import {
  Client,
  ClientUser,
  GatewayIntentBits,
  TextChannel,
  userMention,
} from "discord.js";
import { handleMessage } from "./handle-message";
import type { ChatLike } from "@lmstudio/sdk";
import { makeSender, type SendMessage } from "./sendMessage";
import { shouldReply } from "./judge";
function stripBackticksAroundMentions(text: string): string {
  // Replace ` <@123> ` or `<@123>` wrapped in backticks
  return text.replace(/`<@!?(\d+)>`/g, "<@$1>");
}
const token = process.env.DISCORD_TOKEN!;
const BOTLAND_CHANNEL_ID = process.env.BOTLAND_CHANNEL_ID as string;

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

const sendMessage: SendMessage = makeSender(client);

client.once("clientReady", () => {
  console.log("🤖 zapplebot with tools active in #botland");
  sendMessage({
    content:
      "⚡️🍎🤖 Zapplebot just came online. I will respond when tagged everywhere, but I might just choose to say something here in botland.",
    channelId: BOTLAND_CHANNEL_ID,
  });
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const channel = await client.channels.fetch(message.channelId);
  // Make sure it is text-based
  if (!channel || !(channel instanceof TextChannel)) return;

  const messages = await channel.messages.fetch({ limit: 5 });
  const me = client.user as ClientUser;

  if (!message.mentions.users.has(me.id)) {
    if (message.channelId !== BOTLAND_CHANNEL_ID) {
      return false;
    }
    const autoReply = await shouldReply(messages);
    if (!autoReply) {
      return false;
    }
  }

  const chatHistory: ChatLike = messages
    .filter((e) => e.id !== message.id)
    .reverse()
    .map((e) => {
      return {
        role: e.author.id === me.id ? "assistant" : "user",
        content:
          e.author.id === me.id
            ? e.content
            : `<@${e.author.id}> says: ${e.content}`,
      };
    });

  const cleaned =
    (message.content ?? "")
      .replace(`<@${me.id}>`, "Zapplebot")
      .replace(`<@!${me.id}>`, "Zapplebot")
      .trim() || "hello";

  const llmResp = await handleMessage(
    cleaned,
    userMention(message.author.id),
    message.id,
    chatHistory
  );

  await sendMessage({
    content: stripBackticksAroundMentions(llmResp.content),
    toolBlock: llmResp.toolBlock,
    channelId: message.channelId,
  });
});

client.login(token);
