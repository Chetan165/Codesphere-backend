const { v4: uuidv4 } = require("uuid");
const redis = require("../redis/redisClient");
const KEYS = require("../redis/redisKeys");
const { submissionQueue } = require("../queue/queues.js");

const runCode = async (req, res) => {
  const {
    Code,
    languageId,
    stdin = "",
    expectedOutput = "",
    expected = "",
  } = req.body;
  const expectedValue = expected || expectedOutput || "";

  if (!Code || !languageId) {
    return res
      .status(400)
      .json({ ok: false, message: "Code and languageId required" });
  }

  try {
    const runId = uuidv4();
    await redis.set(
      KEYS.runResult(runId),
      JSON.stringify({ status: "queued", verdict: "pending" }),
      "EX",
      KEYS.RUN_RESULT_TTL,
    );

    await submissionQueue.add(`run:${runId}`, {
      submissionId: runId,
      Code,
      languageId,
      stdin,
      expectedValue,
      isRun: true,
    });

    return res.json({ ok: true, runId });
  } catch (err) {
    console.error("[/run]", err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

module.exports = runCode;
