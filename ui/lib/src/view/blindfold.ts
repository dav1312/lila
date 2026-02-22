import * as licon from '../licon';
import { bind, hl, type MaybeVNode } from './index';

export function renderBlindfoldToggle(isActive: boolean | undefined | null, disable: () => void): MaybeVNode {
  if (!isActive) return undefined;

  return hl('div#blindfoldzone', [
    hl(
      'a#blindfoldtog.text.fbt.active',
      {
        attrs: { 'data-icon': licon.Checkmark },
        hook: bind('click', disable),
      },
      i18n.preferences.blindfold,
    ),
  ]);
}
