const express = require("express");
const Router = express.Router();
const contestController = require("../controller/ContestController");
const problemAutomationController = require("../controller/ProblemAutomationController");
const isloggedin = require("../middleware/SessionStatus");
const AutocraftRouter = require("./Autocraft");
const AdminCheck = require("../middleware/AdminCheck");

// Contest routes
Router.post(
  "/contest",
  isloggedin,
  AdminCheck,
  contestController.createContest,
);
Router.put(
  "/contest/:id",
  isloggedin,
  AdminCheck,
  contestController.updateContest,
);
Router.post(
  "/contest/problem",
  isloggedin,
  AdminCheck,
  contestController.createProblem,
);
Router.get(
  "/contest/:contestId/export",
  isloggedin,
  AdminCheck,
  contestController.downloadContestResultsExcel,
);
Router.use("/autocraft", isloggedin, AdminCheck, AutocraftRouter);

// Minimal Problem Automation routes with sessionId for temp storage
Router.post(
  "/genai/problem",
  isloggedin,
  AdminCheck,
  problemAutomationController.genAIProblem,
); // Step 1
Router.post(
  "/genai/testcaseGeneration",
  isloggedin,
  AdminCheck,
  problemAutomationController.genAITestcases,
); // Step 2
Router.post(
  "/routeCE/pipeline/:id",
  isloggedin,
  AdminCheck,
  problemAutomationController.runPipeline,
); // Step 3

Router.get(
  "/Download/:id",
  isloggedin,
  AdminCheck,
  problemAutomationController.downloadTestcases,
); // Download Testcases

module.exports = Router;
