import {
  LMStudioClient,
  Chat,
  type ChatLike,
  type ChatMessageInput,
  type ToolCallRequest,
  type ToolCallResult,
  text,
} from "@lmstudio/sdk";
import { toolsProvider } from "./tools";
import { getRelevantMemories } from "./tools/memory";
import { getCtxId, setCtx, logger } from "./global";

const lm = new LMStudioClient();
const qwenModel = await lm.llm.model("qwen/qwen3-4b-2507");
const tools = await toolsProvider();

type HandleMessageResponse = {
  content: string;
  toolBlock?: string;
};

export async function handleMessage(
  prompt: string,
  username: string,
  history: Array<ChatMessageInput>
): Promise<HandleMessageResponse> {
  const chatId = getCtxId();
  const subLogger = logger.child({
    chatId,
    user: username,
  });

  const chat = Chat.from([]);

  const simpleContext: Array<string> = [
    ...history.filter((e) => e.role === "user").map((e) => e.content as string),
    prompt,
  ];

  const relevantMems = await getRelevantMemories(...simpleContext);

  const memChat =
    relevantMems.length > 0
      ? [
          {
            role: "system" as const,
            content: `
# Private Memory (do not mention unless directly relevant to the last 1–2 messages)
# If not relevant, ignore completely.
${relevantMems.map((e) => `- ${e.summary} -- from ${e.date}`)}`,
          },
        ]
      : [];

  const system: ChatLike = [
    {
      role: "system",
      content: text`You are Zapplebot ⚡️🍎🤖, a cute and concise helpful bot with access to tools.

      You are being addressed by ${username}. You can address them by ${username} or gender neutral pronouns.
      You are running on a Discord of about 30 people.
      
      Guidelines:
      - Keep your response to about 1500 characters.
      - Keep responses on topic.
      - Refrain from simply listing capabilities unless asked.

      The current date is ${new Date().toISOString()}
      `,
    },
    ...memChat,
    ...history,
    { role: "user", content: prompt },
  ];

  function initChat(chatMessage: ChatMessageInput) {
    chat.append(chatMessage);
    subLogger.debug(`[chat] ${chatMessage.role}`, chatMessage);
  }

  for (const m of system) {
    initChat(m);
  }

  let reply = "";

  let toolCallRequests: Array<ToolCallRequest> = [];

  let toolCallResults: Array<ToolCallResult> = [];

  await qwenModel.act(chat, tools, {
    onMessage: async (message) => {
      chat.append(message);
      subLogger.debug("Response", {
        role: message.getRole(),
        toolCallRequests: message.getToolCallRequests(),
        toolCallResults: message.getToolCallResults(),
        content: message.getText(),
      });
      toolCallRequests.push(...(await message.getToolCallRequests()));
      toolCallResults.push(...(await message.getToolCallResults()));
      reply += message.getText();
    },
  });

  let toolBlock: string | undefined;
  if (toolCallRequests.length > 0 || toolCallResults.length > 0) {
    toolBlock = `//tools
// requests
${JSON.stringify(toolCallRequests, null, 2)}

// responses
${JSON.stringify(toolCallResults, null, 2)}
`;
  }

  setCtx((e) => {
    return { ...e, toolCallRequests, toolCallResults };
  });

  return { content: reply, toolBlock };
}
