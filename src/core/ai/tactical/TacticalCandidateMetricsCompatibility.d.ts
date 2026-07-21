import './TacticalQuery';

declare module './TacticalQuery' {
  interface TacticalCandidateMetrics {
    /** Legacy compatibility alias used by older tactical-position candidates. */
    readonly danger?: number;
  }
}
