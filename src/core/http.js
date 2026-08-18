'use strict';

/** Small fetch helpers with timeouts, used by every tool that talks to the web. */

const DEFAULT_TIMEOUT = 15000;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function request(url, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: { 'User-Agent': UA, ...(rest.headers || {}) },
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Request to ${hostOf(url)} timed out.`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function getText(url, options = {}) {
  const res = await request(url, options);
  if (!res.ok) throw new Error(`${hostOf(url)} returned HTTP ${res.status}`);
  return res.text();
}

async function getJson(url, options = {}) {
  const res = await request(url, options);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || data?.error_description || data?.error || res.statusText;
    throw new Error(`${hostOf(url)} returned HTTP ${res.status}: ${msg}`);
  }
  return data;
}

async function postJson(url, body, options = {}) {
  return getJson(url, {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(body),
  });
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch (_) {
    return 'the server';
  }
}

/** Turn an HTML page into readable plain text (scripts/styles/tags stripped). */
function htmlToText(html, maxChars = 6000) {
  const text = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(text)
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
    .slice(0, maxChars);
}

function decodeEntities(s) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    '#39': "'", ndash: '-', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘',
    ldquo: '“', rdquo: '”',
  };
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z#0-9]+);/gi, (m, name) => named[name.toLowerCase()] ?? m);
}

module.exports = { request, getText, getJson, postJson, htmlToText, decodeEntities };
