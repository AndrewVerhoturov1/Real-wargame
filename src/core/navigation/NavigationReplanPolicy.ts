import type { NavigationProfile } from './NavigationProfiles';

export type NavigationReplanReason = 'blocked' | 'profile_changed' | 'danger_changed' | null;

export interface NavigationReplanOrderSnapshot {
  readonly routeRevision?: number;
  readonly navigationProfileRevision?: number;
  readonly knowledgeRevision?: number;
  readonly lastReplanAtSeconds?: number;
  readonly pathCost?: number;
}

export interface NavigationReplanEvaluationInput {
  readonly order: NavigationReplanOrderSnapshot;
  readonly profile: NavigationProfile;
  readonly nowSeconds: number;
  readonly blocked: boolean;
  readonly currentProfileRevision: number;
  readonly currentKnowledgeRevision: number;
  readonly candidateCost?: number;
}

export interface NavigationReplanEvaluation {
  readonly shouldSearch: boolean;
  readonly shouldReplace: boolean;
  readonly reason: NavigationReplanReason;
  readonly reasonRu: string | null;
  readonly improvementRatio: number | null;
}

export function evaluateNavigationReplan(input: NavigationReplanEvaluationInput): NavigationReplanEvaluation {
  const rules = input.profile.replanRules;
  const previousProfileRevision = input.order.navigationProfileRevision ?? input.currentProfileRevision;
  const previousKnowledgeRevision = input.order.knowledgeRevision ?? input.currentKnowledgeRevision;
  const elapsed = input.nowSeconds - (input.order.lastReplanAtSeconds ?? Number.NEGATIVE_INFINITY);

  let reason: Exclude<NavigationReplanReason, null> | null = null;
  if (input.blocked && rules.replanOnBlocked) {
    reason = 'blocked';
  } else if (previousProfileRevision !== input.currentProfileRevision && rules.replanOnProfileChange) {
    reason = 'profile_changed';
  } else if (
    input.currentKnowledgeRevision - previousKnowledgeRevision >= rules.minimumDangerRevisionInterval
    && rules.replanOnDangerChange
  ) {
    reason = 'danger_changed';
  }

  const cooldownReady = reason === 'blocked' || elapsed >= rules.replanCooldownSeconds;
  const shouldSearch = reason !== null && cooldownReady;
  const improvementRatio = calculateImprovement(input.order.pathCost, input.candidateCost);
  const shouldReplace = shouldSearch && input.candidateCost !== undefined && (
    reason === 'blocked'
    || reason === 'profile_changed'
    || improvementRatio !== null && improvementRatio + 1e-9 >= rules.minimumCostImprovement
  );

  return {
    shouldSearch,
    shouldReplace,
    reason: shouldSearch ? reason : null,
    reasonRu: shouldSearch ? reasonToRussian(reason) : null,
    improvementRatio,
  };
}

function calculateImprovement(currentCost: number | undefined, candidateCost: number | undefined): number | null {
  if (!Number.isFinite(currentCost) || !Number.isFinite(candidateCost) || !currentCost || currentCost <= 0) return null;
  return (currentCost - (candidateCost as number)) / currentCost;
}

function reasonToRussian(reason: NavigationReplanReason): string | null {
  switch (reason) {
    case 'blocked': return 'Следующий участок маршрута стал непроходимым.';
    case 'profile_changed': return 'Изменились настройки активного профиля маршрута.';
    case 'danger_changed': return 'Существенно изменились известные бойцу угрозы.';
    default: return null;
  }
}
