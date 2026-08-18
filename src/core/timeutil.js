'use strict';

/**
 * Timezone maths.
 *
 * VIRANI runs on a cloud server that is almost certainly on UTC, while you
 * live somewhere else. Everything the user says ("remind me at 6pm") is in
 * *their* timezone, so every scheduled moment is converted properly here —
 * including across daylight-saving changes.
 */

const { config } = require('./config');

/** How far ahead of UTC the timezone is, at that particular instant, in ms. */
function tzOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (t) => parseInt(parts.find((p) => p.type === t)?.value, 10);
  const hour = get('hour') === 24 ? 0 : get('hour');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return asUtc - date.getTime();
}

/**
 * Convert a wall-clock string ("2026-08-18T18:00") in a timezone to a real
 * UTC Date. Applied twice so the offset is correct even if the instant falls
 * on the other side of a daylight-saving switch.
 */
function zonedToUtc(localIsoString, timeZone = config.timezone) {
  const normalised = String(localIsoString).trim().replace(' ', 'T').replace(/Z$/i, '');
  const withSeconds = /T\d{2}:\d{2}$/.test(normalised) ? `${normalised}:00` : normalised;
  const naive = Date.parse(`${withSeconds}Z`);
  if (Number.isNaN(naive)) return null;

  let utc = naive - tzOffsetMs(new Date(naive), timeZone);
  utc = naive - tzOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

/** The reverse: a real Date rendered as "YYYY-MM-DDTHH:mm" wall-clock time. */
function localIso(date = new Date(), timeZone = config.timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

/** Friendly rendering, e.g. "Tue, 18 Aug 2026 at 18:00". */
function humanTime(date, timeZone = config.timezone) {
  return new Intl.DateTimeFormat(config.locale, {
    timeZone,
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function nowInfo(timeZone = config.timezone) {
  const now = new Date();
  const fmt = (opts) => new Intl.DateTimeFormat(config.locale, { timeZone, ...opts }).format(now);
  return {
    timezone: timeZone,
    iso: now.toISOString(),
    date: fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    time: fmt({ hour: '2-digit', minute: '2-digit' }),
    localIso: localIso(now, timeZone),
  };
}

/** Advance a due date by its repeat rule. Returns null for one-off reminders. */
function nextOccurrence(date, repeat, timeZone = config.timezone) {
  const d = new Date(date.getTime());
  switch (repeat) {
    case 'daily':
      d.setUTCDate(d.getUTCDate() + 1);
      return d;
    case 'weekdays': {
      do {
        d.setUTCDate(d.getUTCDate() + 1);
      } while ([0, 6].includes(weekdayIn(d, timeZone)));
      return d;
    }
    case 'weekly':
      d.setUTCDate(d.getUTCDate() + 7);
      return d;
    case 'monthly':
      d.setUTCMonth(d.getUTCMonth() + 1);
      return d;
    default:
      return null;
  }
}

function weekdayIn(date, timeZone) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

module.exports = { tzOffsetMs, zonedToUtc, localIso, humanTime, nowInfo, nextOccurrence, weekdayIn };
