'use strict';

/**
 * V.I.R.A.N.I. — server.
 *
 * Serves the voice app, runs the agent loop, holds the Google connection,
 * and keeps the scheduler beating so reminders fire around the clock.
 */

const path = require('path');
const express = require('express');

const { config } = require('./core/config');
const { store } = require('./core/store');
const auth = require('./core/auth');
const push = require('./core/push');
const google = require('./core/google');
const scheduler = require('./core/scheduler');
const { think } = require('./core/brain');
const { buildSystemPrompt } = require('./core/persona');
const toolRegistry = require('./tools');
const { icon } = require('./core/icon');
const { KEY: REMINDERS_KEY, render: renderReminder, activeReminders } = require('./tools/reminders');
const { allFacts } = require('./tools/knowledge');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Public endpoints
// ---------------------------------------------------------------------------

// Health check — this is also the URL you give a free uptime pinger so the
// host never sleeps and VIRANI really is available 24/7.
app.get(['/health', '/healthz'], (req, res) => {
  res.json({
    status: 'ok',
    assistant: config.name,
    aiProvider: config.aiProvider,
    memory: config.memoryBackend,
    google: config.googleEnabled ? 'configured' : 'off',
    tools: toolRegistry.names().length,
    time: new Date().toISOString(),
  });
});

// Generated app icons (see src/core/icon.js).
app.get('/icon-:size.png', (req, res) => {
  const png = icon(req.params.size);
  res.set('Content-Type', 'image/png').set('Cache-Control', 'public, max-age=604800').send(png);
});

// What the login screen needs to know before anyone has signed in.
app.get('/api/hello', (req, res) => {
  res.json({
    name: config.name,
    fullName: config.fullName,
    wakeWord: config.wakeWord,
    pinRequired: Boolean(config.ownerPin),
    configured: Boolean(config.gemini.apiKey || config.groq.apiKey || config.openai.apiKey),
  });
});

app.post('/api/login', (req, res) => {
  if (!config.ownerPin) {
    return res.status(503).json({ error: 'OWNER_PIN is not set on the server yet.' });
  }
  if (!auth.checkPin(req.body?.pin)) {
    return res.status(401).json({ error: 'Wrong PIN.' });
  }
  res.json({ token: auth.issueToken('owner'), name: config.name });
});

// ---------------------------------------------------------------------------
// Everything below needs the owner's token
// ---------------------------------------------------------------------------

app.get('/api/state', auth.requireAuth, async (req, res) => {
  try {
    const [reminders, facts, devices, googleConnected, tokens, inbox] = await Promise.all([
      activeReminders(),
      allFacts(),
      push.count(),
      config.googleEnabled ? google.isConnected() : Promise.resolve(false),
      config.googleEnabled ? google.getTokens() : Promise.resolve(null),
      scheduler.pendingInbox(),
    ]);
    res.json({
      name: config.name,
      fullName: config.fullName,
      wakeWord: config.wakeWord,
      owner: config.ownerName,
      timezone: config.timezone,
      aiProvider: config.aiProvider,
      pushPublicKey: push.getPublicKey(),
      devices,
      google: {
        available: config.googleEnabled,
        connected: googleConnected,
        email: tokens?.email || null,
      },
      reminders: reminders
        .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
        .map(renderReminder),
      facts: facts.map((f) => ({ id: f.id, category: f.category, fact: f.text })),
      inbox,
      tools: toolRegistry.names(),
    });
  } catch (err) {
    console.error('[state]', err);
    res.status(500).json({ error: err.message });
  }
});

