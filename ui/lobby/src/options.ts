import { variants } from 'lib/game/perf';

import type { GameMode, GameType } from './interfaces';

// bughouse needs four players, so it is only offered for lobby games
export const variantsForGameType = (gameType: GameType): VariantKey[] =>
  gameType === 'hook'
    ? variants.filter(key => key !== 'fromPosition')
    : variants.filter(key => key !== 'bughouse');

export const variantsWhereWhiteIsBetter: VariantKey[] = [
  'antichess',
  'atomic',
  'horde',
  'racingKings',
  'threeCheck',
];

export const gameModes: GameMode[] = ['casual', 'rated'];
