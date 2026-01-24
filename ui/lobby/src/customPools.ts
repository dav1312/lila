import { storage } from 'lib/storage';
import { variants } from './options';
import type { SetupStore } from './interfaces';

const makeKey = (username?: string) => `lobby.custom.presets.${username || 'anon'}`;

export const getAll = (username?: string): Record<string, SetupStore> => {
  const raw = storage.make(makeKey(username)).get();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

export const get = (username: string | undefined, id: string): SetupStore | undefined => getAll(username)[id];

export const set = (username: string | undefined, id: string, pool: SetupStore) => {
  const all = getAll(username);
  all[id] = pool;
  storage.make(makeKey(username)).set(JSON.stringify(all));
};

export const remove = (username: string | undefined, id: string) => {
  const all = getAll(username);
  delete all[id];
  storage.make(makeKey(username)).set(JSON.stringify(all));
};

export const getDisplayData = (p: SetupStore) => {
  const timeLabel =
    p.timeMode === 'realTime'
      ? `${p.time}+${p.increment}`
      : p.timeMode === 'correspondence'
        ? `${p.days}d`
        : '∞';

  const variantDef = variants.find(v => v.key === p.variant);

  return {
    timeLabel,
    icon: p.variant !== 'standard' ? variantDef?.icon : undefined,
  };
};