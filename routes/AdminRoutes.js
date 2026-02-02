const express = require("express");
const Router = express.Router();
const contestController = require("../controller/ContestController");
const problemAutomationController = require("../controller/ProblemAutomationController");
const isloggedin = require("../middleware/SessionStatus");
const AutocraftRouter = require("./Autocraft");

// Contest routes
Router.post("/contest", isloggedin, contestController.createContest);
Router.post("/contest/problem", isloggedin, contestController.createProblem);
Router.use("/autocraft", AutocraftRouter);

// Minimal Problem Automation routes with sessionId for temp storage
Router.post("/genai/problem", problemAutomationController.genAIProblem); // Step 1
Router.post(
  "/genai/testcaseGeneration",
  problemAutomationController.genAITestcases,
); // Step 2
Router.post("/routeCE/pipeline/:id", problemAutomationController.runPipeline); // Step 3

Router.get("/Download/:id", problemAutomationController.downloadTestcases); // Download Testcases

module.exports = Router;
