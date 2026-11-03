import { lichessRules } from 'chessops/compat';
import type { Rules } from 'chessops/types';

// chessops does not know bughouse, so a bughouse board is analysed with crazyhouse rules
export const boardRules = (variant: VariantKey): Rules =>
  lichessRules(variant === 'bughouse' ? 'crazyhouse' : variant);
