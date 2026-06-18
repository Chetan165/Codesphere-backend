const { Queue } = require("bullmq");
const connection = require("../queue/connection.js");

const queueOptions = {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000, // Retries at 1s, 2s, 4s if network or system drops
    },
    removeOnComplete: true, // Auto-purges metadata from memory upon success
    removeOnFail: false, // Retains traces for easier debugging
  },
};

const submissionQueue = new Queue("submission-queue", queueOptions);
const evaluationQueue = new Queue("evaluation-queue", queueOptions);

module.exports = { submissionQueue, evaluationQueue };
