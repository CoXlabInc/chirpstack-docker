const mqtt = require('mqtt');
const config = require('./config');
const logger = require('./logger');

class IotownClient {
  constructor() {
    this.client = null;
    this.connected = false;
    this.messageQueue = [];
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

    this.client = mqtt.connect(url, options);

    this.client.on('connect', () => {
      logger.info('Connected to IOTOWN MQTT broker');
      this.connected = true;
      this.flushQueue();
    });

    this.client.on('reconnect', () => {
      logger.warn('Reconnecting to IOTOWN MQTT broker...');
      this.connected = false;
    });

    this.client.on('error', (error) => {
      logger.error('IOTOWN MQTT error:', error.message);
    });

    this.client.on('close', () => {
      logger.warn('IOTOWN MQTT connection closed');
      this.connected = false;
    });

    this.client.on('offline', () => {
      logger.warn('IOTOWN MQTT client offline');
      this.connected = false;
    });

    return this;
  }

  publish(topic, message, options = { qos: 1 }) {
    if (!this.connected) {
      // Queue message if not connected
      this.messageQueue.push({ topic, message, options });
      logger.debug(`Message queued for topic: ${topic} (queue size: ${this.messageQueue.length})`);
      return;
    }

    this.client.publish(topic, message, options, (err) => {
      if (err) {
        logger.error(`Failed to publish to ${topic}:`, err.message);
      } else {
        logger.debug(`Published to IOTOWN topic: ${topic}`);
      }
    });
  }

  flushQueue() {
    if (this.messageQueue.length === 0) {
      return;
    }

    const queueSize = this.messageQueue.length;
    logger.info(`Flushing ${queueSize} queued messages...`);

    while (this.messageQueue.length > 0) {
      const { topic, message, options } = this.messageQueue.shift();
      this.client.publish(topic, message, options, (err) => {
        if (err) {
          logger.error(`Failed to publish queued message to ${topic}:`, err.message);
        }
      });
    }

    logger.info(`Flushed ${queueSize} queued messages`);
  }

  disconnect() {
    if (this.client) {
      this.client.end();
      logger.info('Disconnected from IOTOWN MQTT');
    }
  }
}

module.exports = IotownClient;
