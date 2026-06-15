import { rmSync } from 'node:fs';
import { build } from 'esbuild';

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
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

console.log('Built dist/index.js (single-file ESM, minified, no source maps).');
