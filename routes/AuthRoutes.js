const express = require("express");
const router = express.Router();
const authController = require("../controller/AuthController.js");
const isloggedin = require("../middleware/SessionStatus.js");
const passport = require("passport");

router.get("/", authController.root);
router.get("/protected", isloggedin, authController.protectedRoute);
router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["email", "profile"] }),
);
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/auth/failure" }),
  authController.googleCallback,
);
router.get("/auth/failure", authController.authFailure);
router.get("/api/user", isloggedin, authController.getUser);
router.post("/api/register", authController.register);
router.get("/logout", authController.logout);

module.exports = router;
