const express = require("express");
const app = express();
const db = require("./sqliteDB");
app.use(express.json());

app.post("/RCEPipeline", async (req, res) => {
  // Logic for RCE Pipeline
  const data = req.body;
  data.MetaData = JSON.stringify(data.MetaData);
  await db
    .prepare(
      "INSERT INTO jobs(jobid,inputCode,outputCode,MetaData) VALUES (?,?,?,?)",
    )
    .run(data.jobid, data.inputCode, data.outputCode, data.MetaData);
  res.json({ ok: true });
});

app.get("/getJobs", async (req, res) => {
  const jobs = db.prepare("SELECT * FROM jobs").all();
  res.json({ ok: true, jobs });
});

app.get("/deleteJobs", async (req, res) => {
  db.prepare("DELETE FROM jobs").run();
  res.json({ ok: true });
});
app.listen(3000, () => {
  console.log("RCE Engine Server running on port 3000");
});
