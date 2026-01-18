const express = require("express");
const submissionController = require("../controller/SubmissionController.js");

const router = express.Router();

router.post("/UpdateSubmission", submissionController.updateSubmission);

module.exports = router;
