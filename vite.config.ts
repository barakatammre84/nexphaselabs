import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

export default defineConfig(() => {
  return {
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
