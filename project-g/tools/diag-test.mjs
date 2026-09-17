/*
 * 診断ログの検査。
 *
 * いちばん大事なのは「工程表の中身が混ざっていないこと」。
 * 本物のサンプルを読ませて診断ログを作り、
 * CSV に出てくる機微な文字列が 1 つも含まれていないことを確かめる。
 * あわせて、読み込みが失敗した状態でも書き出せることを見る。
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const HTML = pathToFileURL(join(root, 'プロジェクトG_工程表ツール.html')).href;
const CSV_PATH = join(root, 'sample', 'Sample', 'サポートルーム_サンプル工程表.csv');
const CSV = readFileSync(CSV_PATH, 'utf8');
const CSV_NAME = 'サポートルーム_サンプル工程表.csv';

/* CSV から「絶対に漏れてはいけない文字列」を拾う */
function secrets(text) {
  const rows = text.replace(/^﻿/, '').split('\r\n').filter((l) => l.trim());
  const split = (l) => {
    const c = []; let cur = '', q = false;
    for (let k = 0; k < l.length; k++) {
      const ch = l[k];
      if (q) { if (ch === '"') { if (l[k + 1] === '"') { cur += '"'; k++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { c.push(cur); cur = ''; }
      else cur += ch;
    }
    c.push(cur); return c;
  };
  const meta = split(rows[1]);
  const head = split(rows[2]);
  const ix = (n) => head.indexOf(n);
  const out = new Set();
  // メタ：プロジェクトID・工程表ID・ユーザーID・ユーザー名
  for (const i of [0, 1, 4, 5]) if (meta[i]) out.add(meta[i]);
  // ファイル名（拡張子を除いた本体）
  out.add(CSV_NAME.replace(/\.[^.]+$/, ''));
  for (const l of rows.slice(3)) {
    const c = split(l);
    for (const col of ['工程ID', '項目ID（開始日ノード）', '項目ID（終了日ノード）',
      '項目ID（中間ノード）', '項目名（開始日ノード）', '項目名（終了日ノード）',
      '開始日ノードの関係線ID', '終了日ノードの関係線ID']) {
      const v = (c[ix(col)] || '').trim();
      if (v.length >= 4) out.add(v);          // 短すぎるものは偶然一致するので除く
    }
    // 工程線名の name
    try {
      const nm = JSON.parse(c[ix('工程線名')])[0].name;
      if (nm && nm.length >= 3) out.add(nm);
    } catch (_) { /* 無視 */ }
  }
  return Array.from(out).filter(Boolean);
}

const out = [];
const say = (s) => { console.log(s); out.push(s); };
let fails = 0;
const chk = (ok, label, detail = '') => {
  if (!ok) fails++;
  say(`${ok ? 'OK' : 'NG'}\t${label}\t${detail}`);
};

const b = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ offline: true, viewport: { width: 1400, height: 900 } });
const ext = [];
ctx.on('request', (r) => { if (!/^(file|blob|data):/.test(r.url())) ext.push(r.url()); });
const page = await ctx.newPage();
await page.goto(HTML);
await page.waitForFunction(() => !!window.__TOOL__ && !!window.ExcelJS);

/* ---- 1. 正常に読めた状態の診断ログ ---- */
const normal = await page.evaluate(async ([csv, name]) => {
  window.__TOOL__.loadCsvText(csv, name);
  window.__TOOL__.setPeriod('2026-09-01', '2026-10-10');
  window.__TOOL__.render();
  await window.__TOOL__.xlsx();
  return { masked: window.__TOOL__.diag(false), raw: window.__TOOL__.diag(true) };
}, [CSV, CSV_NAME]);

const SEC = secrets(CSV);
say(`CSV から拾った「漏れてはいけない文字列」: ${SEC.length} 種類`);
const leaked = SEC.filter((s) => normal.masked.includes(s));
chk(leaked.length === 0, '伏せ字ログに機微な文字列が 1 つも無い',
  leaked.length ? `漏れ: ${leaked.slice(0, 5).join(' , ')}` : `${SEC.length} 種類すべて不在`);

// 実値モードでは逆に入っていること（伏せ字が効いていることの裏取り）
const inRaw = SEC.filter((s) => normal.raw.includes(s)).length;
chk(inRaw > SEC.length * 0.5, '実値モードでは機微な文字列が入る（伏せ字が効いている証拠）',
  `${inRaw} / ${SEC.length} 種類`);

chk(/\(\d+文字\)/.test(normal.masked), '名前が「(n文字)」に置き換わっている');
chk(/\bP001\b/.test(normal.masked), '工程IDが通し番号 P001… に置き換わっている');
chk(normal.masked.includes('(ファイル名).csv'), 'ファイル名が拡張子だけになっている');
chk(!normal.masked.includes('尾園'), 'ユーザー名が入っていない');

// 診断に必要な情報は残っていること
for (const need of ['形状の分布', 'SVG 検査', 'xlsx 検査', '休日の判定',
  '工程の一覧', 'ブラウザ', '見出し', '警告', 'エラー']) {
  chk(normal.masked.includes(need), `診断に要る項目が残っている: ${need}`);
}
chk(/yElbow \d+/.test(normal.masked), '形状の分布が数えられている');
chk(normal.masked.includes('2026-09-21'), '祝日の判定結果が入っている');

/* ---- 2. 読み込みに失敗した状態でも書き出せる ---- */
const broken = CSV.replace('工程線の形状', '形状もどき');
const fail = await page.evaluate(async ([csv, name]) => {
  let err = null;
  try { window.__TOOL__.loadCsvText(csv, name); } catch (e) { window.__TOOL__.recordError('loadCsvText', e.message, e.stack); err = e.message; }
  return { err, text: window.__TOOL__.diag(false) };
}, [broken, CSV_NAME]);
chk(!!fail.err, '必須列が無い CSV は読み込みで止まる', String(fail.err));
chk(fail.text.length > 200, '止まった状態でも診断ログが作れる', `${fail.text.length} 文字`);
chk(fail.text.includes('loadCsvText'), '失敗の中身がログに残っている');
const leaked2 = SEC.filter((s) => fail.text.includes(s));
chk(leaked2.length === 0, '失敗時のログにも機微な文字列が無い',
  leaked2.length ? `漏れ: ${leaked2.slice(0, 3).join(' , ')}` : '');

/* ---- 3. 実際に落ちたときも拾えるか ---- */
const crash = await page.evaluate(() => {
  window.__TOOL__.recordError('test', '意図的に起こした例外', 'at somewhere (x.js:1:1)');
  return window.__TOOL__.diag(false);
});
chk(crash.includes('意図的に起こした例外'), 'JS の例外がログに残る');

chk(ext.length === 0, '診断ログを出しても外部通信は無い', `${ext.length} 本`);

say('');
say(`伏せ字ログの大きさ: ${normal.masked.length.toLocaleString()} 文字`);
say(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
writeFileSync(join(root, 'out', 'diag-test.log'), out.join('\n') + '\n', 'utf8');
writeFileSync(join(root, 'out', '診断ログの例.txt'), '﻿' + normal.masked, 'utf8');
await b.close();
process.exit(fails === 0 ? 0 : 1);
