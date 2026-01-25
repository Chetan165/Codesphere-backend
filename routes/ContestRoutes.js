const express = require("express");
const router = express.Router();
const contestController = require("../controller/ContestController.js");
const isloggedin = require("../middleware/SessionStatus.js");

router.get("/contests", contestController.getAllContests);
router.post("/problems", contestController.getProblems);
router.post("/ContestChallenges", contestController.getContestChallenges);
router.get("/deleteContest/:id", isloggedin, contestController.deleteContest);
router.post("/contests/getTime/:id", contestController.getContestTime);
module.exports = router;
