import { text, tool } from "../bot-tool";
import { z } from "zod";
import { openai, MODEL } from "../llm-client";
import type OpenAI from "openai";

function stripSearchMarkup(text: string): string {
  // Remove search markup inserted by Wikipedia API.
  return text
    .replaceAll('<span class="searchmatch">', "")
    .replaceAll("</span>", "");
}

const searchWikipediaTool = tool({
  name: "search_wikipedia",
  description: text`Search Wikipedia by keyword. Returns titles, snippets, and page_ids. Always follow up with get_wikipedia_page for full content.`,
  parameters: { query: z.string() },
  implementation: async ({ query }) => {
    // https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=<query>&format=json&utf8=1
    const url = new URL(`https://en.wikipedia.org`);
    url.pathname = "/w/api.php";
    const searchParams = url.searchParams;
    searchParams.set("action", "query");
    searchParams.set("list", "search");
    searchParams.set("srsearch", query);
    searchParams.set("format", "json");
    searchParams.set("utf8", "1");

    const response = await fetch(url.toString());

    if (!response.ok) {
      return { result: `Error: Wikipedia returned a ${response.status} error` };
    }
    const data = await response.json();

    return {
      results: (data as any).query.search.map(
        (result: { title: string; snippet: string; pageid: number }) => ({
          title: result.title,
          summary: stripSearchMarkup(result.snippet),
          page_id: result.pageid,
        })
      ),
      hint: "Call get_wikipedia_page with a page_id for full content.",
    };
  },
});

const getWikipediaPageTool = tool({
  name: "get_wikipedia_page",
  description: text`Fetch full Wikipedia page content by page_id. Use search_wikipedia first to get the page_id.`,
  parameters: { page_id: z.number() },
  implementation: async ({ page_id }) => {
    // https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&pageids=<page_id>&format=json&utf8=1
    const url = new URL(`https://en.wikipedia.org`);
    url.pathname = "/w/api.php";
    const searchParams = url.searchParams;
    searchParams.set("action", "query");
    searchParams.set("prop", "extracts");
    searchParams.set("explaintext", "1");
    searchParams.set("pageids", String(page_id));
    searchParams.set("format", "json");
    searchParams.set("utf8", "1");

    const response = await fetch(url.toString());
    if (!response.ok) {
      return { result: `Error: Wikipedia returned a ${response.status} error` };
    }
    const data = await response.json();
    const page = (data as any).query.pages[page_id];

    return {
      title: page.title,
      content: page.extract ?? "No content available for this page.",
    };
  },
});

const wikiSubtools = [searchWikipediaTool, getWikipediaPageTool];

export async function wikiSubAgent({ search }: { search: string }) {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You search and summarize Wikipedia entries into short responses`,
    },
    { role: "user", content: `Search Wikipedia for ${search}` },
  ];

  const openaiTools = wikiSubtools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: { type: "object", properties: { query: { type: "string" }, page_id: { type: "number" } } },
    },
  }));

  let reply = "";
  while (true) {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: openaiTools,
      tool_choice: "auto",
      max_tokens: 400,
    });

    const choice = response.choices[0];
    if (!choice) break;
    const msg = choice.message;
    messages.push(msg);
    if (msg.content) reply += msg.content;

    if (choice.finish_reason === "tool_calls" && msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        if (tc.type !== "function") continue;
        const t = wikiSubtools.find((x) => x.name === tc.function.name);
        let result: unknown;
        try {
          const args = JSON.parse(tc.function.arguments);
          result = await t!.implementation(args);
        } catch (err) {
          result = { error: String(err) };
        }
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
  return reply;
}

export const searchTool = tool({
  name: "search_wikipedia",
  description: text`Search Wikipedia and return a summarized answer. Use keyword queries (e.g. "Thomas Edison"), not natural language questions.`,
  parameters: { query: z.string() },
  implementation: async ({ query }) => {
    return wikiSubAgent({ search: query });
  },
});

export const followWikipediaLinkTool = tool({
  name: "follow_wikipedia_link",
  description: text`Fetch a Wikipedia article from a direct URL (e.g. https://en.wikipedia.org/wiki/RTX_50_series). Use when a user pastes a Wikipedia link directly.`,
  parameters: { url: z.string() },
  implementation: async ({ url }) => {
    const match = url.match(/en(?:\.m)?\.wikipedia\.org\/wiki\/([^#?]+)/);
    if (!match) return { error: "Not a valid Wikipedia URL" };
    const title = decodeURIComponent(match[1].replace(/_/g, " "));
    return wikiSubAgent({ search: title });
  },
});
