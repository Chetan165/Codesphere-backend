const express = require("express");
const passport = require("passport");
const session = require("express-session");
const cors = require("cors");
const Prisma = require("./db/PrismaClient.js");
const TestcaseRouter = require("./TestcaseRoute.js");
const SubmissionRouter = require("./SubmissionRoute.js");
const updatedSubmission = require("./UpdateSubmission.js");
const ContestRoutes = require("./routes/ContestRoutes.js");
const isloggedin = require("./middleware/SessionStatus.js");
const AdminRoutes = require("./routes/AdminRoutes.js");
require("./auth");
require("dotenv").config();

const app = express();

app.use(
  cors({
    origin: ["http://localhost:5173", "http://13.201.179.0:2358"],
    credentials: true, // allow cookies to be sent
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.secret,
    cookie: {
      secure: false, // only true if using HTTPS
      sameSite: "lax", // or 'none' with secure: true
    },
  }),
);
app.use(passport.initialize());
app.use(passport.session());

const AuthRoutes = require("./routes/AuthRoutes.js");

app.use("/", AuthRoutes);
app.use("/admin", AdminRoutes);
app.use("/api", ContestRoutes);
app.use("/api/upload-testcases", TestcaseRouter);
app.use("/api/Submission/", SubmissionRouter);
app.post("/api/UpdateSubmission", async (req, res) => {
  const { uid, problemId, ContestId, score, verdict, Code, lang_id } = req.body;
  try {
    await updatedSubmission(
      uid,
      problemId,
      ContestId,
      score,
      verdict,
      Code,
      lang_id,
    );
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
