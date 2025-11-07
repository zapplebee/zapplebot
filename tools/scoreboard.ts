import { text, tool } from "@lmstudio/sdk";
import { z } from "zod";
import { JSONFilePreset } from "lowdb/node";

type UserScore = Record<string, number>;
type Data = Record<string, UserScore>;

const defaultData: Data = {};
const db = await JSONFilePreset<Data>("db.json", defaultData);

export const scoreBoardTool = tool({
  name: "update_score_board",
  description: text`
    Update a scoreboard for a user by adding a signed delta to a named score counter.
    - Use this when the user asks to add, remove, award, or adjust points, wins, losses, etc.
    - If the user or score does not exist yet, create it with an initial value of 0, then apply the delta.
    - The delta can be positive (increment) or negative (decrement).
    - Return the updated scores for that user only.

    Examples:
    - "give Alice +5 karma" -> { username: "alice", scoreName: "karma", scoreDelta: 5 }
    - "Alice loses 2 lives" -> { username: "alice", scoreName: "lives", scoreDelta: -2 }
    - "Add one win to Bob"  -> { username: "bob",   scoreName: "wins",  scoreDelta: 1 }
  `,
  parameters: {
    username: z.string(),
    scoreDelta: z.number().int(),
    scoreName: z.string(),
  },
  implementation: async ({ username, scoreDelta, scoreName }) => {
    db.data[username] ??= {};
    db.data[username][scoreName] ??= 0;
    db.data[username][scoreName] += scoreDelta;
    await db.write();
    return db.data;
  },
});

export const getScoreBoardTool = tool({
  name: "get_score_board",
  description: text`
    Get the full contents of the scoreboard`,
  parameters: {},
  implementation: async () => {
    return db.data;
  },
});
