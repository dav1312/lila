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

const key = 'lobby.custom.presets';
const store = storage.make(key);

export const getAll = (): Record<string, CustomPool> => {
  const raw = store.get();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

export const get = (id: string): CustomPool | undefined => getAll()[id];

export const set = (id: string, pool: CustomPool) => {
  const all = getAll();
  all[id] = pool;
  store.set(JSON.stringify(all));
};

export const remove = (id: string) => {
  const all = getAll();
  delete all[id];
  store.set(JSON.stringify(all));
};

export const formatDisplay = (p: CustomPool) => {
  if (p.variant !== 'standard') return p.variant;
  if (p.timeMode === 'realTime') return `${p.time}+${p.increment}`;
  if (p.timeMode === 'correspondence') return `${p.days}d`;
  return '∞';
};
