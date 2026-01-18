const express = require("express");
const passport = require("passport");
const session = require("express-session");
const cors = require("cors");
const TestcaseRouter = require("./TestcaseRoute.js");
const SubmissionRouter = require("./SubmissionRoute.js");
const AuthRoutes = require("./routes/AuthRoutes.js");
const UserRoutes = require("./routes/UserRoutes.js");
const ContestRoutes = require("./routes/ContestRoutes.js");
const ProblemRoutes = require("./routes/ProblemRoutes.js");
const SubmissionRoutes = require("./routes/SubmissionRoutes.js");
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

// Root route
app.get("/", (req, res) => {
  res.json({
    sucess: true,
  });
});

app.use("/", AuthRoutes);
app.use("/api", UserRoutes);
app.use("/api", ContestRoutes);
app.use("/api", ProblemRoutes);
app.use("/api", SubmissionRoutes);
app.use("/api/upload-testcases", TestcaseRouter);
app.use("/api/Submission/", SubmissionRouter);

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
