// tools/github-bugs.ts
import { tool, text } from "@lmstudio/sdk";
import { z } from "zod";

const GH_PAT = process.env.GH_PAT;
if (!GH_PAT) {
  console.error("❌ Missing GH_PAT in environment");
  // don't exit; allow app to boot but every call will fail fast with a clear error
}

const OWNER = "zapplebee";
const REPO = "zapplebot";
const API = "https://api.github.com";

type GhInit = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

// --- tiny GitHub fetch helper ---
async function ghFetch<T = any>(path: string, init: GhInit = {}): Promise<T> {
  if (!GH_PAT) {
    throw new Error("GH_PAT not set");
  }
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GH_PAT}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "zapplebot-tools",
      ...(init.headers ?? {}),
    },
  });

  // helpful error surface
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const rate = res.headers.get("x-ratelimit-remaining");
    const reset = res.headers.get("x-ratelimit-reset");
    throw new Error(
      `GitHub ${res.status} ${res.statusText} for ${path}\n${text}\n` +
        (rate ? `rateRemaining=${rate} reset=${reset}\n` : "")
    );
  }

  // some endpoints can return 204
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

// ---------- bugReport: open a new GitHub issue ----------
export const bugReport = tool({
  name: "bugReport",
  description: text`
Open a bug in zapplebee/zapplebot using the GitHub API. 
Use this for user-reported problems, regressions, or feature gaps discovered while chatting.`,
  parameters: {
    title: z.string().min(3).max(300),
    body: z
      .string()
      .min(1)
      .describe(
        "Markdown body. Include reproduction steps, expected vs actual, and context."
      ),
  },
  async implementation({ title, body }) {
    const payload = { title, body };
    const out = await ghFetch(`/repos/${OWNER}/${REPO}/issues`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    // Return a compact summary
    return {
      number: out.number,
      url: out.html_url,
      state: out.state,
      title: out.title,
    };
  },
});

// ---------- readBugs: list open issues (with filters) ----------
export const readBugs = tool({
  name: "readBugs",
  description: text`
Read open issues from zapplebee/zapplebot. 
Optionally filter by label(s) or search text, and paginate.`,
  parameters: {
    labels: z.array(z.string()).optional().describe("Filter by labels (AND)"),
    query: z.string().optional().describe("Simple text filter in title/body"),
    per_page: z.number().int().min(1).max(100).default(25),
    page: z.number().int().min(1).default(1),
  },
  async implementation({ labels, query, per_page, page }) {
    const params = new URLSearchParams({
      state: "open",
      per_page: String(per_page),
      page: String(page),
      // Note: GitHub API issues endpoint doesn't natively search body/title with a param;
      // use Search API if query is provided.
    });

    if (labels && labels.length > 0) params.set("labels", labels.join(","));

    if (!query) {
      const list = await ghFetch(
        `/repos/${OWNER}/${REPO}/issues?${params.toString()}`
      );
      return list
        .filter((i: any) => !i.pull_request) // exclude PRs
        .map((i: any) => ({
          number: i.number,
          title: i.title,
          url: i.html_url,
          labels: i.labels?.map((l: any) =>
            typeof l === "string" ? l : l.name
          ),
          created_at: i.created_at,
          updated_at: i.updated_at,
        }));
    } else {
      // Use Search API to filter text
      const q = [
        `repo:${OWNER}/${REPO}`,
        "is:issue",
        "is:open",
        ...(labels ?? []).map((l) => `label:"${l.replace(/"/g, '\\"')}"`),
        query,
      ].join(" ");
      const search = await ghFetch(
        `/search/issues?q=${encodeURIComponent(
          q
        )}&per_page=${per_page}&page=${page}`
      );
      return search.items.map((i: any) => ({
        number: i.number,
        title: i.title,
        url: i.html_url,
        labels: i.labels?.map((l: any) => (typeof l === "string" ? l : l.name)),
        created_at: i.created_at,
        updated_at: i.updated_at,
        score: i.score,
      }));
    }
  },
});

// ---------- (bonus) readRepoFile: fetch a file from the repo (base64 decoded) ----------
export const readRepoFile = tool({
  name: "readRepoFile",
  description: text`
Read a file from zapplebee/zapplebot repository via the Contents API.
Useful for pulling markdown templates (e.g., ISSUE_TEMPLATE), config, etc.`,
  parameters: {
    path: z
      .string()
      .min(1)
      .describe(
        "Path relative to repo root, e.g. '.github/ISSUE_TEMPLATE/bug.md'"
      ),
    ref: z
      .string()
      .optional()
      .describe(
        "Optional git ref (branch, tag, or commit SHA). Defaults to default branch."
      ),
  },
  async implementation({ path, ref }) {
    const qs = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const out = await ghFetch(
      `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}${qs}`
    );
    if (out.type !== "file") {
      return { type: out.type, message: "Not a file", path: out.path };
    }
    // decode base64 content
    const content = Buffer.from(out.content, "base64").toString("utf8");
    return {
      name: out.name,
      path: out.path,
      sha: out.sha,
      size: out.size,
      encoding: out.encoding,
      content,
      html_url: out.html_url,
    };
  },
});
