'use strict';

/**
 * Long-term memory — the thing that makes VIRANI feel like it knows you.
 *
 * Conversation history is short-term (the last N turns). Anything worth
 * keeping forever — your name, your work, your preferences, people in your
 * life, decisions you made — is written here and injected into every future
 * conversation, on every device.
 */

const { store } = require('../core/store');

const KEY = 'facts';
const MAX_FACTS = 300;

async function allFacts() {
  return store.list(KEY);
}

/** A compact digest of everything remembered, for the system prompt. */
async function memoryDigest(limit = 60) {
  const facts = await allFacts();
  if (facts.length === 0) return '';
  return facts
    .slice(-limit)
    .map((f) => `- [${f.category || 'general'}] ${f.text}`)
    .join('\n');
}

function score(fact, needle) {
  const text = `${fact.text} ${fact.category || ''}`.toLowerCase();
  const words = needle.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return text.includes(needle.toLowerCase()) ? 1 : 0;
  return words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0) / words.length;
}

const tools = [
  {
    name: 'remember',
    description:
      'Save a fact about the owner permanently, so you still know it in weeks. ' +
      'Use this whenever they tell you something durable about themselves: their ' +
      'name, job, family, city, preferences, goals, ongoing projects, important ' +
      'dates, how they like you to behave. Do NOT use it for one-off chit-chat.',
    parameters: {
      type: 'object',
      properties: {
        fact: {
          type: 'string',
          description: 'The fact, written in the third person, e.g. "Prefers short spoken answers."',
        },
        category: {
          type: 'string',
          description: 'A grouping label, e.g. "identity", "work", "preference", "people", "health".',
        },
      },
      required: ['fact'],
    },
    async handler({ fact, category }) {
      const text = String(fact || '').trim();
      if (!text) return { error: 'Nothing to remember.' };

      const existing = await allFacts();
      const duplicate = existing.find((f) => f.text.toLowerCase() === text.toLowerCase());
      if (duplicate) return { alreadyKnown: true, fact: duplicate.text, id: duplicate.id };

      const saved = await store.push(KEY, { text, category: category || 'general' });

      // Keep memory bounded so prompts stay small and fast.
      const after = await allFacts();
      if (after.length > MAX_FACTS) {
        await store.replace(KEY, after.slice(-MAX_FACTS));
      }
      return { remembered: saved.text, id: saved.id, category: saved.category };
    },
  },

  {
    name: 'recall',
    description:
      'Search everything you have permanently remembered about the owner. ' +
      'Use when they ask "what do you know about…", "what did I tell you about…", ' +
      'or when you need a detail that is not in the recent conversation.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for. Omit to list everything.' },
      },
    },
    async handler({ query }) {
      const facts = await allFacts();
      if (!query) {
        return { count: facts.length, facts: facts.map((f) => ({ id: f.id, category: f.category, fact: f.text })) };
      }
      const hits = facts
        .map((f) => ({ f, s: score(f, query) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 15)
        .map((x) => ({ id: x.f.id, category: x.f.category, fact: x.f.text }));
      return { query, count: hits.length, facts: hits };
    },
  },

  {
    name: 'forget',
    description: 'Permanently delete a remembered fact. Pass its id, or words matching it.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        match: { type: 'string', description: 'Words from the fact to match instead of an id.' },
      },
    },
    async handler({ id, match }) {
      const facts = await allFacts();
      let target = id ? facts.find((f) => f.id === id) : null;
      if (!target && match) {
        const hits = facts.filter((f) => score(f, match) >= 0.5);
        if (hits.length > 1) {
          return {
            error: 'Several facts match — ask which one.',
            candidates: hits.map((f) => ({ id: f.id, fact: f.text })),
          };
        }
        target = hits[0];
      }
      if (!target) return { error: 'No matching memory found.' };
      await store.remove(KEY, target.id);
      return { forgotten: target.text };
    },
  },
];

module.exports = { tools, memoryDigest, allFacts, KEY };
