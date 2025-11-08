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

export async function toolsProvider() {
  return [
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
}
