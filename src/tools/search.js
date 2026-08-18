'use strict';

/**
 * Live web knowledge.
 *
 * VIRANI must be able to answer about *today*, not only about what the model
 * memorised. Three layers, tried in order, so a single blocked source never
 * makes the assistant useless:
 *
 *   1. Gemini with Google Search grounding — real Google results, free tier,
 *      no scraping and no extra API key. This is the primary path.
 *   2. DuckDuckGo (Instant Answer API + the lightweight HTML endpoint).
 *   3. Wikipedia REST API — always up, great for "who/what is X".
 */

const { config } = require('../core/config');
const { getJson, getText, postJson, htmlToText, decodeEntities } = require('../core/http');

// ---------------------------------------------------------------------------
// 1) Gemini + Google Search grounding
// ---------------------------------------------------------------------------
async function groundedSearch(query) {
  if (!config.gemini.apiKey) return null;
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}` +
    `:generateContent?key=${config.gemini.apiKey}`;

  const data = await postJson(url, {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              `Search the web and answer factually and concisely: ${query}\n\n` +
              `Include specific numbers, names and dates where relevant. ` +
              `If the answer changes over time, state when the information is from.`,
          },
        ],
      },
    ],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 800 },
  }, { timeout: 25000 });

  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text || '').join('').trim();
  if (!text) return null;

  const chunks = candidate?.groundingMetadata?.groundingChunks || [];
  const sources = chunks
    .map((c) => c.web && { title: c.web.title, url: c.web.uri })
    .filter(Boolean)
    .slice(0, 5);

  return { source: 'google', answer: text, sources };
}

// ---------------------------------------------------------------------------
// 2) DuckDuckGo
// ---------------------------------------------------------------------------
async function duckInstant(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const data = await getJson(url).catch(() => null);
  if (!data) return null;
  const abstract = (data.AbstractText || data.Answer || '').trim();
  const related = (data.RelatedTopics || [])
    .map((t) => (t.Text ? { title: t.Text, url: t.FirstURL } : null))
    .filter(Boolean)
    .slice(0, 5);
  if (!abstract && related.length === 0) return null;
  return {
    source: 'duckduckgo',
    answer: abstract || undefined,
    sources: [
      ...(data.AbstractURL ? [{ title: data.Heading || query, url: data.AbstractURL }] : []),
      ...related,
    ].slice(0, 5),
  };
}

async function duckHtml(query) {
  const html = await getText(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    { headers: { Accept: 'text/html' } }
  ).catch(() => null);
  if (!html) return null;

  const results = [];
  // Each organic result is an <a class="result__a" href="...">Title</a> followed
  // by an optional <a class="result__snippet">…</a>.
  const linkRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippets = [];
  let m;
  while ((m = snippetRe.exec(html)) !== null) {
    snippets.push(htmlToText(m[1], 400));
  }
  let i = 0;
  while ((m = linkRe.exec(html)) !== null && results.length < 6) {
    results.push({
      title: htmlToText(m[2], 200),
      url: unwrapDuckUrl(m[1]),
      snippet: snippets[i] || '',
    });
    i += 1;
  }
  if (results.length === 0) return null;
  return { source: 'duckduckgo-html', results };
}

/** DuckDuckGo wraps outbound links as //duckduckgo.com/l/?uddg=<encoded>. */
function unwrapDuckUrl(href) {
  const raw = decodeEntities(href);
  const match = /[?&]uddg=([^&]+)/.exec(raw);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch (_) {
      /* fall through */
    }
  }
  return raw.startsWith('//') ? `https:${raw}` : raw;
}

// ---------------------------------------------------------------------------
// 3) Wikipedia
// ---------------------------------------------------------------------------
async function wikipedia(query) {
  const searchUrl =
    'https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch=' +
    encodeURIComponent(query);
  const found = await getJson(searchUrl).catch(() => null);
  const title = found?.query?.search?.[0]?.title;
  if (!title) return null;

  const summary = await getJson(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  ).catch(() => null);
  if (!summary?.extract) return null;

  return {
    source: 'wikipedia',
    answer: summary.extract,
    sources: [
      {
        title: summary.title,
        url: summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
const tools = [
  {
    name: 'web_search',
    description:
      'Search the live internet for current information: news, prices, scores, ' +
      'people, products, definitions, "what happened today", anything the model ' +
      'may not know or that changes over time. ALWAYS use this instead of guessing ' +
      'when a question concerns recent or verifiable facts.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query, in plain language.' },
      },
      required: ['query'],
    },
    async handler({ query }) {
      const attempts = [groundedSearch, duckInstant, duckHtml, wikipedia];
      const failures = [];
      for (const attempt of attempts) {
        try {
          const result = await attempt(query);
          if (result) return { query, ...result };
        } catch (err) {
          failures.push(`${attempt.name}: ${err.message}`);
        }
      }
      return {
        query,
        error: 'No search source could be reached right now.',
        details: failures.slice(0, 3),
      };
    },
  },

  {
    name: 'open_page',
    description:
      'Fetch a specific web page and read its text content. Use after web_search ' +
      'when you need the full detail of one result, or when the user gives you a URL.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full https:// URL to read.' },
      },
      required: ['url'],
    },
    async handler({ url }) {
      if (!/^https?:\/\//i.test(url)) return { error: 'Only http(s) URLs can be read.' };
      try {
        const html = await getText(url, { timeout: 20000 });
        const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
        return {
          url,
          title: title ? htmlToText(title, 200) : undefined,
          content: htmlToText(html, 6000),
        };
      } catch (err) {
        return { url, error: err.message };
      }
    },
  },
];

module.exports = { tools, groundedSearch, unwrapDuckUrl, duckHtml };
