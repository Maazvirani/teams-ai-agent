'use strict';

/**
 * Offline self-test.
 *
 * Runs the whole agent loop against a fake model so you can verify that tool
 * calling, reminders, memory and the HTTP API all work before you ever spend
 * an API call. Run with:  node scripts/selftest.js
 */

process.env.OWNER_PIN = process.env.OWNER_PIN || '4242';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'selftest-secret';
process.env.MEMORY_BACKEND = 'file';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'fake-key-for-selftest';
process.env.OWNER_TIMEZONE = process.env.OWNER_TIMEZONE || 'Asia/Karachi';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Use a throwaway data file so a real memory store is never touched.
const dataFile = path.join(process.cwd(), 'data', 'virani.json');
if (fs.existsSync(dataFile)) fs.rmSync(dataFile);

const results = [];
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      results.push(`  PASS  ${name}`);
    })
    .catch((err) => {
      results.push(`  FAIL  ${name}\n        ${err.message}`);
      process.exitCode = 1;
    });
}

// ---------------------------------------------------------------------------
// A fake Gemini: scripted turns, so the loop is exercised without the network.
// ---------------------------------------------------------------------------
const realFetch = global.fetch;
let script = [];
let seen = [];

function fakeGemini() {
  global.fetch = async (url, options) => {
    if (!String(url).includes('generativelanguage')) return realFetch(url, options);
    const body = JSON.parse(options.body);
    seen.push(body);
    const turn = script.shift();
    if (!turn) throw new Error('Fake model ran out of scripted turns.');
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { role: 'model', parts: turn } }] }),
    };
  };
}

