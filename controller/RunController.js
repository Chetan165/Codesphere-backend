const { v4: uuidv4 } = require("uuid");
const redis = require("../redis/redisClient");
const KEYS = require("../redis/redisKeys");
const { submitSingle } = require("../Judge0Config/client");

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
    // single submission — client handles all limits via getLimits()
    const token = await submitSingle(Code, languageId, stdin);

    const runId = uuidv4();
    // store token + expectedOutput so PollRun can evaluate when ready
    await redis.set(
      KEYS.runResult(runId),
      JSON.stringify({
        token,
        status: "pending",
        expected: expectedValue || null,
      }),
      "EX",
      KEYS.RUN_RESULT_TTL,
    );

    return res.json({ ok: true, runId });
  } catch (err) {
    console.error("[/run]", err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

module.exports = runCode;
