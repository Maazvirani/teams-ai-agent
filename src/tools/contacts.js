'use strict';

/**
 * The address book.
 *
 * This is what lets you say "call Ali" or "WhatsApp mum that I'm running late"
 * instead of reciting a phone number. Contacts are stored permanently and are
 * resolved by fuzzy name match, so "ali" finds "Ali Raza".
 */

const { store } = require('../core/store');

const KEY = 'contacts';

async function all() {
  return store.list(KEY);
}

function normalise(value) {
  return String(value || '').toLowerCase().trim();
}

/** Digits only, keeping a leading + so wa.me and tel: links both work. */
function cleanNumber(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  const plus = value.startsWith('+');
  const digits = value.replace(/\D/g, '');
  return digits ? (plus ? `+${digits}` : digits) : '';
}

/**
 * Find one contact by name. Exact match wins, then "starts with", then
 * "contains" — so a partial or mis-heard name still lands.
 */
async function resolve(name) {
  const needle = normalise(name);
  if (!needle) return { error: 'Which person?' };

  const contacts = await all();
  if (contacts.length === 0) {
    return { error: 'There are no contacts saved yet. Ask the user for the number, then save it.' };
  }

  const exact = contacts.filter((c) => normalise(c.name) === needle);
  const starts = contacts.filter((c) => normalise(c.name).startsWith(needle));
  const contains = contacts.filter((c) => normalise(c.name).includes(needle));
  const firstWord = contacts.filter((c) => normalise(c.name).split(/\s+/).includes(needle));

  const hits = exact.length ? exact : firstWord.length ? firstWord : starts.length ? starts : contains;

  if (hits.length === 0) {
    return {
      error: `No contact called "${name}".`,
      known: contacts.map((c) => c.name),
    };
  }
  if (hits.length > 1) {
    return {
      error: 'Several contacts match — ask the user which one.',
      candidates: hits.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email })),
    };
  }
  return { contact: hits[0] };
}

function view(contact) {
  return {
    id: contact.id,
    name: contact.name,
    phone: contact.phone || undefined,
    email: contact.email || undefined,
    note: contact.note || undefined,
  };
}

const tools = [
  {
    name: 'save_contact',
    description:
      'Save or update a person in the address book so they can later be called, ' +
      'messaged or emailed by name alone. Use whenever the owner gives you ' +
      "someone's number or email, even in passing.",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The person\'s name as the owner says it.' },
        phone: { type: 'string', description: 'Phone number, ideally with country code.' },
        email: { type: 'string', description: 'Email address.' },
        note: { type: 'string', description: 'Who they are, e.g. "brother", "accountant".' },
      },
      required: ['name'],
    },
    async handler({ name, phone, email, note }) {
      const cleanName = String(name || '').trim();
      if (!cleanName) return { error: 'A contact needs a name.' };

      const contacts = await all();
      const existing = contacts.find((c) => normalise(c.name) === normalise(cleanName));

      if (existing) {
        // Merge rather than overwrite — adding an email must not wipe the number.
        if (phone) existing.phone = cleanNumber(phone);
        if (email) existing.email = String(email).trim();
        if (note) existing.note = String(note).trim();
        await store.replace(KEY, contacts);
        return { updated: view(existing) };
      }

      const saved = await store.push(KEY, {
        name: cleanName,
        phone: cleanNumber(phone),
        email: String(email || '').trim(),
        note: String(note || '').trim(),
      });
      return { saved: view(saved) };
    },
  },

  {
    name: 'find_contact',
    description:
      'Look up someone in the address book. Use before calling or messaging a ' +
      'person by name, to get their number or email.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name to look for. Omit to list everyone.' },
      },
    },
    async handler({ name }) {
      if (!name) {
        const contacts = await all();
        return { count: contacts.length, contacts: contacts.map(view) };
      }
      const found = await resolve(name);
      return found.contact ? { contact: view(found.contact) } : found;
    },
  },

  {
    name: 'delete_contact',
    description: 'Remove someone from the address book.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
    async handler({ name }) {
      const found = await resolve(name);
      if (!found.contact) return found;
      await store.remove(KEY, found.contact.id);
      return { deleted: found.contact.name };
    },
  },
];

module.exports = { tools, resolve, cleanNumber, all, KEY };
