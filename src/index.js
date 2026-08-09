'use strict';

// Load .env for local development (harmless if the file is absent, e.g. on hosts
// where variables are set in the dashboard instead).
require('dotenv').config();

const path = require('path');
const restify = require('restify');
const {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
} = require('botbuilder');

const { SupportBot } = require('./bot');
const { PROVIDER } = require('./ai/provider');
const { loadBusiness } = require('./prompt');

// ---------------------------------------------------------------------------
// Bot Framework authentication + adapter (modern CloudAdapter).
// Reads MicrosoftAppId / MicrosoftAppPassword / MicrosoftAppType / TenantId.
// ---------------------------------------------------------------------------
const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication({
  MicrosoftAppId: process.env.MicrosoftAppId,
  MicrosoftAppPassword: process.env.MicrosoftAppPassword,
  MicrosoftAppType: process.env.MicrosoftAppType || 'MultiTenant',
  MicrosoftAppTenantId: process.env.MicrosoftAppTenantId,
});

const adapter = new CloudAdapter(botFrameworkAuthentication);

// Central error handler — logs and tells the user something went wrong,
// instead of crashing the process.
adapter.onTurnError = async (context, error) => {
  console.error('[adapter] Unhandled error:', error);
  try {
    await context.sendActivity('Sorry, something went wrong on my side. Please try again.');
  } catch (_) {
    /* ignore secondary failures */
  }
};

const bot = new SupportBot();

// ---------------------------------------------------------------------------
// HTTP server.
// ---------------------------------------------------------------------------
const server = restify.createServer({ name: 'teams-ai-support-agent' });
server.use(restify.plugins.bodyParser());

const PORT = process.env.PORT || 3978;

// The endpoint Microsoft Teams calls with every message.
server.post('/api/messages', async (req, res) => {
  await adapter.process(req, res, (context) => bot.run(context));
});

// Health check — a public URL an uptime service (e.g. UptimeRobot) can ping
// every few minutes to keep a free host awake 24/7.
function health(req, res, next) {
  res.json({
    status: 'ok',
    service: 'teams-ai-support-agent',
    business: loadBusiness().businessName || undefined,
    aiProvider: PROVIDER,
    time: new Date().toISOString(),
  });
  return next();
}
server.get('/', health);
server.get('/health', health);

server.listen(PORT, () => {
  const b = loadBusiness();
  console.log('==================================================================');
  console.log(` ${server.name} is running`);
  console.log(` Business:     ${b.businessName || '(set in config/business.json)'}`);
  console.log(` Agent name:   ${b.agentName || '(set in config/business.json)'}`);
  console.log(` AI brain:     ${PROVIDER}`);
  console.log(` Listening on: http://localhost:${PORT}`);
  console.log(` Messaging endpoint: /api/messages`);
  console.log(` Health check:       /health`);
  if (!process.env.MicrosoftAppId) {
    console.log('  NOTE: MicrosoftAppId is not set yet — see docs/SETUP.md, Step 3.');
  }
  console.log('==================================================================');
});
