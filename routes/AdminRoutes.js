const express = require("express");
const Router = express.Router();
const contestController = require("../controller/ContestController");
const problemAutomationController = require("../controller/ProblemAutomationController");
const isloggedin = require("../middleware/SessionStatus");

// Contest routes
Router.post("/contest", isloggedin, contestController.createContest);
Router.post("/contest/problem", isloggedin, contestController.createProblem);

// Minimal Problem Automation routes with sessionId for temp storage
Router.post("/genai/problem", problemAutomationController.genAIProblem); // Step 1
Router.post(
  "/genai/testcaseGeneration",
  problemAutomationController.genAITestcases,
); // Step 2
Router.get("/routeRCE/pipeline/:id", problemAutomationController.runPipeline); // Step 3

module.exports = Router;
