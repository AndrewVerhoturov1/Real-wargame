export {};

declare module './PerformancePhases' {
  interface PerformancePhaseRuntimeDiagnostic {
    readonly [key: string]: unknown;
  }
}

declare module './PerformanceMonitor' {
  interface PerformancePhaseMeasureDiagnostic {
    readonly [key: string]: unknown;
  }
}

declare module '../navigation/RouteCostField' {
  interface RouteCostFieldDiagnostics {
    readonly [key: string]: unknown;
  }
}
