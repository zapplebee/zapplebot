import { text, tool } from "../bot-tool";

export const START_TIME = new Date();

export const uptimeTool = tool({
  name: "get_uptime",
  description: text`
    Returns how long the bot has been running since it last started.
    Use this when someone asks how long the bot has been up or online.
  `,
  parameters: {},
  implementation: async () => {
    const now = new Date();
    const ms = now.getTime() - START_TIME.getTime();

    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / 1000 / 60) % 60;
    const hours = Math.floor(ms / 1000 / 60 / 60) % 24;
    const days = Math.floor(ms / 1000 / 60 / 60 / 24);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return {
      uptime: parts.join(" "),
      started_at: START_TIME.toISOString(),
    };
  },
});
