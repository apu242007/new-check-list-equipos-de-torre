import { build } from 'esbuild';
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { parseCatalog } from '../src/domain.mjs';
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
const catalog = parseCatalog(await readFile('docs/checklist-fuente.md', 'utf8'));
await writeFile('dist/catalog.json', JSON.stringify(catalog));
await writeFile('dist/.nojekyll', '');
const config = JSON.parse(await readFile('public/config.json', 'utf8'));
config.submissionUrl = process.env.TACKER_FLOW_URL || '';
await writeFile('dist/config.json', JSON.stringify(config));
await build({
  entryPoints: { app: 'src/app.mjs' },
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  minify: true,
  target: ['es2022'],
  legalComments: 'eof',
});
console.log('App compilada en dist/ con las 16 secciones del documento fuente.');
