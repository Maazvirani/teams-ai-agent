'use strict';

/**
 * Central configuration for V.I.R.A.N.I.
 * Everything is read from environment variables so the same code runs
 * locally and on a free cloud host (Render) without edits.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

/**
 * Settings committed alongside the code, so they never have to be retyped into
 * a hosting dashboard. Environment variables still win, and secrets never live
 * here — this file is in git.
 */
const fileSettings = (() => {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'config', 'virani.json'), 'utf8');
    const parsed = JSON.parse(raw);
    delete parsed._comment;
    return parsed;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[config] config/virani.json could not be read:', err.message);
    }
    return {};
  }
})();

/**
 * Read one setting, forgivingly.
 *
 * Hosting dashboards and the "copy" buttons on services like Upstash hand you a
 * whole .env line — `NAME="value"` — and it is very easy to paste that entire
 * line into a value box. The result is a value with its own name and quotes
 * baked into it, which then fails somewhere far away with a confusing error.
 * Rather than make people debug that, we strip it here.
 */
function env(name, fallback = '') {
  // Environment first, then the committed settings file, then the default.
  let value = process.env[name];
  if (value === undefined || value === null || String(value).trim() === '') {
    value = fileSettings[name];
  }
  if (value === undefined || value === null) return fallback;
  value = String(value).trim();

  // Two passes handles both  NAME="value"  and  "NAME=value".
  for (let pass = 0; pass < 2; pass += 1) {
    const named = new RegExp(`^${name}\\s*=\\s*`, 'i');
    if (named.test(value)) value = value.replace(named, '').trim();

    const first = value[0];
    if ((first === '"' || first === "'") && value.endsWith(first) && value.length > 1) {
      value = value.slice(1, -1).trim();
    }
  }
  return value === '' ? fallback : value;
}

const config = {
  // --- Identity -----------------------------------------------------------
  name: env('ASSISTANT_NAME') || 'VIRANI',
  fullName:
    env('ASSISTANT_FULL_NAME') ||
    'Virtual Intelligent Response Assistant & Network Interface',
  wakeWord: (env('WAKE_WORD') || 'virani').toLowerCase(),
  ownerName: env('OWNER_NAME') || 'Sir',
  timezone: env('OWNER_TIMEZONE') || 'Asia/Karachi',
  locale: env('OWNER_LOCALE') || 'en-GB',
  homeCity: env('OWNER_CITY') || 'Karachi',

  // --- Security -----------------------------------------------------------
  // VIRANI lives on the public internet, so it is locked behind a PIN.
  ownerPin: env('OWNER_PIN') || '',
  sessionSecret: env('SESSION_SECRET') || '',
  sessionDays: parseInt(env('SESSION_DAYS') || '90', 10),

  // --- AI brain -----------------------------------------------------------
  aiProvider: (env('AI_PROVIDER') || 'gemini').toLowerCase(),
  gemini: {
    apiKey: env('GEMINI_API_KEY') || '',
    model: env('GEMINI_MODEL') || 'gemini-2.0-flash',
  },
  groq: {
    apiKey: env('GROQ_API_KEY') || '',
    model: env('GROQ_MODEL') || 'llama-3.3-70b-versatile',
  },
  openai: {
    apiKey: env('OPENAI_API_KEY') || '',
    model: env('OPENAI_MODEL') || 'gpt-4o-mini',
  },
  maxToolRounds: parseInt(env('MAX_TOOL_ROUNDS') || '6', 10),

  // --- Memory -------------------------------------------------------------
  memoryBackend: (env('MEMORY_BACKEND') || 'file').toLowerCase(),
  memoryTurns: parseInt(env('MEMORY_TURNS') || '20', 10),
  upstash: {
    url: env('UPSTASH_REDIS_REST_URL') || '',
    token: env('UPSTASH_REDIS_REST_TOKEN') || '',
  },

  // --- Google (Gmail + Calendar) -----------------------------------------
  google: {
    clientId: env('GOOGLE_CLIENT_ID') || '',
    clientSecret: env('GOOGLE_CLIENT_SECRET') || '',
    // Where Google sends the user back after they approve access.
    redirectUri: env('GOOGLE_REDIRECT_URI') || '',
    scopes: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  },

  // --- Voice -------------------------------------------------------------
  // "browser" (default, free) uses the speech engine on your device.
  // "elevenlabs" synthesises on the server for a far more natural voice.
  tts: {
    provider: (env('TTS_PROVIDER') || 'browser').toLowerCase(),
    apiKey: env('ELEVENLABS_API_KEY') || '',
    // Default is ElevenLabs' "Adam" — deep and calm. Any voice id works:
    // https://elevenlabs.io/app/voice-library
    voiceId: env('ELEVENLABS_VOICE_ID') || 'pNInz6obpgDQGcFmaJgB',
    model: env('ELEVENLABS_MODEL') || 'eleven_turbo_v2_5',
    stability: Number(env('ELEVENLABS_STABILITY') || 0.45),
    similarity: Number(env('ELEVENLABS_SIMILARITY') || 0.8),
    speed: Number(env('ELEVENLABS_SPEED') || 1),
    // A hard ceiling so one long answer cannot eat the free character quota.
    maxChars: parseInt(env('TTS_MAX_CHARS') || '900', 10),
  },

  // --- Push notifications (free, no service required) --------------------
  vapid: {
    publicKey: env('VAPID_PUBLIC_KEY') || '',
    privateKey: env('VAPID_PRIVATE_KEY') || '',
    subject: env('VAPID_SUBJECT') || 'mailto:owner@example.com',
  },

  // --- Scheduler ----------------------------------------------------------
  schedulerIntervalMs: parseInt(env('SCHEDULER_INTERVAL_MS') || '30000', 10),
  dailyBriefingTime: env('DAILY_BRIEFING_TIME') || '', // e.g. "08:00" (local time), blank = off

  // --- Server -------------------------------------------------------------
  port: parseInt(env('PORT') || '3978', 10),
  publicUrl: (env('PUBLIC_URL') || '').replace(/\/+$/, ''),

  // --- Optional Microsoft Teams front door -------------------------------
  teams: {
    appId: env('MicrosoftAppId') || '',
    appPassword: env('MicrosoftAppPassword') || '',
    appType: env('MicrosoftAppType') || 'MultiTenant',
    tenantId: env('MicrosoftAppTenantId') || '',
  },
};

config.googleEnabled = Boolean(config.google.clientId && config.google.clientSecret);
config.teamsEnabled = Boolean(config.teams.appId && config.teams.appPassword);

module.exports = { config, env };
