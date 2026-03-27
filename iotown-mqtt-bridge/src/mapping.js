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
 * Parse IOTOWN command topic and extract group_id and device_id
 * Input: iotown/{group_id}/{device_id}/command
 */
function parseIotownCommandTopic(topic) {
  const regex = /^iotown\/([^/]+)\/([^/]+)\/command$/;
  const match = topic.match(regex);

  if (!match) {
    return null;
  }

  return {
    groupId: match[1],
    deviceId: match[2]
  };
}

/**
 * Reverse lookup: group_id -> application_id list
 * Since multiple application_ids can map to the same group_id, returns an array
 */
function getApplicationIds(groupId) {
  const applicationIds = [];

  for (const [appId, gId] of Object.entries(config.appGroupMapping)) {
    if (gId === groupId) {
      applicationIds.push(appId);
    }
  }

  return applicationIds;
}

/**
 * Build ChirpStack downlink topic
 * Output: application/{application_id}/device/{dev_eui}/command/down
 */
function buildChirpStackDownlinkTopic(applicationId, devEui) {
  return `application/${applicationId}/device/${devEui}/command/down`;
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
  transformTopic,
  parseIotownCommandTopic,
  getApplicationIds,
  buildChirpStackDownlinkTopic
};
