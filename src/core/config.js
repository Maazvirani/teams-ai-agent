'use strict';

/**
 * Central configuration for V.I.R.A.N.I.
 * Everything is read from environment variables so the same code runs
 * locally and on a free cloud host (Render) without edits.
 */

require('dotenv').config();

const config = {
  // --- Identity -----------------------------------------------------------
  name: process.env.ASSISTANT_NAME || 'VIRANI',
  fullName:
    process.env.ASSISTANT_FULL_NAME ||
    'Virtual Intelligent Response Assistant & Network Interface',
  wakeWord: (process.env.WAKE_WORD || 'virani').toLowerCase(),
  ownerName: process.env.OWNER_NAME || 'Sir',
  timezone: process.env.OWNER_TIMEZONE || 'Asia/Karachi',
  locale: process.env.OWNER_LOCALE || 'en-GB',
  homeCity: process.env.OWNER_CITY || 'Karachi',

  // --- Security -----------------------------------------------------------
  // VIRANI lives on the public internet, so it is locked behind a PIN.
  ownerPin: process.env.OWNER_PIN || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  sessionDays: parseInt(process.env.SESSION_DAYS || '90', 10),

  // --- AI brain -----------------------------------------------------------
  aiProvider: (process.env.AI_PROVIDER || 'gemini').toLowerCase(),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
  maxToolRounds: parseInt(process.env.MAX_TOOL_ROUNDS || '6', 10),

  // --- Memory -------------------------------------------------------------
  memoryBackend: (process.env.MEMORY_BACKEND || 'file').toLowerCase(),
  memoryTurns: parseInt(process.env.MEMORY_TURNS || '20', 10),
  upstash: {
    url: process.env.UPSTASH_REDIS_REST_URL || '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
  },

  // --- Google (Gmail + Calendar) -----------------------------------------
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    // Where Google sends the user back after they approve access.
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
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
    provider: (process.env.TTS_PROVIDER || 'browser').toLowerCase(),
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    // Default is ElevenLabs' "Adam" — deep and calm. Any voice id works:
    // https://elevenlabs.io/app/voice-library
    voiceId: process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB',
    model: process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5',
    stability: Number(process.env.ELEVENLABS_STABILITY || 0.45),
    similarity: Number(process.env.ELEVENLABS_SIMILARITY || 0.8),
    speed: Number(process.env.ELEVENLABS_SPEED || 1),
    // A hard ceiling so one long answer cannot eat the free character quota.
    maxChars: parseInt(process.env.TTS_MAX_CHARS || '900', 10),
  },

  // --- Push notifications (free, no service required) --------------------
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:owner@example.com',
  },

  // --- Scheduler ----------------------------------------------------------
  schedulerIntervalMs: parseInt(process.env.SCHEDULER_INTERVAL_MS || '30000', 10),
  dailyBriefingTime: process.env.DAILY_BRIEFING_TIME || '', // e.g. "08:00" (local time), blank = off

  // --- Server -------------------------------------------------------------
  port: parseInt(process.env.PORT || '3978', 10),
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),

  // --- Optional Microsoft Teams front door -------------------------------
  teams: {
    appId: process.env.MicrosoftAppId || '',
    appPassword: process.env.MicrosoftAppPassword || '',
    appType: process.env.MicrosoftAppType || 'MultiTenant',
    tenantId: process.env.MicrosoftAppTenantId || '',
  },
};

config.googleEnabled = Boolean(config.google.clientId && config.google.clientSecret);
config.teamsEnabled = Boolean(config.teams.appId && config.teams.appPassword);

module.exports = { config };
