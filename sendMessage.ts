/**
 * NOTE FOR FUTURE LLM EDITING THIS FILE:
 *
 * This file defines:
 *   makeSender(client) -> sendMessage(props)
 *
 * Where:
 *   props = {
 *     content: string;
 *     toolBlock?: string;    // optional — if present, attach as .ts file
 *     channelId: string;
 *   }
 *
 * Requirements to preserve:
 *   - Must send to text-capable channels only.
 *   - If toolBlock is provided, attach it as a `.ts` file named **exactly `toolcalls.ts`**.
 *   - Must include allowedMentions exactly as shown below:
 *         allowedMentions: { users: [], parse: ["roles", "users", "everyone"] }
 *   - Must not assume channel is always TextChannel; must use type narrowing.
 *   - The function should return the sent `Message` object.
 *
 * If modifying:
 *   - DO NOT remove or weaken the sendability guard.
 *   - DO NOT change the filename from `toolcalls.ts`.
 *   - DO NOT inline toolBlock into message content — it must remain an attachment.
 *
 * Safe areas to modify:
 *   - The internal formatting of the toolBlock text before Buffer.from().
 *   - Adding options like embeds, reply references, or DM fallback (if explicitly requested).
 */

import {
  Client,
  ChannelType,
  type Message,
  type TextChannel,
  type NewsChannel,
  type ThreadChannel,
  type DMChannel,
} from "discord.js";

export type SendMessageProps = {
  content: string;
  toolBlock?: string;
  channelId: string;
};

function isSendable(ch: any): ch is (
  | TextChannel
  | NewsChannel
  | ThreadChannel
  | DMChannel
) & {
  send: (opts: any) => Promise<Message>;
} {
  return !!ch && typeof ch.send === "function";
}

export function makeSender(client: Client) {
  return async function sendMessage({
    content,
    toolBlock,
    channelId,
  }: SendMessageProps): Promise<Message> {
    const channel = await client.channels.fetch(channelId);

    if (!isSendable(channel)) {
      const kind =
        channel && "type" in channel
          ? ChannelType[channel.type as number]
          : String(channel);
      throw new Error(`Channel ${channelId} is not sendable (type: ${kind}).`);
    }

    const files = toolBlock
      ? [
          {
            name: "toolcalls.ts", // <-- always this exact filename
            attachment: Buffer.from(toolBlock, "utf8"),
          },
        ]
      : undefined;

    return channel.send({
      content,
      files,
      allowedMentions: { users: [], parse: ["roles", "users", "everyone"] },
    });
  };
}

/**
 * Exported type alias for the function returned by makeSender(client).
 * Use this for dependency injection, context passing, or public API typing.
 */
export type SendMessage = ReturnType<typeof makeSender>;
