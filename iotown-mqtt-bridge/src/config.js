const fs = require('fs');
const yaml = require('js-yaml');

const configPath = process.env.CONFIG_PATH || '/etc/iotown-mqtt-bridge/config.yml';
const rawConfig = yaml.load(fs.readFileSync(configPath, 'utf8'));

const config = {
  // ChirpStack MQTT (Source)
  chirpstack: {
    host: process.env.CHIRPSTACK_MQTT_HOST || 'mosquitto',
    port: parseInt(process.env.CHIRPSTACK_MQTT_PORT, 10) || 1883,
    protocol: 'mqtt',
    username: rawConfig.chirpstack?.mqtt?.username || '',
    password: rawConfig.chirpstack?.mqtt?.password || '',
    // ChirpStack topic patterns
    subscribeTopics: [
      'application/+/device/+/event/up',
      '+/gateway/+/event/stats'  // {region}/gateway/{gateway_id}/event/stats
    ]
  },

  // IOTOWN MQTT (Target)
  iotown: {
    host: rawConfig.iotown?.mqtt?.host,
    port: rawConfig.iotown?.mqtt?.port || 8883,
    protocol: 'mqtts',
    username: rawConfig.iotown?.mqtt?.username,
    password: rawConfig.iotown?.mqtt?.password,
    rejectUnauthorized: rawConfig.iotown?.mqtt?.rejectUnauthorized !== false
  },

  // Application ID to Group ID mapping
  appGroupMapping: rawConfig.appGroupMapping || {},
  defaultGroupId: rawConfig.defaultGroupId || 'default',

  // Gateway ID to Group ID mapping
  gatewayGroupMapping: rawConfig.gatewayGroupMapping || {},
  defaultGatewayGroupId: rawConfig.defaultGatewayGroupId || 'gateway',

  // Bridge settings
  logLevel: rawConfig.logLevel || 'info',
  clientIdPrefix: rawConfig.clientIdPrefix || 'iotown-mqtt-bridge',
  reconnectInterval: rawConfig.reconnectInterval || 5000
};

module.exports = config;
