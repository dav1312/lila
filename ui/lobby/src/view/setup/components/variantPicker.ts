// ui/lobby/src/view/setup/components/variantPicker.ts
import { h } from 'snabbdom';
import { snabDialog } from 'lib/view';
import type LobbyController from '@/ctrl';
import { variants, variantsForGameType } from '@/options';

const variantConfig: Record<string, { icon: string; desc: string }> = {
  standard: { icon: '', desc: i18n.site.standardDesc },
  other: { icon: '', desc: i18n.site.otherDesc },
  crazyhouse: { icon: '', desc: i18n.site.crazyhouseDesc },
  chess960: { icon: '', desc: i18n.site.chess960Desc },
  kingOfTheHill: { icon: '', desc: i18n.site.kingOfTheHillDesc },
  threeCheck: { icon: '', desc: i18n.site.threeCheckDesc },
  antichess: { icon: '', desc: i18n.site.antichessDesc },
  atomic: { icon: '', desc: i18n.site.atomicDesc },
  horde: { icon: '', desc: i18n.site.hordeDesc },
  racingKings: { icon: '', desc: i18n.site.racingKingsDesc },
  fromPosition: { icon: '', desc: i18n.site.fromPositionDesc },
};

export const variantPicker = (ctrl: LobbyController) => {
  const { setupCtrl } = ctrl;
  const currentVariant = setupCtrl.variant();
  const isStandard = currentVariant === 'standard';

  const otherVariantKey = isStandard ? 'standard' : currentVariant;
  const otherIcon = isStandard ? variantConfig.other.icon : variantConfig[otherVariantKey]?.icon || variantConfig.other.icon;
  const otherName = isStandard
    ? i18n.site.other
    : variants.find(v => v.key === currentVariant)?.name || i18n.site.other;
  const otherDesc = isStandard ? i18n.site.otherDesc : variantConfig[currentVariant]?.desc || '';

  const availableVariants = variantsForGameType(variants, setupCtrl.gameType!).filter(
    v => v.key !== 'standard',
  );

  const close = () => {
    setupCtrl.variantMenuOpen = false;
    setupCtrl.root.redraw();
  };

  const variantModal = setupCtrl.variantMenuOpen
    ? snabDialog({
        attrs: { dialog: { 'aria-label': i18n.site.variant } },
        class: 'variant-selector',
        modal: true,
        onClose: close,
        vnodes: [
          h('h2', i18n.site.variant),
          h(
            'div.variant-grid',
            availableVariants.map(v => {
              const conf = variantConfig[v.key] || { icon: '', desc: '' };
              return h(
                'button.variant-card',
                {
                  class: { selected: currentVariant === v.key },
                  on: {
                    click: (e: Event) => {
                      e.stopPropagation();
                      setupCtrl.variant(v.key);
                      close();
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
        ],
        onInsert: d => d.show(),
      })
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
