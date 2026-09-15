import { execSync } from 'node:child_process';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

/**
 * The commit a build comes from, written into the bundle as __RELEASE_SHA__ so a
 * deployed Worker can report the source it runs (lib/release.ts, /api/health).
 * CI provides GITHUB_SHA; a local build uses HEAD, marked -dirty when the tree has
 * uncommitted changes.
 */
function releaseSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    const run = (command: string) =>
      execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const sha = run('git rev-parse HEAD');
    return run('git status --porcelain') ? `${sha}-dirty` : sha;
  } catch {
    return '';
  }
}

export default defineConfig(() => {
  return {
    define: { __RELEASE_SHA__: JSON.stringify(releaseSha()) },
    css: { postcss: { plugins: [tailwindcss()] } },
    server: {
      watch: {
        ignored: ['**/.node_modules-broken-local/**'],
        ...(isCodexSeatbeltSandbox
          ? { useFsEvents: false, usePolling: true }
          : {}),
      },
    },
    plugins: [
      vinext(),
      // Runs the RSC environment in workerd so `cloudflare:workers` bindings
      // (D1 `DB`, R2 `DOCS`) resolve in dev and are externalised in the build.
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      }),
    ],
  };
});
