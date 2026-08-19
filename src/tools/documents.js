'use strict';

/**
 * Real, usable output.
 *
 * Speaking an answer is fine for a question. It is useless when you asked for a
 * proposal, a plan, an invoice or a report — you need something you can open,
 * read, print and send to someone.
 *
 * These tools let VIRANI write a document and hand back a link. The document
 * lives in the same store as everything else, so it survives restarts, and it
 * renders as a clean printable page that saves to PDF from any browser.
 */

const crypto = require('crypto');
const { store } = require('../core/store');
const google = require('../core/google');

const KEY = 'documents';
const MAX_DOCS = 200;

/** Unguessable id — the link itself is the permission to read it. */
function shareId() {
  return crypto.randomBytes(12).toString('base64url');
}

async function all() {
  return store.list(KEY);
}

async function findById(id) {
  const docs = await all();
  return docs.find((d) => d.id === id) || null;
}

const tools = [
  {
    name: 'create_document',
    description:
      'Write a real document and give the owner a link to open, print or send. ' +
      'Use whenever they ask for something they need to KEEP or SHARE rather than ' +
      'just hear: a proposal, a plan, a report, meeting notes, a letter, a quote, ' +
      'an invoice, a checklist, a summary, an agenda. ' +
      'Write the full finished content — not an outline, not a placeholder. ' +
      'Use Markdown: # for the title, ## for sections, - for bullets, ' +
      '| tables |, and **bold**. Then tell the owner in one sentence that it is ready.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The document title.' },
        content: {
          type: 'string',
          description:
            'The complete document in Markdown. Write it properly and in full — ' +
            'this is the deliverable the owner will actually send to someone.',
        },
      },
      required: ['title', 'content'],
    },
    async handler({ title, content }, ctx) {
      const heading = String(title || '').trim();
      const body = String(content || '').trim();
      if (!heading) return { error: 'The document needs a title.' };
      if (!body) return { error: 'The document has no content to write.' };

      const doc = await store.push(KEY, { id: shareId(), title: heading, markdown: body });

      // Keep storage bounded; oldest documents fall off first.
      const docs = await all();
      if (docs.length > MAX_DOCS) await store.replace(KEY, docs.slice(-MAX_DOCS));

      const url = `${google.baseUrl()}/d/${doc.id}`;
      ctx.actions.push({ type: 'open_url', url, label: heading });

      return {
        status: 'written',
        title: heading,
        url,
        words: body.split(/\s+/).length,
        note:
          'The document is open in the owner\'s browser. Anyone with this link can ' +
          'read it, so it can be sent straight to a client. It prints to PDF from ' +
          'the browser\'s print menu.',
      };
    },
  },

  {
    name: 'list_documents',
    description: 'List the documents already written, newest first, with their links.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional words to match in the title.' },
      },
    },
    async handler({ query }) {
      const docs = await all();
      const matched = query
        ? docs.filter((d) => d.title.toLowerCase().includes(String(query).toLowerCase()))
        : docs;

      return {
        count: matched.length,
        documents: matched
          .slice(-20)
          .reverse()
          .map((d) => ({
            id: d.id,
            title: d.title,
            written: d.createdAt,
            url: `${google.baseUrl()}/d/${d.id}`,
          })),
      };
    },
  },

  {
    name: 'read_document',
    description:
      'Read back a document you wrote earlier, so you can quote it, summarise it ' +
      'or use it as the basis for a new one.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The document id.' } },
      required: ['id'],
    },
    async handler({ id }) {
      const doc = await findById(id);
      if (!doc) return { error: 'No document with that id.' };
      return { id: doc.id, title: doc.title, content: doc.markdown, written: doc.createdAt };
    },
  },

  {
    name: 'delete_document',
    description: 'Permanently delete a document. Its link stops working immediately.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    async handler({ id }) {
      const removed = await store.remove(KEY, id);
      return removed ? { deleted: removed.title } : { error: 'No document with that id.' };
    },
  },
];

module.exports = { tools, findById, all, KEY };
