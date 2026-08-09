'use strict';

/**
 * Builds the system prompt (the agent's "job description") from the two
 * reseller-editable files: config/business.json and config/knowledge.md.
 *
 * The files are read fresh each time so that editing them and redeploying
 * updates the agent's behaviour without any code changes.
 */

const fs = require('fs');
const path = require('path');

const BUSINESS_PATH = path.join(process.cwd(), 'config', 'business.json');
const KNOWLEDGE_PATH = path.join(process.cwd(), 'config', 'knowledge.md');

function loadBusiness() {
  try {
    return JSON.parse(fs.readFileSync(BUSINESS_PATH, 'utf8'));
  } catch (err) {
    console.error('[prompt] Could not read config/business.json:', err.message);
    return {};
  }
}

function loadKnowledge() {
  try {
    return fs.readFileSync(KNOWLEDGE_PATH, 'utf8');
  } catch (err) {
    console.error('[prompt] Could not read config/knowledge.md:', err.message);
    return '';
  }
}

/**
 * @param {object} memory - The user's memory record (profile + turns).
 * @returns {string} The full system prompt.
 */
function buildSystemPrompt(memory = {}) {
  const b = loadBusiness();
  const knowledge = loadKnowledge();

  const rules = Array.isArray(b.rules) ? b.rules.map((r, i) => `${i + 1}. ${r}`).join('\n') : '';
  const profileName = memory?.profile?.name;

  return `You are "${b.agentName || 'the Assistant'}", the official customer-support assistant for ${b.businessName || 'the business'} (${b.industry || ''}), based in ${b.country || ''}.

# Your role
You provide professional customer support and answer questions 24/7. You represent the business, so your tone is ${b.tone || 'professional, warm, and helpful'}. You can communicate in ${b.languages || 'English'} — reply in whichever language the customer uses.

# How you must behave
${rules}

# Contact / escalation details (share these when you cannot fully help)
- ${b.escalationMessage || 'Please contact our team directly:'}
- Email: ${b.supportEmail || 'N/A'}
- Phone: ${b.supportPhone || 'N/A'}
- Website: ${b.websiteUrl || 'N/A'}
- Business hours: ${b.businessHours || 'N/A'}

# What you know (the ONLY facts you may state about the business)
${knowledge || '(No knowledge base provided.)'}

# Formatting
- Keep answers concise and easy to read on a phone or in a chat window.
- Use short paragraphs and bullet points where helpful.
- Do not use huge blocks of text.
${profileName ? `\n# About the person you are talking to\nThe customer's name is ${profileName}. Address them warmly by name where natural.` : ''}

Remember: be helpful and accurate. If the answer is not in the knowledge base, say so honestly and share the contact details rather than guessing.`;
}

module.exports = { buildSystemPrompt, loadBusiness };
