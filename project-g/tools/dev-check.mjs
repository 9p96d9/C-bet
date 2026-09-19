/*
 * 開発用.html と 納品する単一 HTML が同じ結果になることを確かめる。
 *
 * 開発用.html は src/*.js を <script src> で読み、
 * 単一 HTML は同じ中身を連結して 1 つの <script> に入れている。
 * 読み方が違うだけで結果が違ってはいけないので、両方で同じ CSV を
 * 描いて、SVG の中身・検査の結果・xlsx の大きさを突き合わせる。
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CSV = readFileSync(join(root, 'sample', 'Sample', 'サポートルーム_サンプル工程表.csv'), 'utf8');

const out = [];
const say = (s) => { console.log(s); out.push(s); };
let fails = 0;
const chk = (ok, label, detail = '') => { if (!ok) fails++; say(`${ok ? 'OK' : 'NG'}\t${label}\t${detail}`); };

async function run(b, file) {
  const ctx = await b.newContext({ offline: true, viewport: { width: 1400, height: 900 } });
  const ext = [], errs = [];
  ctx.on('request', (r) => { if (!/^(file|blob|data):/.test(r.url())) ext.push(r.url()); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(pathToFileURL(join(root, file)).href);
  await page.waitForFunction(() => !!window.__TOOL__ && !!window.ExcelJS, null, { timeout: 20000 });
  const r = await page.evaluate(async (csv) => {
    window.__TOOL__.loadCsvText(csv, 'サンプル.csv');
    window.__TOOL__.setPeriod('2026-09-01', '2026-10-10');
    window.__TOOL__.render();
    await window.__TOOL__.xlsx();
    const res = window.__TOOL__.results();
    const svg = document.querySelector('svg.plot-svg');
    return {
      svg: new XMLSerializer().serializeToString(svg),
      procs: document.querySelectorAll('g.proc').length,
      svgNg: res.svg.filter((x) => !x.ok).length,
      svgAll: res.svg.length,
      xlsxNg: res.xlsx.filter((x) => !x.ok).length,
      xlsxAll: res.xlsx.length,
      ests: window.__TOOL__.estimates().length,
      diag: window.__TOOL__.diag(false).length,
    };
  }, CSV);
  await ctx.close();
  return { ...r, ext: ext.length, errs };
}

const b = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const dev = await run(b, join('tools', '開発用.html'));
const one = await run(b, 'プロジェクトG_工程表ツール.html');
await b.close();

for (const [name, r] of [['開発用.html', dev], ['単一 HTML', one]]) {
  chk(r.errs.length === 0, `${name}: JS エラーが出ていない`, r.errs.join(' '));
  chk(r.ext === 0, `${name}: 外部通信が無い`, `${r.ext} 本`);
  chk(r.procs > 0, `${name}: 工程が描けている`, `${r.procs} 件`);
  chk(r.svgNg === 0 && r.xlsxNg === 0, `${name}: 機械検査が全て通る`,
    `SVG ${r.svgAll - r.svgNg}/${r.svgAll}  xlsx ${r.xlsxAll - r.xlsxNg}/${r.xlsxAll}`);
}
chk(dev.svg === one.svg, '両者の SVG が 1 文字も違わない',
  dev.svg === one.svg ? `${dev.svg.length.toLocaleString()} 文字が一致` : `${dev.svg.length} vs ${one.svg.length} 文字`);
chk(dev.svgAll === one.svgAll && dev.xlsxAll === one.xlsxAll, '検査の項目数が同じ',
  `SVG ${dev.svgAll}/${one.svgAll}  xlsx ${dev.xlsxAll}/${one.xlsxAll}`);
chk(dev.ests === one.ests, '推定の件数が同じ', `${dev.ests} / ${one.ests}`);

say('');
say(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
writeFileSync(join(root, 'out', 'dev-check.log'), out.join('\n') + '\n', 'utf8');
process.exit(fails === 0 ? 0 : 1);
