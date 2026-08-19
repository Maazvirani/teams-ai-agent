'use strict';

/**
 * Owner authentication.
 *
 * VIRANI can read your email, your calendar and your memories, so the whole
 * app sits behind a single PIN you choose (OWNER_PIN). Logging in returns a
 * signed token that the browser keeps, so you only type the PIN once per device.
 *
 * No database and no third-party login service — just an HMAC signature.
 */

const crypto = require('crypto');
const { config } = require('./config');

// The signing key for session tokens.
//
// If SESSION_SECRET is set, that wins. Otherwise one is generated once and kept
// in the store, so it survives restarts and redeploys and you stay signed in —
// without having to invent and paste a random string during setup.
let SECRET = config.sessionSecret || crypto.randomBytes(32).toString('hex');

async function initSecret() {
  if (config.sessionSecret) return;

  // Required here rather than at the top: the store reads config, and config
  // must finish loading before auth is wired up.
  // eslint-disable-next-line global-require
  const { store } = require('./store');

  const saved = await store.get('auth:secret');
  if (saved && typeof saved === 'string' && saved.length >= 32) {
    SECRET = saved;
    return;
  }
  await store.set('auth:secret', SECRET);
  console.log('[auth] Generated a session secret and saved it — you will stay signed in across restarts.');
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  // Constant-time compare so a token can't be guessed byte by byte.
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

/** Check a submitted PIN without leaking timing information. */
function checkPin(pin) {
  if (!config.ownerPin) return false;
  const a = Buffer.from(String(pin || ''));
  const b = Buffer.from(config.ownerPin);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function issueToken(userId = 'owner') {
  return sign({
    sub: userId,
    iat: Date.now(),
    exp: Date.now() + config.sessionDays * 24 * 60 * 60 * 1000,
  });
}

/** Express middleware: rejects anything without a valid token. */
function requireAuth(req, res, next) {
  // No PIN configured at all → refuse to serve private data rather than
  // silently exposing the owner's inbox to the internet.
  if (!config.ownerPin) {
    return res.status(503).json({
      error:
        'OWNER_PIN is not set. Set it in your hosting environment so only you can use VIRANI.',
    });
  }
  const header = req.headers.authorization || '';
  const token =
    (header.startsWith('Bearer ') && header.slice(7)) ||
    req.query.token ||
    (req.body && req.body.token);
  const payload = verify(token);
  if (!payload) return res.status(401).json({ error: 'Not signed in.' });
  req.user = payload;
  return next();
}

module.exports = { sign, verify, checkPin, issueToken, requireAuth, initSecret };
