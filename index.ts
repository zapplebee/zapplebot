import {
  Client,
  ClientUser,
  GatewayIntentBits,
  Partials,
  TextChannel,
  userMention,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type User,
} from "discord.js";
import { handleMessage } from "./handle-message";
import type OpenAI from "openai";
import { makeSender, type SendMessage } from "./sendMessage";
import { shouldReply } from "./judge";
import { getCtx, logger, withCtx } from "./global";
import { startServer } from "./server";
import { registerSlashCommands, handleInteraction } from "./interactions";
import { removePersistentMemoryBySourceKey, storePersistentMemory } from "./tools/memory";

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
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

const sendMessage: SendMessage = makeSender(client);

const EMOJI_ACK = "👀";
const EMOJI_FIN = "✅";
const EMOJI_FAIL = "❌";
const EMOJI_WHISPER = "🙉";
const EMOJI_MEMORY = "📌";

function truncateForMemory(value: string, maxLength = 240): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}...`;
}

function memorySummaryFromMessage(message: Message): string | null {
  const content = truncateForMemory(message.content ?? "");
  if (!content) return null;
  return `<@${message.author.id}> says: ${content}`;
}

client.once("clientReady", async () => {
  logger.info("zapplebot ready", { botId: client.user?.id, botTag: client.user?.tag });
  await registerSlashCommands(client);
  sendMessage({ content: startupMessage, channelId: BOTLAND_CHANNEL_ID });
  startServer(sendMessage);
});

client.on("interactionCreate", async (interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (err) {
    logger.error("interaction handler failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

client.on("messageReactionAdd", async (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
  if (user.bot) return;

  const emoji = reaction.emoji.name;
  if (emoji !== EMOJI_MEMORY) return;

  const fullReaction = reaction.partial ? await reaction.fetch() : reaction;
  const message = fullReaction.message.partial ? await fullReaction.message.fetch() : fullReaction.message;

  if (message.author?.bot) return;

  const summary = memorySummaryFromMessage(message);
  if (!summary) return;

  const result = await storePersistentMemory(summary, `discord-message:${message.id}`);
  if (!result.stored && result.duplicate) return;

  logger.info("memory stored from pin reaction", {
    messageId: message.id,
    channelId: message.channelId,
    reactingUserId: user.id,
    summary,
  });
});

client.on("messageReactionRemove", async (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
  if (user.bot) return;

  const emoji = reaction.emoji.name;
  if (emoji !== EMOJI_MEMORY) return;

  const fullReaction = reaction.partial ? await reaction.fetch() : reaction;
  const message = fullReaction.message.partial ? await fullReaction.message.fetch() : fullReaction.message;

  if (message.author?.bot) return;

  const users = await fullReaction.users.fetch();
  const nonBotPinsRemaining = users.some((u) => !u.bot);
  if (nonBotPinsRemaining) return;

  const result = await removePersistentMemoryBySourceKey(`discord-message:${message.id}`);
  if (!result.removed) return;

  logger.info("memory removed from pin reaction", {
    messageId: message.id,
    channelId: message.channelId,
    removingUserId: user.id,
  });
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

    if (message.content.includes("/whisper")) {
      await message.react(EMOJI_WHISPER);
      return;
    }

    await message.react(EMOJI_ACK);

    const start = Date.now();
    try {
      const chatHistory: OpenAI.Chat.ChatCompletionMessageParam[] = messages
        .filter((e) => e.id !== message.id)
        .filter((e) => !e.content.includes("/whisper"))
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
        {
          id: message.author.id,
          mention: userMention(message.author.id),
          displayName: message.member?.displayName ?? message.author.username,
        },
        chatHistory
      );

      const ctx = getCtx();
      const toolCallRequests = Array.isArray(ctx.toolCallRequests) ? ctx.toolCallRequests as Array<{ function?: { name?: string } }> : [];
      const storedMemory = toolCallRequests.some((tc) => tc.function?.name === "add_persistent_memory");

      if (storedMemory) {
        await message.react(EMOJI_MEMORY);
      }

      if (!llmResp.content.trim()) return;

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
