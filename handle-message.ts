import { stringify as yamlStringify } from "yaml";
import { tools, openaiTools } from "./tools";
import { getRelevantMemories } from "./tools/memory";
import { getCtxId, setCtx, logger, convoLogger } from "./global";
import { openai, MODEL } from "./llm-client";
import type OpenAI from "openai";

type HandleMessageResponse = {
  content: string;
  toolBlock?: string;
};

export type UserInfo = {
  id: string;
  mention: string;      // <@id> — what the model sees
  displayName: string;  // human-readable name — logging only
};

export async function handleMessage(
  prompt: string,
  userInfo: UserInfo,
  history: Array<OpenAI.Chat.ChatCompletionMessageParam>
): Promise<HandleMessageResponse> {
  const chatId = getCtxId();
  const start = Date.now();
  const subLogger = logger.child({ chatId, user: userInfo.mention });

  subLogger.debug("handle start", {
    historySize: history.length,
    promptLength: prompt.length,
    prompt,
  });

  const simpleContext: Array<string> = [
    ...history.filter((e) => e.role === "user").map((e) => e.content as string),
    prompt,
  ];

  const relevantMems = await getRelevantMemories(...simpleContext);

  subLogger.debug("memory retrieved", {
    count: relevantMems.length,
    summaries: relevantMems.map((m) => m.summary),
  });

  const memMessage: OpenAI.Chat.ChatCompletionMessageParam[] =
    relevantMems.length > 0
      ? [
          {
            role: "system",
            content: `# Private Memory (do not mention unless directly relevant to the last 1–2 messages)
# If not relevant, ignore completely.
${relevantMems.map((e) => `- ${e.summary} -- from ${e.date}`).join("\n")}`,
          },
        ]
      : [];

  const dndTrigger = prompt.includes("/dnd")
    ? [
        {
          role: "system" as const,
          content: "The user invoked /dnd. You MUST call the dnd_combat tool immediately before responding.",
        },
      ]
    : [];

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `/no_think\nYou are Zapplebot ⚡️🍎🤖, a concise Discord bot (~30 users). Talking to ${userInfo.mention}.\nReply ≤1500 chars. Stay on topic. Use tools when helpful. Don't list capabilities unprompted.\nBe proactive about memory: when the user reveals a durable fact, preference, relationship, ongoing situation, repeated correction, or something they want remembered, call add_persistent_memory.`,
    },
    ...memMessage,
    ...dndTrigger,
    ...history,
    { role: "user", content: prompt },
  ];

  convoLogger.info("request", {
    chatId,
    model: MODEL,
    user: {
      id: userInfo.id,
      mention: userInfo.mention,
      displayName: userInfo.displayName,
    },
    messages,
  });

  let reply = "";
  const toolCallRequests: unknown[] = [];
  const toolCallResults: unknown[] = [];
  let turn = 0;

  // Agentic tool loop
  while (true) {
    turn++;
    const turnStart = Date.now();

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: openaiTools,
      tool_choice: "auto",
      max_tokens: 2048,
    });

    const choice = response.choices[0];
    if (!choice) break;
    const msg = choice.message;
    messages.push(msg);

    subLogger.debug("llm response", {
      turn,
      finish_reason: choice.finish_reason,
      tool_calls: msg.tool_calls?.map((tc) => tc.type === "function" ? tc.function.name : tc.type),
      content_length: msg.content?.length ?? 0,
      usage: response.usage,
      duration_ms: Date.now() - turnStart,
    });

    if (msg.content) reply += msg.content;

    if (choice.finish_reason === "tool_calls" && msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        if (tc.type !== "function") continue;
        const t = tools.find((x) => x.name === tc.function.name);
        toolCallRequests.push(tc);

        const toolStart = Date.now();
        let result: unknown;
        let success = true;
        try {
          const args = JSON.parse(tc.function.arguments);
          result = await t!.implementation(args);
        } catch (err) {
          result = { error: String(err) };
          success = false;
        }

        subLogger.debug("tool call", {
          tool: tc.function.name,
          args: tc.function.arguments,
          success,
          duration_ms: Date.now() - toolStart,
        });

        toolCallResults.push({ id: tc.id, result });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    } else {
      break;
    }
  }

  subLogger.debug("handle complete", {
    turns: turn,
    toolCallCount: toolCallRequests.length,
    replyLength: reply.length,
    total_ms: Date.now() - start,
  });

  convoLogger.info("response", {
    chatId,
    model: MODEL,
    user: {
      id: userInfo.id,
      mention: userInfo.mention,
      displayName: userInfo.displayName,
    },
    reply,
    toolCallRequests,
    toolCallResults,
    turns: turn,
    total_ms: Date.now() - start,
  });

  let toolBlock: string | undefined;
  if (toolCallRequests.length > 0) {
    type TcRequest = { id: string; function: { name: string; arguments: string } };
    type TcResult = { id: string; result: unknown };
    const resultById = new Map(
      (toolCallResults as TcResult[]).map((r) => [r.id, r.result])
    );
    const calls = (toolCallRequests as TcRequest[]).map((req) => ({
      tool: req.function.name,
      request: JSON.parse(req.function.arguments),
      response: resultById.get(req.id),
    }));
    toolBlock = yamlStringify(calls, { lineWidth: 80 });
  }

  setCtx((e) => {
    return { ...e, toolCallRequests, toolCallResults };
  });

  if (!reply.trim()) {
    subLogger.warn("empty reply from LLM, suppressing message");
    return { content: "", toolBlock };
  }

  return { content: reply, toolBlock };
}
