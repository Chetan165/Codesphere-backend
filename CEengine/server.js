const express = require("express");
const app = express();
const db = require("./sqliteDB");
const path = require("path");
app.use(express.json());

app.post("/CEPipeline", async (req, res) => {
  // Logic for CE Pipeline
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

app.get("/download/:id", async (req, res) => {
  const id = req.params.id;
  const filePath = path.join(__dirname, `${id}.zip`);
  res.download(filePath);
});
app.listen(5000, () => {
  console.log("CE Engine Server running on port 5000");
});
