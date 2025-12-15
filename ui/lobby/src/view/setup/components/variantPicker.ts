// ui/lobby/src/view/setup/components/variantPicker.ts
import { h } from 'snabbdom';
import { snabDialog } from 'lib/view';
import type LobbyController from '@/ctrl';
import { variants, variantsForGameType } from '@/options';
import { option } from 'lib/setup/option';

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

  if (site.blindMode) {
    return h('div.variant.label-select', [
      h('label', { attrs: { for: 'sf_variant' } }, i18n.site.variant),
      h(
        'select#sf_variant',
        {
          on: {
            change: (e: Event) => setupCtrl.variant((e.target as HTMLSelectElement).value as VariantKey),
          },
        },
        variantsForGameType(variants, setupCtrl.gameType!).map(variant =>
          option(variant, setupCtrl.variant()),
        ),
      ),
    ]);
  }

  const currentVariant = setupCtrl.variant();
  const isStandard = currentVariant === 'standard' || !variants.some(v => v.key === currentVariant);
  const otherKey = isStandard ? 'other' : currentVariant;
  const otherConf = variantConfig[otherKey] || variantConfig.other;
  const otherName = isStandard
    ? i18n.site.other
    : variants.find(v => v.key === currentVariant)?.name || i18n.site.other;

  return h('div.variant-picker-split', [
    h('group.radio', [
      h('div', [
        h('input#variant_std', {
          attrs: {
            type: 'radio',
            name: 'variant',
            value: 'standard',
            checked: isStandard,
          },
          props: {
            checked: isStandard,
          },
          // Force update the checked property to fix desync with native radio behavior
          hook: {
            update: (_: any, vnode: any) => {
              if (vnode.elm) vnode.elm.checked = isStandard;
            },
            insert: (vnode: any) => {
              if (vnode.elm) vnode.elm.checked = isStandard;
            },
          },
          on: { change: () => setupCtrl.variant('standard') },
        }),
        h('label', { attrs: { for: 'variant_std' } }, [
          h('span.icon', { attrs: { 'data-icon': variantConfig.standard.icon } }),
          h('div.text', [h('span.name', i18n.site.standard), h('span.desc', variantConfig.standard.desc)]),
        ]),
      ]),
      h('div', [
        h('input#variant_other', {
          attrs: {
            type: 'radio',
            name: 'variant',
            value: 'other',
            checked: !isStandard,
          },
          props: {
            checked: !isStandard,
          },
          hook: {
            update: (_: any, vnode: any) => {
              if (vnode.elm) vnode.elm.checked = !isStandard;
            },
            insert: (vnode: any) => {
              if (vnode.elm) vnode.elm.checked = !isStandard;
            },
          },
        }),
        h(
          'label',
          {
            attrs: { for: 'variant_other' },
            on: {
              click: (e: Event) => {
                e.preventDefault();
                setupCtrl.toggleVariantMenu();
              },
            },
          },
          [
            h('span.icon', { attrs: { 'data-icon': otherConf.icon } }),
            h('div.text', [h('span.name', otherName), h('span.desc', otherConf.desc)]),
          ],
        ),
      ]),
    ]),
  ]);
};

export const variantModal = (ctrl: LobbyController) => {
  const { setupCtrl } = ctrl;

  if (!setupCtrl.variantMenuOpen) return null;

  const currentVariant = setupCtrl.variant();
  const availableVariants = variantsForGameType(variants, setupCtrl.gameType!).filter(
    v => v.key !== 'standard',
  );

  const onClose = () => {
    setupCtrl.variantMenuOpen = false;
    setupCtrl.root.redraw();
  };

  let dialog: any;

  return snabDialog({
    attrs: { dialog: { 'aria-label': i18n.site.variant } },
    class: 'variant-selector',
    modal: true,
    onClose,
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
                  dialog?.close();
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
    onInsert: d => {
      dialog = d;
      d.show();
    },
  });
};
