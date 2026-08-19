'use strict';

/**
 * Messaging people by name.
 *
 * "WhatsApp Ali that I'm running twenty minutes late" resolves the contact,
 * opens WhatsApp with the message already typed, and leaves the send button to
 * you. Same for SMS and for email when Gmail is not connected.
 *
 * Pre-filling rather than auto-sending is deliberate: a mis-heard word should
 * never go out under your name without you seeing it.
 */

const { resolve, cleanNumber } = require('./contacts');

/** Turn either a saved name or a raw number into something dialable. */
async function targetNumber(to) {
  const direct = cleanNumber(to);
  // A raw number is anything that survives as 7+ digits.
  if (direct.replace(/\D/g, '').length >= 7) return { number: direct, name: direct };

  const found = await resolve(to);
  if (!found.contact) return found;
  if (!found.contact.phone) {
    return { error: `${found.contact.name} has no phone number saved. Ask the owner for it.` };
  }
  return { number: found.contact.phone, name: found.contact.name };
}

const tools = [
  {
    name: 'send_whatsapp',
    description:
      'Open WhatsApp with a message already typed out to a contact, ready for the ' +
      'owner to press send. Use for "WhatsApp <person> that ...", "message <person>". ' +
      'Accepts a saved contact name or a raw phone number. ' +
      'Write the message in the owner\'s own voice, first person, as they would send it.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Contact name or phone number.' },
        message: { type: 'string', description: 'The message text, written as the owner.' },
      },
      required: ['to', 'message'],
    },
    async handler({ to, message }, ctx) {
      const target = await targetNumber(to);
      if (target.error) return target;

      const text = String(message || '').trim();
      if (!text) return { error: 'There is no message to send.' };

      // wa.me needs the number without a leading plus.
      const url = `https://wa.me/${target.number.replace(/^\+/, '')}?text=${encodeURIComponent(text)}`;
      ctx.actions.push({ type: 'open_url', url, label: `WhatsApp ${target.name}` });
      return {
        status: 'ready_to_send',
        app: 'WhatsApp',
        to: target.name,
        message: text,
        note: 'WhatsApp is open with the message typed. Tell the owner to press send.',
      };
    },
  },

  {
    name: 'send_sms',
    description:
      'Open the phone\'s text-message app with a message pre-typed to a contact. ' +
      'Use when the owner asks to text or SMS someone rather than WhatsApp them.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Contact name or phone number.' },
        message: { type: 'string' },
      },
      required: ['to', 'message'],
    },
    async handler({ to, message }, ctx) {
      const target = await targetNumber(to);
      if (target.error) return target;

      const url = `sms:${target.number}?body=${encodeURIComponent(String(message || '').trim())}`;
      ctx.actions.push({ type: 'open_url', url, label: `Text ${target.name}` });
      return { status: 'ready_to_send', app: 'Messages', to: target.name, message };
    },
  },

  {
    name: 'call_contact',
    description:
      'Start a phone call to a saved contact or a number. Use for "call <person>", ' +
      '"ring <person>", "dial <number>".',
    parameters: {
      type: 'object',
      properties: { to: { type: 'string', description: 'Contact name or phone number.' } },
      required: ['to'],
    },
    async handler({ to }, ctx) {
      const target = await targetNumber(to);
      if (target.error) return target;

      ctx.actions.push({ type: 'open_url', url: `tel:${target.number}`, label: `Call ${target.name}` });
      return { status: 'dialling', to: target.name, number: target.number };
    },
  },

  {
    name: 'compose_email',
    description:
      'Open the device email app with a message pre-written to someone. Use this ' +
      'when Gmail is NOT connected, or when the owner wants to review and send it ' +
      'themselves. If Gmail is connected and they want it sent for them, use ' +
      'gmail_send instead.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Contact name or an email address.' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'The email text, written as the owner.' },
      },
      required: ['to', 'subject', 'body'],
    },
    async handler({ to, subject, body }, ctx) {
      let address = String(to || '').trim();
      let name = address;

      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
        const found = await resolve(address);
        if (!found.contact) return found;
        if (!found.contact.email) {
          return { error: `${found.contact.name} has no email address saved.` };
        }
        address = found.contact.email;
        name = found.contact.name;
      }

      const url =
        `mailto:${address}?subject=${encodeURIComponent(subject || '')}` +
        `&body=${encodeURIComponent(body || '')}`;
      ctx.actions.push({ type: 'open_url', url, label: `Email ${name}` });
      return { status: 'ready_to_send', to: name, address, subject, body };
    },
  },
];

module.exports = { tools, targetNumber };
