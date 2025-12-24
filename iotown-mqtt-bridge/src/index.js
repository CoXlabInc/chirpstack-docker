require('dotenv').config();

const MqttBridge = require('./bridge');
const logger = require('./logger');
const config = require('./config');

// Validate configuration
function validateConfig() {
  const required = [
    { key: 'IOTOWN_MQTT_HOST', value: config.iotown.host },
    { key: 'IOTOWN_MQTT_USERNAME', value: config.iotown.username },
    { key: 'IOTOWN_MQTT_PASSWORD', value: config.iotown.password }
  ];

  const missing = required.filter((r) => !r.value);

  if (missing.length > 0) {
    const missingKeys = missing.map((m) => m.key).join(', ');
    logger.error(`Missing required environment variables: ${missingKeys}`);
    process.exit(1);
  }
}

// Main
function main() {
  logger.info('=== ChirpStack to IOTOWN MQTT Bridge ===');
  logger.info(`Log level: ${config.logLevel}`);
  logger.info(`ChirpStack MQTT: ${config.chirpstack.host}:${config.chirpstack.port}`);
  logger.info(`IOTOWN MQTT: ${config.iotown.host}:${config.iotown.port}`);
  logger.info(`Application mappings: ${Object.keys(config.appGroupMapping).length}`);
  logger.info(`Default group ID: ${config.defaultGroupId}`);

  if (Object.keys(config.appGroupMapping).length > 0) {
    logger.debug(`Mappings: ${JSON.stringify(config.appGroupMapping)}`);
  }

  validateConfig();

  const bridge = new MqttBridge();
  bridge.start();
}

main();
