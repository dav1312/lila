import { h } from 'snabbdom';
import type LobbyController from '../../ctrl';
import * as customPools from '../../customPools';

export function presetGrid(ctrl: LobbyController) {
  return h(
    'div.lpools.setup-presets',
    ctrl.pools.map(pool => {
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

      const subLabel = custom
        ? custom.mode === 'rated'
          ? 'Rated'
          : 'Casual'
        : pool.perf;

      return h(
        'div.lpool',
        {
          class: { custom: !!custom },
          attrs: { role: 'button' },
          on: {
            click: () => ctrl.setupCtrl.saveToPreset(pool.id),
          },
        },
        [
          h('div.clock', [
            icon
              ? h('span', {
                  attrs: { 'data-icon': icon },
                  style: { marginRight: '0.2em', fontSize: '0.9em', opacity: '0.8' },
                })
              : null,
            label,
          ]),
          h('div.perf', subLabel),
          custom
            ? h(
                'div.reset-preset',
                {
                  style: {
                    position: 'absolute',
                    top: '2px',
                    right: '5px',
                    fontWeight: 'bold',
                    fontSize: '1.2em',
                    lineHeight: '1',
                    opacity: '0.6',
                  },
                  on: {
                    click: (e: Event) => {
                      e.stopPropagation();
                      ctrl.setupCtrl.resetPreset(pool.id);
                    },
                  },
                },
                '×',
              )
            : null,
        ],
      );
    }),
  );
}
