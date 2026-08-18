'use strict';

/**
 * The reasoning loop.
 *
 * This is what separates a real agent from a chatbot: the model is given the
 * tool catalogue, it decides what to call, the server actually runs those
 * calls, feeds the results back, and the loop repeats until the model has
 * everything it needs to answer. Multiple tools can run in one round.
 *
 * Gemini is the default brain (free tier). Groq and OpenAI speak the same
 * loop through their tool-calling format, so switching is one env var.
 */

const { config } = require('./config');
const { postJson } = require('./http');
const tools = require('../tools');

async function think({ systemPrompt, history = [], userMessage, channel = 'voice' }) {
  const ctx = { actions: [], log: [], channel };
  const provider = config.aiProvider;

  const reply =
    provider === 'gemini'
      ? await runGemini({ systemPrompt, history, userMessage, ctx })
      : await runOpenAICompatible({ systemPrompt, history, userMessage, ctx, provider });

  return { reply, actions: ctx.actions, toolLog: ctx.log };
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

/** Gemini wants OpenAPI-style schemas with UPPERCASE type names. */
function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type' && typeof value === 'string') out.type = value.toUpperCase();
    else if (key === 'properties') {
      out.properties = Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, toGeminiSchema(v)])
      );
    } else if (key === 'items') out.items = toGeminiSchema(value);
    else out[key] = value;
  }
  return out;
}

function geminiTools() {
  const declarations = tools.declarations().map((d) => {
    const hasParams = Object.keys(d.parameters?.properties || {}).length > 0;
    return {
      name: d.name,
      description: d.description,
      // Gemini rejects an empty parameter object — omit it for no-argument tools.
      ...(hasParams ? { parameters: toGeminiSchema(d.parameters) } : {}),
    };
  });
  return [{ functionDeclarations: declarations }];
}

async function runGemini({ systemPrompt, history, userMessage, ctx }) {
  if (!config.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey');
  }
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}` +
    `:generateContent?key=${config.gemini.apiKey}`;

  const contents = [
    ...history.map((t) => ({
      role: t.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: t.text }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  for (let round = 0; round < config.maxToolRounds; round += 1) {
    const data = await postJson(
      url,
      {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: geminiTools(),
        generationConfig: { temperature: 0.6, maxOutputTokens: 1024 },
      },
      { timeout: 45000 }
    );

    const candidate = data?.candidates?.[0];
    if (!candidate) {
      const blocked = data?.promptFeedback?.blockReason;
      throw new Error(blocked ? `The model blocked that request (${blocked}).` : 'The model returned nothing.');
    }

    const parts = candidate.content?.parts || [];
    const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);

    if (calls.length === 0) {
      const text = parts.map((p) => p.text || '').join('').trim();
      if (text) return text;
      if (candidate.finishReason === 'MAX_TOKENS') {
        return 'I ran out of room mid-thought. Ask me again and I will keep it shorter.';
      }
      throw new Error('The model returned an empty answer.');
    }

    // Run every requested tool for this round, in parallel.
    const results = await Promise.all(
      calls.map(async (call) => ({
        name: call.name,
        response: await tools.run(call.name, call.args || {}, ctx),
      }))
    );

    contents.push({ role: 'model', parts: parts.filter((p) => p.functionCall || p.text) });
    contents.push({
      role: 'user',
      parts: results.map((r) => ({
        functionResponse: { name: r.name, response: wrap(r.response) },
      })),
    });
  }

  return 'That took more steps than I expected. Give me the request one piece at a time.';
}

/** Gemini requires a functionResponse payload to be a JSON object. */
function wrap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : { result: value };
}

// ---------------------------------------------------------------------------
// OpenAI / Groq (same wire format)
// ---------------------------------------------------------------------------
async function runOpenAICompatible({ systemPrompt, history, userMessage, ctx, provider }) {
  const settings = {
    groq: {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: config.groq.apiKey,
      model: config.groq.model,
      label: 'Groq',
    },
    openai: {
      url: 'https://api.openai.com/v1/chat/completions',
      apiKey: config.openai.apiKey,
      model: config.openai.model,
      label: 'OpenAI',
    },
  }[provider];

  if (!settings) throw new Error(`Unknown AI_PROVIDER "${provider}". Use gemini, groq or openai.`);
  if (!settings.apiKey) throw new Error(`${settings.label} API key is not set.`);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((t) => ({ role: t.role, content: t.text })),
    { role: 'user', content: userMessage },
  ];

  const toolSpec = tools.declarations().map((d) => ({
    type: 'function',
    function: { name: d.name, description: d.description, parameters: d.parameters },
  }));

  for (let round = 0; round < config.maxToolRounds; round += 1) {
    const data = await postJson(
      settings.url,
      {
        model: settings.model,
        messages,
        tools: toolSpec,
        tool_choice: 'auto',
        temperature: 0.6,
        max_tokens: 1024,
      },
      { headers: { Authorization: `Bearer ${settings.apiKey}` }, timeout: 45000 }
    );

    const message = data?.choices?.[0]?.message;
    if (!message) throw new Error(`${settings.label} returned nothing.`);

    const calls = message.tool_calls || [];
    if (calls.length === 0) {
      const text = (message.content || '').trim();
      if (!text) throw new Error(`${settings.label} returned an empty answer.`);
      return text;
    }

    messages.push(message);
    const results = await Promise.all(
      calls.map(async (call) => {
        let args = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch (_) {
          args = {};
        }
        return {
          id: call.id,
          content: await tools.run(call.function.name, args, ctx),
        };
      })
    );
    for (const r of results) {
      messages.push({ role: 'tool', tool_call_id: r.id, content: JSON.stringify(r.content) });
    }
  }

  return 'That took more steps than I expected. Give me the request one piece at a time.';
}

module.exports = { think, toGeminiSchema };
