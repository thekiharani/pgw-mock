import { nodeFileTrace } from '@vercel/nft';
import {
  copyFile,
  cp,
  lstat,
  mkdir,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

const cwd = process.cwd();
const OUT = resolve(cwd, 'prod');

const FORCE_INCLUDE = ['pg', '@scalar/fastify-api-reference', '@fastify/static'];

await rm(OUT, { recursive: true, force: true });

const { fileList, warnings } = await nodeFileTrace(['dist/index.js'], { base: cwd });

let files = 0;
let links = 0;
for (const rel of fileList) {
  const src = resolve(cwd, rel);
  const dest = join(OUT, rel);
  await mkdir(dirname(dest), { recursive: true });
  const st = await lstat(src);
  if (st.isSymbolicLink()) {
    await symlink(await readlink(src), dest).catch(() => {});
    links += 1;
  } else if (st.isDirectory()) {
    await cp(src, dest, { recursive: true });
  } else {
    await copyFile(src, dest);
    files += 1;
  }
}

for (const pkg of FORCE_INCLUDE) {
  let realDir;
  try {
    realDir = await realpath(join(cwd, 'node_modules', pkg));
  } catch {
    continue;
  }
  const dest = join(OUT, relative(cwd, realDir));
  await rm(dest, { recursive: true, force: true });
  await mkdir(dirname(dest), { recursive: true });
  await cp(realDir, dest, { recursive: true });
}

await writeFile(join(OUT, 'package.json'), `${JSON.stringify({ type: 'module' }, null, 2)}\n`);

if (warnings?.length) {
  console.warn(`[trace] ${warnings.length} nft warning(s):`);
  for (const w of warnings.slice(0, 20)) console.warn('  -', w.message ?? w);
}
console.log(`[trace] staged ${files} files + ${links} symlinks into prod/`);
