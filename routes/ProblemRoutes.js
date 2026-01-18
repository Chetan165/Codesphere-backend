const express = require("express");
const problemController = require("../controller/ProblemController.js");

const router = express.Router();

router.post("/admin/contest/problem", problemController.createProblem);

router.post("/problems", problemController.searchProblems);

module.exports = router;
