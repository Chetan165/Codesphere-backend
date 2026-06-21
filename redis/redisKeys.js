const KEYS = {
  // testcases for a problem — cached on first submit, 30min TTL
  // value: JSON array of { input, output }
  testcases: (problemId) => `tc:${problemId}`,
  TESTCASES_TTL: 60 * 60 * 2, // 2 hours

  // tokens for a pending submission — deleted once verdict is final
  // value: JSON array of Judge0 token strings
  subTokens: (submissionId) => `sub:tokens:${submissionId}`,
  SUB_TOKENS_TTL: 60, // 60 s safety expiry

  // final verdict — short cache so rapid re-polls don't re-query PG
  // value: JSON verdict object
  subResult: (submissionId) => `sub:result:${submissionId}`,
  SUB_RESULT_TTL: 60, // 60 s

  // run code result — ephemeral, no DB involved
  // value: JSON { stdout, stderr, status, time, memory }
  runResult: (runId) => `run:${runId}`,
  RUN_RESULT_TTL: 60, // 1 minute

  // dedup lock — prevents double Judge0 poll if frontend
  // fires two requests before first one finishes
  pollLock: (submissionId) => `lock:poll:${submissionId}`,
  POLL_LOCK_TTL: 4, // 4 seconds
};

module.exports = KEYS;
