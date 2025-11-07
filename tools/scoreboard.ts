import { text, tool } from "@lmstudio/sdk";
import { z } from "zod";
import { JSONFilePreset } from "lowdb/node";

type UserScore = Record<string, number>;
type Data = Record<string, UserScore>;

const defaultData: Data = {};
const db = await JSONFilePreset<Data>("db.json", defaultData);

export const scoreBoardScoreNames = tool({
  name: "score_board_score_names",
  description: text`
Return the list of all **existing** score categories currently in use, such as:
"party_points", "wins", "reputation", etc.

Use this tool when:
- The user refers to "points", "score", "wins", etc., but does not specify a scoreName.
- You need to decide whether to reuse an existing scoreName or introduce a new one.

General rule:
- Prefer reusing an existing scoreName if it matches the user's intent.
- Only invent a new scoreName if the user clearly intends a new category.
  `,
  parameters: {},
  async implementation() {
    const extantNames = new Set<string>();
    for (const scores of Object.values(db.data)) {
      for (const name of Object.keys(scores)) {
        extantNames.add(name);
      }
    }
    return [...extantNames];
  },
});

export const scoreBoardTool = tool({
  name: "update_score_board",
  description: text`
Modify a user's score for a specific scoreName by adding or subtracting a value.

Use this tool when the user:
- Gives, awards, grants, or adds points.
- Removes, deducts, penalizes, or subtracts points.
- Increases or decreases someone's score.
- Refers to a specific game stat like "karma", "party_points", "wins", etc.

Behavior:
- If the user does not exist in the scoreboard yet, they will be created.
- If the scoreName does not exist for that user, it starts at 0.
- scoreDelta can be positive (increase) or negative (decrease).
- Return the **full updated scoreboard** so the bot can summarize results.

Examples of how to parametrize:
"Give <@535097720785076245> +3 party_points" → { username: "<@535097720785076245>", scoreName: "party_points", scoreDelta: 3 }
"<@5286624765194797058> loses 2 reputation" → { username: "<@5286624765194797058>", scoreName: "reputation", scoreDelta: -2 }
"Add one win to <@205845828185620480>" → { username: "<@205845828185620480>", scoreName: "wins", scoreDelta: 1 }

username **MUST** be in this format <@5286624765194797058>
  `,
  parameters: {
    username: z
      .string()
      .regex(/^<@\d+>$/, "username MUST be in the format <@1234567890>"),
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
Return the **entire** scoreboard as a dictionary of:
{ userMention -> { scoreName -> value } }

Use this to:
- Display rankings
- Summarize scores
- Compare users
- Show the current state of the game
  `,
  parameters: {},
  implementation: async () => {
    return db.data;
  },
});
