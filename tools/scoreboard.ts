import { text, tool } from "../bot-tool";
import { z } from "zod";
import { JSONFilePreset } from "lowdb/node";

type UserScore = Record<string, number>;
type Data = Record<string, UserScore>;

const defaultData: Data = {};
const db = await JSONFilePreset<Data>("db.json", defaultData);

export const scoreBoardScoreNames = tool({
  name: "score_board_score_names",
  description: text`List all existing score category names (e.g. "wins", "party_points"). Call this before update_score_board when the scoreName is unspecified, to reuse an existing name instead of inventing a new one.`,
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
  description: text`Add or subtract from a user's score. scoreDelta is positive or negative. username MUST be <@digits> format.
E.g. give <@535097720785076245> +3 party_points → { username: "<@535097720785076245>", scoreName: "party_points", scoreDelta: 3 }`,
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
  description: text`Return the full scoreboard { userMention → { scoreName → value } }. Use to display rankings or scores.`,
  parameters: {},
  implementation: async () => {
    return db.data;
  },
});
