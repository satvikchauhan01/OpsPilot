import mongoose from 'mongoose';
import { User } from '../models/user.js';

const FRESH_MS = 10_000;

// Sessions are signed cookies, so on their own a changed role or a removed account would
// only take effect when the cookie expires, up to 12 hours later. Each request looks the
// account up instead, through a cache short enough that a change reaches every session
// within seconds. Changes made here drop the cached copy at once.
function createAccounts() {
  const cache = new Map();

  async function current(id) {
    const hit = cache.get(id);
    if (hit && hit.until > Date.now()) return hit.account;

    const user = mongoose.isValidObjectId(id) ? await User.findById(id, 'name role').lean() : null;
    const account = user ? { name: user.name, role: user.role } : null;
    cache.set(id, { account, until: Date.now() + FRESH_MS });
    return account;
  }

  return { current, forget: (id) => cache.delete(String(id)) };
}

export const accounts = createAccounts();
