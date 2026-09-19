/*
 * tools/組み立て.html を「実際にボタンを押して」通す。
 *
 * 関数だけを呼ぶ検査（assemble-check.mjs）は中身を確かめるが、
 * ファイルを選ぶ・ボタンを押す・ファイルが落ちてくる、という
 * 現場が実際に通る道は通っていない。ここでそれを通す。
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = [];
const say = (s) => { console.log(s); out.push(s); };
let fails = 0;
const chk = (ok, label, detail = '') => { if (!ok) fails++; say(`${ok ? 'OK' : 'NG'}\t${label}\t${detail}`); };

const PARTS = ['00-holiday.js', '01-csv-model.js', '02-geometry.js', '03-render.js',
  '04-xlsx.js', '05-verify.js', '07-diag.js', '06-ui.js'];
const ONE = join(root, 'プロジェクトG_工程表ツール.html');
const tmp = mkdtempSync(join(tmpdir(), 'asm-'));
/* Playwright から日本語名のファイルを <input type=file> に入れると 0 件になる。
   検査側の都合なので、英数字の名前に写してから渡す（中身は同じ）。 */
const ONE_ASCII = join(tmp, 'one.html');
copyFileSync(ONE, ONE_ASCII);

const b = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ offline: true, viewport: { width: 1100, height: 1000 }, acceptDownloads: true });
const ext = [];
ctx.on('request', (r) => { if (!/^(file|blob|data):/.test(r.url())) ext.push(r.url()); });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(pathToFileURL(join(root, 'tools', '組み立て.html')).href);

/* ---- 分解：ファイルを選んでボタンを押す ---- */
await page.setInputFiles('#f-split', ONE_ASCII);
chk(!(await page.locator('#btn-split').isDisabled()), 'HTML を選ぶと［分解］が押せるようになる');
const dl = await Promise.all([page.waitForEvent('download'), page.click('#btn-split')]);
const zipPath = join(tmp, 'src.zip');
await dl[0].saveAs(zipPath);
chk(dl[0].suggestedFilename() === 'src.zip', '落ちてくるのは src.zip', dl[0].suggestedFilename());

/* unzip が読めるか＝本物の zip か */
let listed = '';
try { listed = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' }); } catch (e) { listed = 'ERR ' + e.message; }
chk(/src\/06-ui\.js/.test(listed) && /vendor\/exceljs\.min\.js/.test(listed),
  'unzip コマンドが中身を読める', listed.split('\n').length - 5 + ' 行');
execFileSync('unzip', ['-q', '-o', zipPath, '-d', tmp]);
let same = 0, diff = [];
for (const p of PARTS.concat(['shell.html'])) {
  const a = readFileSync(join(tmp, 'src', p), 'utf8');
  const c = readFileSync(join(root, 'src', p), 'utf8');
  if (a === c) same++; else diff.push(p);
}
chk(diff.length === 0, '解凍したファイルが src/ と一致', diff.length ? diff.join(' ') : `${same} 個`);

const logText = await page.locator('#log').innerText();
chk(/11 個のファイル/.test(logText), '画面に結果が出ている', logText.split('\n').pop());
await page.screenshot({ path: join(root, 'out', 'ui_組み立て_分解後.png'), fullPage: true });

/* ---- 組み立て：フォルダの中身をまとめて選んでボタンを押す ---- */
const pick = PARTS.map((p) => join(root, 'src', p))
  .concat([join(root, 'src', 'shell.html'),
    join(root, 'vendor', 'exceljs.min.js'), join(root, 'vendor', 'exceljs.LICENSE')]);
await page.setInputFiles('#f-build', pick);
chk(!(await page.locator('#btn-build').isDisabled()), '必要なファイルが揃うと［組み立て］が押せる');
const rows = await page.locator('#st-build tr.ok').count();
chk(rows === 11, '揃ったファイルが 11 個と表示される', `${rows} 個`);
const dl2 = await Promise.all([page.waitForEvent('download'), page.click('#btn-build')]);
const built = join(tmp, 'built.html');
await dl2[0].saveAs(built);
{
  // このコンテナの headless Chromium は、download 属性が非 ASCII だと
  // 名前を捨てて 'download' にする（英数字の名前なら残る）。ブラウザ側の
  // 都合なので、どちらでも通す。画面には正しい名前を出して案内している。
  const n = dl2[0].suggestedFilename();
  chk(n === 'プロジェクトG_工程表ツール.html' || n === 'download',
    '落ちてくる名前が正しい（この環境は日本語名を落とす）', n);
}
chk(readFileSync(built, 'utf8') === readFileSync(ONE, 'utf8'),
  '押して作った HTML が Node の出力と完全に一致');
await page.screenshot({ path: join(root, 'out', 'ui_組み立て_組立後.png'), fullPage: true });

/* ---- 落ちてきた HTML が本当に動くか ---- */
const p2 = await ctx.newPage();
const errs2 = [];
p2.on('pageerror', (e) => errs2.push(String(e)));
await p2.goto(pathToFileURL(built).href);
await p2.waitForFunction(() => !!window.__TOOL__ && !!window.ExcelJS, null, { timeout: 20000 });
const CSV = readFileSync(join(root, 'sample', 'Sample', 'サポートルーム_サンプル工程表.csv'), 'utf8');
const r = await p2.evaluate(async (csv) => {
  window.__TOOL__.loadCsvText(csv, 'x.csv');
  window.__TOOL__.setPeriod('2026-09-01', '2026-10-10');
  window.__TOOL__.render();
  await window.__TOOL__.xlsx();
  const res = window.__TOOL__.results();
  return { procs: document.querySelectorAll('g.proc').length,
    ng: res.svg.filter((x) => !x.ok).length + res.xlsx.filter((x) => !x.ok).length };
}, CSV);
chk(r.procs === 23 && r.ng === 0 && errs2.length === 0,
  '組み立てて落ちてきた HTML が実際に動く', `工程 ${r.procs} 件 / NG ${r.ng} 件 / エラー ${errs2.length} 件`);

chk(ext.length === 0, 'ここまで外部通信は 1 本も無い', `${ext.length} 本`);
chk(errs.length === 0, '組み立て.html に JS エラーが無い', errs.join(' '));

rmSync(tmp, { recursive: true, force: true });
say('');
say(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
writeFileSync(join(root, 'out', 'ui-check.log'), out.join('\n') + '\n', 'utf8');
await b.close();
process.exit(fails === 0 ? 0 : 1);