/** The main endpoint: one turn of conversation. */
app.post('/api/chat', auth.requireAuth, async (req, res) => {
  const message = String(req.body?.message || '').trim();
  const channel = req.body?.channel === 'text' ? 'text' : 'voice';
  const userId = req.user?.sub || 'owner';

  if (!message) return res.status(400).json({ error: 'Say something first.' });

  try {
    const record = await store.getConversation(userId);
    const systemPrompt = await buildSystemPrompt({ profile: record.profile, channel });

    const { reply, actions, toolLog } = await think({
      systemPrompt,
      history: record.turns.map((t) => ({ role: t.role, text: t.text })),
      userMessage: message,
      channel,
    });

    await store.addTurn(userId, 'user', message);
    await store.addTurn(userId, 'assistant', reply);

    res.json({ reply, actions, tools: toolLog.map((t) => t.tool) });
  } catch (err) {
    console.error('[chat]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reset', auth.requireAuth, async (req, res) => {
  await store.clearConversation(req.user?.sub || 'owner');
  res.json({ ok: true });
});

// --- Reminders (the UI can delete without going through the model) ---------
app.delete('/api/reminders/:id', auth.requireAuth, async (req, res) => {
  const removed = await store.remove(REMINDERS_KEY, req.params.id);
  res.json(removed ? { deleted: renderReminder(removed) } : { error: 'Not found.' });
});

app.delete('/api/facts/:id', auth.requireAuth, async (req, res) => {
  const removed = await store.remove('facts', req.params.id);
  res.json(removed ? { deleted: removed.text } : { error: 'Not found.' });
});

// --- Push notifications ----------------------------------------------------
app.post('/api/push/subscribe', auth.requireAuth, async (req, res) => {
  try {
    res.json(await push.subscribe(req.body?.subscription));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/push/unsubscribe', auth.requireAuth, async (req, res) => {
  await push.unsubscribe(req.body?.endpoint);
  res.json({ ok: true });
});

app.post('/api/push/test', auth.requireAuth, async (req, res) => {
  res.json(
    await push.notify({
      title: config.name,
      body: 'Notifications are working. I can reach you even when the app is closed.',
      tag: 'test',
    })
  );
});

app.post('/api/inbox/spoken', auth.requireAuth, async (req, res) => {
  await scheduler.markInboxSpoken();
  res.json({ ok: true });
});

// --- Google connection -----------------------------------------------------
app.get('/api/google/connect', auth.requireAuth, (req, res) => {
  if (!config.googleEnabled) {
    return res.status(503).json({ error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set.' });
  }
  // The state is a short-lived signed token, so only a logged-in owner can
  // complete the flow — Google's redirect carries no auth header of its own.
  res.json({ url: google.authUrl(auth.sign({ purpose: 'google', exp: Date.now() + 600000 })) });
});

app.get('/api/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.status(400).send(page('Google said no', String(error)));
  if (!auth.verify(state)) return res.status(401).send(page('Expired link', 'Start the connection again from VIRANI settings.'));
  if (!code) return res.status(400).send(page('Missing code', 'Google did not send an authorisation code.'));

  try {
    const { email } = await google.exchangeCode(String(code));
    res.send(page('Google connected', `${email || 'Your account'} is linked. You can close this tab and talk to ${config.name}.`));
  } catch (err) {
    console.error('[google]', err.message);
    res.status(500).send(page('Connection failed', err.message));
  }
});

app.post('/api/google/disconnect', auth.requireAuth, async (req, res) => {
  await google.disconnect();
  res.json({ ok: true });
});

function page(title, body) {
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#070b14;color:#dff6ff;display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:24px">
<div><h1 style="color:#38e2ff;font-weight:600">${title}</h1><p style="opacity:.8;max-width:36ch;line-height:1.6">${body}</p>
<a href="/" style="color:#38e2ff">Back to ${config.name}</a></div></body>`;
}

// ---------------------------------------------------------------------------
// Optional: Microsoft Teams front door (same brain, text channel)
// ---------------------------------------------------------------------------
if (config.teamsEnabled) {
  try {
    // eslint-disable-next-line global-require
    require('./channels/teams').mount(app);
  } catch (err) {
    console.error('[teams] could not start:', err.message);
  }
}

// ---------------------------------------------------------------------------
// The app itself
// ---------------------------------------------------------------------------
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    setHeaders(res, filePath) {
      // The service worker must never be cached, or updates never land.
      if (filePath.endsWith('sw.js')) res.set('Cache-Control', 'no-cache');
    },
  })
);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'No such endpoint.' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function start() {
  await push.init();
  scheduler.start();

  app.listen(config.port, () => {
    const line = '='.repeat(66);
    console.log(line);
    console.log(`  ${config.name} — ${config.fullName}`);
    console.log(line);
    console.log(`  Listening   : http://localhost:${config.port}`);
    console.log(`  AI brain    : ${config.aiProvider} (${config[config.aiProvider]?.model || 'n/a'})`);
    console.log(`  Memory      : ${config.memoryBackend}`);
    console.log(`  Timezone    : ${config.timezone}`);
    console.log(`  Tools       : ${toolRegistry.names().length} — ${toolRegistry.names().join(', ')}`);
    console.log(`  Google      : ${config.googleEnabled ? 'configured' : 'not configured'}`);
    console.log(`  Teams       : ${config.teamsEnabled ? 'enabled at /api/messages' : 'off'}`);
    if (!config.ownerPin) console.log('  ⚠  OWNER_PIN is not set — the app will refuse to sign anyone in.');
    if (!config.gemini.apiKey && config.aiProvider === 'gemini') {
      console.log('  ⚠  GEMINI_API_KEY is not set — get a free one at https://aistudio.google.com/apikey');
    }
    console.log(line);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
}

module.exports = { app, start };
