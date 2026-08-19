'use strict';

/**
 * The tool registry — everything VIRANI can actually *do*.
 *
 * Each tool declares a JSON schema the model sees, and a handler the server
 * runs. The model decides which to call; src/core/brain.js runs the loop.
 */

const search = require('./search');
const world = require('./world');
const reminders = require('./reminders');
const knowledge = require('./knowledge');
const apps = require('./apps');
const contacts = require('./contacts');
const messaging = require('./messaging');
const notes = require('./notes');
const documents = require('./documents');
const money = require('./money');
const location = require('./location');
const googleTools = require('./google');
const { config } = require('../core/config');

const ALL = [
  ...world.tools,
  ...search.tools,
  ...knowledge.tools,
  ...reminders.tools,
  ...notes.tools,
  ...documents.tools,
  ...money.tools,
  ...contacts.tools,
  ...messaging.tools,
  ...location.tools,
  ...apps.tools,
  // Gmail/Calendar are only offered to the model when Google is configured,
  // otherwise it would keep suggesting things it cannot do.
  ...(config.googleEnabled ? googleTools.tools : []),
];

const byName = new Map(ALL.map((t) => [t.name, t]));

/** The declarations sent to the model (schema only — no handlers). */
function declarations() {
  return ALL.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters: parameters && Object.keys(parameters.properties || {}).length
      ? parameters
      : { type: 'object', properties: {} },
  }));
}

/**
 * Run one tool call. Never throws: a failed tool must come back as data the
 * model can read and explain, not as a crashed request.
 */
async function run(name, args, ctx) {
  const tool = byName.get(name);
  if (!tool) return { error: `Unknown tool "${name}".` };
  const started = Date.now();
  try {
    const result = await tool.handler(args || {}, ctx);
    ctx.log.push({ tool: name, args, ms: Date.now() - started });
    return result ?? { ok: true };
  } catch (err) {
    ctx.log.push({ tool: name, args, ms: Date.now() - started, failed: true });
    console.error(`[tool:${name}]`, err.message);
    return { error: err.message };
  }
}

function names() {
  return ALL.map((t) => t.name);
}

module.exports = { declarations, run, names, ALL };
