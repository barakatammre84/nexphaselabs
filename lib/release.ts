declare const __RELEASE_SHA__: string | undefined;

/**
 * The commit this build was made from, so a deployed Worker can say which source it
 * runs. vite.config.ts writes it in at build time: GITHUB_SHA in CI, otherwise the
 * checkout's HEAD, marked "-dirty" when the tree had uncommitted changes. Null where
 * nothing was written in, such as the test runner.
 */
export function releaseCommit(): string | null {
  return typeof __RELEASE_SHA__ === 'string' && __RELEASE_SHA__ ? __RELEASE_SHA__ : null;
}
