declare const __EXPECTED_MIGRATIONS__: unknown;

/**
 * The migration tags compiled into the Worker from drizzle/meta/_journal.json.
 * A local test runner has no Vite replacement, so an absent value is an empty
 * manifest rather than an exception.
 */
export function expectedMigrationTags(): string[] {
  if (typeof __EXPECTED_MIGRATIONS__ === 'undefined' || !Array.isArray(__EXPECTED_MIGRATIONS__)) return [];
  return __EXPECTED_MIGRATIONS__.filter((tag): tag is string => typeof tag === 'string');
}

export function migrationListsMatch(expected: readonly string[], applied: readonly string[]): boolean {
  return expected.length === applied.length && expected.every((tag, index) => tag === applied[index]);
}