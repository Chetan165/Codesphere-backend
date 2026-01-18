const express = require("express");
const passport = require("passport");
const authController = require("../controller/AuthController.js");
const isloggedin = require("../middleware/SessionStatus.js");

const router = express.Router();

router.get("/protected", isloggedin, authController.protectedRoute);

router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["email", "profile"] }),
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/auth/failure",
  }),
  authController.googleCallback,
);

router.get("/auth/failure", authController.authFailure);

router.get("/logout", authController.logout);

module.exports = router;
