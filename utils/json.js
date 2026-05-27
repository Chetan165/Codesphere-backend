const { jsonrepair } = require("jsonrepair");

function extractJSON(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in response");
  const rawText = text.slice(start, end + 1);
  try {
    return JSON.parse(rawText);
  } catch (err) {
    let cleanedText = rawText.replace(/\\bullet/g, "\\\\bullet");
    cleanedText = cleanedText.replace(/\\(?!["\\\/bfnrtu])/g, "\\\\");
    return JSON.parse(cleanedText);
  }
}

function extractJsonPayload(text) {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("No JSON object found in response");
  }
  return text.slice(firstBrace, lastBrace + 1);
}

function repairJsonEscapes(text) {
  let repaired = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (!inString) {
      repaired += char;
      if (char === '"') inString = true;
      continue;
    }

    if (escaped) {
      repaired += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      const nextChar = text[i + 1];
      if (nextChar && !'"\\\\/bfnrtu'.includes(nextChar)) {
        repaired += "\\\\";
      } else {
        repaired += char;
      }
      escaped = nextChar && '"\\\\/bfnrtu'.includes(nextChar);
      continue;
    }

    if (char === "\n") {
      repaired += "\\n";
      continue;
    }

    if (char === "\r") {
      repaired += "\\r";
      continue;
    }

    if (char === "\t") {
      repaired += "\\t";
      continue;
    }

    repaired += char;
    if (char === '"') inString = false;
  }

  return repaired;
}

function extractJsonStringField(text, key) {
  const pattern = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "s");
  const match = text.match(pattern);
  if (!match) return null;

  const rawValue = match[1]
    .replace(/\\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");

  return rawValue;
}

function safeParseProblemJSON(text) {
  const payload = extractJsonPayload(text);
  const repaired = repairJsonEscapes(payload);

  try {
    return JSON.parse(jsonrepair(repaired));
  } catch (error) {
    const fallback = {
      title: extractJsonStringField(payload, "title") || "Untitled Problem",
      problemStatement:
        extractJsonStringField(payload, "problemStatement") || "",
      inputFormat: extractJsonStringField(payload, "inputFormat") || "",
      outputFormat: extractJsonStringField(payload, "outputFormat") || "",
      constraints: extractJsonStringField(payload, "constraints") || "",
      sampleInput: extractJsonStringField(payload, "sampleInput") || "",
      sampleOutput: extractJsonStringField(payload, "sampleOutput") || "",
      explanation: extractJsonStringField(payload, "explanation") || "",
      inferredComplexity:
        extractJsonStringField(payload, "inferredComplexity") ||
        (text.includes("O(n^2)") ? "O(n^2)" : "unknown"),
    };

    if (!fallback.problemStatement && !fallback.inputFormat) {
      throw error;
    }

    return fallback;
  }
}

function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const payload = extractJsonPayload(text);
    const repairAttempts = [
      payload,
      repairJsonEscapes(payload),
      jsonrepair(payload),
      jsonrepair(repairJsonEscapes(payload)),
    ];

    let lastError = e;
    for (const attempt of repairAttempts) {
      try {
        return JSON.parse(attempt);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }
}

module.exports = {
  extractJSON,
  extractJsonPayload,
  repairJsonEscapes,
  extractJsonStringField,
  safeParseProblemJSON,
  safeParseJSON,
};
