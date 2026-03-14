import { createHmac } from "crypto";

const PORT = 8586;
const URL = `http://localhost:${PORT}/webhook`;

export async function sendWebhook(message: string, secret?: string): Promise<void> {
  const resolvedSecret = secret ?? process.env.WEBHOOK_SECRET;
  if (!resolvedSecret) throw new Error("WEBHOOK_SECRET not set");

  const body = JSON.stringify({ message });
  const sig = `sha256=${createHmac("sha256", resolvedSecret).update(body).digest("hex")}`;

  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Signature-SHA256": sig },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Webhook failed (${res.status}): ${text}`);
  }
}

// CLI entrypoint
if (import.meta.main) {
  const message = process.argv[2];
  if (!message) {
    console.error("Usage: bun run webhook \"<message>\"");
    process.exit(1);
  }
  await sendWebhook(message);
  console.log("Posted.");
}
