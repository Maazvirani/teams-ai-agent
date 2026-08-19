'use strict';

/**
 * Notes and lists.
 *
 * Distinct from long-term memory: `remember` stores facts about *you*, while
 * these hold content you dictate — ideas, numbers, a shopping list, a to-do
 * list. Lists are created on first use, so "add milk to the shopping list"
 * works before any list exists.
 */

const { store } = require('../core/store');

const NOTES_KEY = 'notes';
const LISTS_KEY = 'lists';

function normalise(name) {
  return String(name || 'general').toLowerCase().trim().replace(/\s+list$/, '') || 'general';
}

async function getLists() {
  const lists = await store.get(LISTS_KEY);
  return lists && typeof lists === 'object' && !Array.isArray(lists) ? lists : {};
}

const tools = [
  {
    name: 'save_note',
    description:
      'Write something down for the owner — an idea, a number, an address, a ' +
      'quote, anything dictated to be kept. Use for "note that…", "write this ' +
      'down", "make a note". For durable facts about the owner themselves, use ' +
      'remember instead.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The note content, tidied into clear prose.' },
        title: { type: 'string', description: 'A short title so it can be found later.' },
      },
      required: ['text'],
    },
    async handler({ text, title }) {
      const body = String(text || '').trim();
      if (!body) return { error: 'There is nothing to note.' };
      const saved = await store.push(NOTES_KEY, {
        title: String(title || body.split(/[.\n]/)[0]).trim().slice(0, 60),
        text: body,
      });
      return { saved: { id: saved.id, title: saved.title } };
    },
  },

  {
    name: 'read_notes',
    description: 'Read back saved notes, optionally only those matching some words.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to search for. Omit for the most recent notes.' },
        limit: { type: 'integer', description: 'How many to return. Default 10.' },
      },
    },
    async handler({ query, limit }) {
      const notes = await store.list(NOTES_KEY);
      const max = Math.min(Math.max(parseInt(limit || 10, 10) || 10, 1), 30);

      const matched = query
        ? notes.filter((n) => `${n.title} ${n.text}`.toLowerCase().includes(String(query).toLowerCase()))
        : notes;

      return {
        count: matched.length,
        notes: matched
          .slice(-max)
          .reverse()
          .map((n) => ({ id: n.id, title: n.title, text: n.text, savedAt: n.createdAt })),
      };
    },
  },

  {
    name: 'delete_note',
    description: 'Delete a saved note by its id.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    async handler({ id }) {
      const removed = await store.remove(NOTES_KEY, id);
      return removed ? { deleted: removed.title } : { error: 'No note with that id.' };
    },
  },

  {
    name: 'add_to_list',
    description:
      'Add one or more items to a named list — shopping, to-do, packing, anything. ' +
      'The list is created automatically if it does not exist yet.',
    parameters: {
      type: 'object',
      properties: {
        list: { type: 'string', description: 'List name, e.g. "shopping" or "todo". Default "general".' },
        items: {
          type: 'array',
          items: { type: 'string' },
          description: 'The items to add. Split naturally spoken lists into separate items.',
        },
      },
      required: ['items'],
    },
    async handler({ list, items }) {
      const name = normalise(list);
      const additions = (Array.isArray(items) ? items : [items])
        .map((i) => String(i || '').trim())
        .filter(Boolean);
      if (additions.length === 0) return { error: 'Nothing to add.' };

      const lists = await getLists();
      const current = lists[name] || [];
      const existing = new Set(current.map((i) => i.toLowerCase()));
      const fresh = additions.filter((i) => !existing.has(i.toLowerCase()));

      lists[name] = [...current, ...fresh];
      await store.set(LISTS_KEY, lists);

      return {
        list: name,
        added: fresh,
        alreadyThere: additions.filter((i) => existing.has(i.toLowerCase())),
        total: lists[name].length,
      };
    },
  },

  {
    name: 'read_list',
    description: 'Read out a named list, or name every list that exists.',
    parameters: {
      type: 'object',
      properties: {
        list: { type: 'string', description: 'List name. Omit to see which lists exist.' },
      },
    },
    async handler({ list }) {
      const lists = await getLists();
      if (!list) {
        return {
          lists: Object.entries(lists).map(([name, items]) => ({ name, count: items.length })),
        };
      }
      const name = normalise(list);
      if (!lists[name]) return { error: `There is no "${name}" list yet.`, lists: Object.keys(lists) };
      return { list: name, count: lists[name].length, items: lists[name] };
    },
  },

  {
    name: 'remove_from_list',
    description:
      'Remove items from a list, or empty it completely. Use when something is ' +
      'bought, done or no longer needed.',
    parameters: {
      type: 'object',
      properties: {
        list: { type: 'string' },
        items: {
          type: 'array',
          items: { type: 'string' },
          description: 'Items to remove. Matching is case-insensitive and partial.',
        },
        clear_all: { type: 'boolean', description: 'True to empty the whole list.' },
      },
      required: ['list'],
    },
    async handler({ list, items, clear_all: clearAll }) {
      const name = normalise(list);
      const lists = await getLists();
      if (!lists[name]) return { error: `There is no "${name}" list.`, lists: Object.keys(lists) };

      if (clearAll) {
        const had = lists[name].length;
        lists[name] = [];
        await store.set(LISTS_KEY, lists);
        return { list: name, cleared: had };
      }

      const targets = (Array.isArray(items) ? items : [items])
        .map((i) => String(i || '').toLowerCase().trim())
        .filter(Boolean);
      if (targets.length === 0) return { error: 'Say which items to remove, or set clear_all.' };

      const removed = [];
      lists[name] = lists[name].filter((item) => {
        const hit = targets.some((t) => item.toLowerCase().includes(t) || t.includes(item.toLowerCase()));
        if (hit) removed.push(item);
        return !hit;
      });
      await store.set(LISTS_KEY, lists);

      return { list: name, removed, remaining: lists[name] };
    },
  },
];

module.exports = { tools, NOTES_KEY, LISTS_KEY, getLists };
