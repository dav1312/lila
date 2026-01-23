import { h, type Hooks } from 'snabbdom';
import { spinnerVdom, onInsert } from 'lib/view';
import * as licon from 'lib/licon';
import type LobbyController from '../ctrl';
import * as customPools from '../customPools';

const createHandler = (ctrl: LobbyController) => (e: Event) => {
  if (ctrl.redirecting) return;

  if (e instanceof KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); // Prevent page scroll on space
  }

  const target = e.target as HTMLElement;
  const poolEl = target.closest('[data-id]') as HTMLElement;
  const id = poolEl?.dataset['id'];

  if (target.closest('.edit-action')) {
    const action = (target.closest('.edit-action') as HTMLElement).dataset['action'];
    if (action === 'edit' && id) ctrl.setupCtrl.openForEdit(id);
    else if (action === 'reset' && id) ctrl.setupCtrl.resetPreset(id);
    ctrl.redraw();
    return;
  }

  if (target.closest('.edit-toggle')) {
    ctrl.isEditingPools.toggle();
    ctrl.redraw();
    return;
  }

  if (!id) return;

  if (ctrl.isEditingPools()) return;

  if (id === 'custom') {
    if (ctrl.isEditingPools()) {
      ctrl.isEditingPools.toggle();
    } else {
      ctrl.setupCtrl.openModal('hook');
    }
  } else if (id) ctrl.clickPool(id);

  ctrl.redraw();
};

export const hooks = (ctrl: LobbyController): Hooks =>
  onInsert(el => {
    const handler = createHandler(ctrl);
    el.addEventListener('click', handler);
    el.addEventListener('keydown', handler);
  });

export function render(ctrl: LobbyController) {
  const member = ctrl.poolMember;
  const isEditing = ctrl.isEditingPools();

  return ctrl.pools
    .map(pool => {
      const active = member?.id === pool.id,
        transp = !!member && !active;
      const custom = customPools.get(ctrl.me?.username, pool.id);

      let label: string;
      let icon: string | undefined;

      if (custom) {
        const display = customPools.getDisplayData(custom);
        label = display.timeLabel;
        icon = display.icon;
      } else {
        label = `${pool.lim}+${pool.inc}`;
        icon = undefined;
      }

      const subLabel = custom ? (custom.mode === 'rated' ? 'Rated' : 'Casual') : pool.perf;

      return h(
        'div.lpool',
        {
          class: { active, transp, custom: !!custom, editing: isEditing },
          attrs: { role: 'button', 'data-id': pool.id, tabindex: '0' },
        },
        [
          h('div.clock', [icon ? h('span', { attrs: { 'data-icon': icon } }) : null, label]),
          active
            ? member.range && ctrl.opts.showRatings
              ? h('div.range', member.range.replace('-', '–'))
              : spinnerVdom()
            : h('div.perf', subLabel),

          isEditing
            ? h('div.edit-overlay', [
                h(
                  'button.edit-action',
                  {
                    attrs: { 'data-action': 'edit', title: 'Edit' },
                  },
                  h('span', { attrs: { 'data-icon': licon.Pencil } }),
                ),
                custom
                  ? h(
                      'button.edit-action',
                      {
                        attrs: { 'data-action': 'reset', title: 'Reset to default' },
                      },
                      h('span', { attrs: { 'data-icon': licon.Reload } }),
                    )
                  : null,
              ])
            : null,
        ],
      );
    })
    .concat(
      h(
        'div.lpool',
        {
          class: { transp: !!member, active: isEditing },
          attrs: { role: 'button', 'data-id': 'custom', tabindex: '0' },
        },
        [
          h(
            'div.edit-toggle',
            {
              attrs: { title: 'Customize lobby grid' },
            },
            h('span', { attrs: { 'data-icon': licon.Gear } }),
          ),
          isEditing ? 'Editing' : i18n.site.custom,
        ],
      ),
    );
}
