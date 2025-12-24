const mqtt = require('mqtt');
const config = require('./config');
const logger = require('./logger');

class ChirpStackClient {
  constructor() {
    this.client = null;
    this.onMessageCallback = null;
  }

  connect() {
    const url = `${config.chirpstack.protocol}://${config.chirpstack.host}:${config.chirpstack.port}`;

    const options = {
      clientId: `${config.clientIdPrefix}-chirpstack-${Date.now()}`,
      clean: true,
      reconnectPeriod: config.reconnectInterval,
      connectTimeout: 30000
    };

    // Add authentication if provided
    if (config.chirpstack.username) {
      options.username = config.chirpstack.username;
      options.password = config.chirpstack.password;
    }

    logger.info(`Connecting to ChirpStack MQTT: ${url}`);

    this.client = mqtt.connect(url, options);

    this.client.on('connect', () => {
      logger.info('Connected to ChirpStack MQTT broker');
      this.subscribe();
    });

    this.client.on('reconnect', () => {
      logger.warn('Reconnecting to ChirpStack MQTT broker...');
    });

    this.client.on('error', (error) => {
      logger.error('ChirpStack MQTT error:', error.message);
    });

    this.client.on('close', () => {
      logger.warn('ChirpStack MQTT connection closed');
    });

    this.client.on('message', (topic, message) => {
      if (this.onMessageCallback) {
        this.onMessageCallback(topic, message);
      }
    });

    return this;
  }

  subscribe() {
    const topics = config.chirpstack.subscribeTopics;

    this.client.subscribe(topics, { qos: 1 }, (err, granted) => {
      if (err) {
        logger.error('ChirpStack subscription error:', err.message);
        return;
      }
      granted.forEach((g) => {
        logger.info(`Subscribed to ChirpStack topic: ${g.topic}`);
      });
    });
  }

  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  disconnect() {
    if (this.client) {
      this.client.end();
      logger.info('Disconnected from ChirpStack MQTT');
    }
  }
}

module.exports = ChirpStackClient;
