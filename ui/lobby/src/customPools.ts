import { storage } from 'lib/storage';

export interface CustomPool {
  variant: string;
  fen?: string;
  timeMode: string;
  time: number;
  increment: number;
  days: number;
  mode: string;
  ratingRange: string;
  ratingMin: number;
  ratingMax: number;
  level?: number;
  color: string;
}

const makeKey = (username?: string) => `lobby.custom.presets.${username || 'anon'}`;

export const getAll = (username?: string): Record<string, CustomPool> => {
  const raw = storage.make(makeKey(username)).get();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

export const get = (username: string | undefined, id: string): CustomPool | undefined =>
  getAll(username)[id];

export const set = (username: string | undefined, id: string, pool: CustomPool) => {
  const all = getAll(username);
  all[id] = pool;
  storage.make(makeKey(username)).set(JSON.stringify(all));
};

export const remove = (username: string | undefined, id: string) => {
  const all = getAll(username);
  delete all[id];
  storage.make(makeKey(username)).set(JSON.stringify(all));
};

export const formatDisplay = (p: CustomPool) => {
  if (p.variant !== 'standard') return p.variant;
  if (p.timeMode === 'realTime') return `${p.time}+${p.increment}`;
  if (p.timeMode === 'correspondence') return `${p.days}d`;
  return '∞';
};
