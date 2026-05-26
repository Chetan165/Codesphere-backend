const express = require("express");
const router = express.Router();
const contestController = require("../controller/ContestController.js");
const isloggedin = require("../middleware/SessionStatus.js");
const checkContestWindow = require("../middleware/checkContestWindow.js");
const { route } = require("../SubmissionRoute.js");
const SubmitCode = require("../controller/SubmitController.js");
const { PollSubmission, PollRun } = require("../controller/PollController.js");
const runCode = require("../controller/RunController.js");
const AdminCheck = require("../middleware/AdminCheck.js");
router.get("/contests", isloggedin, contestController.getAllContests);
router.get(
  "/contests/:contestId/meta",
  isloggedin,
  contestController.getContestMeta,
);
router.get(
  "/contests/:contestId/leaderboard",
  isloggedin,
  contestController.getContestLeaderboard,
);
router.get(
  "/contests/:contestId/challenges",
  isloggedin,
  contestController.getContestChallengesList,
);
// check registration status
router.get(
  "/contests/:contestId/registered",
  isloggedin,
  contestController.checkRegistrationForContest,
);
router.post(
  "/contests/register/:contestId",
  isloggedin,
  contestController.registerForContest,
);
router.get("/challenges/:challengeId", contestController.getChallengeById);
router.post("/Submission/submit", isloggedin, checkContestWindow, SubmitCode);
router.get("/Submission/submit/poll/:submissionId", PollSubmission);
router.post("/Submission/run", isloggedin, checkContestWindow, runCode);
router.get("/Submission/run/poll/:runId", PollRun);
router.post("/problems", contestController.getProblems);
router.post("/ContestChallenges", contestController.getContestChallenges);
router.get(
  "/deleteContest/:id",
  isloggedin,
  AdminCheck,
  contestController.deleteContest,
);
router.post("/contests/getTime/:id", contestController.getContestTime);
module.exports = router;
