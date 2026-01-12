import type AnalyseCtrl from '@/ctrl';
import { displayColumns } from 'lib/device';
import { hl, toggle, type LooseVNodes } from 'lib/view';

export const config = (ctrl: AnalyseCtrl): LooseVNodes => [
  displayColumns() > 1 && hl('h2', 'Board zones'),
  toggle(
    {
      name: 'Safe zones',
      id: 'show-safe-zones',
      checked: ctrl.zone.safe(),
      change: ctrl.zone.safe,
    },
    ctrl.redraw,
  ),
  toggle(
    {
      name: 'Danger zones',
      id: 'show-danger-zones',
      checked: ctrl.zone.danger(),
      change: ctrl.zone.danger,
    },
    ctrl.redraw,
  ),
];
