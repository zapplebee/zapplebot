import { rollDiceTool } from "./dice";
import { addPersistentMemoryTool, getPersistentMemoryTool } from "./memory";
import { typescriptSandboxTool } from "./sandbox";
import {
  scoreBoardTool,
  getScoreBoardTool,
  scoreBoardScoreNames,
} from "./scoreboard";
import { getTechStackTool } from "./techstack";

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
  ];
}
