const express = require("express");
const Prisma = require("./db/PrismaClient.js");
const updateSubmission = require("./UpdateSubmission.js");
const router = express.Router();

router.post("/submit", async (req, res) => {
  const { Code, problemId, ContestId, languageId, uid } = req.body.Submission; //required data

  try {
    const testcases = await Prisma.testCase.findMany({
      //retrieving all testcases with problemId
      where: { problemId },
    });

    if (testcases.length === 0) throw new Error("Challenge has no testcases"); //if no testcase are present throw error

    const submissions = testcases.map((tc) => ({
      //create array of submissions for each testcase [{code:...,stdin:...},{}....{}]
      source_code: Code,
      language_id: languageId,
      stdin: tc.input,
      expected_output: tc.output,
      cpu_time_limit: 5,
      memory_limit: 128000,
    }));

    const judgeRes = await fetch(
      //submit in batch all the testcase
      "http://13.234.14.231:2358/submissions/batch?base64_encoded=false&wait=false",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissions }),
      }
    );

    const judgeData = await judgeRes.json(); //retrive the response containing tokens
    const tokens = judgeData.map((t) => t.token);
    console.log(`tokens:${tokens}`);

    return res.json({
      ok: true,
      tokens,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: err.message });
  }
});

module.exports = router;
