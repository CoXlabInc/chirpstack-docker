const ChirpStackClient = require('./chirpstack-client');
const IotownClient = require('./iotown-client');
const PayloadDecoder = require('./payload-decoder');
const { transformTopic } = require('./mapping');
const logger = require('./logger');

class MqttBridge {
  constructor() {
    this.chirpstackClient = new ChirpStackClient();
    this.iotownClient = new IotownClient();
    this.payloadDecoder = new PayloadDecoder();
    this.messageCount = 0;
  }

  start() {
    logger.info('Starting MQTT Bridge...');

    // Connect to IOTOWN first (to be ready to receive messages)
    this.iotownClient.connect();

    // Connect to ChirpStack and set up message handler
    this.chirpstackClient.connect();
    this.chirpstackClient.onMessage((topic, message) => {
      this.handleMessage(topic, message);
    });

    // Graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());

    logger.info('MQTT Bridge started successfully');
  }

  handleMessage(topic, message) {
    try {
      // Transform topic
      const transformed = transformTopic(topic);

      if (!transformed) {
        logger.warn(`Unable to transform topic: ${topic}`);
        return;
      }

      const { iotownTopic, metadata } = transformed;

      let payload;
      if (metadata.type === 'gateway_stats') {
        // Decode gateway stats (protobuf or JSON) and add region
        const decoded = this.payloadDecoder.decodeGatewayStats(message);
        const enrichedData = {
          region: metadata.region,
          ...decoded.data
        };
        payload = JSON.stringify(enrichedData);
      } else {
        // Pass device payload as-is (ChirpStack JSON -> IOTOWN)
        payload = message.toString();
      }

      logger.info(`Bridging: ${topic} -> ${iotownTopic}`);
      logger.debug(`Metadata: ${JSON.stringify(metadata)}`);
      logger.debug(`Payload: ${payload}`);

      // Publish to IOTOWN
      this.iotownClient.publish(iotownTopic, payload);

      this.messageCount++;

      if (this.messageCount % 100 === 0) {
        logger.info(`Total messages bridged: ${this.messageCount}`);
      }
    } catch (error) {
      logger.error('Error handling message:', error.message);
    }
  }

  stop() {
    logger.info('Stopping MQTT Bridge...');
    this.chirpstackClient.disconnect();
    this.iotownClient.disconnect();
    logger.info(`MQTT Bridge stopped. Total messages bridged: ${this.messageCount}`);
    process.exit(0);
  }
}

module.exports = MqttBridge;
