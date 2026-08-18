'use strict';

/**
 * Optional Microsoft Teams front door.
 *
 * Same brain, same memory, same tools — just reached by typing in Teams rather
 * than speaking in the app. Only mounted when MicrosoftAppId/Password are set,
 * so you can ignore this entirely if you only want the voice app.
 */

const { CloudAdapter, ConfigurationBotFrameworkAuthentication, TeamsActivityHandler, TurnContext } = require('botbuilder');
const { config } = require('../core/config');
const { store } = require('../core/store');
const { think } = require('../core/brain');
const { buildSystemPrompt } = require('../core/persona');

class ViraniTeamsBot extends TeamsActivityHandler {
  constructor() {
    super();

    this.onMembersAdded(async (context, next) => {
      const botId = context.activity.recipient.id;
      for (const member of context.activity.membersAdded || []) {
        if (member.id !== botId) {
          await context.sendActivity(
            `${config.name} online. Ask me anything — I can search the web, manage your reminders and check your calendar.`
          );
        }
      }
      await next();
    });

    this.onMessage(async (context, next) => {
      await this.reply(context);
      await next();
    });
  }

  async reply(context) {
    const userId = context.activity.from?.aadObjectId || context.activity.from?.id || 'teams';
    const text = (TurnContext.removeRecipientMention(context.activity) || context.activity.text || '').trim();
    if (!text) return;

    if (['reset', 'clear', 'forget'].includes(text.toLowerCase())) {
      await store.clearConversation(userId);
      await context.sendActivity('Conversation cleared.');
      return;
    }

    await context.sendActivity({ type: 'typing' });
    try {
      const record = await store.getConversation(userId);
      if (context.activity.from?.name && !record.profile?.name) {
        await store.updateProfile(userId, { name: String(context.activity.from.name).split(/\s+/)[0] });
      }

      const systemPrompt = await buildSystemPrompt({ profile: record.profile, channel: 'text' });
      const { reply, actions } = await think({
        systemPrompt,
        history: record.turns.map((t) => ({ role: t.role, text: t.text })),
        userMessage: text,
        channel: 'text',
      });

      await store.addTurn(userId, 'user', text);
      await store.addTurn(userId, 'assistant', reply);

      // Teams cannot open apps on the user's behalf, so links are offered instead.
      const links = actions
        .filter((a) => a.type === 'open_url')
        .map((a) => `[${a.label || 'Open'}](${a.url})`)
        .join(' · ');
      await context.sendActivity(links ? `${reply}\n\n${links}` : reply);
    } catch (err) {
      console.error('[teams]', err.message);
      await context.sendActivity(`I hit a problem: ${err.message}`);
    }
  }
}

function mount(app) {
  const authentication = new ConfigurationBotFrameworkAuthentication({
    MicrosoftAppId: config.teams.appId,
    MicrosoftAppPassword: config.teams.appPassword,
    MicrosoftAppType: config.teams.appType,
    MicrosoftAppTenantId: config.teams.tenantId,
  });
  const adapter = new CloudAdapter(authentication);
  adapter.onTurnError = async (context, error) => {
    console.error('[teams] unhandled:', error);
    await context.sendActivity('Something went wrong on my side.').catch(() => {});
  };

  const bot = new ViraniTeamsBot();
  app.post('/api/messages', (req, res) => adapter.process(req, res, (ctx) => bot.run(ctx)));
  console.log('[teams] messaging endpoint mounted at /api/messages');
}

module.exports = { mount, ViraniTeamsBot };
