const fs = require('fs');
const YAML = require('yaml');

const configPath = process.env.CONFIG_PATH || '/etc/iotown-mqtt-bridge/config.yml';

function readRaw() {
  return YAML.parse(fs.readFileSync(configPath, 'utf8')) || {};
}

// YAML keys that look like numbers (e.g. an all-digit gateway ID) must stay strings
function stringMap(map) {
  const out = {};
  for (const [key, value] of Object.entries(map || {})) {
    out[String(key)] = String(value);
  }
  return out;
}

const DEFAULT_API_URL = process.env.CHIRPSTACK_API_URL || 'http://chirpstack-rest-api:8090';

function build(rawConfig) {
  // An external ChirpStack is set by its MQTT host in config.yml. Without one, the bridge uses the
  // ChirpStack installed alongside it (broker and REST API from the compose environment).
  const csMqtt = rawConfig.chirpstack?.mqtt || {};
  const external = Boolean(csMqtt.host);
  return {
    // ChirpStack MQTT (Source)
    chirpstack: {
      external,
      host: csMqtt.host || process.env.CHIRPSTACK_MQTT_HOST || 'mosquitto',
      port: (external && csMqtt.port) || parseInt(process.env.CHIRPSTACK_MQTT_PORT, 10) || 1883,
      protocol: external && csMqtt.tls ? 'mqtts' : 'mqtt',
      rejectUnauthorized: csMqtt.rejectUnauthorized !== false,
      username: rawConfig.chirpstack?.mqtt?.username || '',
      password: rawConfig.chirpstack?.mqtt?.password || '',
      // ChirpStack topic patterns
      subscribeTopics: [
        'application/+/device/+/event/up',
        '+/gateway/+/event/stats'  // {region}/gateway/{gateway_id}/event/stats
      ]
    },

    // ChirpStack REST API, only used by the web UI to show application and gateway names
    chirpstackApi: {
      url: (external && rawConfig.chirpstack?.api?.url) || DEFAULT_API_URL,
      token: rawConfig.chirpstack?.api?.token || ''
    },

    // IOTOWN MQTT (Target)
    iotown: {
      host: rawConfig.iotown?.mqtt?.host,
      port: rawConfig.iotown?.mqtt?.port || 8883,
      protocol: 'mqtts',
      username: rawConfig.iotown?.mqtt?.username,
      password: rawConfig.iotown?.mqtt?.password,
      rejectUnauthorized: rawConfig.iotown?.mqtt?.rejectUnauthorized !== false,
      subscribeTopic: 'iotown/+/+/command'
    },

    // Application ID to Group ID mapping
    appGroupMapping: stringMap(rawConfig.appGroupMapping),
    // Empty: device data from applications without a mapping is not forwarded
    defaultGroupId: rawConfig.defaultGroupId || '',

    // Applications whose device uplinks must not be bridged to IOTOWN
    // (e.g. the application holding EdgeEye virtual session devices)
    excludeApplications: Array.isArray(rawConfig.excludeApplications)
      ? rawConfig.excludeApplications.map(String)
      : [],

    // Gateway ID to Group ID mapping
    gatewayGroupMapping: stringMap(rawConfig.gatewayGroupMapping),
    // Empty: stats from gateways without a mapping are not forwarded
    defaultGatewayGroupId: rawConfig.defaultGatewayGroupId || '',

    // Downlink defaults
    downlink: {
      defaultFPort: rawConfig.downlink?.defaultFPort || 1,
      defaultConfirmed: rawConfig.downlink?.defaultConfirmed || false
    },

    // Bridge settings
    logLevel: rawConfig.logLevel || 'info',
    clientIdPrefix: rawConfig.clientIdPrefix || 'iotown-mqtt-bridge',
    reconnectInterval: rawConfig.reconnectInterval || 5000,
    // Messages kept while IOTOWN is unreachable; the oldest are dropped beyond this
    maxQueuedMessages: rawConfig.maxQueuedMessages || 10000
  };
}

const config = build(readRaw());

Object.defineProperty(config, 'path', { value: configPath });

// Re-read config.yml into this same object, so every module holding `config` sees the new values
Object.defineProperty(config, 'reload', {
  value: () => {
    Object.assign(config, build(readRaw()));
    return config;
  }
});

module.exports = config;
