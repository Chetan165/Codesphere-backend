const express = require("express");
const passport = require("passport");
const session = require("express-session");
const { RedisStore } = require("connect-redis");
const cors = require("cors");
const TestcaseRouter = require("./TestcaseRoute.js");
const updatedSubmission = require("./UpdateSubmission.js");
const ContestRoutes = require("./routes/ContestRoutes.js");
const isloggedin = require("./middleware/SessionStatus.js");
const AdminRoutes = require("./routes/AdminRoutes.js");
const redis = require("./redis/redisClient.js");
require("./auth");
const APP_CONFIG = require("./config/appConfig");

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24;
const SESSION_TTL_SECONDS = 60 * 60 * 24;
const redisSessionStore = new RedisStore({
  client: redis,
  prefix: "sess:",
  ttl: SESSION_TTL_SECONDS,
});

const app = express();

app.use(
  cors({
    origin: APP_CONFIG.FRONTEND_ORIGINS,
    credentials: true, // allow cookies to be sent
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    store: redisSessionStore,
    resave: false,
    saveUninitialized: false,
    secret: process.env.secret,
    rolling: false,
    cookie: {
      maxAge: SESSION_MAX_AGE_MS,
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

app.listen(APP_CONFIG.PORT, () => {
  console.log(`Server is running on port ${APP_CONFIG.PORT}`);
});
