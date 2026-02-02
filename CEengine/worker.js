import db from "./sqliteDB.js";
import fs from "fs";
import fse from "fs-extra";
import runInDocker from "./runInDocker.js";
import CreateMdFile from "./CreateMdFile.js";
import path from "path";
import archiver from "archiver";
console.log("CE Worker started");

const sleep = async () => {
  const P = new Promise((resolve, reject) => {
    const interval = setTimeout(() => {
      resolve("sleep done");
    }, 5000);
  });
  return P;
};
const fetchJobAndUpdate = async () => {
  const job = db
    .prepare(
      `
  UPDATE jobs
  SET status = 'running'
  WHERE jobid = (
    SELECT jobid
    FROM jobs
    WHERE status = 'queued'
    LIMIT 1
  )
  RETURNING *;
`,
    )
    .get();

  if (!job) {
    console.log("[CE WORKER] No queued job available");
    return { success: false, message: "No queued job" };
  } else {
    console.log("[CE WORKER] Claimed job:", job.jobid);
    db.prepare("UPDATE jobs SET status=? WHERE jobid=?").run(
      "completed",
      job.jobid,
    );
    return { success: true, jobid: job.jobid };
  }
};
console.log("[CE WORKER] Checking for queued jobs...");
while (true) {
  const Jobdata = await fetchJobAndUpdate();
  if (Jobdata.success) {
    try {
      const job = db
        .prepare("SELECT * FROM jobs WHERE jobid=?")
        .get(Jobdata.jobid);
      const folderPath = path.join("./", Jobdata.jobid);
      fs.mkdirSync(folderPath);
      console.log("[CE WORKER] Created directory for job:", Jobdata.jobid);
      fs.writeFileSync(path.join(folderPath, "inputCode.py"), job.inputCode);
      console.log("[CE WORKER] Wrote inputCode.py for job:", Jobdata.jobid);
      try {
        const resultInputGen = await runInDocker(
          folderPath,
          "inputCode.py",
          {},
        );
        console.log(
          "[CE WORKER] Docker execution completed for job:",
          Jobdata.jobid,
          "Result:",
          resultInputGen,
        );
      } catch (err) {
        throw Error(
          "[CE WORKER] Error during input code execution for job:" +
            Jobdata.jobid +
            " Error: " +
            err,
        );
      }
      fs.writeFileSync(path.join(folderPath, "outputCode.py"), job.outputCode);
      console.log("[CE WORKER] Wrote outputCode.py for job:", Jobdata.jobid);
      try {
        const resultOutputGen = await runInDocker(
          folderPath,
          "outputCode.py",
          {},
        );
        console.log(
          "[CE WORKER] Docker execution completed for outputCode.py for job:",
          Jobdata.jobid,
          "Result:",
          resultOutputGen,
        );
      } catch (err) {
        throw Error(
          "[CE WORKER] Error during output code execution for job:" +
            Jobdata.jobid +
            " Error: " +
            err,
        );
      }
      try {
        await CreateMdFile(job);
      } catch (err) {
        throw Error(
          "[CE WORKER] Error creating markdown file for job:" +
            Jobdata.jobid +
            " Error: " +
            err,
        );
      }
      // Creating zip and testcase dir
      const testcasesDir = path.join(folderPath, "Testcases");
      const testcasesZip = path.join(folderPath, "Testcases.zip");
      fse.ensureDirSync(testcasesDir);
      fse.copySync(
        path.join(folderPath, "input"),
        path.join(testcasesDir, "input"),
      );
      fse.copySync(
        path.join(folderPath, "output"),
        path.join(testcasesDir, "output"),
      );
      let output = fs.createWriteStream(testcasesZip);
      let archive = archiver("zip", {
        zlib: { level: 9 },
      });
      archive.pipe(output);
      archive.directory(testcasesDir, false);
      await archive.finalize();

      //zipping the entire job folder
      const zipPath = path.join("./", Jobdata.jobid + ".zip");
      let jobOutput = fs.createWriteStream(zipPath);
      const archiveJob = archiver("zip", {
        zlib: { level: 9 },
      });
      archiveJob.pipe(jobOutput);
      archiveJob.directory(folderPath, false);
      await archiveJob.finalize();
      console.log("[CE WORKER] Zipped job folder for job:", Jobdata.jobid);
      // Update job status to completed
      db.prepare("UPDATE jobs SET status=? WHERE jobid=?").run(
        "completed",
        Jobdata.jobid,
      );
      console.log("[CE WORKER] Completed job:", Jobdata.jobid);
    } catch (err) {
      console.error("[CE WORKER] Error processing job:", Jobdata.jobid, err);
      db.prepare("UPDATE jobs SET status=? WHERE jobid=?").run(
        "error",
        Jobdata.jobid,
      );
    } finally {
      //cleanup
      const folderPath = path.join("./", Jobdata.jobid);
      fse.removeSync(folderPath);
      console.log("[CE WORKER] Cleaned up folder for job:", Jobdata.jobid);
    }
  }
  await sleep();
}
