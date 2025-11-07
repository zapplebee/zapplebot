import {
  Client,
  GatewayIntentBits,
  TextChannel,
  userMention,
} from "discord.js";
import { handleMessage } from "./handle-message";
import type { ChatLike } from "@lmstudio/sdk";
function stripBackticksAroundMentions(text: string): string {
  // Replace ` <@123> ` or `<@123>` wrapped in backticks
  return text.replace(/`<@!?(\d+)>`/g, "<@$1>");
}
const token = process.env.DISCORD_TOKEN!;

if (!token) {
  console.error("❌ DISCORD_TOKEN missing in .env");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("clientReady", () => {
  console.log("🤖 zapplebot with tools active in #botland");
});

client.on("messageCreate", async (message) => {
  // todo read history and inject into context
  // todo randomly poll rooms and have an act that decides "do I have anything to say?"

  if (message.author.bot) return;

  const channel = await client.channels.fetch(message.channelId);
  // Make sure it is text-based
  if (!channel || !(channel instanceof TextChannel)) return;

  const messages = await channel.messages.fetch({ limit: 5 });
  const me = client.user;

  if (!me || !message.mentions.users.has(me.id)) return;
  const chatHistory: ChatLike = messages
    .filter((e) => e.id !== message.id)
    .reverse()
    .map((e) => {
      return {
        role: e.id === me.id ? "assistant" : "user",
        content: e.id === me.id ? e.content : `<@${e.id}> says: ${e.content}`,
      };
    });

  messages.forEach((msg) => {
    console.log(`[${msg.author.id}] ${msg.content}`);
  });

  const cleaned =
    (message.content ?? "")
      .replace(`<@${me.id}>`, "Zapplebot")
      .replace(`<@!${me.id}>`, "Zapplebot")
      .trim() || "hello";

  message.id;

  const resp = await handleMessage(
    cleaned,
    userMention(message.author.id),
    message.id,
    chatHistory
  );
  const ids = new Set<string>();
  const regex = /<@!?(\d+)>/g;
  let match;
  while ((match = regex.exec(resp)) !== null) {
    ids.add(match[1] as string);
  }

  ids.add(message.author.id);

  await message.reply({
    content: stripBackticksAroundMentions(resp),
    allowedMentions: { users: [], parse: ["roles", "users", "everyone"] },
  });
});

client.login(token);
