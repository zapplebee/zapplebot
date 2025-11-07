import { Chat, LMStudioClient, text, tool, type ChatLike } from "@lmstudio/sdk";
import { z } from "zod";

function stripSearchMarkup(text: string): string {
  // Remove search markup inserted by Wikipedia API.
  return text
    .replaceAll('<span class="searchmatch">', "")
    .replaceAll("</span>", "");
}

const searchWikipediaTool = tool({
  name: "search_wikipedia",
  description: text`
      Searches wikipedia using the given \`query\` string. Returns a list of search results. Each
      search result contains the a \`title\`, a \`summary\`, and a \`page_id\` which can be used to
      retrieve the full page content using get_wikipedia_page.

      Note: this tool searches using Wikipedia, meaning, instead of using natural language queries,
      you should search for terms that you expect there will be an Wikipedia article of. For
      example, if the user asks about "the inventions of Thomas Edison", don't search for "what are
      the inventions of Thomas Edison". Instead, search for "Thomas Edison".

      If a particular query did not return a result that you expect, you should try to search again
      using a more canonical term, or search for a different term that is more likely to contain the
      relevant information.

      ALWAYS use \`get_wikipedia_page\` to retrieve the full content of the page afterwards. NEVER
      try to answer merely based on summary in the search results.
    `,
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
      hint: text`
          If any of the search results are relevant, ALWAYS use \`get_wikipedia_page\` to retrieve
          the full content of the page using the \`page_id\`. The \`summary\` is just a brief 
          snippet and can have missing information. If not, try to search again using a more
          canonical term, or search for a different term that is more likely to contain the relevant
          information.
        `,
    };
  },
});

const getWikipediaPageTool = tool({
  name: "get_wikipedia_page",
  description: text`
      Retrieves the full content of a Wikipedia page using the given \`page_id\`. Returns the title
      and content of a page. Use \`search_wikipedia\` first to get the \`page_id\`.
    `,
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

export async function wikiSubAgent({ search }: { search: string }) {
  const lm = new LMStudioClient();
  const qwenModel = await lm.llm.model("qwen/qwen3-4b-2507");
  const system: ChatLike = [
    {
      role: "system",
      content: `You search and summarize Wikipedia entries into short responses
          `,
    },
    { role: "user", content: `Seach Wikipedia for ${search}` },
  ];

  const chat = Chat.from(system);
  let reply = "";
  await qwenModel.act(chat, [getWikipediaPageTool, searchWikipediaTool], {
    onMessage: async (message) => {
      chat.append(message);
      reply += message.getText();
    },
  });
  return reply;
}

export const searchTool = tool({
  name: "search_wikipedia",
  description: text`search wikipedia for info. only use simple queries like a search bar, not natural language`,
  parameters: { query: z.string() },
  implementation: async ({ query }) => {
    return wikiSubAgent({ search: query });
  },
});
