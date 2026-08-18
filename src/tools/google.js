'use strict';

/**
 * Gmail and Google Calendar, driven by voice.
 *
 * Reading is free-flowing; anything that leaves the house (sending an email,
 * creating or deleting a calendar entry) is gated behind an explicit
 * confirmation, so VIRANI always reads the message back before it goes out.
 */

const { config } = require('../core/config');
const google = require('../core/google');
const { htmlToText } = require('../core/http');
const { zonedToUtc, localIso, humanTime } = require('../core/timeutil');

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CALENDAR = 'https://www.googleapis.com/calendar/v3/calendars';

const NOT_CONNECTED = {
  error:
    'The Google account is not connected yet. Tell the user to open VIRANI settings ' +
    'and tap "Connect Google", then try again.',
};

async function ensureConnected() {
  return (await google.isConnected()) ? null : NOT_CONNECTED;
}

// ---------------------------------------------------------------------------
// Gmail helpers
// ---------------------------------------------------------------------------
function headerValue(payload, name) {
  const h = (payload?.headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

function decodeBody(data) {
  if (!data) return '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

/** Walk the MIME tree and pull out readable text, preferring text/plain. */
function extractText(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) return decodeBody(payload.body.data);
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return htmlToText(decodeBody(payload.body.data), 8000);
  }
  for (const part of payload.parts || []) {
    const text = extractText(part);
    if (text.trim()) return text;
  }
  return payload.body?.data ? decodeBody(payload.body.data) : '';
}

/** RFC 2047 encoding so non-English subjects survive the trip. */
function encodeHeader(value) {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function buildMime({ to, cc, subject, body }) {
  const lines = [
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: ${encodeHeader(subject || '(no subject)')}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body || '', 'utf8').toString('base64'),
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------
const tools = [
  {
    name: 'gmail_search',
    description:
      'Search or list the owner\'s Gmail. Use Gmail search syntax in `query` ' +
      '(e.g. "is:unread", "from:bank newer_than:7d", "has:attachment invoice"). ' +
      'Returns senders, subjects and previews — call gmail_read for the full text.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query. Default "is:unread in:inbox".' },
        limit: { type: 'integer', description: 'How many messages (1-15). Default 8.' },
      },
    },
    async handler({ query, limit }) {
      const guard = await ensureConnected();
      if (guard) return guard;

      const q = query || 'is:unread in:inbox';
      const max = Math.min(Math.max(parseInt(limit || 8, 10) || 8, 1), 15);
      try {
        const list = await google.api(
          `${GMAIL}/messages?maxResults=${max}&q=${encodeURIComponent(q)}`
        );
        const ids = (list.messages || []).map((m) => m.id);
        if (ids.length === 0) return { query: q, count: 0, messages: [] };

        const messages = await Promise.all(
          ids.map(async (id) => {
            const m = await google.api(
              `${GMAIL}/messages/${id}?format=metadata` +
                '&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date'
            );
            return {
              id,
              threadId: m.threadId,
              from: headerValue(m.payload, 'From'),
              subject: headerValue(m.payload, 'Subject'),
              date: headerValue(m.payload, 'Date'),
              preview: m.snippet,
              unread: (m.labelIds || []).includes('UNREAD'),
            };
          })
        );
        return { query: q, count: messages.length, messages };
      } catch (err) {
        return { error: err.message };
      }
    },
  },

  {
    name: 'gmail_read',
    description: 'Read one full email by its id (from gmail_search), including the body text.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The message id.' } },
      required: ['id'],
    },
    async handler({ id }) {
      const guard = await ensureConnected();
      if (guard) return guard;
      try {
        const m = await google.api(`${GMAIL}/messages/${id}?format=full`);
        return {
          id,
          from: headerValue(m.payload, 'From'),
          to: headerValue(m.payload, 'To'),
          subject: headerValue(m.payload, 'Subject'),
          date: headerValue(m.payload, 'Date'),
          body: extractText(m.payload).slice(0, 8000),
        };
      } catch (err) {
        return { error: err.message };
      }
    },
  },

  {
    name: 'gmail_send',
    description:
      'Send an email from the owner\'s Gmail account. SAFETY RULE: never call this ' +
      'with confirmed=true until you have read the recipient, subject and full body ' +
      'back to the user and they have clearly said yes. Call it with confirmed=false ' +
      'first to get the draft echoed back for approval.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address.' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'Plain-text body of the email.' },
        cc: { type: 'string', description: 'Optional CC address.' },
        confirmed: {
          type: 'boolean',
          description: 'True ONLY after the user explicitly approved this exact message.',
        },
      },
      required: ['to', 'subject', 'body'],
    },
    async handler({ to, subject, body, cc, confirmed }) {
      const guard = await ensureConnected();
      if (guard) return guard;

      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(to).trim())) {
        return { error: `"${to}" is not a valid email address.` };
      }
      if (!confirmed) {
        return {
          status: 'awaiting_confirmation',
          draft: { to, cc, subject, body },
          instruction:
            'Read this draft back to the user and ask them to confirm. Only if they ' +
            'say yes, call gmail_send again with the same fields and confirmed=true.',
        };
      }
      try {
        const sent = await google.api(`${GMAIL}/messages/send`, {
          method: 'POST',
          body: JSON.stringify({ raw: buildMime({ to, cc, subject, body }) }),
        });
        return { status: 'sent', to, subject, id: sent.id };
      } catch (err) {
        return { error: err.message };
      }
    },
  },

  {
    name: 'calendar_list',
    description:
      'List the owner\'s upcoming calendar events. Use for "what\'s on today", ' +
      '"am I free tomorrow", "what\'s my week look like".',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'integer', description: 'How many days ahead to look. Default 7.' },
        query: { type: 'string', description: 'Optional text to filter events by.' },
      },
    },
    async handler({ days, query }) {
      const guard = await ensureConnected();
      if (guard) return guard;

      const ahead = Math.min(Math.max(parseInt(days || 7, 10) || 7, 1), 60);
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + ahead * 86400000).toISOString();
      try {
        const url =
          `${CALENDAR}/primary/events?singleEvents=true&orderBy=startTime&maxResults=25` +
          `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
          `&timeZone=${encodeURIComponent(config.timezone)}` +
          (query ? `&q=${encodeURIComponent(query)}` : '');
        const data = await google.api(url);
        const events = (data.items || []).map((e) => ({
          id: e.id,
          title: e.summary || '(no title)',
          start: e.start?.dateTime
            ? humanTime(new Date(e.start.dateTime), config.timezone)
            : `${e.start?.date} (all day)`,
          end: e.end?.dateTime ? humanTime(new Date(e.end.dateTime), config.timezone) : undefined,
          location: e.location || undefined,
          attendees: (e.attendees || []).map((a) => a.email).slice(0, 8),
        }));
        return { rangeDays: ahead, count: events.length, events };
      } catch (err) {
        return { error: err.message };
      }
    },
  },

  {
    name: 'calendar_create',
    description:
      'Create an event in the owner\'s Google Calendar. Times are local wall-clock ' +
      'in their timezone. Call get_datetime first so relative days are correct. ' +
      'Read the event back before calling with confirmed=true.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        start_local: {
          type: 'string',
          description: 'Start as "YYYY-MM-DDTHH:mm" local wall-clock time.',
        },
        end_local: {
          type: 'string',
          description: 'End as "YYYY-MM-DDTHH:mm". Defaults to one hour after the start.',
        },
        location: { type: 'string' },
        description: { type: 'string' },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Email addresses to invite.',
        },
        confirmed: {
          type: 'boolean',
          description: 'True only after the user approved these exact details.',
        },
      },
      required: ['title', 'start_local'],
    },
    async handler({ title, start_local: startLocal, end_local: endLocal, location, description, attendees, confirmed }) {
      const guard = await ensureConnected();
      if (guard) return guard;

      const start = zonedToUtc(startLocal, config.timezone);
      if (!start) return { error: `I could not understand the start time "${startLocal}".` };
      const end = endLocal
        ? zonedToUtc(endLocal, config.timezone)
        : new Date(start.getTime() + 3600000);
      if (!end || end <= start) return { error: 'The end time must be after the start time.' };

      const summary = {
        title,
        start: humanTime(start, config.timezone),
        end: humanTime(end, config.timezone),
        location,
        attendees,
      };
      if (!confirmed) {
        return {
          status: 'awaiting_confirmation',
          event: summary,
          instruction:
            'Read these details back and ask the user to confirm. If they agree, call ' +
            'calendar_create again with the same fields and confirmed=true.',
        };
      }
      try {
        const created = await google.api(`${CALENDAR}/primary/events`, {
          method: 'POST',
          body: JSON.stringify({
            summary: title,
            location,
            description,
            start: { dateTime: start.toISOString(), timeZone: config.timezone },
            end: { dateTime: end.toISOString(), timeZone: config.timezone },
            ...(Array.isArray(attendees) && attendees.length
              ? { attendees: attendees.map((email) => ({ email })) }
              : {}),
          }),
        });
        return { status: 'created', id: created.id, link: created.htmlLink, event: summary };
      } catch (err) {
        return { error: err.message };
      }
    },
  },

  {
    name: 'calendar_delete',
    description:
      'Delete a calendar event by id (get it from calendar_list). Confirm with the ' +
      'user first — deleting cannot be undone.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        confirmed: { type: 'boolean', description: 'True only after the user approved.' },
      },
      required: ['id'],
    },
    async handler({ id, confirmed }) {
      const guard = await ensureConnected();
      if (guard) return guard;
      if (!confirmed) {
        return {
          status: 'awaiting_confirmation',
          instruction: 'Name the event and ask the user to confirm deletion first.',
        };
      }
      try {
        await google.api(`${CALENDAR}/primary/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
        return { status: 'deleted', id };
      } catch (err) {
        return { error: err.message };
      }
    },
  },
];

module.exports = { tools, buildMime, extractText, encodeHeader, headerValue };
