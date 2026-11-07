import type { MoveMetadata } from '@lichess-org/chessground/types';
import { key2pos, opposite, posToTranslate, translate } from '@lichess-org/chessground/util';
import { h } from 'snabbdom';

import { AutoQueen } from '@/prefs';
import { type MaybeVNode, bind, onInsert } from '@/view';

import type { WithGround } from './ground';

export type Hooks = {
  submit: (orig: Key, dest: Key, role: Role) => void;
  show?: (ctrl: PromotionCtrl, roles: Role[] | false) => void;
};

interface Promoting {
  orig: Key;
  dest: Key;
  pre: boolean;
  hooks: Hooks;
}

const PROMOTABLE_ROLES: Role[] = ['queen', 'knight', 'rook', 'bishop'];

export function promote(g: CgApi, key: Key, role: Role): void {
  const piece = g.state.pieces.get(key);
  if (piece?.role === 'pawn') g.setPieces(new Map([[key, { color: piece.color, role, promoted: true }]]));
}

export class PromotionCtrl {
  private promoting?: Promoting;
  private prePromotionRole?: Role;

  constructor(
    private readonly withGround: WithGround,
    private readonly onCancel: () => void,
    private readonly redraw: Redraw,
    private readonly variant: () => VariantKey = () => 'standard',
    private readonly autoQueenPref: AutoQueen = AutoQueen.Never,
    private readonly playerColor: () => Color | undefined = () => undefined,
  ) {}

  private hoverKey?: Key;
  private ghostEl?: HTMLElement;

  // the square under the pointer, or undefined when the pointer leaves the board
  setHover = (key: Key | undefined): void => {
    if (this.hoverKey === key) return;
    this.hoverKey = key;
    this.redraw();
  };

  start = (orig: Key, dest: Key, hooks: Hooks, meta?: MoveMetadata, forceAutoQueen = false): boolean =>
    this.withGround(g => {
      const premovePiece = g.state.pieces.get(orig);
      const piece = premovePiece || g.state.pieces.get(dest);
      if (
        piece?.role === 'pawn' &&
        ((dest[1] === '8' && g.state.turnColor === 'black') ||
          (dest[1] === '1' && g.state.turnColor === 'white'))
      ) {
        if (
          this.variant() === 'atomic' &&
          (premovePiece ? g.state.pieces.get(dest)?.color === opposite(premovePiece.color) : !!meta?.captured)
        ) {
          if (premovePiece) this.setPrePromotion(dest, 'queen');
          else this.doPromote({ orig, dest, hooks }, 'queen');
          return true;
        }
        if (this.prePromotionRole && meta?.premove) {
          this.doPromote({ orig, dest, hooks }, this.prePromotionRole);
          return true;
        }
        if (!meta?.ctrlKey && !this.promoting && (this.autoQueens(!!premovePiece) || forceAutoQueen)) {
          if (premovePiece) this.setPrePromotion(dest, 'queen');
          else this.doPromote({ orig, dest, hooks }, 'queen');
          return true;
        }
        this.promoting = { orig, dest, pre: !!premovePiece, hooks };
        this.redraw();
        return true;
      }
      return false;
    }) || false;

  // whether a pawn move to the last rank is queened without asking, for a normal move or a premove
  private readonly autoQueens = (premove: boolean): boolean =>
    this.autoQueenPref === AutoQueen.Always || (this.autoQueenPref === AutoQueen.OnPremove && premove);

  // the square to show the ghost queen on: the hovered 8th (or 1st) rank square while our pawn is
  // selected or held and the move would be queened without asking
  ghostSquare = (): Key | undefined => {
    const dest = this.hoverKey;
    if (!dest || this.promoting) return undefined;
    return this.withGround(g => {
      const color = this.playerColor();
      const orig = g.state.draggable.current?.orig ?? g.state.selected;
      return color && orig && this.isAutoQueenMove(g, orig, dest, color) ? dest : undefined;
    });
  };

  // draws the ghost queen inside the board, positioned the same way chessground positions pieces,
  // so it lines up at any board size and shares the pieces' layering. Called on every render.
  syncGhost = (): void => {
    const dest = this.ghostSquare();
    const color = this.playerColor();
    this.withGround(g => {
      if (!dest || !color) {
        this.ghostEl?.remove();
        return;
      }
      if (!this.ghostEl) {
        this.ghostEl = document.createElement('piece');
        this.ghostEl.className = `queen ${color} promotion-ghost`;
      }
      const board = g.state.dom.elements.board;
      if (this.ghostEl.parentNode !== board) board.appendChild(this.ghostEl);
      const pos = posToTranslate(g.state.dom.bounds())(key2pos(dest), g.state.orientation === 'white');
      translate(this.ghostEl, pos);
    });
  };

