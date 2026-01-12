import { storedBooleanPropWithEffect } from 'lib/storage';
import type { Prop } from 'lib';
import { boardAnalysisVariants } from '../motif/boardAnalysis';

export default class ZoneCtrl {
  safe: Prop<boolean>;
  danger: Prop<boolean>;

  constructor(setAutoShapes: () => void) {
    this.safe = storedBooleanPropWithEffect('analyse.zone.safe', false, setAutoShapes);
    this.danger = storedBooleanPropWithEffect('analyse.zone.danger', false, setAutoShapes);
  }

  supports = (variant: VariantKey): boolean => boardAnalysisVariants.includes(variant);

  any = () => this.safe() || this.danger();
}
