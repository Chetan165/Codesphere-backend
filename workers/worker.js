const { Worker } = require("bullmq");
const connection = require("../queue/connection.js");
const redis = require("../redis/redisClient");
const prisma = require("../db/PrismaClient");
const KEYS = require("../redis/redisKeys");
const { getLimits } = require("../Judge0Config/config");
const {
  submitBatchStringOptimized,
  submitSingle,
} = require("../Judge0Config/client");
const dotenv = require("dotenv");
dotenv.config();

const CALLBACK_URL =
  process.env.JUDGE0_CALLBACK_URL ||
  "http://localhost:3000/api/callbacks/judge0";

// Shape cache (stdin only) + grading cache (expected output) — 2hr TTL
const SHAPE_TTL = 60 * 60 * 2;

const worker = new Worker(
  "submission-queue",
  async (job) => {
    const {
      submissionId,
      Code,
      problemId,
      languageId,
      contestKey,
      uid,
      expectedValue,
      stdin,
      isRun,
    } = job.data;

    console.log(`[Worker] Processing submission: ${submissionId}`);

    if (!isRun) {
      await redis.set(
        KEYS.subResult(submissionId),
        JSON.stringify({ status: "processing", verdict: "pending" }),
        { EX: KEYS.SUB_TOKENS_TTL },
      );

      // 1. Check if testcase shape (stdin list) exists in Redis
      const shapeKey = `problem:${problemId}:shape`;
      let shapeRaw = await redis.get(shapeKey);
      let stdinList; // array of { input } strings, DB-order preserved
      let totalCount;

      if (!shapeRaw) {
        // 2. Cache miss -> pull from DB once, cache both shape + grading data
        const testcases = await prisma.testCase.findMany({
          where: { problemId },
        });

        if (!testcases.length) {
          throw new Error(`No testcases assigned to problem: ${problemId}`);
        }

        totalCount = testcases.length;
        stdinList = testcases.map((tc) => tc.input ?? "");

        // shape cache: just stdin per testcase, language-agnostic
        await redis.set(shapeKey, JSON.stringify({ stdinList, totalCount }), {
          EX: SHAPE_TTL,
        });

        // grading cache: expected output + visibility, used by evaluation worker
        const expectedArray = testcases.map((tc) => ({
          output: tc.output,
          isPublic: tc.isPublic,
        }));
        await redis.set(
          KEYS.testcases(problemId),
          JSON.stringify(expectedArray),
          { EX: SHAPE_TTL },
        );
      } else {
        const parsed = JSON.parse(shapeRaw);
        stdinList = parsed.stdinList;
        totalCount = parsed.totalCount;
      }

      // 3. Build the Judge0 payload as real objects — no string templating
      const limits = getLimits(languageId);
      const submissionsArray = stdinList.map((input) => ({
        source_code: Code,
        language_id: languageId,
        stdin: input,
        callback_url: CALLBACK_URL,
        ...limits,
      }));

      const tokens = await submitBatchStringOptimized(
        JSON.stringify({ submissions: submissionsArray }),
      );

      for (let i = 0; i < tokens.length; i++) {
        await redis.set(
          `token:map:${tokens[i]}`,
          JSON.stringify({ submissionId, index: i }),
          { EX: KEYS.SUB_TOKENS_TTL },
        );
      }

      await redis.set(
        KEYS.subTokens(submissionId),
        JSON.stringify({
          tokens,
          problemId,
          submissionId,
          uid,
          contestKey,
          totalCount,
          Code,
          languageId,
        }),
        { EX: KEYS.SUB_TOKENS_TTL },
      );
    } else {
      await redis.set(
        KEYS.runResult(submissionId),
        JSON.stringify({ status: "processing", verdict: "pending" }),
        { EX: KEYS.SUB_TOKENS_TTL },
      );

      const token = await submitSingle(
        Code,
        languageId,
        stdin || "",
        CALLBACK_URL,
      );

      await redis.set(
        `token:map:${token}`,
        JSON.stringify({ submissionId, index: 0, isRun: true }),
        { EX: KEYS.SUB_TOKENS_TTL },
      );

      await redis.set(
        KEYS.subTokens(submissionId),
        JSON.stringify({
          tokens: [token],
          problemId,
          submissionId,
          uid,
          stdin: stdin || "",
          expected: expectedValue || "",
          contestKey,
          totalCount: 1,
        }),
        { EX: KEYS.SUB_TOKENS_TTL },
      );
    }
  },
  { connection },
);

worker.on("completed", (job) =>
  console.log(`[Queue] Job ${job.id} completed.`),
);
worker.on("failed", (job, err) =>
  console.error(`[Queue] Job ${job?.id} failed. Error: ${err.stack}`),
);
