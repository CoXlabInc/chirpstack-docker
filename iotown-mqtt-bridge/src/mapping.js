const config = require('./config');

/**
 * Parse ChirpStack topic and extract application_id and dev_eui
 * Input: application/{application_id}/device/{dev_eui}/event/up
 */
function parseChirpStackTopic(topic) {
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
 * Convert application_id to group_id
 */
function getGroupId(applicationId) {
  return config.appGroupMapping[applicationId] || config.defaultGroupId;
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
  const parsed = parseChirpStackTopic(chirpstackTopic);

  if (!parsed) {
    return null;
  }

  const groupId = getGroupId(parsed.applicationId);
  // dev_eui = device_id (same value)
  const deviceId = parsed.devEui;

  return {
    iotownTopic: buildIotownTopic(groupId, deviceId),
    metadata: {
      applicationId: parsed.applicationId,
      groupId: groupId,
      devEui: parsed.devEui,
      deviceId: deviceId
    }
  };
}

module.exports = {
  parseChirpStackTopic,
  getGroupId,
  buildIotownTopic,
  transformTopic
};
