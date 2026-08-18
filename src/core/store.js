'use strict';

/**
 * Persistent storage for V.I.R.A.N.I.
 *
 * One tiny key/value interface, two interchangeable backends:
 *   - "file"    (default)  → ./data/virani.json. Zero setup, great for local use.
 *                            On free hosts the disk can reset on redeploy.
 *   - "upstash" (recommended for real 24/7) → Upstash Redis over REST (free tier).
 *                            Survives restarts, redeploys and sleeping dynos.
 *
 * Everything VIRANI persists (conversations, long-term facts, reminders,
 * push subscriptions, Google tokens) goes through here.
 */

const fs = require('fs');
const path = require('path');
const { config } = require('./config');

// ---------------------------------------------------------------------------
// Backends
// ---------------------------------------------------------------------------
class FileBackend {
  constructor() {
    this.name = 'file';
    this.dir = path.join(process.cwd(), 'data');
    this.file = path.join(this.dir, 'virani.json');
    this.cache = {};
    try {
      if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
      if (fs.existsSync(this.file)) {
        this.cache = JSON.parse(fs.readFileSync(this.file, 'utf8') || '{}');
      }
    } catch (err) {
      console.error('[store] Could not load data file, starting empty:', err.message);
      this.cache = {};
    }
  }

  async read(key) {
    const v = this.cache[key];
    return v === undefined ? null : v;
  }

  async write(key, value) {
    this.cache[key] = value;
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.cache, null, 2));
    } catch (err) {
      console.error('[store] Could not save data file:', err.message);
    }
  }
}

class UpstashBackend {
  constructor() {
    this.name = 'upstash';
    this.url = config.upstash.url.replace(/\/+$/, '');
    this.token = config.upstash.token;
    if (!this.url || !this.token) {
      throw new Error(
        'MEMORY_BACKEND=upstash but UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are missing.'
      );
    }
  }

  async _cmd(command) {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });
    if (!res.ok) throw new Error(`Upstash error (${res.status}): ${await res.text()}`);
    const data = await res.json();
    return data.result;
  }

  async read(key) {
    const raw = await this._cmd(['GET', `virani:${key}`]);
    if (raw === null || raw === undefined) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return raw;
    }
  }

  async write(key, value) {
    await this._cmd(['SET', `virani:${key}`, JSON.stringify(value)]);
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
class Store {
  constructor() {
    this.backend =
      config.memoryBackend === 'upstash' ? new UpstashBackend() : new FileBackend();
    console.log(`[store] backend = ${this.backend.name}`);
  }

  get(key) {
    return this.backend.read(key);
  }

  set(key, value) {
    return this.backend.write(key, value);
  }

  /** Read a collection (always returns an array). */
  async list(key) {
    const v = await this.get(key);
    return Array.isArray(v) ? v : [];
  }

  /** Add an item to a collection and return it (with a generated id). */
  async push(key, item) {
    const items = await this.list(key);
    const withId = { id: newId(), createdAt: new Date().toISOString(), ...item };
    items.push(withId);
    await this.set(key, items);
    return withId;
  }

  /** Replace a whole collection. */
  async replace(key, items) {
    await this.set(key, items);
    return items;
  }

  /** Remove one item by id; returns the removed item or null. */
  async remove(key, id) {
    const items = await this.list(key);
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    const [removed] = items.splice(idx, 1);
    await this.set(key, items);
    return removed;
  }

  // -------------------------------------------------------------------------
  // Conversation memory (short-term context per user)
  // -------------------------------------------------------------------------
  async getConversation(userId) {
    const record = await this.get(`conv:${userId}`);
    if (record) return record;
    const now = new Date().toISOString();
    return { profile: {}, turns: [], firstSeen: now, lastSeen: now };
  }

  async addTurn(userId, role, text) {
    const record = await this.getConversation(userId);
    record.turns.push({ role, text, ts: new Date().toISOString() });
    if (record.turns.length > config.memoryTurns) {
      record.turns = record.turns.slice(-config.memoryTurns);
    }
    record.lastSeen = new Date().toISOString();
    await this.set(`conv:${userId}`, record);
    return record;
  }

  async updateProfile(userId, patch) {
    const record = await this.getConversation(userId);
    record.profile = { ...record.profile, ...patch };
    await this.set(`conv:${userId}`, record);
    return record;
  }

  async clearConversation(userId) {
    const now = new Date().toISOString();
    await this.set(`conv:${userId}`, {
      profile: {},
      turns: [],
      firstSeen: now,
      lastSeen: now,
    });
  }
}

function newId() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  ).toUpperCase();
}

const store = new Store();

module.exports = { store, Store, newId };
