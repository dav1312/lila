// ui/lobby/src/options.ts
import * as licon from 'lib/licon';

import type { GameMode, GameType, Variant } from './interfaces';

export const variants: Variant[] = [
  { id: 1, icon: licon.CrownElite, key: 'standard', name: 'Standard', desc: i18n.site.standardDesc }, // Should be i18n.variant.standardTitle
  { id: 10, icon: licon.Crazyhouse, key: 'crazyhouse', name: 'Crazyhouse', desc: i18n.site.crazyhouseDesc },
  { id: 2, icon: licon.DieSix, key: 'chess960', name: 'Chess960', desc: i18n.site.chess960Desc },
  { id: 4, icon: licon.FlagKingHill, key: 'kingOfTheHill', name: 'King of the Hill', desc: i18n.site.kingOfTheHillDesc },
  { id: 5, icon: licon.ThreeCheckStack, key: 'threeCheck', name: 'Three-check', desc: i18n.site.threeCheckDesc },
  { id: 6, icon: licon.Antichess, key: 'antichess', name: 'Antichess', desc: i18n.site.antichessDesc },
  { id: 7, icon: licon.Atom, key: 'atomic', name: 'Atomic', desc: i18n.site.atomicDesc },
  { id: 8, icon: licon.Keypad, key: 'horde', name: 'Horde', desc: i18n.site.hordeDesc },
  { id: 9, icon: licon.FlagRacingKings, key: 'racingKings', name: 'Racing Kings', desc: i18n.site.racingKingsDesc },
  { id: 3, icon: licon.Pencil, key: 'fromPosition', name: 'From Position', desc: i18n.site.fromPositionDesc },
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
