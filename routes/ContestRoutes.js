const express = require("express");
const contestController = require("../controller/ContestController.js");

const router = express.Router();

router.post("/admin/contest", contestController.createContest);

router.get("/contests", contestController.getAllContests);

router.post("/ContestChallenges", contestController.getContestChallenges);

router.get("/deleteContest/:id", contestController.deleteContest);

router.post("/contests/getTime/:id", contestController.getContestTime);

module.exports = router;
