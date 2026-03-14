import OpenAI from "openai";

const backend = process.env.LLM_BACKEND ?? "llama";

const config =
  backend === "claude"
    ? {
        baseURL: "https://api.anthropic.com/v1",
        apiKey: process.env.ANTHROPIC_API_KEY ?? "",
        model: process.env.CLAUDE_MODEL ?? "claude-haiku-4-5-20251001",
        headers: { "anthropic-version": "2023-06-01" },
      }
    : backend === "openai"
    ? {
        baseURL: undefined,
        apiKey: process.env.OPENAI_API_KEY ?? "",
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        headers: {},
      }
    : {
        baseURL: (process.env.LLAMA_BASE_URL ?? "http://127.0.0.1:8888") + "/v1",
        apiKey: process.env.LLAMA_API_KEY ?? "not-needed",
        model: process.env.LLAMA_MODEL ?? "local-model",
        headers: {},
      };

export const openai = new OpenAI({
  baseURL: config.baseURL,
  apiKey: config.apiKey,
  defaultHeaders: config.headers,
});

export const MODEL = config.model;
