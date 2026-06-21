const { Worker } = require("bullmq");
const connection = require("../queue/connection.js");
const redis = require("../redis/redisClient");
const prisma = require("../db/PrismaClient");
const KEYS = require("../redis/redisKeys");

const languageOptions = {
  54: "C++ (GCC 9.2.0)",
  62: "Java (OpenJDK 13.0.1)",
  71: "Python (3.8.1)",
};

const JUDGE0_STATUS = {
  5: "Time Limit Exceeded",
  6: "Compilation Error",
  7: "Runtime Error (SIGSEGV)",
  8: "Runtime Error (SIGXFSZ)",
  9: "Runtime Error (SIGFPE)",
  10: "Runtime Error (SIGABRT)",
  11: "Runtime Error (NZEC)",
  12: "Runtime Error (Other)",
  13: "Internal Error",
  14: "Exec Format Error",
};

const decodeBase64 = (value) => {
  if (!value) return "";
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch (e) {
    return value;
  }
};

const normalizeOutputOptimized = (value) => {
  if (value == null) return "";
  let s = String(value).replace(/\r\n/g, "\n");
  const lines = s.split("\n").map((l) => l.replace(/[ \t]+$/g, ""));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n").trim();
};

const worker = new Worker(
  "evaluation-queue",
  async (job) => {
    const { submissionId } = job.data;
    const subTokensKey = KEYS.subTokens(submissionId);
    const rawTokens = await redis.get(subTokensKey);

    if (!rawTokens) {
      throw new Error(
        `Token profile metadata dropped for context ID: ${submissionId}`,
      );
    }

    const data = JSON.parse(rawTokens);
    const { problemId, uid, contestKey, Code, languageId, totalCount, tokens } =
      data;

    const tcKey = KEYS.testcases(problemId);
    let tcRaw = await redis.get(tcKey);

    if (!tcRaw) {
      const testcasesFromDb = await prisma.testCase.findMany({
        where: { problemId },
      });

      if (!testcasesFromDb.length) {
        await redis.set(
          KEYS.subResult(submissionId),
          JSON.stringify({
            status: "error",
            message: `No testcases found for: ${problemId}`,
          }),
          { EX: KEYS.SUB_RESULT_TTL },
        );
        throw new Error(`No testcases found for: ${problemId}`);
      }

      const expectedArray = testcasesFromDb.map((tc) => ({
        output: tc.output,
        isPublic: tc.isPublic,
      }));
      tcRaw = JSON.stringify(expectedArray);
      await redis.set(tcKey, tcRaw, { EX: KEYS.TESTCASES_TTL });
    }

    const testcases = JSON.parse(tcRaw);
    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      select: { MaxScore: true },
    });
    const maxScore = problem?.MaxScore || 100;

    let passed = 0,
      passedNonPublic = 0,
      firstError = null;
    const nonPublicCount = testcases.filter((t) => !t.isPublic).length;
    const results = [];

    // --- Compilation Error short-circuit ---
    const firstRaw = await redis.get(`sub:${submissionId}:tc:0`);
    const firstParsed = firstRaw ? JSON.parse(firstRaw) : null;
    const firstStatusId = firstParsed?.status?.id;

    if (firstStatusId === 6) {
      const compileOutput = decodeBase64(firstParsed?.compile_output);
      firstError = {
        testcase: 1,
        status: "Compilation Error",
        statusId: 6,
        compile_output: compileOutput,
      };
      for (let i = 0; i < totalCount; i++) {
        results.push({
          testcase: i + 1,
          pass: false,
          status: "Compilation Error",
          time: "0.000",
          memory: 0,
        });
      }
    } else {
      for (let i = 0; i < totalCount; i++) {
        const tcRawData = await redis.get(`sub:${submissionId}:tc:${i}`);

        if (!tcRawData) {
          firstError = firstError || {
            testcase: i + 1,
            status: "Result missing",
          };
          results.push({
            testcase: i + 1,
            pass: false,
            status: "Result missing",
            time: "0.000",
            memory: 0,
          });
          continue;
        }

        const tcData = JSON.parse(tcRawData);
        const expectedTC = testcases[i];
        const statusId = tcData.status?.id;
        const stdout = normalizeOutputOptimized(decodeBase64(tcData.stdout));
        const expectedNorm = normalizeOutputOptimized(expectedTC?.output);

        let tcStatus,
          isAC = false;

        if (statusId === 3) {
          isAC = stdout === expectedNorm;
          tcStatus = isAC ? "Accepted" : "Wrong Answer";
        } else if (JUDGE0_STATUS[statusId]) {
          tcStatus = JUDGE0_STATUS[statusId];
        } else {
          tcStatus = tcData.status?.description || "Unknown";
        }

        if (isAC) {
          passed++;
          if (!expectedTC?.isPublic) passedNonPublic++;
        } else if (!firstError) {
          firstError = {
            testcase: i + 1,
            status: tcStatus,
            statusId,
            // surface runtime error detail (stderr) for non-compile failures
            stderr: decodeBase64(tcData.stderr) || undefined,
          };
        }

        results.push({
          testcase: i + 1,
          pass: isAC,
          status: tcStatus,
          time: tcData.time != null ? tcData.time : "0.000",
          memory: tcData.memory != null ? tcData.memory : 0,
        });
      }
    }

    const allPassed = passed === testcases.length;
    const computedScore =
      nonPublicCount > 0
        ? Math.round((passedNonPublic / nonPublicCount) * maxScore)
        : 0;

    const totalTime = results.reduce(
      (acc, r) => acc + (parseFloat(r.time) || 0),
      0,
    );
    const peakMemory = results.reduce(
      (acc, r) => Math.max(acc, parseInt(r.memory) || 0),
      0,
    );

    const verdictStatus = allPassed
      ? "accepted"
      : firstError?.statusId === 5
        ? "time_limit_exceeded"
        : firstError?.statusId === 6
          ? "compilation_error"
          : firstError?.statusId >= 7 && firstError?.statusId <= 12
            ? "runtime_error"
            : firstError?.statusId === 13
              ? "internal_error"
              : firstError?.statusId === 14
                ? "exec_format_error"
                : "wrong_answer";

    const verdict = {
      status: verdictStatus,
      score: computedScore,
      maxScore,
      total: totalCount,
      passedNonPublic,
      firstError,
      results,
      time: totalTime.toFixed(3),
      memory: peakMemory,
    };

    const stored = await prisma.submission.findFirst({
      where: { userId: uid, problemId, contestId: contestKey || null },
      select: { id: true, score: true },
    });

    if (!stored) {
      console.error(
        `[Evaluation] No submission row found for userId=${uid}, problemId=${problemId}, contestId=${contestKey}. Verdict computed but NOT persisted to Postgres.`,
      );
    } else if (computedScore > (stored.score || 0)) {
      await prisma.submission.update({
        where: { id: stored.id },
        data: {
          verdict: verdict.status,
          score: computedScore,
          language: languageOptions[languageId] || String(languageId),
          code: Code,
          passedCount: passed,
          totalCount: totalCount,
          submittedAt: new Date(),
        },
      });
    }

    await redis.set(KEYS.subResult(submissionId), JSON.stringify(verdict), {
      EX: KEYS.SUB_RESULT_TTL,
    });
    await redis.del(subTokensKey);
    for (const t of tokens) await redis.del(`token:map:${t}`);
  },
  { connection },
);

worker.on("completed", (job) =>
  console.log(`[Queue] Job ${job.id} completed.`),
);
worker.on("failed", (job, err) =>
  console.error(`[Queue] Job ${job?.id} failed. Error: ${err.stack}`),
);
