// ui/lobby/src/options.ts
import * as licon from 'lib/licon';

import type { GameMode, GameType, Variant } from './interfaces';

export const variants: Variant[] = [
  { id: 1, icon: licon.CrownElite, key: 'standard', name: i18n.variant.standard, desc: i18n.variant.standardTitle },
  { id: 10, icon: licon.Crazyhouse, key: 'crazyhouse', name: i18n.variant.crazyhouse, desc: i18n.variant.crazyhouseTitle },
  { id: 2, icon: licon.DieSix, key: 'chess960', name: i18n.variant.chess960, desc: i18n.variant.chess960Title },
  { id: 4, icon: licon.FlagKingHill, key: 'kingOfTheHill', name: i18n.variant.kingOfTheHill, desc: i18n.variant.kingOfTheHillTitle },
  { id: 5, icon: licon.ThreeCheckStack, key: 'threeCheck', name: i18n.variant.threeCheck, desc: i18n.variant.threeCheckTitle },
  { id: 6, icon: licon.Antichess, key: 'antichess', name: i18n.variant.antichess, desc: i18n.variant.antichessTitle },
  { id: 7, icon: licon.Atom, key: 'atomic', name: i18n.variant.atomic, desc: i18n.variant.atomicTitle },
  { id: 8, icon: licon.Keypad, key: 'horde', name: i18n.variant.horde, desc: i18n.variant.hordeTitle },
  { id: 9, icon: licon.FlagRacingKings, key: 'racingKings', name: i18n.variant.racingKings, desc: i18n.variant.racingKingsTitle },
  { id: 3, icon: licon.Pencil, key: 'fromPosition', name: i18n.variant.fromPosition, desc: i18n.variant.fromPositionTitle },
];

export const variantsForGameType = (baseVariants: Variant[], gameType: GameType): Variant[] =>
  gameType === 'hook' ? baseVariants.filter(({ key }) => key !== 'fromPosition') : baseVariants;

export const variantsWhereWhiteIsBetter: VariantKey[] = [
  'antichess',
  'atomic',
  'horde',
  'racingKings',
  'threeCheck',
];

export const speeds: { key: Speed; name: string; icon: string }[] = [
  { icon: licon.UltraBullet, key: 'ultraBullet', name: 'UltraBullet' },
  { icon: licon.Bullet, key: 'bullet', name: 'Bullet' },
  { icon: licon.FlameBlitz, key: 'blitz', name: 'Blitz' },
  { icon: licon.Rabbit, key: 'rapid', name: 'Rapid' },
  { icon: licon.Turtle, key: 'classical', name: 'Classical' },
  { icon: licon.PaperAirplane, key: 'correspondence', name: 'Correspondence' },
];

export const keyToId = (key: string, items: { id: number; key: string }[]): number =>
  items.find(item => item.key === key)!.id;

export const gameModes: { key: GameMode; name: string }[] = [
  { key: 'casual', name: i18n.site.casual },
  { key: 'rated', name: i18n.site.rated },
];
