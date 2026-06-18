// controllers/SubmitCode.js
const { v4: uuidv4 } = require("uuid");
const redis = require("../redis/redisClient");
const KEYS = require("../redis/redisKeys");
const { submissionQueue } = require("../queue/queues.js");

const SubmitCode = async (req, res) => {
  const { Code, problemId, ContestId, languageId, uid } = req.body.Submission;

  if (!Code || !problemId || !languageId || !uid) {
    return res
      .status(400)
      .json({ ok: false, message: "Missing required fields" });
  }

  try {
    const submissionId = uuidv4();
    const contestKey = ContestId || null;

    // Initialize state in Redis cache for the frontend polling router
    await redis.set(
      KEYS.subResult(submissionId),
      JSON.stringify({ status: "queued", verdict: "pending" }),
      "EX",
      KEYS.SUB_TOKENS_TTL,
    );

    // Drop tracking parameters cleanly onto the Stage 1 task queue
    await submissionQueue.add(`submit:${submissionId}`, {
      submissionId,
      Code,
      problemId,
      contestKey,
      languageId,
      uid,
    });

    // Instant exit path — thread memory allocations are kept low
    return res.json({ ok: true, submissionId });
  } catch (err) {
    console.error("[/submit]", err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

module.exports = SubmitCode;
