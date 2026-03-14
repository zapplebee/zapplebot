import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "crypto";
import { START_TIME } from "./tools/uptime";
import type { SendMessage } from "./sendMessage";
import { logger } from "./global";

const PORT = 8586;
const BOTLAND_CHANNEL_ID = process.env.BOTLAND_CHANNEL_ID as string;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

function getUptime() {
  const ms = Date.now() - START_TIME.getTime();
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / 1000 / 60) % 60;
  const hours = Math.floor(ms / 1000 / 60 / 60) % 24;
  const days = Math.floor(ms / 1000 / 60 / 60 / 24);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return { uptime: parts.join(" "), started_at: START_TIME.toISOString() };
}

function verifySignature(secret: string, rawBody: string, header: string | undefined): boolean {
  if (!header) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  try {
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function startServer(sendMessage: SendMessage) {
  if (!WEBHOOK_SECRET) {
    logger.warn("WEBHOOK_SECRET not set — /webhook endpoint will reject all requests");
  }

  const app = new Hono();

  app.get("/health", (c) => {
    return c.json(getUptime());
  });

  app.post("/webhook", async (c) => {
    if (!WEBHOOK_SECRET) {
      return c.json({ error: "webhook not configured" }, 503);
    }

    const rawBody = await c.req.text();
    const sig = c.req.header("X-Signature-SHA256");

    if (!verifySignature(WEBHOOK_SECRET, rawBody, sig)) {
      logger.warn("webhook signature verification failed");
      return c.json({ error: "invalid signature" }, 401);
    }

    let body: { message?: string };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    if (!body.message || typeof body.message !== "string") {
      return c.json({ error: "missing message field" }, 400);
    }

    await sendMessage({ content: body.message, channelId: BOTLAND_CHANNEL_ID });
    logger.info("webhook message posted to botland", { preview: body.message.slice(0, 80) });

    return c.json({ ok: true });
  });

  Bun.serve({ fetch: app.fetch, port: PORT });
  logger.info(`HTTP server listening on port ${PORT}`);
}
