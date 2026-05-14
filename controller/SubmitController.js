const { v4: uuidv4 } = require("uuid");
const prisma = require("../db/PrismaClient");
const redis = require("../redis/redisClient");
const KEYS = require("../redis/redisKeys");
const { submitBatch } = require("../Judge0Config/client");

const languageOptions = {
  54: "C++ (GCC 9.2.0)",
  62: "Java (OpenJDK 13.0.1)",
  71: "Python (3.8.1)",
};

const SubmitCode = async (req, res) => {
  const { Code, problemId, ContestId, languageId, uid } = req.body.Submission;

  if (!Code || !problemId || !languageId || !uid) {
    return res
      .status(400)
      .json({ ok: false, message: "Missing required fields" });
  }

  try {
    // ── 1. Testcases — Redis first, PG fallback ───────────────────
    let testcases;
    const tcKey = KEYS.testcases(problemId);
    const cached = await redis.get(tcKey);

    if (cached) {
      console.log("Testcases cache hit");
      testcases = JSON.parse(cached);
    } else {
      testcases = await prisma.testCase.findMany({ where: { problemId } });
      if (!testcases.length) throw new Error("No testcases for this problem");
      await redis.set(
        tcKey,
        JSON.stringify(testcases),
        "EX",
        KEYS.TESTCASES_TTL,
      );
    }

    // ── 2. Fire batch at Judge0 via client (no expected_output) ──
    const tokens = await submitBatch(Code, languageId, testcases);

    // ── 3. Generate or reuse submissionId — store tokens + meta in Redis ──
    // Reuse an existing submission row for the same user/problem/contest so
    // we maintain a single best-submission record per user/problem/contest.
    let submissionId;
    const contestKey = ContestId || null;
    const existing = await prisma.submission.findFirst({
      where: { userId: uid, problemId, contestId: contestKey },
    });
    if (existing) {
      // reuse existing submission id; do not create a new DB row
      submissionId = existing.id;
    } else {
      submissionId = uuidv4();
      // create a placeholder row to be filled when verdict arrives
      await prisma.submission.create({
        data: {
          id: submissionId,
          userId: uid,
          problemId,
          contestId: contestKey,
          language: languageOptions[languageId],
          code: Code,
          verdict: "pending",
          totalCount: testcases.length,
          score: 0,
          submittedAt: new Date(),
        },
      });
    }

    // Clear any previous cached result for this submission id so a new
    // attempt is not shadowed by an old cached verdict.
    await redis.del(KEYS.subResult(submissionId));

    await redis.set(
      KEYS.subTokens(submissionId),
      JSON.stringify({
        tokens,
        problemId,
        uid,
        ContestId: contestKey,
        Code,
        languageId,
      }),
      "EX",
      KEYS.SUB_TOKENS_TTL,
    );
    console.log("languageId", languageOptions[languageId]);
    // ── 4. Return submissionId only — tokens never leave server ──
    return res.json({ ok: true, submissionId });
  } catch (err) {
    console.error("[/submit]", err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

module.exports = SubmitCode;
