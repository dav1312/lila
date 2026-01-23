import { h, type Hooks } from 'snabbdom';
import { spinnerVdom, onInsert } from 'lib/view';
import type LobbyController from '../ctrl';
import * as customPools from '../customPools';

const createHandler = (ctrl: LobbyController) => (e: Event) => {
  if (ctrl.redirecting) return;

  if (e instanceof KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); // Prevent page scroll on space
  }

  const id =
    (e.target as HTMLElement).dataset['id'] ||
    ((e.target as HTMLElement).parentNode as HTMLElement).dataset['id'];
  if (id === 'custom') ctrl.setupCtrl.openModal('hook');
  else if (id) ctrl.clickPool(id);

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
  return ctrl.pools
    .map(pool => {
      const active = member?.id === pool.id,
        transp = !!member && !active;
      const custom = customPools.get(ctrl.me?.username, pool.id);

      const label = custom
        ? customPools.formatDisplay(custom)
        : `${pool.lim}+${pool.inc}`;
      const subLabel = custom
        ? custom.mode === 'rated'
          ? 'Rated'
          : 'Casual'
        : pool.perf;

      return h(
        'div.lpool',
        {
          class: { active, transp, custom: !!custom },
          attrs: { role: 'button', 'data-id': pool.id, tabindex: '0' },
        },
        [
          h('div.clock', label),
          active
            ? member.range && ctrl.opts.showRatings
              ? h('div.range', member.range.replace('-', '–'))
              : spinnerVdom()
            : h('div.perf', subLabel),
        ],
      );
    })
    .concat(
      h(
        'div.lpool',
        {
          class: { transp: !!member },
          attrs: { role: 'button', 'data-id': 'custom', tabindex: '0' },
        },
        i18n.site.custom,
      ),
    );
}
