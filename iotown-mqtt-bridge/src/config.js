const config = {
  // ChirpStack MQTT (Source)
  chirpstack: {
    host: process.env.CHIRPSTACK_MQTT_HOST || 'mosquitto',
    port: parseInt(process.env.CHIRPSTACK_MQTT_PORT, 10) || 1883,
    protocol: 'mqtt',
    username: process.env.CHIRPSTACK_MQTT_USERNAME || '',
    password: process.env.CHIRPSTACK_MQTT_PASSWORD || '',
    // ChirpStack uplink topic pattern
    subscribeTopics: ['application/+/device/+/event/up']
  },

  // IOTOWN MQTT (Target)
  iotown: {
    host: process.env.IOTOWN_MQTT_HOST,
    port: parseInt(process.env.IOTOWN_MQTT_PORT, 10) || 8883,
    protocol: 'mqtts',
    username: process.env.IOTOWN_MQTT_USERNAME,
    password: process.env.IOTOWN_MQTT_PASSWORD,
    rejectUnauthorized: process.env.IOTOWN_MQTT_REJECT_UNAUTHORIZED !== 'false'
  },

  // Application ID to Group ID mapping
  appGroupMapping: JSON.parse(process.env.APP_GROUP_MAPPING || '{}'),
  defaultGroupId: process.env.DEFAULT_GROUP_ID || 'default',

  // Bridge settings
  logLevel: process.env.LOG_LEVEL || 'info',
  clientIdPrefix: process.env.CLIENT_ID_PREFIX || 'iotown-mqtt-bridge',
  reconnectInterval: parseInt(process.env.RECONNECT_INTERVAL, 10) || 5000
};

module.exports = config;
