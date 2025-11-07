import { Client, GatewayIntentBits, userMention } from "discord.js";
import { handleMessage } from "./handle-message";
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

  const me = client.user;
  if (!me || !message.mentions.users.has(me.id)) return;

  const cleaned =
    (message.content ?? "")
      .replace(`<@${me.id}>`, "Zapplebot")
      .replace(`<@!${me.id}>`, "Zapplebot")
      .trim() || "hello";

  message.id;

  const resp = await handleMessage(
    cleaned,
    userMention(message.author.id),
    message.id
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
    allowedMentions: { users: [...ids] },
  });
});

client.login(token);
