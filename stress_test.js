// stress-submit.js
// Node 18+ (uses built-in fetch)

const APP_CONFIG = require("./config/appConfig");

const CONFIG = {
  baseUrl: APP_CONFIG.SERVER_BASE,
  totalSubmissions: 10, // N submissions to fire
  submitEveryMs: 300, // periodic submit interval
  pollEveryMs: 1000, // periodic poll interval
  maxLifetimeMs: 3 * 60 * 1000, // stop polling one submission after 3 minutes
  statsPrintEveryMs: 2000,

  // ---- REQUIRED: set valid values from your DB ----
  payload: {
    Submission: {
      Code: `import java.io.*;
import java.util.*;

public class Main {
    static class FastReader {
        BufferedReader br;
        StringTokenizer st;

        public FastReader() {
            br = new BufferedReader(new InputStreamReader(System.in));
        }

        String next() {
            while (st == null || !st.hasMoreElements()) {
                try {
                    String line = br.readLine();
                    if (line == null) return null;
                    st = new StringTokenizer(line);
                } catch (IOException e) {
                    return null;
                }
            }
            return st.nextToken();
        }

        int nextInt() {
            String s = next();
            if (s == null) return -1;
            return Integer.parseInt(s);
        }
    }

    static class DSU {
        int[] parent;
        DSU(int n) {
            parent = new int[n + 1];
            for (int i = 0; i <= n; i++) parent[i] = i;
        }

        // ITERATIVE FIND to prevent StackOverflowError (NZEC)
        int find(int i) {
            int root = i;
            while (parent[root] != root) {
                root = parent[root];
            }
            // Path Compression (making future finds O(1))
            while (parent[i] != root) {
                int next = parent[i];
                parent[i] = root;
                i = next;
            }
            return root;
        }

        boolean unite(int i, int j) {
            int rootI = find(i);
            int rootJ = find(j);
            if (rootI != rootJ) {
                parent[rootI] = rootJ;
                return true;
            }
            return false;
        }
    }

    public static void main(String[] args) {
        FastReader fr = new FastReader();
        PrintWriter out = new PrintWriter(System.out);
        
        String tStr = fr.next();
        if (tStr == null) return;
        int T = Integer.parseInt(tStr);
        
        while (T-- > 0) {
            int N = fr.nextInt();
            int M = fr.nextInt();
            if (N == -1) break;

            int[] cultures = new int[N + 1];
            for (int i = 1; i <= N; i++) {
                cultures[i] = fr.nextInt();
            }
            
            DSU cityDsu = new DSU(N);
            for (int i = 0; i < M; i++) {
                cityDsu.unite(fr.nextInt(), fr.nextInt());
            }

            // Using ArrayList of ArrayLists to store component roots per culture
            List<Integer>[] cultureToComponents = new ArrayList[N + 1];

            for (int i = 1; i <= N; i++) {
                int c = cultures[i];
                int root = cityDsu.find(i);
                if (cultureToComponents[c] == null) {
                    cultureToComponents[c] = new ArrayList<>();
                }
                cultureToComponents[c].add(root);
            }

            DSU metaDsu = new DSU(N);
            int roadsNeeded = 0;

            for (int c = 1; c <= N; c++) {
                if (cultureToComponents[c] == null) continue;
                
                List<Integer> roots = cultureToComponents[c];
                int firstRoot = roots.get(0);
                for (int i = 1; i < roots.size(); i++) {
                    if (metaDsu.unite(firstRoot, roots.get(i))) {
                        roadsNeeded++;
                    }
                }
            }
            out.println(roadsNeeded);
        }
        out.flush();
        out.close();
    }
}`,
      problemId: "cmnxf36l20000f3wkvand77a7",
      ContestId: "cmnxf41au000lf3wka2qdsd7o", // or valid contest id
      languageId: 62, // 71 Python, 54 C++, 62 Java
      uid: "23-E&CS48-27",
    },
  },
};

// In-memory store for submission tokens/ids and state
const store = new Map(); // key: submissionId, value: metadata

const counters = {
  submitAttempted: 0,
  submitSuccess: 0,
  submitFailed: 0,
  pollRequests: 0,
  pollFailed: 0,
  pending: 0,
  accepted: 0,
  wrong_answer: 0,
  expired: 0,
  unknownFinal: 0,
};

let submitTimer = null;
let pollTimer = null;
let statsTimer = null;
let submittedCount = 0;
let pollCycleInFlight = false;

function nowIso() {
  return new Date().toISOString();
}

async function submitOnce(index) {
  counters.submitAttempted++;
  const startedAt = Date.now();

  try {
    const res = await fetch(`${CONFIG.baseUrl}/api/Submission/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(CONFIG.payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.submissionId) {
      counters.submitFailed++;
      console.error(
        `[${nowIso()}] SUBMIT_FAIL #${index} status=${res.status} body=`,
        data,
      );
      return;
    }

    counters.submitSuccess++;
    const submissionId = data.submissionId;
    store.set(submissionId, {
      submissionId,
      submitIndex: index,
      createdAt: startedAt,
      lastStatus: "pending",
      polls: 0,
      polling: false,
      counted: false,
      final: false,
      finalPayload: null,
    });

    console.log(
      `[${nowIso()}] SUBMIT_OK #${index} submissionId=${submissionId}`,
    );
  } catch (err) {
    counters.submitFailed++;
    console.error(`[${nowIso()}] SUBMIT_ERR #${index}`, err.message);
  }
}

