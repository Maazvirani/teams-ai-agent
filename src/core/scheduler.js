'use strict';

/**
 * The 24/7 heartbeat.
 *
 * A loop on the server checks every 30 seconds for anything that has come due.
 * This is why VIRANI works when your phone is locked and the browser is closed:
 * the thinking happens in the cloud, and the result arrives as a push
 * notification. Fired items are also queued so VIRANI can speak them aloud the
 * next time you open the app.
 */

const { config } = require('./config');
const { store } = require('./store');
const push = require('./push');
const { nextOccurrence, humanTime, zonedToUtc, localIso } = require('./timeutil');
const { KEY: REMINDERS_KEY } = require('../tools/reminders');

const INBOX_KEY = 'inbox';
const MAX_INBOX = 30;

let timer = null;

// ---------------------------------------------------------------------------
// Briefings — a reminder can generate its content when it fires
// ---------------------------------------------------------------------------
const BRIEFING_REQUEST =
  'Give me my briefing now. Use your tools to gather: the weather where I live ' +
  "today, everything on my calendar for today, how many unread emails I have and " +
  'who the important ones are from, my reminders due today, and the three biggest ' +
  'news headlines. Deliver it as a short spoken briefing, no lists or formatting.';

async function composeBriefing() {
  // Required lazily: the brain pulls in the whole tool registry, and the
  // scheduler must still start cleanly if the AI key is missing.
  const { think } = require('./brain');
  const { buildSystemPrompt } = require('./persona');

  const systemPrompt = await buildSystemPrompt({ channel: 'voice' });
  const { reply } = await think({
    systemPrompt,
    history: [],
    userMessage: BRIEFING_REQUEST,
    channel: 'voice',
  });
  return reply;
}

// ---------------------------------------------------------------------------
// Firing
// ---------------------------------------------------------------------------
async function fire(reminder) {
  let title = config.name;
  let body = reminder.text;

  if (reminder.kind === 'briefing') {
    title = `${config.name} — your briefing`;
    try {
      body = await composeBriefing();
    } catch (err) {
      console.error('[scheduler] briefing failed:', err.message);
      body = `I could not put your briefing together just now: ${err.message}`;
    }
  }

  await push.notify({
    title,
    body: body.slice(0, 400),
    tag: `reminder-${reminder.id}`,
    url: '/?spoke=1',
    data: { reminderId: reminder.id, kind: reminder.kind || 'reminder' },
  });

  // Queue it so the app speaks it aloud when next opened.
  const inbox = await store.list(INBOX_KEY);
  inbox.push({
    id: reminder.id,
    kind: reminder.kind || 'reminder',
    text: body,
    firedAt: new Date().toISOString(),
    spoken: false,
  });
  await store.replace(INBOX_KEY, inbox.slice(-MAX_INBOX));

  console.log(`[scheduler] fired: ${reminder.kind || 'reminder'} — ${reminder.text}`);
}

async function tick() {
  try {
    const reminders = await store.list(REMINDERS_KEY);
    if (reminders.length === 0) return;

    const now = Date.now();
    const due = reminders.filter((r) => !r.done && new Date(r.dueAt).getTime() <= now);
    if (due.length === 0) return;

    for (const reminder of due) {
      await fire(reminder);

      if (reminder.repeat && reminder.repeat !== 'none') {
        // Roll forward until the next occurrence is genuinely in the future,
        // so a sleeping server does not replay a week of missed alarms.
        let next = nextOccurrence(new Date(reminder.dueAt), reminder.repeat, config.timezone);
        let guard = 0;
        while (next && next.getTime() <= now && guard < 400) {
          next = nextOccurrence(next, reminder.repeat, config.timezone);
          guard += 1;
        }
        reminder.dueAt = next.toISOString();
        reminder.firedCount = (reminder.firedCount || 0) + 1;
        reminder.lastFired = new Date().toISOString();
      } else {
        reminder.done = true;
        reminder.lastFired = new Date().toISOString();
      }
    }

    // Keep the store tidy: drop one-off reminders once they have fired.
    await store.replace(REMINDERS_KEY, reminders.filter((r) => !r.done));
  } catch (err) {
    console.error('[scheduler] tick failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Inbox (things that fired while you were away)
// ---------------------------------------------------------------------------
async function pendingInbox() {
  const inbox = await store.list(INBOX_KEY);
  return inbox.filter((i) => !i.spoken);
}

async function markInboxSpoken() {
  const inbox = await store.list(INBOX_KEY);
  await store.replace(INBOX_KEY, inbox.map((i) => ({ ...i, spoken: true })));
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
/** Create the recurring daily briefing if DAILY_BRIEFING_TIME is configured. */
async function ensureDailyBriefing() {
  if (!config.dailyBriefingTime) return;
  if (!/^\d{1,2}:\d{2}$/.test(config.dailyBriefingTime)) {
    console.warn(`[scheduler] DAILY_BRIEFING_TIME "${config.dailyBriefingTime}" should look like "08:00".`);
    return;
  }

  const reminders = await store.list(REMINDERS_KEY);
  if (reminders.some((r) => r.kind === 'briefing')) return;

  const [h, m] = config.dailyBriefingTime.split(':');
  const today = localIso(new Date(), config.timezone).slice(0, 10);
  let due = zonedToUtc(`${today}T${h.padStart(2, '0')}:${m}`, config.timezone);
  if (!due) return;
  if (due.getTime() <= Date.now()) due = new Date(due.getTime() + 86400000);

  await store.push(REMINDERS_KEY, {
    text: 'Daily briefing',
    kind: 'briefing',
    dueAt: due.toISOString(),
    repeat: 'daily',
    done: false,
    firedCount: 0,
  });
  console.log(`[scheduler] Daily briefing scheduled for ${humanTime(due, config.timezone)}, repeating daily.`);
}

function start() {
  if (timer) return;
  ensureDailyBriefing().catch((err) => console.error('[scheduler]', err.message));
  timer = setInterval(tick, config.schedulerIntervalMs);
  timer.unref?.();
  console.log(`[scheduler] running every ${Math.round(config.schedulerIntervalMs / 1000)}s`);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick, pendingInbox, markInboxSpoken, composeBriefing, INBOX_KEY };
