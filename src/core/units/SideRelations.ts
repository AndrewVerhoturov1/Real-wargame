import type { UnitModel, UnitSide } from './UnitModel';

export type SideRelation = 'friendly' | 'hostile';

export function getSideRelation(observerSide: UnitSide, subjectSide: UnitSide): SideRelation {
  return observerSide === subjectSide ? 'friendly' : 'hostile';
}

export function areUnitsHostile(observer: Pick<UnitModel, 'side'>, subject: Pick<UnitModel, 'side'>): boolean {
  return getSideRelation(observer.side, subject.side) === 'hostile';
}
