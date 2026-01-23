import { h } from 'snabbdom';
import type LobbyController from '../../ctrl';
import * as customPools from '../../customPools';

export function presetGrid(ctrl: LobbyController) {
  return h(
    'div.lpools.setup-presets',
    ctrl.pools.map(pool => {
      const custom = customPools.get(pool.id);
      const label = custom ? customPools.formatDisplay(custom) : `${pool.lim}+${pool.inc}`;
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
          h('div.clock', label),
          h('div.perf', subLabel),
          custom
            ? h(
                'div.reset-preset', // Class needed for styling or just use text
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
