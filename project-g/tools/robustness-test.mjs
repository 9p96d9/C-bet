/*
 * 「別の工程表の CSV を渡したら動くか」を実際に確かめる。
 *
 * 本物のサンプルを元に、他の工程表で起こりそうな違いを作って通す。
 * 列順が違う／列が増減する／年が違う／規模が大きい／
 * サンプルに無い機能が使われている、など。
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const HTML = pathToFileURL(join(root, 'プロジェクトG_工程表ツール.html')).href;
const SRC = readFileSync(join(root, 'sample', 'Sample', 'サポートルーム_サンプル工程表.csv'), 'utf8');

/* ---- CSV の読み書き（引用を保ったまま列を触るため自前で持つ） ---- */
function splitLine(l) {
  const c = []; let cur = '', q = false;
  for (let k = 0; k < l.length; k++) {
    const ch = l[k];
    if (q) { if (ch === '"') { if (l[k + 1] === '"') { cur += '""'; k++; } else { q = false; cur += ch; } } else cur += ch; }
    else if (ch === '"') { q = true; cur += ch; }
    else if (ch === ',') { c.push(cur); cur = ''; }
    else cur += ch;
  }
  c.push(cur); return c;
}
function parse(text) {
  const bom = text.charCodeAt(0) === 0xfeff;
  const body = bom ? text.slice(1) : text;
  const lines = body.split('\r\n').filter((l, i, a) => l !== '' || i < a.length - 1);
  return { bom, rows: lines.map(splitLine) };
}
function build({ bom, rows }, { crlf = true } = {}) {
  return (bom ? '﻿' : '') + rows.map((r) => r.join(',')).join(crlf ? '\r\n' : '\n') + (crlf ? '\r\n' : '\n');
}
const H = (doc) => doc.rows[2];
const ix = (doc, name) => H(doc).indexOf(name);

