import { type Rules } from 'chessops/types';

import type { LocalEval } from '@/tree/types';

import { defined } from '../index';
import type { Work, EngineInfo } from './types';

export class Protocol {
  public engineName?: string;

  private work?: Work;
  private currentEval?: LocalEval;
  private gameId?: string;
  private nextWork?: Work;
  private send: ((cmd: string) => void) | undefined;
  private options: Map<string, string | number> = new Map<string, string>();

  constructor(
    readonly info: EngineInfo,
    readonly variantMap?: (v: Rules) => string,
  ) {}

  connected(send: (cmd: string) => void): void {
    this.send = send;

    // Get engine name, version and options.
    this.options = new Map([
      ['Threads', '1'],
      ['Hash', '16'],
      ['MultiPV', '1'],
      ['UCI_Variant', 'chess'],
    ]);
    this.send('uci');
  }

  private setOption(name: string, value: string | number): void {
    value = value.toString();
    if (this.send && this.options.get(name) !== value) {
      this.send(`setoption name ${name} value ${value}`);
      this.options.set(name, value);
    }
  }

  disconnected(): void {
    if (this.work && this.currentEval) {
      this.currentEval.bestmove ??= '(none)';
      this.emit();
    }
    this.work = undefined;
    this.send = undefined;
  }

  received(command: string): void {
    const parts = command.trim().split(/\s+/g);
    if (parts[0] === 'uciok') {
      // Analyse without contempt.
      this.setOption('UCI_AnalyseMode', 'true');
      this.setOption('Analysis Contempt', 'Off');

      // Affects notation only. Life would be easier if everyone would always
      // unconditionally use this mode.
      this.setOption('UCI_Chess960', 'true');

      this.send?.('ucinewgame');
      this.send?.('isready');
    } else if (parts[0] === 'readyok') this.swapWork();
    else if (parts[0] === 'id' && parts[1] === 'name') this.engineName = parts.slice(2).join(' ');
    else if (parts[0] === 'bestmove') {
      const work = this.work;
      this.work = undefined;
      if (work) {
        const ceval = this.currentEval ?? {
          millis: 0,
          fen: work.currentFen,
          depth: 0,
          nodes: 0,
          pvs: [],
          engineId: this.info.id,
        };
        ceval.bestmove = parts[1];
        if (parts[2] === 'ponder') ceval.ponder = parts[3];
        if (!work.stopRequested) work.emit(ceval, work);
      }
      this.swapWork();
    } else if (this.work && !this.work.stopRequested && parts[0] === 'info') {
      this.throwOnFatalError(parts);
      let depth = 0;
      let nodes;
      let multiPv = 1;
      let millis;
      let isMate = false;
      let povEv;
      let moves: string[] = [];
      for (let i = 1; i < parts.length; i++) {
        switch (parts[i]) {
          case 'depth':
            depth = parseInt(parts[++i]);
            break;
          case 'nodes':
            nodes = parseInt(parts[++i]);
            break;
          case 'multipv':
            multiPv = parseInt(parts[++i]);
            break;
          case 'time':
            millis = parseInt(parts[++i]);
            break;
          case 'score':
            isMate = parts[++i] === 'mate';
            povEv = parseInt(parts[++i]);
            break;
          case 'pv':
            moves = parts.slice(++i);
            i = parts.length;
            break;
        }
      }

      // Sometimes we get #0. Let's just skip it.
      if (isMate && !povEv) return;

      if (!defined(nodes) || !defined(millis) || !defined(isMate) || !defined(povEv)) return;

      const pivot = this.work.threatMode ? 0 : 1;
      const ev = this.work.ply % 2 === pivot ? -povEv : povEv;

      const pvData = {
        moves,
        cp: isMate ? undefined : ev,
        mate: isMate ? ev : undefined,
        depth,
      };

      // Show the most recent line for each multipv slot. Bounds and depth are not used
      // to filter lines: every line replaces the previous line in its slot.
      if (!this.currentEval) {
        // The primary line starts a new evaluation; other slots wait for it.
        if (multiPv !== 1) return;
        this.currentEval = {
          fen: this.work.currentFen,
          depth,
          nodes,
          millis,
          cp: pvData.cp,
          mate: pvData.mate,
          pvs: [],
          engineId: this.info.id,
        };
      }

      // Never leave a gap in pvs: skip a line whose earlier slot has not arrived yet.
      if (multiPv > this.currentEval.pvs.length + 1) return;

      this.currentEval.pvs[multiPv - 1] = pvData;
      if (multiPv === 1) {
        this.currentEval.depth = depth;
        this.currentEval.nodes = nodes;
        this.currentEval.millis = millis;
        this.currentEval.cp = pvData.cp;
        this.currentEval.mate = pvData.mate;
      }

      this.emit();
    } else if (
      command &&
      !['Stockfish', 'id', 'option', 'info'].includes(parts[0]) &&
      !['Analysis Contempt', 'UCI_Variant', 'UCI_AnalyseMode'].includes(command.split(': ')[1])
    )
      console.warn(`SF: ${command}`);
  }

  uciVariant(key: Rules): string {
    return this.variantMap?.(key) ?? key;
  }

  private emit(ev = this.currentEval, work = this.work) {
    // don't let callers sort these pvs
    if (ev && work)
      work.emit(structuredClone(ev), { threatMode: work.threatMode, path: work.path, ply: work.ply });
  }

  private stop(): void {
    if (this.work && !this.work.stopRequested) {
      this.work.stopRequested = true;
      this.send?.('stop');
    }
  }

  private swapWork(): void {
    if (!this.send || this.work) return;

    this.work = this.nextWork;
    this.nextWork = undefined;

    if (this.work) {
      this.currentEval = undefined;

      this.setOption('UCI_Variant', this.uciVariant(this.work.variant));
      this.setOption('Threads', this.work.threads);
      this.setOption('Hash', this.work.hashSize || 16);
      this.setOption('MultiPV', Math.max(1, this.work.multiPv));

      if (this.gameId && this.gameId !== this.work.gameId) this.send('ucinewgame');
      this.gameId = this.work.gameId;

      this.send(['position fen', this.work.initialFen, 'moves', ...this.work.moves].join(' '));
      const [by, value] = Object.entries(this.work.search)[0];
      const cmd = Number.isFinite(value) ? `go ${by} ${value}` : 'go';
      this.send(cmd);
    }
  }

  compute(nextWork: Work | undefined): void {
    this.nextWork = nextWork;
    this.stop();
    this.swapWork();
  }

  isComputing(): boolean {
    return !!this.work && !this.work.stopRequested;
  }

  private throwOnFatalError(info: string[]): void {
    if (info[1] !== 'string' || !info.slice(2, 4).some(e => e.toLowerCase().startsWith('error'))) return;
    if (this.currentEval) this.currentEval.bestmove = '(none)';
    if (this.work)
      this.work.emit(undefined, {
        threatMode: false,
        path: this.work.path,
        ply: this.work.ply,
        error: info.slice(2).join(' '),
      });
    this.disconnected();
    throw new Error(info.slice(2).join(' '));
  }
}
