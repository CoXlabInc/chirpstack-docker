const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ADMIN_USER = 'admin';
const DEFAULT_PASSWORD = 'admin';

function deriveKey(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password, mustChange) {
  const salt = crypto.randomBytes(16);
  const key = await deriveKey(password, salt);
  return { salt: salt.toString('base64'), hash: key.toString('base64'), mustChange };
}

// Single admin account; the hash lives next to config.yml
class AuthStore {
  constructor(file) {
    this.file = file;
    this.cached = null;
  }

  async load() {
    if (this.cached) {
      return this.cached;
    }
    if (fs.existsSync(this.file)) {
      this.cached = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } else {
      // Factory default; the UI forces a change before anything else
      this.cached = await hashPassword(DEFAULT_PASSWORD, true);
      this.save();
    }
    return this.cached;
  }

  save() {
    const tmp = path.join(path.dirname(this.file), `.${path.basename(this.file)}.${process.pid}.tmp`);
    fs.writeFileSync(tmp, JSON.stringify(this.cached), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  async mustChange() {
    return (await this.load()).mustChange;
  }

  async verify(username, password) {
    const stored = await this.load();
    const key = await deriveKey(password, Buffer.from(stored.salt, 'base64'));
    const expected = Buffer.from(stored.hash, 'base64');
    return username === ADMIN_USER && key.length === expected.length && crypto.timingSafeEqual(key, expected);
  }

  async setPassword(password) {
    this.cached = await hashPassword(password, false);
    this.save();
  }
}

const IDLE_MS = 60 * 60 * 1000;
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

// In memory on purpose: restarting the bridge simply logs everyone out
class Sessions {
  constructor() {
    this.sessions = new Map();
  }

  create() {
    const id = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    this.sessions.set(id, { createdAt: now, lastSeen: now });
    return id;
  }

  touch(id) {
    const session = id && this.sessions.get(id);
    if (!session) {
      return false;
    }
    const now = Date.now();
    if (now - session.lastSeen > IDLE_MS || now - session.createdAt > MAX_AGE_MS) {
      this.sessions.delete(id);
      return false;
    }
    session.lastSeen = now;
    return true;
  }

  destroy(id) {
    if (id) {
      this.sessions.delete(id);
    }
  }

  destroyAllExcept(keep) {
    for (const id of this.sessions.keys()) {
      if (id !== keep) {
        this.sessions.delete(id);
      }
    }
  }
}

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;

class LoginLimiter {
  constructor() {
    this.attempts = new Map();
  }

  // Seconds to wait when the address is over the limit, 0 otherwise
  check(ip) {
    const entry = this.attempts.get(ip);
    if (!entry || entry.resetAt < Date.now()) {
      return 0;
    }
    return entry.count >= MAX_ATTEMPTS ? Math.ceil((entry.resetAt - Date.now()) / 1000) : 0;
  }

  fail(ip) {
    const now = Date.now();
    const entry = this.attempts.get(ip);
    if (!entry || entry.resetAt < now) {
      this.attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    } else {
      entry.count += 1;
    }
  }

  reset(ip) {
    this.attempts.delete(ip);
  }
}

module.exports = { ADMIN_USER, AuthStore, Sessions, LoginLimiter };
