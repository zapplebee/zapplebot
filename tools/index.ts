import { rollDiceTool } from "./dice";
import { addPersistentMemoryTool, getPersistentMemoryTool } from "./memory";
import { scoreBoardTool, getScoreBoardTool } from "./scoreboard";
import { getTechStackTool } from "./techstack";

export async function toolsProvider() {
  return [
    addPersistentMemoryTool,
    getPersistentMemoryTool,
    rollDiceTool,
    scoreBoardTool,
    getScoreBoardTool,
    getTechStackTool,
  ];
}
