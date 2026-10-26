import { h, thunk, type VNode } from 'snabbdom';

import { getPlayer } from 'lib/game';
import { licon } from 'lib/licon';
import { bind, dataIcon, onInsert } from 'lib/view';
import { userLink } from 'lib/view/userLink';

import type AnalyseCtrl from '@/ctrl';
import { findTag } from '@/study/studyChapters';

import type { AnalysisMetaSide, GamePhase } from '../interfaces';

type AdviceKind = 'inaccuracy' | 'mistake' | 'blunder';

interface Advice {
  kind: AdviceKind;
  label: string;
  symbol: string;
}

const renderPlayer = ({ data, study }: AnalyseCtrl, color: Color): VNode => {
  const { user, ratingDiff, name, ai } = getPlayer(data, color);
  return user
    ? userLink({ ...user, name: user.username, ratingDiff, line: false })
    : h(
        'span',
        name ||
          (ai && 'Stockfish level ' + ai) ||
          (study && findTag(study.data.chapter.tags, color)) ||
          'Anonymous',
      );
};

const advices: Advice[] = [
  { kind: 'inaccuracy', label: i18n.site.inaccuracy, symbol: '?!' },
  { kind: 'mistake', label: i18n.site.mistake, symbol: '?' },
  { kind: 'blunder', label: i18n.site.blunder, symbol: '??' },
];

const phaseOrder: GamePhase[] = ['opening', 'middlegame', 'endgame'];

const playerName = (ctrl: AnalyseCtrl, color: Color): VNode =>
  h('div.advice-summary__player', [h(`icon.is.color-icon.${color}.text`), renderPlayer(ctrl, color)]);

const accuracyClass = (accuracy: number): string =>
  accuracy >= 85 ? 'good' : accuracy >= 70 ? 'inaccuracy' : accuracy >= 55 ? 'mistake' : 'blunder';

const error = (nb: number, color: Color, advice: Advice) =>
  h(
    'div.advice-summary__error' + (nb ? `.symbol.${advice.kind}` : '.no-error'),
    { attrs: nb ? { 'data-color': color, 'data-symbol': advice.symbol } : {} },
    h('strong', nb),
  );

const acplRows = (white: AnalysisMetaSide, black: AnalysisMetaSide): VNode[] => [
  ...advices.flatMap(a => [
    error(white[a.kind], 'white', a),
    h('div.advice-summary__label', a.label),
    error(black[a.kind], 'black', a),
  ]),
  h('strong', white.acpl),
  h('div.advice-summary__label', i18n.site.averageCentipawnLoss),
  h('strong', black.acpl),
];

const phaseCell = (side: AnalysisMetaSide, phase: GamePhase): VNode => {
  const accuracy = side.phases?.[phase];
  return accuracy === undefined
    ? h('div')
    : h(`div.advice-summary__phase.${accuracyClass(accuracy)}`, h('strong', `${accuracy}%`));
};

const accuracyRows = (white: AnalysisMetaSide, black: AnalysisMetaSide): VNode[] => [
  h('strong', [white.accuracy, '%']),
  h('div.advice-summary__label', i18n.site.accuracy),
  h('strong', [black.accuracy, '%']),
  ...phaseOrder.flatMap(phase =>
    white.phases?.[phase] === undefined && black.phases?.[phase] === undefined
      ? []
      : [phaseCell(white, phase), h('div.advice-summary__label', i18n.site[phase]), phaseCell(black, phase)],
  ),
];

const doRender = (ctrl: AnalyseCtrl): VNode => {
  const { white, black } = ctrl.mainlineAnalysis!;
  return h(
    'div.advice-summary',
    {
      hook: onInsert(elem => {
        $(elem).on('click', 'div.symbol', function (this: HTMLElement) {
          ctrl.jumpToGlyphSymbol(this.dataset.color as Color, this.dataset.symbol!);
        });
      }),
    },
    [
      h('div.advice-summary__players', [playerName(ctrl, 'white'), h('div'), playerName(ctrl, 'black')]),
      h('div.advice-summary__acpl', acplRows(white, black)),
      h('div.advice-summary__accuracy', accuracyRows(white, black)),
      ctrl.study
        ? null
        : h(
            'a.button.text',
            {
              class: { active: !!ctrl.retro },
              attrs: dataIcon(licon.PlayTriangle),
              hook: bind('click', ctrl.toggleRetro, ctrl.redraw),
            },
            i18n.site.learnFromYourMistakes,
          ),
    ],
  );
};

export function puzzleLink(ctrl: AnalyseCtrl): VNode | undefined {
  const puzzle = ctrl.data.puzzle;
  if (!puzzle) return undefined;
  return h(
    'div.analyse__puzzle',
    h(
      'a.button-link.text',
      {
        attrs: {
          ...dataIcon(licon.ArcheryTarget),
          href: `/training/${puzzle.key}/${ctrl.bottomColor()}`,
        },
      },
      ['Recommended puzzle training', h('br'), puzzle.name],
    ),
  );
}

export function render(ctrl: AnalyseCtrl): VNode | undefined {
  if (ctrl.study?.practice) return undefined;

  if (
    !ctrl.mainlineAnalysis ||
    !ctrl.settings.showMainlineAnalysis ||
    (ctrl.study && ctrl.study.vm.toolTab() !== 'serverEval')
  ) {
    if (!ctrl.data.puzzle) return h('div.analyse__round-training');
    return h('div.analyse__round-training', puzzleLink(ctrl));
  }

  // don't cache until the analysis is complete!
  const buster = ctrl.mainlineAnalysis.partial ? Math.random() : '';
  let cacheKey = String(buster) + !!ctrl.retro + Boolean(ctrl.idbTree.hasLocalAnalysis);
  if (ctrl.study) cacheKey += ctrl.study.data.chapter.id;

  return h('div.analyse__round-training', [
    h('div.analyse__acpl', thunk('div.advice-summary', doRender, [ctrl, cacheKey])),
    puzzleLink(ctrl),
  ]);
}
