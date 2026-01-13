const gw = require('@chirpstack/chirpstack-api/gw/gw_pb');
const logger = require('./logger');

class PayloadDecoder {
  /**
   * Decode gateway stats payload (auto-detect JSON or Protobuf)
   * @param {Buffer} buffer - Raw message buffer
   * @returns {{ format: string, data: object }}
   */
  decodeGatewayStats(buffer) {
    // Try JSON first
    try {
      const str = buffer.toString('utf8');
      if (str.startsWith('{')) {
        const data = JSON.parse(str);
        logger.debug('Decoded gateway stats as JSON');
        return { format: 'json', data };
      }
    } catch (e) {
      // Not valid JSON, try Protobuf
    }

    // Try Protobuf
    try {
      const decoded = gw.GatewayStats.deserializeBinary(buffer);
      const data = decoded.toObject();
      logger.debug('Decoded gateway stats as Protobuf');
      return { format: 'protobuf', data };
    } catch (e) {
      logger.error('Failed to decode gateway stats:', e.message);
      throw new Error(`Failed to decode gateway stats: ${e.message}`);
    }
  }
}

module.exports = PayloadDecoder;
