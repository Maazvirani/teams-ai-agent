'use strict';

const { TeamsActivityHandler, TurnContext } = require('botbuilder');
const { generateReply } = require('./ai/provider');
const { MemoryStore } = require('./memory/store');
const { buildSystemPrompt, loadBusiness } = require('./prompt');

/**
 * The Support Agent.
 *
 * Extends TeamsActivityHandler so it reacts to Teams events:
 *  - a new member/first contact  -> professional welcome
 *  - every message               -> think with the AI brain, using memory
 */
class SupportBot extends TeamsActivityHandler {
  constructor() {
    super();
    this.memory = new MemoryStore();

    // Greet the customer when the agent is first added / a member joins.
    this.onMembersAdded(async (context, next) => {
      const business = loadBusiness();
      const botId = context.activity.recipient.id;
      for (const member of context.activity.membersAdded || []) {
        if (member.id !== botId) {
          await context.sendActivity(
            business.greeting ||
              `Hello! I'm ${business.agentName || 'your assistant'}. How can I help you today?`
          );
        }
      }
      await next();
    });

    // Handle every incoming message.
    this.onMessage(async (context, next) => {
      await this.handleMessage(context);
      await next();
    });
  }

  async handleMessage(context) {
    const userId = context.activity.from?.aadObjectId || context.activity.from?.id || 'unknown';
    const userName = context.activity.from?.name;
    const text = (TurnContext.removeRecipientMention(context.activity) || context.activity.text || '').trim();

    // --- Built-in commands -------------------------------------------------
    const lower = text.toLowerCase();
    if (lower === 'reset' || lower === 'clear' || lower === 'forget') {
      await this.memory.clear(userId);
      await context.sendActivity("Done — I've cleared our conversation history. How can I help you now?");
      return;
    }
    if (lower === 'help' || lower === 'menu' || lower === '/help') {
      await context.sendActivity(this.helpText());
      return;
    }
    if (!text) {
      await context.sendActivity("I didn't catch that. Could you type your question?");
      return;
    }

    // --- Show a typing indicator while the AI thinks -----------------------
    await context.sendActivity({ type: 'typing' });

    try {
      // Load memory and remember the customer's display name once.
      let record = await this.memory.get(userId);
      if (userName && !record.profile?.name) {
        record = await this.memory.updateProfile(userId, { name: firstName(userName) });
      }

      const systemPrompt = buildSystemPrompt(record);
      const history = record.turns.map((t) => ({ role: t.role, text: t.text }));

      const reply = await generateReply({ systemPrompt, history, userMessage: text });

      // Persist both sides of the exchange so context carries forward.
      await this.memory.addTurn(userId, 'user', text);
      await this.memory.addTurn(userId, 'assistant', reply);

      await context.sendActivity(reply);
    } catch (err) {
      console.error('[bot] AI error:', err.message);
      const business = loadBusiness();
      await context.sendActivity(
        `I'm sorry — I ran into a problem answering that just now. Please try again in a moment.` +
          (business.supportEmail ? `\n\nIf it keeps happening, you can reach our team at ${business.supportEmail}.` : '')
      );
    }
  }

  helpText() {
    const b = loadBusiness();
    return (
      `**${b.agentName || 'Assistant'} — quick help**\n\n` +
      `Just type your question in plain language and I'll help right away. For example:\n` +
      `- "What are your prices?"\n` +
      `- "What are your business hours?"\n` +
      `- "How do I get started?"\n\n` +
      `Commands: type **reset** to clear our chat history, or **help** to see this again.` +
      (b.supportEmail ? `\n\nPrefer a human? Email ${b.supportEmail}.` : '')
    );
  }
}

function firstName(fullName) {
  return String(fullName).trim().split(/\s+/)[0];
}

module.exports = { SupportBot };
