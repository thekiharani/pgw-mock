import { rmSync } from 'node:fs';
import { build } from 'esbuild';

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });

await build({
  // The server plus standalone maintenance scripts. `out` pins each output name
  // so they land flat in dist/ (dist/index.js, dist/create-user.js) regardless of
  // their source directory.
  entryPoints: [
    { in: 'src/index.ts', out: 'index' },
    { in: 'scripts/create-user.ts', out: 'create-user' },
  ],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: false,
  minify: true,
  tsconfig: 'tsconfig.json',
  logLevel: 'info',
});

console.log('Built dist/index.js + dist/create-user.js (ESM, minified, no source maps).');
