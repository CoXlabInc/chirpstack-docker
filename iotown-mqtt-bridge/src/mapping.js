const config = require('./config');

/**
 * Parse ChirpStack device topic and extract application_id and dev_eui
 * Input: application/{application_id}/device/{dev_eui}/event/up
 */
function parseDeviceTopic(topic) {
  const regex = /^application\/([^/]+)\/device\/([^/]+)\/event\/up$/;
  const match = topic.match(regex);

  if (!match) {
    return null;
  }

  return {
    applicationId: match[1],
    devEui: match[2]
  };
}

/**
 * Parse ChirpStack gateway stats topic
 * Input: {region}/gateway/{gateway_id}/event/stats
 */
function parseGatewayStatsTopic(topic) {
  const regex = /^([^/]+)\/gateway\/([^/]+)\/event\/stats$/;
  const match = topic.match(regex);

  if (!match) {
    return null;
  }

  return {
    region: match[1],
    gatewayId: match[2]
  };
}

/**
 * Convert application_id to group_id
 */
function getGroupId(applicationId) {
  return config.appGroupMapping[applicationId] || config.defaultGroupId;
}

/**
 * Convert gateway_id to group_id
 */
function getGatewayGroupId(gatewayId) {
  return config.gatewayGroupMapping[gatewayId] || config.defaultGatewayGroupId;
}

/**
 * Build IOTOWN topic
 * Output: iotown/{group_id}/{device_id}/data
 */
function buildIotownTopic(groupId, deviceId) {
  return `iotown/${groupId}/${deviceId}/data`;
}

/**
 * Transform ChirpStack topic to IOTOWN topic
 */
function transformTopic(chirpstackTopic) {
  // Try device topic first
  const deviceParsed = parseDeviceTopic(chirpstackTopic);
  if (deviceParsed) {
    const groupId = getGroupId(deviceParsed.applicationId);
    const deviceId = deviceParsed.devEui;

    return {
      iotownTopic: buildIotownTopic(groupId, deviceId),
      metadata: {
        type: 'device',
        applicationId: deviceParsed.applicationId,
        groupId: groupId,
        devEui: deviceParsed.devEui,
        deviceId: deviceId
      }
    };
  }

  // Try gateway stats topic
  const gatewayParsed = parseGatewayStatsTopic(chirpstackTopic);
  if (gatewayParsed) {
    const { region, gatewayId } = gatewayParsed;
    const groupId = getGatewayGroupId(gatewayId);

    return {
      iotownTopic: buildIotownTopic(groupId, gatewayId),
      metadata: {
        type: 'gateway_stats',
        region: region,
        gatewayId: gatewayId,
        groupId: groupId
      }
    };
  }

  return null;
}

module.exports = {
  parseDeviceTopic,
  parseGatewayStatsTopic,
  getGroupId,
  getGatewayGroupId,
  buildIotownTopic,
  transformTopic
};
