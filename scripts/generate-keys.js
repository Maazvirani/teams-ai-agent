#!/usr/bin/env node
'use strict';

/**
 * Prints the secret values you paste into your hosting dashboard.
 * Run:  node scripts/generate-keys.js
 */

const crypto = require('crypto');
const webpush = require('web-push');

const vapid = webpush.generateVAPIDKeys();

console.log(`
Paste these into Render → Environment (or your .env file).
Keep them private, and keep them the same forever — changing the VAPID keys
un-registers every device's notifications.

SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}
VAPID_PUBLIC_KEY=${vapid.publicKey}
VAPID_PRIVATE_KEY=${vapid.privateKey}

Also set, if you have not already:
OWNER_PIN=<any number you will remember>
GEMINI_API_KEY=<free key from https://aistudio.google.com/apikey>
`);
