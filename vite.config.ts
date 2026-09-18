import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
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

function migrationTags(): string[] {
  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as {
    entries?: Array<{ tag?: unknown }>;
  };
  const journalTags = (journal.entries ?? []).map((entry) => entry.tag).filter((tag): tag is string => typeof tag === 'string');
  const sqlTags = readdirSync('drizzle')
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort()
    .map((file) => file.slice(0, -4));
  if (JSON.stringify(journalTags) !== JSON.stringify(sqlTags)) {
    throw new Error(
      `drizzle migration manifest is out of sync: journal has ${journalTags.at(-1) ?? 'none'}, SQL has ${sqlTags.at(-1) ?? 'none'}`,
    );
  }
  return journalTags;
}

export default defineConfig(() => {
  const migrations = migrationTags();
  return {
    define: {
      __RELEASE_SHA__: JSON.stringify(releaseSha()),
      __EXPECTED_MIGRATIONS__: JSON.stringify(migrations),
    },
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
