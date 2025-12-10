// ui/lobby/src/view/setup/components/levelButtons.ts
import { h } from 'snabbdom';
import type LobbyController from '@/ctrl';
import { option } from 'lib/setup/option';

const levels = [1, 2, 3, 4, 5, 6, 7, 8];

export const levelButtons = (ctrl: LobbyController) => {
  const { setupCtrl } = ctrl;
  return site.blindMode
    ? [
        h('label', { attrs: { for: 'sf_level' } }, i18n.site.strength),
        h(
          'select#sf_level',
          {
            on: { change: (e: Event) => setupCtrl.aiLevel(parseInt((e.target as HTMLSelectElement).value)) },
          },
          levels
            .map(l => l.toString())
            .map(key => option({ key, name: key }, setupCtrl.aiLevel().toString())),
        ),
      ]
    : h('div.config-group', [
        h('div.level-selector', [
          h('div.label', i18n.site.strength),
          h(
            'div.level-cards',
            levels.map(level =>
              h('label.card-radio', { class: { selected: level === setupCtrl.aiLevel() } }, [
                h('input.sr-only', {
                  attrs: {
                    name: 'level',
                    type: 'radio',
                    value: level,
                    checked: level === setupCtrl.aiLevel(),
                  },
                  on: {
                    change: (e: Event) => setupCtrl.aiLevel(parseInt((e.target as HTMLInputElement).value)),
                  },
                }),
                h('span.num', level.toString()),
              ]),
            ),
          ),
        ]),
      ]);
};