async function main() {
  fakeGemini();
  const { think } = require('../src/core/brain');
  const { buildSystemPrompt } = require('../src/core/persona');
  const { store } = require('../src/core/store');
  const { KEY: REMINDERS_KEY } = require('../src/tools/reminders');

  // -- 1. A plain answer, no tools -----------------------------------------
  await check('model can answer without calling tools', async () => {
    script = [[{ text: 'All systems nominal.' }]];
    const { reply, toolLog } = await think({
      systemPrompt: 'test',
      userMessage: 'are you there',
    });
    assert.strictEqual(reply, 'All systems nominal.');
    assert.strictEqual(toolLog.length, 0);
  });

  // -- 2. Tool call round-trip ---------------------------------------------
  await check('model can call a tool and use the result', async () => {
    script = [
      [{ functionCall: { name: 'get_datetime', args: {} } }],
      [{ text: 'It is Tuesday.' }],
    ];
    const { reply, toolLog } = await think({ systemPrompt: 'test', userMessage: 'what day is it' });
    assert.strictEqual(reply, 'It is Tuesday.');
    assert.deepStrictEqual(toolLog.map((t) => t.tool), ['get_datetime']);
  });

  // -- 3. The tool result actually reaches the model ------------------------
  await check('tool results are fed back to the model', async () => {
    seen = [];
    script = [
      [{ functionCall: { name: 'get_datetime', args: {} } }],
      [{ text: 'Noted.' }],
    ];
    await think({ systemPrompt: 'test', userMessage: 'time?' });
    const second = seen[1];
    const responsePart = second.contents.at(-1).parts[0].functionResponse;
    assert.strictEqual(responsePart.name, 'get_datetime');
    assert.ok(responsePart.response.localIso, 'the datetime payload should come back');
  });

  // -- 4. Parallel tool calls in one round ---------------------------------
  await check('several tools can run in a single round', async () => {
    script = [
      [
        { functionCall: { name: 'remember', args: { fact: 'Likes strong coffee.', category: 'preference' } } },
        { functionCall: { name: 'get_datetime', args: {} } },
      ],
      [{ text: 'Done.' }],
    ];
    const { toolLog } = await think({ systemPrompt: 'test', userMessage: 'remember I like coffee' });
    assert.strictEqual(toolLog.length, 2);
    const facts = await store.list('facts');
    assert.ok(facts.some((f) => f.text.includes('strong coffee')), 'the fact should be persisted');
  });

  // -- 5. A reminder really gets scheduled ---------------------------------
  await check('reminders are created and stored', async () => {
    script = [
      [{ functionCall: { name: 'create_reminder', args: { text: 'Call the bank', in_minutes: 30 } } }],
      [{ text: 'Reminder set.' }],
    ];
    await think({ systemPrompt: 'test', userMessage: 'remind me to call the bank in 30 minutes' });
    const reminders = await store.list(REMINDERS_KEY);
    assert.strictEqual(reminders.length, 1);
    assert.strictEqual(reminders[0].text, 'Call the bank');
    assert.ok(new Date(reminders[0].dueAt) > new Date(), 'it should be scheduled in the future');
  });

  // -- 6. Client actions come back with the reply ---------------------------
  await check('opening an app returns an action for the browser', async () => {
    script = [
      [{ functionCall: { name: 'open_app', args: { app: 'youtube', query: 'arc reactor' } } }],
      [{ text: 'Opening YouTube.' }],
    ];
    const { actions } = await think({ systemPrompt: 'test', userMessage: 'play arc reactor on youtube' });
    assert.strictEqual(actions.length, 1);
    assert.strictEqual(actions[0].type, 'open_url');
    assert.ok(actions[0].url.includes('youtube.com'));
  });

  // -- 7. A broken tool must not break the conversation ---------------------
  await check('a failing tool is reported, not thrown', async () => {
    script = [
      [{ functionCall: { name: 'no_such_tool', args: {} } }],
      [{ text: 'I could not do that.' }],
    ];
    const { reply } = await think({ systemPrompt: 'test', userMessage: 'do something impossible' });
    assert.strictEqual(reply, 'I could not do that.');
  });

  // -- 8. The loop cannot spin forever -------------------------------------
  await check('the tool loop is bounded', async () => {
    script = Array.from({ length: 20 }, () => [{ functionCall: { name: 'get_datetime', args: {} } }]);
    const { reply } = await think({ systemPrompt: 'test', userMessage: 'loop forever' });
    assert.ok(/one piece at a time/.test(reply), 'it should give up gracefully');
  });

  // -- 9. Memory reaches the system prompt ---------------------------------
  await check('remembered facts appear in the system prompt', async () => {
    const prompt = await buildSystemPrompt({ profile: { name: 'Maaz' } });
    assert.ok(prompt.includes('strong coffee'), 'the saved fact should be injected');
    assert.ok(prompt.includes('Maaz'), 'the owner should be addressed by name');
  });

  // -- 10. The HTTP API ----------------------------------------------------
  global.fetch = realFetch;
  await check('the HTTP API authenticates and serves state', async () => {
    const { app } = require('../src/index');
    const push = require('../src/core/push');
    await push.init();

    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
      const health = await (await realFetch(`${base}/health`)).json();
      assert.strictEqual(health.status, 'ok');

      const denied = await realFetch(`${base}/api/state`);
      assert.strictEqual(denied.status, 401, 'state must require a token');

      const wrong = await realFetch(`${base}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '0000' }),
      });
      assert.strictEqual(wrong.status, 401, 'a wrong PIN must be rejected');

      const login = await (
        await realFetch(`${base}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: process.env.OWNER_PIN }),
        })
      ).json();
      assert.ok(login.token, 'a correct PIN returns a token');

      const state = await (
        await realFetch(`${base}/api/state`, { headers: { Authorization: `Bearer ${login.token}` } })
      ).json();
      assert.ok(state.tools.length >= 13, 'tools should be listed');
      assert.strictEqual(state.reminders.length, 1, 'the reminder from earlier should show');
      assert.ok(state.pushPublicKey, 'a push key should be published');

      const icon = await realFetch(`${base}/icon-192.png`);
      assert.strictEqual(icon.headers.get('content-type'), 'image/png');

      const page = await (await realFetch(`${base}/`)).text();
      assert.ok(page.includes('V.I.R.A.N.I.'), 'the app shell should be served');
    } finally {
      server.close();
    }
  });

  console.log(`\n  V.I.R.A.N.I. self-test\n${'  ' + '─'.repeat(40)}`);
  console.log(results.join('\n'));
  console.log(
    `${'  ' + '─'.repeat(40)}\n  ${results.filter((r) => r.includes('PASS')).length}/${results.length} passed\n`
  );
  process.exit(process.exitCode || 0);
}

main().catch((err) => {
  console.error('Self-test crashed:', err);
  process.exit(1);
});
