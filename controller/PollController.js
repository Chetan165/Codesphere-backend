const redis = require("../redis/redisClient");
const KEYS = require("../redis/redisKeys");

const PollSubmission = async (req, res) => {
  const { submissionId } = req.params;
  try {
    const resultCache = await redis.get(KEYS.subResult(submissionId));
    if (resultCache) {
      return res.json(JSON.parse(resultCache));
    }
    return res.json({ status: "processing", verdict: "pending" });
  } catch (err) {
    console.error("[/poll/submit]", err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

const PollRun = async (req, res) => {
  const { runId } = req.params;
  try {
    const raw = await redis.get(KEYS.runResult(runId));

    if (!raw) {
      return res.json({ status: "processing", verdict: "pending" });
    }

    return res.json(JSON.parse(raw));
  } catch (err) {
    console.error("[/poll/run]", err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

module.exports = { PollSubmission, PollRun };
