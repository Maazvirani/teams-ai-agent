'use strict';

/**
 * Google account connection (Gmail + Calendar).
 *
 * Uses the standard OAuth 2.0 "authorization code" flow with a refresh token,
 * called over plain REST so there is no heavyweight SDK to install. You approve
 * access once from the VIRANI settings screen; the refresh token is saved in
 * the store and used to mint short-lived access tokens forever after.
 */

const { config } = require('./config');
const { getJson, request } = require('./http');
const { store } = require('./store');

const TOKEN_KEY = 'google:tokens';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

let cachedAccess = { token: '', expiresAt: 0 };

function redirectUri() {
  if (config.google.redirectUri) return config.google.redirectUri;
  if (config.publicUrl) return `${config.publicUrl}/api/google/callback`;
  return `http://localhost:${config.port}/api/google/callback`;
}

function authUrl(state) {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: config.google.scopes.join(' '),
    access_type: 'offline',       // ask for a refresh token
    prompt: 'consent',            // force it, even on a repeat approval
    include_granted_scopes: 'true',
    state: state || '',
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

async function form(endpoint, params) {
  const res = await request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Google auth failed (${res.status}): ${data.error_description || data.error || res.statusText}`
    );
  }
  return data;
}

/** Step 2 of the flow: swap the one-time code for tokens and store them. */
async function exchangeCode(code) {
  const data = await form(TOKEN_ENDPOINT, {
    code,
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code',
  });
  if (!data.refresh_token) {
    throw new Error(
      'Google did not return a refresh token. Remove VIRANI at ' +
        'https://myaccount.google.com/permissions and connect again.'
    );
  }

  cachedAccess = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };

  let email = '';
  try {
    const me = await getJson('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    email = me.email || '';
  } catch (_) {
    /* the account still works without knowing its address */
  }

  await store.set(TOKEN_KEY, {
    refreshToken: data.refresh_token,
    email,
    scope: data.scope,
    connectedAt: new Date().toISOString(),
  });
  return { email };
}

async function getTokens() {
  return store.get(TOKEN_KEY);
}

async function isConnected() {
  return Boolean((await getTokens())?.refreshToken);
}

async function disconnect() {
  cachedAccess = { token: '', expiresAt: 0 };
  await store.set(TOKEN_KEY, null);
}

/** A valid access token, refreshed automatically when it expires. */
async function accessToken() {
  if (cachedAccess.token && Date.now() < cachedAccess.expiresAt) return cachedAccess.token;

  const tokens = await getTokens();
  if (!tokens?.refreshToken) {
    throw new Error('Google account is not connected. Open VIRANI settings and connect Google.');
  }
  const data = await form(TOKEN_ENDPOINT, {
    refresh_token: tokens.refreshToken,
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    grant_type: 'refresh_token',
  });
  cachedAccess = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in || 3600) - 60) * 1000,
  };
  return cachedAccess.token;
}

/** Authenticated call to any Google API. */
async function api(url, options = {}) {
  const token = await accessToken();
  const res = await request(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (res.status === 204) return {};
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Google API error (${res.status}): ${data?.error?.message || res.statusText}`);
  }
  return data;
}

module.exports = {
  authUrl, exchangeCode, accessToken, api, isConnected, getTokens, disconnect, redirectUri, TOKEN_KEY,
};
