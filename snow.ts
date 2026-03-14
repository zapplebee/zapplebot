import { load } from "cheerio";
import { JSONFilePreset } from "lowdb/node";

export const NOTICES_URL =
  "https://www.minneapolismn.gov/media/minneapolismngov/site-assets/javascript/site-wide-notices/emergency-en.json";
export const PARKING_URL =
  "https://www.minneapolismn.gov/getting-around/snow/snow-emergencies/snow-updates/";

export type Notice = {
  id?: string;
  version?: string;
  noticetype?: string;
  publishDate?: string;
  expireDate?: string;
  html?: string;
};

export type ActiveNotice = {
  version: string;
  noticetype: string;
  publishDate: string;
  expireDate: string;
  text: string;
};

export type CronData = {
  lastSnowEmergencyVersion: string | null;
};

export const db = await JSONFilePreset<CronData>("cron.json", {
  lastSnowEmergencyVersion: null,
});

export async function fetchActiveNotice(): Promise<ActiveNotice | null> {
  const res = await fetch(NOTICES_URL);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const { notices }: { notices: Notice[] } = await res.json();

  const now = Date.now();
  const active = notices
    .filter(
      (n) =>
        n.id === "snow-emergency" &&
        n.publishDate &&
        n.expireDate &&
        new Date(n.publishDate).getTime() <= now &&
        new Date(n.expireDate).getTime() > now
    )
    .sort(
      (a, b) =>
        new Date(b.publishDate!).getTime() - new Date(a.publishDate!).getTime()
    )
    .at(0) ?? null;

  if (!active) return null;

  const $ = load(active.html ?? "");
  const text = $("h2.show-for-sr").first().text().trim();

  return {
    version: active.version!,
    noticetype: active.noticetype ?? "notice",
    publishDate: active.publishDate!,
    expireDate: active.expireDate!,
    text,
  };
}
