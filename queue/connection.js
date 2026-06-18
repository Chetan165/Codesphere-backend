const APP_CONFIG = require("../config/appConfig");

const bullConnection = {
  host: APP_CONFIG.REDIS.host,
  port: APP_CONFIG.REDIS.port,
  password: APP_CONFIG.REDIS.password,
  // Required by BullMQ to process blocking queue commands without disconnecting
  maxRetriesPerRequest: null,
};

module.exports = bullConnection;
