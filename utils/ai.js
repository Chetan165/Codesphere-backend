const Anthropic = require("@anthropic-ai/sdk");
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function callClaude(prompt, useThinking = true) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const config = {
    model: "claude-opus-4-6",
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
  };
  if (useThinking) {
    config.thinking = { type: "enabled", budget_tokens: 10000 };
  }
  const response = await anthropic.messages.create(config);
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.text || "";
}

function createGemini(apiKey) {
  return new GoogleGenerativeAI(apiKey);
}

function createGeminiFactories(gemini) {
  return {
    flashLiteJSON: () =>
      gemini.getGenerativeModel({
        model: "gemini-3.1-flash-lite",
        generationConfig: { responseMimeType: "application/json" },
      }),
    flashJSON: () =>
      gemini.getGenerativeModel({
        model: "gemini-3.5-flash",
        generationConfig: { responseMimeType: "application/json" },
      }),
    flashText: () =>
      gemini.getGenerativeModel({
        model: "gemini-3.5-flash",
      }),
    flashText3_0: () =>
      gemini.getGenerativeModel({
        model: "gemini-3-flash-preview",
      }),
  };
}

module.exports = {
  callClaude,
  createGemini,
  createGeminiFactories,
};
