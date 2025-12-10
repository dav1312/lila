// ui/lib/src/setup/view/timeControl.ts
import type { Prop } from '@/index';
import { hl, type VNode } from '@/view';
import type { InputValue } from '../interfaces';
import {
  timeModes,
  sliderTimes,
  sliderInitVal,
  timeVToTime,
  incrementVToIncrement,
  daysVToDays,
  type TimeControl,
} from '../timeControl';
import { option } from '../option';

const showTime = (v: number) => {
  if (v === 0.25) return '¼';
  if (v === 0.5) return '½';
  if (v === 0.75) return '¾';
  return v.toString();
};

const PRESETS = {
  standard: [
    { t: 0.25, i: 0 },
    { t: 0.5, i: 0 },
    { t: 0, i: 1 },
    { t: 1, i: 1 },
    { t: 2, i: 0 },
    { t: 8, i: 0 },
    { t: 5, i: 5 },
    { t: 10, i: 3 },
    { t: 15, i: 0 },
  ],
  variants: [
    { t: 1, i: 0 },
    { t: 2, i: 1 },
    { t: 3, i: 0 },
    { t: 3, i: 2 },
    { t: 5, i: 0 },
    { t: 5, i: 3 },
    { t: 10, i: 0 },
    { t: 10, i: 5 },
    { t: 15, i: 10 },
    { t: 30, i: 0 },
    { t: 30, i: 20 },
  ],
};

const blindModeTimePickers = (tc: TimeControl) => {
  return [
    renderTimeModePicker(tc),
    tc.mode() === 'realTime' &&
      hl('div.time-choice', [
        hl('label', { attrs: { for: 'sf_time' } }, i18n.site.minutesPerSide),
        hl(
          'select#sf_time',
          {
            on: { change: (e: Event) => tc.timeV(parseFloat((e.target as HTMLSelectElement).value)) },
          },
          sliderTimes.map((sliderTime, timeV) =>
            option({ key: timeV.toString(), name: showTime(sliderTime) }, tc.timeV().toString()),
          ),
        ),
      ]),
    tc.mode() === 'realTime' &&
      hl('div.increment-choice', [
        hl('label', { attrs: { for: 'sf_increment' } }, i18n.site.incrementInSeconds),
        hl(
          'select#sf_increment',
          {
            on: {
              change: (e: Event) => tc.incrementV(parseInt((e.target as HTMLSelectElement).value)),
            },
          },
          Array.from(Array(31).keys()).map(incrementV =>
            option(
              { key: incrementV.toString(), name: incrementVToIncrement(incrementV).toString() },
              tc.incrementV().toString(),
            ),
          ),
        ),
      ]),
    tc.mode() === 'correspondence' &&
      hl('div.days-choice', [
        hl('label', { attrs: { for: 'sf_days' } }, i18n.site.daysPerTurn),
        hl(
          'select#sf_days',
          {
            on: { change: (e: Event) => tc.daysV(parseInt((e.target as HTMLSelectElement).value)) },
          },
          Array.from(Array(7).keys()).map(daysV =>
            option(
              { key: (daysV + 1).toString(), name: daysVToDays(daysV + 1).toString() },
              tc.daysV().toString(),
            ),
          ),
        ),
      ]),
  ];
};

const renderTimeModePicker = (tc: TimeControl) =>
  tc.canSelectMode() &&
  hl('div.label-select', [
    hl('label', { attrs: { for: 'sf_timeMode' } }, i18n.site.timeControl),
    hl(
      'select#sf_timeMode',
      {
        on: {
          change: (e: Event) => {
            tc.mode((e.target as HTMLSelectElement).value as any);
          },
        },
      },
      timeModes.filter(m => tc.modes.includes(m.key)).map(timeMode => option(timeMode, tc.mode())),
    ),
  ]);

const inputRange = (min: number, max: number, prop: Prop<InputValue>, classes?: Record<string, boolean>) =>
  hl('input.range', {
    class: classes,
    attrs: { type: 'range', min, max, value: prop() },
    hook: {
      update: (_: VNode, vnode: VNode) => {
        const el = vnode.elm as HTMLInputElement;
        el.value = prop().toString();
      },
    },
    on: { input: (e: Event) => prop(parseFloat((e.target as HTMLInputElement).value)) },
  });

export const timePickerAndSliders = (
  tc: TimeControl,
  minimumTimeRequiredIfReal: number = 0,
  variant?: string,
): VNode => {
  if (site.blindMode) return hl('div.config-group', blindModeTimePickers(tc));

  const activeMode = tc.mode();
  const showTabs = tc.canSelectMode();

  const tabs = showTabs
    ? hl(
        'div.tabs',
        tc.modes.map(mode =>
          hl(
            'button.tab-btn',
            {
              class: { active: activeMode === mode },
              on: { click: () => tc.mode(mode) },
            },
            timeModes.find(m => m.key === mode)?.name || mode,
          ),
        ),
      )
    : null;

  let panelContent: VNode | null = null;

  if (activeMode === 'realTime') {
    const isStandard = !variant || variant === 'standard' || variant === 'fromPosition';
    const presets = isStandard ? PRESETS.standard : PRESETS.variants;

    panelContent = hl('div.time-panel', [
      hl(
        'div.presets',
        presets.map(p =>
          hl(
            'button.preset-btn',
            {
              on: {
                click: () => {
                  tc.timeV(sliderInitVal(p.t, timeVToTime, 100, 9));
                  tc.incrementV(sliderInitVal(p.i, incrementVToIncrement, 100, 0));
                },
              },
            },
            `${showTime(p.t)}+${p.i}`,
          ),
        ),
      ),
      hl('div.sliders-grid', [
        hl('div.slider-container', [
          hl('div.label-row', [
            hl('label', i18n.site.minutesPerSide),
            hl('span.val-box', showTime(tc.time())),
          ]),
          inputRange(0, 38, tc.timeV, { failure: !tc.realTimeValid(minimumTimeRequiredIfReal) }),
        ]),
        hl('div.slider-container', [
          hl('div.label-row', [
            hl('label', i18n.site.incrementInSeconds),
            hl('span.val-box', tc.increment().toString()),
          ]),
          inputRange(0, 30, tc.incrementV, { failure: !tc.realTimeValid(minimumTimeRequiredIfReal) }),
        ]),
      ]),
    ]);
  } else if (activeMode === 'correspondence') {
    panelContent = hl('div.time-panel', [
      hl('div.slider-container.full-width', [
        hl('div.label-row', [hl('label', i18n.site.daysPerTurn), hl('span.val-box', tc.days().toString())]),
        inputRange(1, 7, tc.daysV),
      ]),
    ]);
  } else if (activeMode === 'unlimited') {
    panelContent = hl('div.time-panel.unlimited-msg', i18n.site.unlimited);
  }

  return hl('div.config-group.time-control-tabs', [tabs, panelContent]);
};
