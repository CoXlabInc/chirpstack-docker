const ChirpStackClient = require('./chirpstack-client');
const IotownClient = require('./iotown-client');
const PayloadDecoder = require('./payload-decoder');
const { transformTopic, parseIotownCommandTopic, getApplicationIds, buildChirpStackDownlinkTopic } = require('./mapping');
const config = require('./config');
const logger = require('./logger');

class MqttBridge {
  constructor() {
    this.chirpstackClient = new ChirpStackClient();
    this.iotownClient = new IotownClient();
    this.payloadDecoder = new PayloadDecoder();
    this.uplinkCount = 0;
    this.downlinkCount = 0;
  }

  start() {
    logger.info('Starting MQTT Bridge...');

    // Connect to IOTOWN first (to be ready to receive messages)
    this.iotownClient.connect();

    // Connect to ChirpStack and set up uplink handler
    this.chirpstackClient.connect();
    this.chirpstackClient.onMessage((topic, message) => {
      this.handleUplink(topic, message);
    });

    // Set up downlink handler (IOTOWN -> ChirpStack)
    this.iotownClient.onMessage((topic, message) => {
      this.handleDownlink(topic, message);
    });

    // Graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());

    logger.info('MQTT Bridge started successfully');
  }

  handleUplink(topic, message) {
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

      this.uplinkCount++;

      if (this.uplinkCount % 100 === 0) {
        logger.info(`Total uplink messages bridged: ${this.uplinkCount}`);
      }
    } catch (error) {
      logger.error('Error handling uplink:', error.message);
    }
  }

  handleDownlink(topic, message) {
    try {
      const parsed = parseIotownCommandTopic(topic);

      if (!parsed) {
        logger.warn(`Unable to parse IOTOWN command topic: ${topic}`);
        return;
      }

      const { groupId, deviceId } = parsed;
      const applicationIds = getApplicationIds(groupId);

      if (applicationIds.length === 0) {
        logger.debug(`No application mapping for group ${groupId}, skipping downlink`);
        return;
      }

      // Build ChirpStack downlink payload
      const payload = this.buildDownlinkPayload(deviceId, message);

      if (!payload) {
        logger.warn(`Invalid downlink payload for device ${deviceId}`);
        return;
      }

      const payloadStr = JSON.stringify(payload);

      // Publish to all mapped applications
      for (const appId of applicationIds) {
        const downlinkTopic = buildChirpStackDownlinkTopic(appId, deviceId);
        logger.info(`Downlink: ${topic} -> ${downlinkTopic}`);
        logger.debug(`Downlink payload: ${payloadStr}`);
        this.chirpstackClient.publish(downlinkTopic, payloadStr);
      }

      this.downlinkCount++;

      if (this.downlinkCount % 100 === 0) {
        logger.info(`Total downlink messages bridged: ${this.downlinkCount}`);
      }
    } catch (error) {
      logger.error('Error handling downlink:', error.message);
    }
  }

  buildDownlinkPayload(devEui, message) {
    let fPort = config.downlink.defaultFPort;
    let confirmed = config.downlink.defaultConfirmed;
    let data;

    try {
      const parsed = JSON.parse(message.toString());
      fPort = parsed.fPort || fPort;
      confirmed = parsed.confirmed !== undefined ? parsed.confirmed : confirmed;
      data = parsed.data;
    } catch (e) {
      // Not valid JSON, use raw message as data
      data = Buffer.from(message).toString('base64');
    }

    if (!data) {
      return null;
    }

    return {
      devEui,
      confirmed,
      fPort,
      data
    };
  }

  stop() {
    logger.info('Stopping MQTT Bridge...');
    this.chirpstackClient.disconnect();
    this.iotownClient.disconnect();
    logger.info(`MQTT Bridge stopped. Uplink: ${this.uplinkCount}, Downlink: ${this.downlinkCount}`);
    process.exit(0);
  }
}

module.exports = MqttBridge;