  // whether moving the pawn on orig to dest would be queened without asking
  private isAutoQueenMove(g: CgApi, orig: Key, dest: Key, color: Color): boolean {
    const piece = g.state.pieces.get(orig);
    if (piece?.role !== 'pawn' || piece.color !== color) return false;
    const seventh = color === 'white' ? '7' : '2';
    const lastRank = color === 'white' ? '8' : '1';
    if (orig[1] !== seventh || dest[1] !== lastRank) return false;

    if (g.state.turnColor === color) {
      return this.autoQueens(false) && !!g.state.movable.dests?.get(orig)?.includes(dest);
    }

    // premove: the opponent is to move, so chessground has no destinations to check against
    // approximate with a push to an empty square or a capture of an enemy piece
    if (!this.autoQueens(true) || !g.state.premovable.enabled) return false;
    const df = Math.abs(dest.charCodeAt(0) - orig.charCodeAt(0));
    const target = g.state.pieces.get(dest);
    return df === 0 ? !target : df === 1 && !!target && target.color !== color;
  }

  cancel = (): void => {
    if (this.dismiss()) this.onCancel();
  };

  dismiss = (): boolean => {
    const promoting = this.promoting;
    this.promoting = undefined;
    this.cancelPrePromotion(promoting);
    if (promoting) {
      this.redraw();
    }
    return !!promoting;
  };

  cancelPrePromotion = (promoting: Promoting | undefined = this.promoting): void => {
    promoting?.hooks.show?.(this, false);
    if (this.prePromotionRole) {
      this.withGround(g => g.setAutoShapes([]));
      this.prePromotionRole = undefined;
      this.redraw();
    }
  };

  view = (antichess?: boolean): MaybeVNode => {
    const promoting = this.promoting;
    if (!promoting) return undefined;
    promoting.hooks.show?.(this, antichess ? [...PROMOTABLE_ROLES, 'king'] : PROMOTABLE_ROLES);

    return (
      this.withGround(g =>
        this.renderPromotion(
          promoting.dest,
          antichess ? PROMOTABLE_ROLES.concat('king') : PROMOTABLE_ROLES,
          opposite(g.state.turnColor),
          g.state.orientation,
        ),
      ) || null
    );
  };

  finish(role: Role): void {
    const promoting = this.promoting;
    if (promoting) {
      this.promoting = undefined;
      if (promoting.pre) this.setPrePromotion(promoting.dest, role);
      else this.doPromote(promoting, role);
      promoting.hooks.show?.(this, false);
      this.redraw();
    }
  }

  private doPromote(promoting: Omit<Promoting, 'pre'>, role: Role): void {
    this.withGround(g => promote(g, promoting.dest, role));
    promoting.hooks.submit(promoting.orig, promoting.dest, role);
  }

  private setPrePromotion(dest: Key, role: Role): void {
    this.prePromotionRole = role;
    this.withGround(g =>
      g.setAutoShapes([
        {
          orig: dest,
          piece: { color: opposite(g.state.turnColor), role },
          brush: '',
        },
      ]),
    );
  }

  private renderPromotion(dest: Key, pieces: Role[], color: Color, orientation: Color): MaybeVNode {
    let left = (7 - key2pos(dest)[0]) * 12.5;
    if (orientation === 'white') left = 87.5 - left;

    const vertical = color === orientation ? 'top' : 'bottom';

    return h(
      'div#promotion-choice.' + vertical,
      {
        hook: onInsert(el => {
          el.addEventListener('click', this.cancel);
          el.oncontextmenu = () => false;
        }),
      },
      pieces.map((serverRole, i) => {
        const top = (color === orientation ? i : 7 - i) * 12.5;
        return h(
          'square',
          {
            attrs: { style: 'top: ' + top + '%;left: ' + left + '%' },
            hook: bind('click', e => {
              e.stopPropagation();
              this.finish(serverRole);
            }),
          },
          [h('piece.' + serverRole + '.' + color)],
        );
      }),
    );
  }
}