/* 工程線名 JSON のキーを差し替える（引用済みセルのまま触る） */
function setNameKey(cell, key, value) {
  const inner = cell.replace(/^"|"$/g, '').replace(/""/g, '"');
  const o = JSON.parse(inner);
  o[0][key] = value;
  return '"' + JSON.stringify(o).replace(/"/g, '""') + '"';
}
const shiftIso = (s, days) => {
  const d = new Date(s.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10) + s.slice(10);
};

/* ---- 変種 ---- */
const VARIANTS = [];
const V = (name, expect, make) => VARIANTS.push({ name, expect, make });

V('そのまま（対照）', 'ok', () => SRC);

V('列順を入れ替えた（124 列を逆順に）', 'ok', () => {
  const d = parse(SRC);
  const n = d.rows[2].length;
  const order = Array.from({ length: n }, (_, i) => n - 1 - i);
  d.rows = d.rows.map((r, i) => (i < 2 ? r : order.map((k) => r[k] ?? '')));
  return build(d);
});

V('使っていない列を 52 個削った（124 → 72 列）', 'ok', () => {
  const d = parse(SRC);
  const drop = new Set();
  H(d).forEach((h, i) => { if (/^詳細工程[1-4]/.test(h)) drop.add(i); });
  const keep = H(d).map((_, i) => i).filter((i) => !drop.has(i));
  d.rows = d.rows.map((r, i) => (i < 2 ? r : keep.map((k) => r[k] ?? '')));
  return build(d);
});

V('知らない列を 5 個足した（124 → 129 列）', 'ok', () => {
  const d = parse(SRC);
  d.rows = d.rows.map((r, i) => (i < 2 ? r : i === 2
    ? [...r, '新項目A', '新項目B', '新項目C', '新項目D', '新項目E']
    : [...r, 'x', 'y', 'z', '', '']));
  return build(d);
});

V('必須列（工程線の形状）が無い', 'error', () => {
  const d = parse(SRC);
  const k = ix(d, '工程線の形状');
  d.rows = d.rows.map((r, i) => (i < 2 ? r : r.filter((_, j) => j !== k)));
  return build(d);
});

V('BOM 無し・改行が LF', 'ok', () => {
  const d = parse(SRC); d.bom = false;
  return build(d, { crlf: false });
});

V('別の年（2028 年へ 2 年ずらす）', 'ok', () => {
  const d = parse(SRC);
  const s = ix(d, '開始日'), e = ix(d, '終了日'), m = ix(d, '中間ノード日付');
  d.rows[1][2] = '2028/09/01-2028/11/30';
  d.rows = d.rows.map((r, i) => {
    if (i < 3) return r;
    const o = r.slice();
    for (const k of [s, e, m]) if (o[k]) o[k] = shiftIso(o[k], 730);
    // 休日 は年が変われば変わるので検算列を空にする
    for (const nm of ['休日', '延べ日数', '日数']) o[ix(d, nm)] = '';
    return o;
  });
  return build(d);
});

V('大規模（工程 230 件・行 460）', 'ok', () => {
  const d = parse(SRC);
  const body = d.rows.slice(3);
  const cId = ix(d, '工程ID'), cSr = ix(d, '開始日の行番号'), cEr = ix(d, '終了日の行番号');
  const cSn = ix(d, '項目ID（開始日ノード）'), cEn = ix(d, '項目ID（終了日ノード）');
  const cMn = ix(d, '項目ID（中間ノード）'), cNm = ix(d, '工程線名');
  const out = [];
  for (let rep = 0; rep < 10; rep++) {
    for (const r of body) {
      const o = r.slice();
      const suf = '_' + rep;
      o[cId] += suf;
      for (const k of [cSn, cEn, cMn]) if (o[k]) o[k] += suf;
      o[cSr] = String(+o[cSr] + rep * 42);
      o[cEr] = String(+o[cEr] + rep * 42);
      const nm = JSON.parse(o[cNm].replace(/^"|"$/g, '').replace(/""/g, '"'))[0].name;
      o[cNm] = setNameKey(o[cNm], 'name', nm + suf);
      out.push(o);
    }
  }
  d.rows = [...d.rows.slice(0, 3), ...out];
  return build(d);
});

V('サンプルに無い機能（0.5日・工程削除・textSize S・crank に中間ノード）', 'ok', () => {
  const d = parse(SRC);
  const cNm = ix(d, '工程線名'), cHalf = ix(d, '0.5日'), cDel = ix(d, '工程削除');
  const cShape = ix(d, '工程線の形状'), cMn = ix(d, '項目ID（中間ノード）');
  const cMd = ix(d, '中間ノード日付'), cSn = ix(d, '項目ID（開始日ノード）'), cEnd = ix(d, '終了日');
  let done = { half: 0, del: 0, s: 0, crank: 0 };
  d.rows = d.rows.map((r, i) => {
    if (i < 3) return r;
    const o = r.slice();
    const nm = JSON.parse(o[cNm].replace(/^"|"$/g, '').replace(/""/g, '"'))[0].name;
    if (nm === 'E1' && !done.half) { o[cHalf] = '0.5'; done.half++; }
    if (nm === 'E3' && !done.del) { o[cDel] = 'true'; done.del++; }
    if (nm === 'B3' && !done.s) { o[cNm] = setNameKey(o[cNm], 'textSize', 'S'); done.s++; }
    if (o[cShape] === 'crank' && !done.crank) {           // crank に中間ノードを付ける
      o[cMn] = o[cSn]; o[cMd] = shiftIso(o[cEnd], 1); done.crank++;
    }
    return o;
  });
  return build(d);
});

V('工程が 1 件だけ', 'ok', () => {
  const d = parse(SRC);
  d.rows = [...d.rows.slice(0, 3), d.rows[3]];
  return build(d);
});

V('工程が 0 件（見出しだけ）', 'ok', () => {
  const d = parse(SRC);
  d.rows = d.rows.slice(0, 3);
  return build(d);
});

// 期待は 'ok'（全件通る）・'error'（読み込みで止まる）・'detect'（検査が拾って xlsx を止める）
V('休日 列が自前の計算と食い違う（会社休日がある工程表を想定）', 'detect', () => {
  const d = parse(SRC);
  const c = ix(d, '休日');
  d.rows = d.rows.map((r, i) => {
    if (i !== 3) return r;
    const o = r.slice(); o[c] = String(+o[c] + 3); return o;   // わざと 3 日ずらす
  });
  return build(d);
});

V('知らない形状名が使われている', 'ok', () => {
  const d = parse(SRC);
  const c = ix(d, '工程線の形状');
  d.rows = d.rows.map((r, i) => {
    if (i !== 3) return r;
    const o = r.slice(); o[c] = 'zigzagNew'; return o;
  });
  return build(d);
});

V('関係線を 3 本に増やした', 'ok', () => {
  const d = parse(SRC);
  const c0 = ix(d, '開始日ノードの関係線名'), c1 = ix(d, '終了日ノードの関係線名');
  const cNm = ix(d, '工程線名');
  const pair = { A1: ['関係２', 0], B1: ['関係２', 1], E1: ['関係３', 0], D1: ['関係３', 1] };
  d.rows = d.rows.map((r, i) => {
    if (i < 3) return r;
    const o = r.slice();
    const nm = JSON.parse(o[cNm].replace(/^"|"$/g, '').replace(/""/g, '"'))[0].name;
    if (pair[nm]) o[pair[nm][1] === 0 ? c0 : c1] = pair[nm][0];
    return o;
  });
  return build(d);
});

/* ---- 実行 ---- */
const out = [];
const say = (s) => { console.log(s); out.push(s); };
let fails = 0;

const b = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ offline: true, viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(HTML);
await page.waitForFunction(() => !!window.__TOOL__ && !!window.ExcelJS);

say('変種 CSV を通した結果');
say('='.repeat(100));

for (const v of VARIANTS) {
  let csv;
  try { csv = v.make(); } catch (e) { say(`NG  ${v.name}\n      変種の生成に失敗: ${e.message}`); fails++; continue; }
  const t0 = Date.now();
  const r = await page.evaluate(async ([csv]) => {
    const res = { error: null };
    try {
      window.__TOOL__.setGateRows('');
      const doc = window.__TOOL__.loadCsvText(csv, 'v.csv');
      res.headers = doc.headers.length;
      res.procs = doc.processes.length;
      res.warns = doc.warnings.length;
      res.warnSample = doc.warnings.slice(0, 2);
      res.est = doc.estimates.filter((e) => e.source === 'rule').length;
      const period = doc.meta.period || '';
      const m = /^(\d{4})\/(\d{2})\/(\d{2})-(\d{4})\/(\d{2})\/(\d{2})$/.exec(period);
      if (m) window.__TOOL__.setPeriod(`${m[1]}-${m[2]}-${m[3]}`, `${m[4]}-${m[5]}-${m[6]}`);
      const rr = window.__TOOL__.render();
      res.drawn = rr.drawn.length;
      res.skipped = rr.skipped.length;
      const sv = window.__TOOL__.results().svg;
      res.svgN = sv.length; res.svgNg = sv.filter((x) => !x.ok).length;
      res.svgNgList = sv.filter((x) => !x.ok).slice(0, 2).map((x) => `${x.scope}/${x.label}`);
      const x = await window.__TOOL__.xlsx();
      const xr = window.__TOOL__.results().xlsx;
      res.xlsxN = xr.length; res.xlsxNg = xr.filter((y) => !y.ok).length;
      res.xlsxNgList = xr.filter((y) => !y.ok).slice(0, 2).map((y) => `${y.scope}/${y.label}`);
      res.bytes = x && x.buffer ? x.buffer.byteLength : 0;
    } catch (e) { res.error = e.message; }
    return res;
  }, [csv]);
  const ms = Date.now() - t0;

  if (v.expect === 'detect') {
    // 検査が食い違いを拾い、xlsx 書き出しが止まることを期待する
    const caught = !r.error && r.svgNg > 0
      && r.svgNgList.some((x) => x.includes('休日の計算'));
    if (!caught) fails++;
    say(`${caught ? 'OK ' : 'NG '} ${v.name}`);
    say(`      検査が食い違いを検出: SVG ${r.svgN - r.svgNg}/${r.svgN}（NG: ${r.svgNgList.join(' , ')}）`);
    say('      → 画面では xlsx 書き出しボタンが無効のままになる');
    continue;
  }
  if (v.expect === 'error') {
    const ok = !!r.error;
    if (!ok) fails++;
    say(`${ok ? 'OK ' : 'NG '} ${v.name}`);
    say(`      期待どおりエラーで止まった: ${r.error || '（止まらなかった）'}`);
    continue;
  }
  const ok = !r.error && r.svgNg === 0 && r.xlsxNg === 0;
  if (!ok) fails++;
  say(`${ok ? 'OK ' : 'NG '} ${v.name}`);
  if (r.error) { say(`      エラー: ${r.error}`); continue; }
  say(`      見出し ${r.headers} 列 / 工程 ${r.procs} 件 / 描画 ${r.drawn} 件（除外 ${r.skipped}）`
    + ` / SVG ${r.svgN - r.svgNg}/${r.svgN} / xlsx ${r.xlsxN - r.xlsxNg}/${r.xlsxN}`
    + ` / ${r.bytes.toLocaleString()} bytes / ${ms}ms`);
  if (r.svgNg) say(`      SVG NG: ${r.svgNgList.join(' , ')}`);
  if (r.xlsxNg) say(`      xlsx NG: ${r.xlsxNgList.join(' , ')}`);
  if (r.warns) say(`      警告 ${r.warns} 件 / 要確認の推定 ${r.est} 件`
    + (r.warnSample.length ? `\n        例: ${r.warnSample.join('\n        例: ')}` : ''));
}

say('='.repeat(100));
say(`JS エラー ${pageErrors.length} 件`);
say(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
writeFileSync(join(root, 'out', 'robustness-test.log'), out.join('\n') + '\n', 'utf8');
await b.close();
process.exit(fails === 0 ? 0 : 1);
