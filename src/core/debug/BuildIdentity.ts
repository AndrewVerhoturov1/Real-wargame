import { PERFORMANCE_REPORT_VERSION } from './PerformanceReportV6';

export const PERFORMANCE_CONTRACT_VERSION = PERFORMANCE_REPORT_VERSION;

export interface RealWargameBuildIdentity {
  readonly branch: string;
  readonly commitSha: string;
  readonly buildId: string;
  readonly generatedAt: string;
  readonly performanceContractVersion: typeof PERFORMANCE_CONTRACT_VERSION;
}

declare const __REAL_WARGAME_BUILD_IDENTITY__: RealWargameBuildIdentity | undefined;

const FALLBACK_IDENTITY: RealWargameBuildIdentity = {
  branch: 'unknown',
  commitSha: 'unknown',
  buildId: 'unidentified-development-build',
  generatedAt: 'unknown',
  performanceContractVersion: PERFORMANCE_CONTRACT_VERSION,
};

export function getRealWargameBuildIdentity(): RealWargameBuildIdentity {
  if (typeof __REAL_WARGAME_BUILD_IDENTITY__ === 'undefined') return FALLBACK_IDENTITY;
  return {
    ...__REAL_WARGAME_BUILD_IDENTITY__,
    performanceContractVersion: PERFORMANCE_CONTRACT_VERSION,
  };
}
