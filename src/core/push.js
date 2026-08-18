'use strict';

/**
 * Web Push — how VIRANI reaches you when the app is closed.
 *
 * This is the free, built-in browser notification channel: no Firebase, no
 * paid service, no app store. The server holds a VAPID key pair and pushes
 * straight to Google/Apple/Mozilla's push endpoints.
 *
 * If you don't provide VAPID keys, a pair is generated on first boot and saved
 * in the store, so it survives restarts (with the Upstash backend, forever).
 */

const webpush = require('web-push');
const { config } = require('./config');
const { store } = require('./store');

const SUBS_KEY = 'push:subscriptions';
const VAPID_KEY = 'push:vapid';

let publicKey = '';
let ready = false;

async function init() {
  let keys = { publicKey: config.vapid.publicKey, privateKey: config.vapid.privateKey };

  if (!keys.publicKey || !keys.privateKey) {
    const saved = await store.get(VAPID_KEY);
    if (saved?.publicKey && saved?.privateKey) {
      keys = saved;
    } else {
      keys = webpush.generateVAPIDKeys();
      await store.set(VAPID_KEY, keys);
      console.log('[push] Generated a new VAPID key pair and saved it to the store.');
    }
  }

  webpush.setVapidDetails(config.vapid.subject, keys.publicKey, keys.privateKey);
  publicKey = keys.publicKey;
  ready = true;
  return publicKey;
}

function getPublicKey() {
  return publicKey;
}

async function subscribe(subscription) {
  if (!subscription?.endpoint) throw new Error('Invalid push subscription.');
  const subs = await store.list(SUBS_KEY);
  if (subs.some((s) => s.endpoint === subscription.endpoint)) {
    return { alreadySubscribed: true, count: subs.length };
  }
  subs.push(subscription);
  await store.replace(SUBS_KEY, subs);
  return { subscribed: true, count: subs.length };
}

async function unsubscribe(endpoint) {
  const subs = await store.list(SUBS_KEY);
  await store.replace(SUBS_KEY, subs.filter((s) => s.endpoint !== endpoint));
}

async function count() {
  return (await store.list(SUBS_KEY)).length;
}

/**
 * Push a notification to every device you've enabled.
 * Devices that have unsubscribed (410/404) are pruned automatically.
 */
async function notify({ title, body, tag, url, data }) {
  if (!ready) return { sent: 0, reason: 'push not initialised' };

  const subs = await store.list(SUBS_KEY);
  if (subs.length === 0) return { sent: 0, reason: 'no devices subscribed' };

  const payload = JSON.stringify({
    title: title || config.name,
    body: body || '',
    tag: tag || 'virani',
    url: url || '/',
    data: data || {},
  });

  const dead = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, payload, { TTL: 3600, urgency: 'high' });
        sent += 1;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) dead.push(sub.endpoint);
        else console.error('[push] send failed:', err.statusCode, err.body || err.message);
      }
    })
  );

  if (dead.length) {
    await store.replace(SUBS_KEY, subs.filter((s) => !dead.includes(s.endpoint)));
    console.log(`[push] Removed ${dead.length} expired subscription(s).`);
  }
  return { sent, pruned: dead.length };
}

module.exports = { init, getPublicKey, subscribe, unsubscribe, notify, count, SUBS_KEY };
