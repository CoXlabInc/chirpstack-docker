const mqtt = require('mqtt');
const config = require('./config');
const logger = require('./logger');

const FLUSH_BATCH = 100;
const FLUSH_PAUSE_MS = 100;

class IotownClient {
  constructor() {
    this.client = null;
    this.connected = false;
    this.messageQueue = [];
    this.onMessageCallback = null;
  }

  connect() {
    const url = `${config.iotown.protocol}://${config.iotown.host}:${config.iotown.port}`;

    const options = {
      clientId: `${config.clientIdPrefix}-iotown-${Date.now()}`,
      clean: true,
      reconnectPeriod: config.reconnectInterval,
      connectTimeout: 30000,
      // TLS authentication
      username: config.iotown.username,
      password: config.iotown.password,
      // Ignore certificate validation
      rejectUnauthorized: config.iotown.rejectUnauthorized
    };

    logger.info(`Connecting to IOTOWN MQTT: ${url}`);
    logger.debug(`TLS rejectUnauthorized: ${config.iotown.rejectUnauthorized}`);

    const client = mqtt.connect(url, options);
    this.client = client;

    client.on('connect', () => {
      logger.info('Connected to IOTOWN MQTT broker');
      this.connected = true;
      this.subscribe();
      this.flushQueue();
    });

    client.on('reconnect', () => {
      logger.warn('Reconnecting to IOTOWN MQTT broker...');
      this.connected = false;
    });

    client.on('error', (error) => {
      logger.error('IOTOWN MQTT error:', error.message);
    });

    // A client replaced by reconnect() may still report closing; it must not reset the new state
    client.on('close', () => {
      logger.warn('IOTOWN MQTT connection closed');
      if (this.client === client) {
        this.connected = false;
      }
    });

    client.on('offline', () => {
      logger.warn('IOTOWN MQTT client offline');
      if (this.client === client) {
        this.connected = false;
      }
    });

    client.on('message', (topic, message) => {
      if (this.onMessageCallback) {
        this.onMessageCallback(topic, message);
      }
    });

    return this;
  }

  subscribe() {
    const topic = config.iotown.subscribeTopic;

    this.client.subscribe(topic, { qos: 1 }, (err, granted) => {
      if (err) {
        logger.error('IOTOWN subscription error:', err.message);
        return;
      }
      granted.forEach((g) => {
        logger.info(`Subscribed to IOTOWN topic: ${g.topic}`);
      });
    });
  }

  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  // While disconnected, or while a backlog is still being sent, messages wait in the queue so they
  // go out in order. Past the limit the oldest message is dropped.
  publish(topic, message, options = { qos: 1 }) {
    if (!this.connected || this.messageQueue.length > 0) {
      if (this.messageQueue.length >= config.maxQueuedMessages) {
        this.messageQueue.shift();
        this.droppedCount = (this.droppedCount || 0) + 1;
        if (this.droppedCount === 1 || this.droppedCount % 1000 === 0) {
          logger.warn(`IOTOWN queue full (${config.maxQueuedMessages}), dropped ${this.droppedCount} oldest message(s)`);
        }
      }
      this.messageQueue.push({ topic, message, options });
      logger.debug(`Message queued for topic: ${topic} (queue size: ${this.messageQueue.length})`);
      if (this.connected) this.flushQueue();
      return;
    }
    this.send(topic, message, options);
  }

  send(topic, message, options) {
    this.client.publish(topic, message, options, (err) => {
      if (err) {
        logger.error(`Failed to publish to ${topic}:`, err.message);
      } else {
        logger.debug(`Published to IOTOWN topic: ${topic}`);
      }
    });
  }

  // Sends the backlog in batches (FLUSH_BATCH messages, then FLUSH_PAUSE_MS) so IOTOWN, on the same
  // device, is not flooded after an outage. Stops if the connection drops again; the rest stays queued.
  flushQueue() {
    if (this.flushing || this.messageQueue.length === 0) {
      return;
    }
    this.flushing = true;
    this.droppedCount = 0;
    logger.info(`Sending ${this.messageQueue.length} queued messages...`);
    let sent = 0;

    const step = () => {
      if (!this.connected) {
        this.flushing = false;
        logger.warn(`IOTOWN disconnected while sending the queue; ${this.messageQueue.length} messages still queued`);
        return;
      }
      for (let i = 0; i < FLUSH_BATCH && this.messageQueue.length > 0; i++) {
        const { topic, message, options } = this.messageQueue.shift();
        this.send(topic, message, options);
        sent++;
      }
      if (this.messageQueue.length > 0) {
        setTimeout(step, FLUSH_PAUSE_MS);
      } else {
        this.flushing = false;
        logger.info(`Sent ${sent} queued messages`);
      }
    };
    step();
  }

  disconnect() {
    if (this.client) {
      this.client.end();
      logger.info('Disconnected from IOTOWN MQTT');
    }
  }
}

module.exports = IotownClient;
