import { text, tool } from "@lmstudio/sdk";
import { z } from "zod";
export const rollDiceTool = tool({
  name: "roll_dice",
  description: text`
      Roll a specified number of dice with specified number of faces.

      For example, to roll 2 six-sided dice (i.e. 2d6), you should call the function \`roll_dice\`
      with the parameters { count: 2, sides: 6 }.
    `,
  parameters: {
    count: z.number().int().min(1).max(100),
    sides: z.number().int().min(2).max(100),
  },
  implementation: async ({ count, sides }) => {
    const rolls = Array.from(
      { length: count },
      () => Math.floor(Math.random() * sides) + 1
    );
    const sum = rolls.reduce((a, b) => a + b);
    return {
      rolls,
      sum,
    };
  },
});
