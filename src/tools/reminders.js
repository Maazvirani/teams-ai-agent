'use strict';

/**
 * Reminders, alarms and recurring briefings.
 *
 * These live in the cloud store, and a scheduler on the server checks them
 * every 30 seconds — so a reminder fires even when your phone is locked and
 * the app is closed. Delivery is by Web Push notification (free, no service).
 */

const { config } = require('../core/config');
const { store } = require('../core/store');
const { zonedToUtc, localIso, humanTime, nowInfo } = require('../core/timeutil');

const KEY = 'reminders';
const REPEATS = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];

async function activeReminders() {
  const all = await store.list(KEY);
  return all.filter((r) => !r.done);
}

function render(reminder) {
  const due = new Date(reminder.dueAt);
  return {
    id: reminder.id,
    text: reminder.text,
    due: humanTime(due, config.timezone),
    dueLocal: localIso(due, config.timezone),
    repeat: reminder.repeat === 'none' ? undefined : reminder.repeat,
  };
}

const tools = [
  {
    name: 'create_reminder',
    description:
      'Schedule a reminder, alarm, alert or recurring briefing. It is stored in the ' +
      'cloud and fires as a phone notification even when the app is closed. ' +
      'Give EITHER when_local (an exact wall-clock time in the owner\'s timezone) ' +
      'OR in_minutes for something relative like "in 20 minutes". ' +
      'Call get_datetime first if you are unsure what the current date is.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'What to remind about, phrased as VIRANI will say it out loud.',
        },
        when_local: {
          type: 'string',
          description:
            'Exact local wall-clock time as "YYYY-MM-DDTHH:mm" in the owner\'s timezone, e.g. "2026-08-19T06:30".',
        },
        in_minutes: {
          type: 'integer',
          description: 'Fire this many minutes from now. Use for relative requests.',
        },
        repeat: {
          type: 'string',
          enum: REPEATS,
          description: 'Repeat rule. "weekdays" = Monday to Friday only. Default "none".',
        },
      },
      required: ['text'],
    },
    async handler({ text, when_local: whenLocal, in_minutes: inMinutes, repeat }) {
      if (!text || !String(text).trim()) return { error: 'A reminder needs some text.' };

      let due;
      if (Number.isFinite(Number(inMinutes)) && Number(inMinutes) > 0) {
        due = new Date(Date.now() + Number(inMinutes) * 60000);
      } else if (whenLocal) {
        due = zonedToUtc(whenLocal, config.timezone);
        if (!due) return { error: `I could not understand the time "${whenLocal}".` };
      } else {
        return { error: 'Tell me when: either when_local or in_minutes is required.' };
      }

      const rule = REPEATS.includes(repeat) ? repeat : 'none';

      // A recurring reminder set for a time already past today should start
      // at its next occurrence rather than firing immediately.
      if (due.getTime() < Date.now() && rule !== 'none') {
        due = new Date(due.getTime() + 24 * 60 * 60 * 1000);
      }
      if (due.getTime() < Date.now() - 60000) {
        return {
          error: `That time (${humanTime(due, config.timezone)}) is in the past. Ask the user which day they meant.`,
        };
      }

      const saved = await store.push(KEY, {
        text: String(text).trim(),
        dueAt: due.toISOString(),
        repeat: rule,
        done: false,
        firedCount: 0,
      });
      return { created: render(saved), now: nowInfo().localIso };
    },
  },

  {
    name: 'list_reminders',
    description: 'List every upcoming reminder, alarm and recurring briefing.',
    parameters: { type: 'object', properties: {} },
    async handler() {
      const items = await activeReminders();
      items.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
      return {
        count: items.length,
        reminders: items.map(render),
        now: nowInfo().localIso,
      };
    },
  },

  {
    name: 'cancel_reminder',
    description:
      'Cancel a reminder. Pass its id (from list_reminders) or a few words matching its text.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The reminder id.' },
        match: { type: 'string', description: 'Words from the reminder text to match instead.' },
      },
    },
    async handler({ id, match }) {
      const items = await activeReminders();
      let target = id ? items.find((r) => r.id === id) : null;

      if (!target && match) {
        const needle = String(match).toLowerCase();
        const hits = items.filter((r) => r.text.toLowerCase().includes(needle));
        if (hits.length > 1) {
          return {
            error: 'More than one reminder matches — ask the user which one.',
            candidates: hits.map(render),
          };
        }
        target = hits[0];
      }
      if (!target) return { error: 'No matching reminder found.', reminders: items.map(render) };

      await store.remove(KEY, target.id);
      return { cancelled: render(target) };
    },
  },
];

module.exports = { tools, KEY, activeReminders, render };
