#!/usr/bin/env node
'use strict';

/**
 * Run VIRANI from your own computer, reachable from your phone.
 *
 * Starts the server and opens a free Cloudflare tunnel in front of it, then
 * prints the public https address to open on your phone. No hosting account,
 * no credit card, nothing to sign up for.
 *
 *   npm run tunnel
 *
 * The catch: it only works while this computer is awake. Close the laptop and
 * VIRANI goes offline until you run it again.
 */

const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.PORT || 3978;
const line = '='.repeat(66);

let tunnelUrl = '';
let announced = false;

// --- 1. The VIRANI server -------------------------------------------------
const server = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
  stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, PORT: String(PORT) },
});

server.on('exit', (code) => {
  console.error(`\nVIRANI stopped (exit code ${code}).`);
  shutdown(code ?? 1);
});

// --- 2. The tunnel --------------------------------------------------------
// Give the server a moment to bind the port before pointing a tunnel at it.
const tunnelTimer = setTimeout(startTunnel, 2500);

function startTunnel() {
  console.log('\nOpening a public tunnel (first run downloads cloudflared, ~30s)...\n');

  const tunnel = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['-y', 'cloudflared', 'tunnel', '--url', `http://localhost:${PORT}`],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  const watch = (chunk) => {
    const text = chunk.toString();
    // cloudflared prints the address once, inside a box, on stderr.
    const found = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(text);
    if (found && !announced) {
      tunnelUrl = found[0];
      announced = true;
      announce();
    }
    // Surface real problems, but not cloudflared's routine chatter.
    if (/ERR|error/i.test(text) && !/failed to sufficiently increase receive buffer/i.test(text)) {
      process.stderr.write(text);
    }
  };

  tunnel.stdout.on('data', watch);
  tunnel.stderr.on('data', watch);

  tunnel.on('error', (err) => {
    console.error(`\nCould not start the tunnel: ${err.message}`);
    console.error('Is Node able to reach the internet? You can also run it manually:');
    console.error(`  npx cloudflared tunnel --url http://localhost:${PORT}\n`);
  });

  tunnel.on('exit', (code) => {
    if (!announced) {
      console.error(`\nThe tunnel exited (code ${code}) before giving an address.`);
      console.error(`VIRANI is still running locally at http://localhost:${PORT}\n`);
    }
  });

  process.on('exit', () => tunnel.kill());
}

function announce() {
  console.log(`\n${line}`);
  console.log('  VIRANI is live on the internet');
  console.log(line);
  console.log(`  Open this on your phone : ${tunnelUrl}`);
  console.log(`  On this computer        : http://localhost:${PORT}`);
  console.log('');
  console.log('  Sign in with your OWNER_PIN, then add it to your home screen.');
  console.log('');
  console.log('  To connect Gmail and Calendar later, set PUBLIC_URL to the');
  console.log('  address above and restart — but note it changes every run.');
  console.log('');
  console.log('  Keep this window open. Press Ctrl+C to stop.');
  console.log(`${line}\n`);
}

function shutdown(code) {
  clearTimeout(tunnelTimer);
  process.exit(code);
}

process.on('SIGINT', () => {
  console.log('\nShutting VIRANI down.');
  server.kill();
  shutdown(0);
});
