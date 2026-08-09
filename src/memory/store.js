'use strict';

/**
 * Persistent memory for the agent.
 *
 * Each user gets a memory record:
 *   {
 *     profile:   { name?: string },          // long-term facts we learn about them
 *     turns:     [{ role, text, ts }],       // recent conversation (short-term context)
 *     firstSeen: ISO string,
 *     lastSeen:  ISO string
 *   }
 *
 * Two backends, chosen by MEMORY_BACKEND:
 *   - "file"    (default): stored in ./data/memory.json. Simple, no signup.
 *                Note: on some free hosts the disk resets on redeploy.
 *   - "upstash" (recommended for real 24/7): stored in Upstash Redis (free tier),
 *                survives restarts and redeploys. Set UPSTASH_REDIS_REST_URL and
 *                UPSTASH_REDIS_REST_TOKEN.
 */

const fs = require('fs');
const path = require('path');

const BACKEND = (process.env.MEMORY_BACKEND || 'file').toLowerCase();
const MAX_TURNS = parseInt(process.env.MEMORY_TURNS || '12', 10);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
class MemoryStore {
  constructor() {
    this.backend = BACKEND === 'upstash' ? new UpstashBackend() : new FileBackend();
    console.log(`[memory] Using "${this.backend.name}" backend (keeps last ${MAX_TURNS} turns per user).`);
  }

  async get(userId) {
    const record = (await this.backend.read(key(userId))) || newRecord();
    return record;
  }

  /** Append a conversation turn and persist. */
  async addTurn(userId, role, text) {
    const record = await this.get(userId);
    record.turns.push({ role, text, ts: new Date().toISOString() });
    // Keep only the most recent turns to control size and token cost.
    if (record.turns.length > MAX_TURNS) {
      record.turns = record.turns.slice(-MAX_TURNS);
    }
    record.lastSeen = new Date().toISOString();
    await this.backend.write(key(userId), record);
    return record;
  }

  /** Store/merge long-term profile facts (e.g. the customer's name). */
  async updateProfile(userId, patch) {
    const record = await this.get(userId);
    record.profile = { ...record.profile, ...patch };
    record.lastSeen = new Date().toISOString();
    await this.backend.write(key(userId), record);
    return record;
  }

  /** Wipe a user's memory (used by the "reset" command). */
  async clear(userId) {
    await this.backend.write(key(userId), newRecord());
  }
}

function key(userId) {
  return `mem:${userId}`;
}

function newRecord() {
  const now = new Date().toISOString();
  return { profile: {}, turns: [], firstSeen: now, lastSeen: now };
}

// ---------------------------------------------------------------------------
// File backend
// ---------------------------------------------------------------------------
class FileBackend {
  constructor() {
    this.name = 'file';
    this.dir = path.join(process.cwd(), 'data');
    this.file = path.join(this.dir, 'memory.json');
    this.cache = null;
    this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
      this.cache = fs.existsSync(this.file)
        ? JSON.parse(fs.readFileSync(this.file, 'utf8') || '{}')
        : {};
    } catch (err) {
      console.error('[memory] Could not load memory file, starting empty:', err.message);
      this.cache = {};
    }
  }

  _save() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.cache, null, 2));
    } catch (err) {
      console.error('[memory] Could not save memory file:', err.message);
    }
  }

  async read(k) {
    return this.cache[k] || null;
  }

  async write(k, value) {
    this.cache[k] = value;
    this._save();
  }
}

// ---------------------------------------------------------------------------
// Upstash Redis backend (REST API — no extra dependency, uses global fetch)
// ---------------------------------------------------------------------------
class UpstashBackend {
  constructor() {
    this.name = 'upstash';
    this.url = process.env.UPSTASH_REDIS_REST_URL;
    this.token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!this.url || !this.token) {
      throw new Error('MEMORY_BACKEND=upstash but UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are missing.');
    }
  }

  async _cmd(command) {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!res.ok) throw new Error(`Upstash error (${res.status}): ${await res.text()}`);
    const data = await res.json();
    return data.result;
  }

  async read(k) {
    const raw = await this._cmd(['GET', k]);
    return raw ? JSON.parse(raw) : null;
  }

  async write(k, value) {
    await this._cmd(['SET', k, JSON.stringify(value)]);
  }
}

module.exports = { MemoryStore };
