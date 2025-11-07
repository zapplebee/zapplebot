import { rollDiceTool } from "./dice";
import { bugReport, readBugs, readRepoFile } from "./github";
import { addPersistentMemoryTool, getPersistentMemoryTool } from "./memory";
import { typescriptSandboxTool } from "./sandbox";
import {
  scoreBoardTool,
  getScoreBoardTool,
  scoreBoardScoreNames,
} from "./scoreboard";
import { getTechStackTool } from "./techstack";
import { searchTool } from "./wiki";
import { utilTools } from "./utils";

export async function toolsProvider() {
  return [
    addPersistentMemoryTool,
    getPersistentMemoryTool,
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
}
