import OpenAI from "openai";

const baseURL =
  (process.env.LLAMA_BASE_URL ?? "http://127.0.0.1:8888") + "/v1";

export const openai = new OpenAI({
  baseURL,
  apiKey: process.env.LLAMA_API_KEY ?? "not-needed",
});

export const MODEL = process.env.LLAMA_MODEL ?? "local-model";
