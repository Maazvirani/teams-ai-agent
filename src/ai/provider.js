'use strict';

/**
 * AI provider abstraction.
 *
 * One function — generateReply() — talks to whichever AI "brain" is configured
 * via the AI_PROVIDER environment variable. Default is Google Gemini (free).
 * You can switch to Groq (free) or OpenAI (paid) without touching the bot code.
 *
 * Uses the built-in global fetch (Node 18+), so there are no extra SDK
 * dependencies to install or update.
 */

const PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

/**
 * @param {object} args
 * @param {string} args.systemPrompt - Instructions defining the agent's persona/knowledge.
 * @param {Array<{role: 'user'|'assistant', text: string}>} args.history - Recent conversation turns.
 * @param {string} args.userMessage - The latest message from the customer.
 * @returns {Promise<string>} The agent's reply text.
 */
async function generateReply({ systemPrompt, history = [], userMessage }) {
  switch (PROVIDER) {
    case 'gemini':
      return callGemini({ systemPrompt, history, userMessage });
    case 'groq':
      return callOpenAICompatible({
        systemPrompt,
        history,
        userMessage,
        baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        providerName: 'Groq',
      });
    case 'openai':
      return callOpenAICompatible({
        systemPrompt,
        history,
        userMessage,
        baseUrl: 'https://api.openai.com/v1/chat/completions',
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        providerName: 'OpenAI',
      });
    default:
      throw new Error(`Unknown AI_PROVIDER "${PROVIDER}". Use "gemini", "groq", or "openai".`);
  }
}

// ---------------------------------------------------------------------------
// Google Gemini (default, free tier)
// ---------------------------------------------------------------------------
async function callGemini({ systemPrompt, history, userMessage }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey');

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Gemini roles are "user" and "model".
  const contents = [
    ...history.map((turn) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.text }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
  };

  const res = await fetchJson(url, body, 'Gemini');
  const text = res?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim();
  if (!text) {
    const blocked = res?.promptFeedback?.blockReason;
    if (blocked) throw new Error(`Gemini blocked the response (${blocked}).`);
    throw new Error('Gemini returned an empty response.');
  }
  return text;
}

// ---------------------------------------------------------------------------
// OpenAI-compatible endpoints (Groq and OpenAI both use this format)
// ---------------------------------------------------------------------------
async function callOpenAICompatible({ systemPrompt, history, userMessage, baseUrl, apiKey, model, providerName }) {
  if (!apiKey) throw new Error(`${providerName} API key is not set.`);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((turn) => ({ role: turn.role, content: turn.text })),
    { role: 'user', content: userMessage },
  ];

  const body = { model, messages, temperature: 0.4, max_tokens: 800 };
  const res = await fetchJson(baseUrl, body, providerName, {
    Authorization: `Bearer ${apiKey}`,
  });
  const text = res?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${providerName} returned an empty response.`);
  return text;
}

// ---------------------------------------------------------------------------
// Small fetch helper with timeout and clear error messages.
// ---------------------------------------------------------------------------
async function fetchJson(url, body, providerName, extraHeaders = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000); // 20s safety timeout
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || data?.error || res.statusText;
      throw new Error(`${providerName} API error (${res.status}): ${msg}`);
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`${providerName} request timed out.`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { generateReply, PROVIDER };
