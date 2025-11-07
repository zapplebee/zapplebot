import * as winston from "winston";
import { randomBytes } from "node:crypto";
import {
  LMStudioClient,
  Chat,
  type ChatLike,
  type ChatMessageInput,
} from "@lmstudio/sdk";
import { toolsProvider } from "./tools";
import { getMemoryRaw } from "./tools/memory";

const logger = winston.createLogger({
  level: "debug",
  format: winston.format.json(),
  transports: [new winston.transports.File({ filename: "chat.log" })],
});

const lm = new LMStudioClient();
const qwenModel = await lm.llm.model("qwen/qwen3-4b-2507");
const tools = await toolsProvider();

export async function handleMessage(
  cleaned: string,
  userMentionString: string,
  messageId: string
): Promise<string> {
  const memoryTool = await getMemoryRaw();
  const chatId = randomBytes(8).toString("hex"); // 8 bytes → 16 hex chars
  const subLogger = logger.child({
    chatId,
    user: userMentionString,
    discordMessageId: messageId,
  });

  const chat = Chat.from([]);

  const system: ChatLike = [
    {
      role: "system",
      content: `You are Zapplebot, a cute and concise helpful bot with access to tools.

      You are being addressed by ${userMentionString}. You can address them by ${userMentionString} or gender neutral pronouns.
      You are running on a Discord of about 30 people.
      Always acknowledge the completion of the user's request. If you used a tool, tell the user.`,
    },
    ...memoryTool.map((e) => ({
      role: "assistant" as "assistant",
      content: `[memory] ${e.summary}`,
    })),
    { role: "user", content: cleaned },
  ];

  function initChat(chatMessage: ChatMessageInput) {
    chat.append(chatMessage);
    subLogger.debug(`[chat] ${chatMessage.role}`, chatMessage);
  }

  for (const m of system) {
    initChat(m);
  }

  let reply = "";

  await qwenModel.act(chat, tools, {
    onMessage: async (message) => {
      chat.append(message);
      subLogger.debug("Response", {
        role: message.getRole(),
        toolCallRequests: message.getToolCallRequests(),
        toolCallResults: message.getToolCallResults(),
        content: message.getText(),
      });
      reply += message.getText();
    },
  });

  return reply;
}
