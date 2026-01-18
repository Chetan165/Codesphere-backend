const express = require("express");
const userController = require("../controller/UserController.js");
const isloggedin = require("../middleware/SessionStatus.js");

const router = express.Router();

router.get("/user", isloggedin, userController.getUser);

router.post("/register", userController.registerUser);

module.exports = router;
