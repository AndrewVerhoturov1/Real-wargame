/**
 * @deprecated The object-cover tooltip was removed with the legacy cover system.
 * Retained temporarily so the existing application entry does not need a large,
 * unrelated rewrite during the tactical-position migration.
 */
export function installWorkspaceTooltipGuard(): () => void {
  return () => undefined;
}
