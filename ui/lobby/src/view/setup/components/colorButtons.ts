// ui/lobby/src/view/setup/components/colorButtons.ts
import { hl } from 'lib/view';
import type LobbyController from '@/ctrl';
import { variantsWhereWhiteIsBetter } from '@/options';
import { blindModeColorPicker } from 'lib/setup/view/color';

export const colorButtons = (ctrl: LobbyController) => {
  const { setupCtrl } = ctrl;

  const randomColorOnly =
    setupCtrl.gameType === 'hook' ||
    (setupCtrl.gameType !== 'ai' &&
      setupCtrl.gameMode() === 'rated' &&
      variantsWhereWhiteIsBetter.includes(setupCtrl.variant()));

  if (randomColorOnly) return undefined;
  if (site.blindMode)
    return setupCtrl.gameType !== 'hook' ? hl('div', blindModeColorPicker(setupCtrl.color)) : undefined;

  const colors = [
    { key: 'black', label: i18n.site.black },
    { key: 'random', label: i18n.site.randomColor },
    { key: 'white', label: i18n.site.white },
  ];

  return hl('div.config-group', [
    // Added .color-picker class to ensure CSS variables (e.g. --king-size) from _colorChoice.scss are available
    hl('div.color-selector.color-picker', [
      hl('div.label', i18n.site.side),
      hl(
        'div.color-cards',
        colors.map(c =>
          hl('label.card-radio', { class: { selected: setupCtrl.color() === c.key } }, [
            hl('input.sr-only', {
              attrs: { type: 'radio', name: 'color', value: c.key, checked: setupCtrl.color() === c.key },
              on: { change: (e: Event) => setupCtrl.color((e.target as HTMLInputElement).value as any) },
            }),
            // Using color-picker__button class to inherit background images logic from original SCSS
            hl('div.color-picker__button', { class: { [c.key]: true } }, [hl('i')]),
            hl('span.text', c.label),
          ]),
        ),
      ),
    ]),
  ]);
};
