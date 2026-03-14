import {
  Client,
  ClientUser,
  GatewayIntentBits,
  TextChannel,
  userMention,
} from "discord.js";
import { handleMessage } from "./handle-message";
import type OpenAI from "openai";
import { makeSender, type SendMessage } from "./sendMessage";
import { shouldReply } from "./judge";
import { logger, withCtx } from "./global";

function stripBackticksAroundMentions(text: string): string {
  return text.replace(/`<@!?(\d+)>`/g, "<@$1>");
}

const token = process.env.DISCORD_TOKEN!;
const BOTLAND_CHANNEL_ID = process.env.BOTLAND_CHANNEL_ID as string;

const startupMessageFlag = process.argv.indexOf("--startupmessage");
const startupMessage =
  (startupMessageFlag !== -1 ? process.argv[startupMessageFlag + 1] : null) ??
  "⚡️🍎🤖 Zapplebot just came online. I will respond when tagged everywhere, but I might just choose to say something here in botland.";

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

const EMOJI_ACK = "👀";
const EMOJI_FIN = "✅";
const EMOJI_FAIL = "❌";

client.once("clientReady", () => {
  logger.info("zapplebot ready", { botId: client.user?.id, botTag: client.user?.tag });
  sendMessage({ content: startupMessage, channelId: BOTLAND_CHANNEL_ID });
});

client.on("messageCreate", async (message) => {
  await withCtx(async () => {
    if (message.author.bot) return;

    const channel = await client.channels.fetch(message.channelId);
    if (!channel || !(channel instanceof TextChannel)) return;

    const messages = await channel.messages.fetch({ limit: 5 });
    const me = client.user as ClientUser;
    const isMention = message.mentions.users.has(me.id);

    logger.debug("message received", {
      messageId: message.id,
      channelId: message.channelId,
      channelName: channel.name,
      userId: message.author.id,
      username: message.author.username,
      isMention,
      contentPreview: message.content.slice(0, 120),
    });

    if (!isMention) {
      if (message.channelId !== BOTLAND_CHANNEL_ID) return;

      const judgeStart = Date.now();
      const autoReply = await shouldReply(messages);
      logger.debug("auto-reply gate", {
        channelId: message.channelId,
        autoReply,
        duration_ms: Date.now() - judgeStart,
      });

      if (!autoReply) return;
    }

    await message.react(EMOJI_ACK);

    const start = Date.now();
    try {
      const chatHistory: OpenAI.Chat.ChatCompletionMessageParam[] = messages
        .filter((e) => e.id !== message.id)
        .reverse()
        .map((e) => ({
          role: e.author.id === me.id ? "assistant" : "user",
          content:
            e.author.id === me.id
              ? e.content
              : `<@${e.author.id}> says: ${e.content}`,
        }));

      const cleaned =
        (message.content ?? "")
          .replace(`<@${me.id}>`, "Zapplebot")
          .replace(`<@!${me.id}>`, "Zapplebot")
          .trim() || "hello";

      const llmResp = await handleMessage(
        cleaned,
        userMention(message.author.id),
        chatHistory
      );

      await sendMessage({
        content: stripBackticksAroundMentions(llmResp.content),
        toolBlock: llmResp.toolBlock,
        channelId: message.channelId,
      });

      logger.info("response sent", {
        messageId: message.id,
        channelId: message.channelId,
        channelName: channel.name,
        userId: message.author.id,
        isMention,
        hadToolCalls: !!llmResp.toolBlock,
        replyLength: llmResp.content.length,
        total_ms: Date.now() - start,
      });
    } catch (err) {
      logger.error("message handler failed", {
        messageId: message.id,
        channelId: message.channelId,
        userId: message.author.id,
        duration_ms: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      await message.react(EMOJI_FAIL);
    } finally {
      await message.react(EMOJI_FIN);
    }
  });
});

client.login(token);
