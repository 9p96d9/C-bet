/* 出力した SVG をそのまま開いて全景 PNG にする（実装メモ用） */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'out');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const f of process.argv.slice(2)) {
  const svg = readFileSync(join(OUT, f), 'utf8');
  const w = +/width="(\d+)"/.exec(svg)[1], h = +/height="(\d+)"/.exec(svg)[1];
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.goto(pathToFileURL(join(OUT, f)).href);
  await p.screenshot({ path: join(OUT, basename(f, '.svg') + '_full.png') });
  console.log(basename(f, '.svg') + '_full.png', w + 'x' + h);
  await p.close();
}
await b.close();
