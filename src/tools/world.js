'use strict';

/**
 * Real-world data that needs no API key at all:
 *   - Weather + forecast  (Open-Meteo)
 *   - Headlines           (Google News RSS)
 *   - Time & date         (the host clock, rendered in the owner's timezone)
 */

const { config } = require('../core/config');
const { getJson, getText, htmlToText } = require('../core/http');
const { nowInfo } = require('../core/timeutil');

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------
const WEATHER_CODES = {
  0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'freezing fog', 51: 'light drizzle', 53: 'drizzle',
  55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'heavy freezing drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain',
  67: 'heavy freezing rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow',
  77: 'snow grains', 80: 'light showers', 81: 'showers', 82: 'violent showers',
  85: 'snow showers', 86: 'heavy snow showers', 95: 'thunderstorm',
  96: 'thunderstorm with hail', 99: 'thunderstorm with heavy hail',
};

function describeCode(code) {
  return WEATHER_CODES[code] || 'unknown conditions';
}

async function geocode(place) {
  const data = await getJson(
    `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=${encodeURIComponent(place)}`
  );
  const hit = data?.results?.[0];
  if (!hit) throw new Error(`I could not find a place called "${place}".`);
  return {
    name: [hit.name, hit.admin1, hit.country].filter(Boolean).join(', '),
    latitude: hit.latitude,
    longitude: hit.longitude,
    timezone: hit.timezone,
  };
}

// ---------------------------------------------------------------------------
// News (Google News RSS — free, no key, works for any topic or country)
// ---------------------------------------------------------------------------
function parseRss(xml, limit) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null && items.length < limit) {
    const block = m[1];
    const pick = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
      if (!r) return '';
      return htmlToText(r[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, ''), 400);
    };
    const title = pick('title');
    if (!title) continue;
    items.push({
      title,
      source: pick('source') || undefined,
      publishedAt: pick('pubDate') || undefined,
      url: pick('link') || undefined,
    });
  }
  return items;
}

const tools = [
  {
    name: 'get_datetime',
    description:
      "Get the current date and time. Use this before any time-related answer or " +
      "before scheduling anything, so you never guess what 'today' or 'now' means.",
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'IANA timezone, e.g. "Asia/Karachi". Defaults to the owner\'s timezone.',
        },
      },
    },
    async handler({ timezone }) {
      try {
        return nowInfo(timezone || config.timezone);
      } catch (_) {
        return nowInfo(config.timezone);
      }
    },
  },

  {
    name: 'get_weather',
    description:
      'Current weather and a multi-day forecast for any city in the world.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'City name, e.g. "Karachi" or "London, UK". Defaults to the owner\'s home city.',
        },
        days: { type: 'integer', description: 'Forecast days to include (1-7). Default 3.' },
      },
    },
    async handler({ location, days }, ctx) {
      const wanted = Math.min(Math.max(parseInt(days || 3, 10) || 3, 1), 7);
      // No place named? Use where the owner actually is, then their home city.
      const place = location || (ctx?.coords ? null : config.homeCity);
      try {
        const geo = place
          ? await geocode(place)
          : {
              name: 'your current location',
              latitude: ctx.coords.lat,
              longitude: ctx.coords.lon,
              timezone: 'auto',
            };
        const data = await getJson(
          `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}` +
            `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
            `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
            `&timezone=${encodeURIComponent(geo.timezone || 'auto')}&forecast_days=${wanted}`
        );
        const c = data.current || {};
        const daily = data.daily || {};
        return {
          location: geo.name,
          current: {
            temperatureC: c.temperature_2m,
            feelsLikeC: c.apparent_temperature,
            humidityPercent: c.relative_humidity_2m,
            windKph: c.wind_speed_10m,
            conditions: describeCode(c.weather_code),
          },
          forecast: (daily.time || []).map((date, i) => ({
            date,
            conditions: describeCode(daily.weather_code?.[i]),
            maxC: daily.temperature_2m_max?.[i],
            minC: daily.temperature_2m_min?.[i],
            rainChancePercent: daily.precipitation_probability_max?.[i],
          })),
        };
      } catch (err) {
        return { location: place || 'current location', error: err.message };
      }
    },
  },

  {
    name: 'get_news',
    description:
      'Latest news headlines, optionally about a specific topic, company, person or country.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Topic to search headlines for. Omit for general top stories.',
        },
        limit: { type: 'integer', description: 'How many headlines (1-10). Default 6.' },
      },
    },
    async handler({ topic, limit }) {
      const count = Math.min(Math.max(parseInt(limit || 6, 10) || 6, 1), 10);
      const base = 'https://news.google.com/rss';
      const url = topic
        ? `${base}/search?q=${encodeURIComponent(topic)}&hl=en&gl=US&ceid=US:en`
        : `${base}?hl=en&gl=US&ceid=US:en`;
      try {
        const xml = await getText(url, { headers: { Accept: 'application/rss+xml' } });
        const headlines = parseRss(xml, count);
        if (headlines.length === 0) return { topic, error: 'No headlines came back.' };
        return { topic: topic || 'top stories', headlines };
      } catch (err) {
        return { topic, error: err.message };
      }
    },
  },
];

module.exports = { tools, parseRss, describeCode };
