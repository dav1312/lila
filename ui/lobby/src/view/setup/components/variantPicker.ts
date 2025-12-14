// ui/lobby/src/view/setup/components/variantPicker.ts
import { h } from 'snabbdom';
import type LobbyController from '@/ctrl';
import { variants, variantsForGameType } from '@/options';

const variantConfig: Record<string, { icon: string; desc: string }> = {
  standard: { icon: '', desc: i18n.site.standard },
  crazyhouse: { icon: '', desc: 'Captured pieces can be dropped back' },
  chess960: { icon: '', desc: 'Randomized starting position' },
  kingOfTheHill: { icon: '', desc: 'Get your king to the center' },
  threeCheck: { icon: '', desc: 'Check the opponent three times' },
  antichess: { icon: '', desc: 'Lose all your pieces or get stalemated' },
  atomic: { icon: '', desc: 'Captures cause explosions' },
  horde: { icon: '', desc: 'White has a horde of pawns' },
  racingKings: { icon: '', desc: 'Race your king to the eighth rank' },
  fromPosition: { icon: '', desc: 'Standard chess from a custom position' },
};

export const variantPicker = (ctrl: LobbyController) => {
  const { setupCtrl } = ctrl;
  const currentVariant = setupCtrl.variant();
  const isStandard = currentVariant === 'standard';

  const otherVariantKey = isStandard ? 'standard' : currentVariant;
  const otherIcon = isStandard ? '' : variantConfig[otherVariantKey]?.icon || '';
  const otherName = isStandard
    ? i18n.site.other
    : variants.find(v => v.key === currentVariant)?.name || 'Other';
  const otherDesc = isStandard ? 'More ways to play' : variantConfig[currentVariant]?.desc || '';

  const availableVariants = variantsForGameType(variants, setupCtrl.gameType!).filter(
    v => v.key !== 'standard',
  );

  const variantModal = setupCtrl.variantMenuOpen
    ? h(
        'div.variant-modal-overlay',
        {
          on: {
            click: (e: Event) => {
              if (e.target === e.currentTarget) setupCtrl.toggleVariantMenu();
            },
          },
        },
        [
          h('dialog.variant-modal', [
            h('header', [
              h('h3', i18n.site.variant),
              h(
                'button.close',
                { on: { click: setupCtrl.toggleVariantMenu } },
                h('span', { attrs: { 'data-icon': '' } }),
              ),
            ]),
            h(
              'div.variant-grid',
              availableVariants.map(v => {
                const conf = variantConfig[v.key] || { icon: '', desc: '' };
                return h(
                  'button.variant-card',
                  {
                    class: { selected: currentVariant === v.key },
                    on: {
                      click: () => {
                        setupCtrl.variant(v.key);
                        setupCtrl.toggleVariantMenu();
                      },
                    },
                  },
                  [
                    h('span.icon', { attrs: { 'data-icon': conf.icon } }),
                    h('div.text', [h('span.name', v.name), h('span.desc', conf.desc)]),
                  ],
                );
              }),
            ),
          ]),
        ],
      )
    : null;

  return h('div.variant-picker-split', [
    h('div.split-buttons', [
      h(
        'button.std-btn',
        {
          class: { selected: isStandard },
          on: { click: () => setupCtrl.variant('standard') },
        },
        [
          h('span.icon', { attrs: { 'data-icon': variantConfig.standard.icon } }),
          h('div.text', [h('span.name', i18n.site.standard), h('span.desc', variantConfig.standard.desc)]),
        ],
      ),
      h(
        'button.other-btn',
        {
          class: { selected: !isStandard },
          on: { click: setupCtrl.toggleVariantMenu },
        },
        [
          h('span.icon', { attrs: { 'data-icon': otherIcon } }),
          h('div.text', [h('span.name', otherName), h('span.desc', otherDesc)]),
        ],
      ),
    ]),
    variantModal,
  ]);
};
