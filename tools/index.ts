import { rollDiceTool } from "./dice";
import { bugReport, readBugs, readRepoFile } from "./github";
import { addPersistentMemoryTool } from "./memory";
import { typescriptSandboxTool } from "./sandbox";
import {
  scoreBoardTool,
  getScoreBoardTool,
  scoreBoardScoreNames,
} from "./scoreboard";
import { getTechStackTool } from "./techstack";
import { searchTool } from "./wiki";
import { utilTools } from "./utils";
import type { BotTool } from "../bot-tool";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type OpenAI from "openai";

export const tools: BotTool[] = [
  addPersistentMemoryTool,
  rollDiceTool,
  scoreBoardTool,
  getScoreBoardTool,
  getTechStackTool,
  scoreBoardScoreNames,
  typescriptSandboxTool,
  bugReport,
  readBugs,
  readRepoFile,
  searchTool,
  ...utilTools,
];

export const openaiTools: OpenAI.Chat.ChatCompletionTool[] = tools.map((t) => {
  const { $schema, ...parameters } = zodToJsonSchema(z.object(t.parameters));
  return {
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters,
    },
  };
});