async function pollOne(sub) {
  if (sub.final || sub.polling) return;

  sub.polling = true;

  try {
    // timeout protection
    if (Date.now() - sub.createdAt > CONFIG.maxLifetimeMs) {
      sub.final = true;
      sub.lastStatus = "expired";
      if (!sub.counted) {
        counters.expired++;
        sub.counted = true;
      }
      return;
    }

    counters.pollRequests++;
    sub.polls++;

    const res = await fetch(
      `${CONFIG.baseUrl}/api/Submission/submit/poll/${sub.submissionId}`,
      { method: "GET" },
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      counters.pollFailed++;
      console.error(
        `[${nowIso()}] POLL_FAIL submissionId=${sub.submissionId} status=${res.status} body=`,
        data,
      );
      return;
    }

    // Backend can return:
    // { status: "pending" } OR
    // final verdict object with status: "accepted" | "wrong_answer"
    const status = data.status || "unknown";
    sub.lastStatus = status;

    if (status === "pending") return;

    sub.final = true;
    sub.finalPayload = data;

    if (!sub.counted) {
      if (status === "accepted") {
        counters.accepted++;
      } else if (status === "wrong_answer") {
        counters.wrong_answer++;
      } else if (status === "expired") {
        counters.expired++;
      } else {
        counters.unknownFinal++;
      }
      sub.counted = true;
    }

    const passed = data.passed ?? "-";
    const total = data.total ?? "-";
    const firstError = data.firstError
      ? JSON.stringify(data.firstError)
      : "none";

    console.log(
      `[${nowIso()}] FINAL submissionId=${sub.submissionId} status=${status} passed=${passed}/${total} polls=${sub.polls} firstError=${firstError}`,
    );
  } catch (err) {
    counters.pollFailed++;
    console.error(
      `[${nowIso()}] POLL_ERR submissionId=${sub.submissionId}`,
      err.message,
    );
  } finally {
    sub.polling = false;
  }
}

async function pollAllPending() {
  const tasks = [];
  for (const sub of store.values()) {
    if (!sub.final) tasks.push(pollOne(sub));
  }
  await Promise.all(tasks);
}

function printStats() {
  let pending = 0;
  for (const sub of store.values()) {
    if (!sub.final) pending++;
  }
  counters.pending = pending;

  console.log("====================================================");
  console.log(`[${nowIso()}] LIVE STATS`);
  const resolvedTotal =
    counters.accepted +
    counters.wrong_answer +
    counters.expired +
    counters.unknownFinal;
  console.log({
    submitAttempted: counters.submitAttempted,
    submitSuccess: counters.submitSuccess,
    submitFailed: counters.submitFailed,
    trackedSubmissionIds: store.size,
    pending: counters.pending,
    accepted: counters.accepted,
    wrong_answer: counters.wrong_answer,
    expired: counters.expired,
    unknownFinal: counters.unknownFinal,
    resolvedTotal,
    pollRequests: counters.pollRequests,
    pollFailed: counters.pollFailed,
  });
  console.log("====================================================");
}

function isDone() {
  if (submittedCount < CONFIG.totalSubmissions) return false;
  for (const sub of store.values()) {
    if (!sub.final) return false;
  }
  return true;
}

async function gracefulStop() {
  clearInterval(submitTimer);
  clearInterval(pollTimer);
  clearInterval(statsTimer);
  printStats();
  console.log(`[${nowIso()}] TEST COMPLETE`);
  process.exit(0);
}

async function main() {
  if (
    CONFIG.payload.Submission.problemId === "REPLACE_WITH_VALID_PROBLEM_ID" ||
    CONFIG.payload.Submission.uid === "REPLACE_WITH_VALID_USER_ID"
  ) {
    throw new Error(
      "Set CONFIG.payload.Submission.problemId and uid before running stress test",
    );
  }

  console.log(`[${nowIso()}] Starting stress test with config:`, CONFIG);

  submitTimer = setInterval(async () => {
    if (submittedCount >= CONFIG.totalSubmissions) {
      clearInterval(submitTimer);
      return;
    }

    submittedCount++;
    await submitOnce(submittedCount);
  }, CONFIG.submitEveryMs);

  pollTimer = setInterval(async () => {
    if (pollCycleInFlight) return;
    pollCycleInFlight = true;
    try {
      await pollAllPending();
      if (isDone()) {
        await gracefulStop();
      }
    } finally {
      pollCycleInFlight = false;
    }
  }, CONFIG.pollEveryMs);

  statsTimer = setInterval(() => {
    printStats();
  }, CONFIG.statsPrintEveryMs);
}

process.on("SIGINT", async () => {
  console.log("\nInterrupted, printing final stats...");
  await gracefulStop();
});

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
