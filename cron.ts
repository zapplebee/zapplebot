import { openai, MODEL } from "./llm-client";
import { sendWebhook } from "./webhook";
import { logger } from "./global";
import { fetchActiveNotice, db, PARKING_URL } from "./snow";

async function summarize(text: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: `Summarize the following Minneapolis snow emergency update in 1-3 plain sentences. Be direct about whether a snow emergency is declared or not, and include any key dates/phases mentioned.\n\n${text}`,
      },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() ?? text;
}

export async function checkSnowEmergency(): Promise<void> {
  const ctx = { process: "snow-emergency-cron" };

  logger.info("snow emergency check started", ctx);

  const active = await fetchActiveNotice();
  if (!active) {
    logger.info("decision: no active snow emergency notice", ctx);
    return;
  }

  logger.info("active notice found", {
    ...ctx,
    version: active.version,
    noticetype: active.noticetype,
    publishDate: active.publishDate,
    expireDate: active.expireDate,
  });

  if (active.version === db.data.lastSnowEmergencyVersion) {
    logger.info("decision: already posted, skipping", {
      ...ctx,
      version: active.version,
    });
    return;
  }

  const summary = await summarize(active.text);
  const emoji = active.noticetype === "warning" ? "🚨" : "🌨️";
  const message = `${emoji} **Minneapolis Snow Emergency Update**\n${summary}\n${PARKING_URL}`;

  await sendWebhook(message);

  db.data.lastSnowEmergencyVersion = active.version;
  await db.write();

  logger.info("decision: posted snow emergency update", {
    ...ctx,
    version: active.version,
    summary,
  });
}

// CLI entrypoint
if (import.meta.main) {
  await checkSnowEmergency();
}
