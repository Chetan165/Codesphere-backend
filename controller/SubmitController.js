const { v4: uuidv4 } = require("uuid");
const redis = require("../redis/redisClient");
const KEYS = require("../redis/redisKeys");
const { submissionQueue } = require("../queue/queues.js");

const SubmitCode = async (req, res) => {
  const t1 = Date.now();
  const { Code, problemId, ContestId, languageId, uid } = req.body.Submission;

  if (!Code || !problemId || !languageId || !uid) {
    return res
      .status(400)
      .json({ ok: false, message: "Missing required fields" });
  }

  try {
    const submissionId = uuidv4();
    const contestKey = ContestId || null;

    await redis.set(
      KEYS.subResult(submissionId),
      JSON.stringify({ status: "queued", verdict: "pending" }),
      { EX: KEYS.SUB_RESULT_TTL },
    );

    await submissionQueue.add(`submit:${submissionId}`, {
      submissionId,
      Code,
      problemId,
      contestKey,
      languageId,
      uid,
      isRun: false,
    });

    const t2 = Date.now();
    console.log(`[submit] Time taken: ${t2 - t1} ms`);

    return res.json({ ok: true, submissionId });
  } catch (err) {
    console.error("[/submit]", err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

module.exports = SubmitCode;
