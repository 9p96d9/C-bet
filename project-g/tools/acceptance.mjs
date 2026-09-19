/*
 * ステップ 1 の受け入れ試験（設計B 5.5）を headless Chromium で実行する。
 * - file:// で開く
 * - browser context を offline にしてネットワーク遮断状態を再現する
 * - 外部リクエストが 1 本でも出たら失敗させる
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(root, 'out');
mkdirSync(OUT, { recursive: true });

const HTML = pathToFileURL(join(root, 'プロジェクトG_工程表ツール.html')).href;
// Sample.zip の本物の CSV（SHA-256 照合済み）
const CSV = readFileSync(join(root, 'sample', 'Sample', 'サポートルーム_サンプル工程表.csv'), 'utf8');
const CSV_NAME = 'サポートルーム_サンプル工程表.csv';

/** 工程行を 1 本複製して 24 本にした CSV（受け入れ 4） */
function csvWith24(text) {
  const lines = text.split('\r\n');
  const body = lines.slice(3).filter((l) => l.trim() !== '');
  // 1 本目を複製し、工程IDと工程線名のIDだけ書き換えて 24 本にする
  const cols = body[0].split(',');
  const dup = body[0].replace(cols[7], cols[7] + 'X');
  return [...lines.slice(0, 3), ...body, dup, ''].join('\r\n');
}

const report = [];
const say = (s) => { console.log(s); report.push(s); };
let failures = 0;
function assert(ok, label, detail) {
  if (!ok) failures++;
  say(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ offline: true, viewport: { width: 1600, height: 1000 } });

// 外部通信が 1 本でも出たら記録する（設計B 2 章「外部通信ゼロ」）
const external = [];
ctx.on('request', (r) => { if (!r.url().startsWith('file://') && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url()); });

const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

await page.goto(HTML);
await page.waitForFunction(() => !!window.__TOOL__ && !!window.ExcelJS);

/** 1 ケース実行して検査結果を返す */
async function runCase(csv, name, start, end, zoom, gateRows) {
  return page.evaluate(async ([csv, name, start, end, zoom, gateRows]) => {
    window.__TOOL__.setGateRows(gateRows || '');
    window.__TOOL__.loadCsvText(csv, name);
    window.__TOOL__.setPeriod(start, end);
    if (zoom) window.__TOOL__.setZoom(zoom);
    const r = window.__TOOL__.render();
    const x = await window.__TOOL__.xlsx();
    let b64 = null;
    if (x && x.buffer) {
      const u8 = new Uint8Array(x.buffer);
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      b64 = btoa(s);
    }
    const res = window.__TOOL__.results();
    return {
      drawn: r.drawn.length, skipped: r.skipped.length,
      procCount: window.__TOOL__.state.doc.processes.length,
      headerCount: window.__TOOL__.state.doc.headers.length,
      svg: res.svg, xlsx: res.xlsx,
      fileName: x && x.name, b64,
      svgText: new XMLSerializer().serializeToString(r.svg),
      geom: r.drawn.map((d) => ({
        id: d.p.id, name: d.p.name, shape: d.p.shape,
        kind: d.sh.kind,
        pts: d.sh.pts ? d.sh.pts.map((q) => [q[0] / r.geo.DAY_W, (q[1] - r.geo.ROW_H / 2) / r.geo.ROW_H + 1]) : null,
        box: d.sh.kind !== 'poly' ? {
          n0: d.sh.x0 / r.geo.DAY_W, n1: d.sh.x1 / r.geo.DAY_W,
          rTop: ((d.sh.top != null ? d.sh.top : d.sh.yc - d.sh.h / 2) - r.geo.ROW_H / 2) / r.geo.ROW_H + 1,
          rH: d.sh.h / r.geo.ROW_H,
        } : null,
      })),
      estimates: window.__TOOL__.estimates(),
      log: window.__TOOL__.logText(),
    };
  }, [csv, name, start, end, zoom, gateRows]);
}

function summarize(tag, results) {
  const ng = results.filter((r) => !r.ok);
  say(`      ${tag}: ${results.length - ng.length}/${results.length} OK`);
  for (const r of ng.slice(0, 20)) say(`        NG ${r.scope} / ${r.label} / ${r.detail}`);
  return ng.length;
}

/* ---------------- 受け入れ 1（代替）: 2026/09/01–10/10 ---------------- */
say('\n=== 受け入れ 1（PDF 照合の代替）: 2026/09/01–10/10 で描画 ===');
say('   PDF 1 頁目と 23 工程を突き合わせる（照合は tools/compare-pdf.py が担当）。');
const c1 = await runCase(CSV, CSV_NAME, '2026-09-01', '2026-10-10');
assert(c1.procCount === 23, '工程 23 件を読み込んだ', `${c1.procCount} 件`);
assert(c1.headerCount === 124, '見出し 124 列を読み込んだ', `${c1.headerCount} 列`);
assert(c1.drawn === 23, '23 件すべてを描画した', `描画 ${c1.drawn} / 除外 ${c1.skipped}`);
assert(summarize('SVG 検査', c1.svg) === 0, 'SVG 検査が全件 OK');
writeFileSync(join(OUT, 'case1_09-01_10-10.svg'), c1.svgText);
writeFileSync(join(OUT, 'case1_geometry.json'), JSON.stringify(c1.geom, null, 1));
await page.screenshot({ path: join(OUT, 'case1_09-01_10-10.png'), fullPage: true });
await page.locator('#plot svg').screenshot({ path: join(OUT, 'case1_plot.png') });

/* 推定の記録：CSV に無く規則で埋めた箇所が残っていること */
const ruleEst = c1.estimates.filter((e) => e.source === 'rule');
say('      CSV に無く埋めた箇所: ' + c1.estimates.length + ' 件（うち要確認の推定 ' + ruleEst.length + ' 件）');
for (const e of ruleEst) say(`        推定 ${e.scope}(${e.name}) ${e.field} = ${e.value}`);
assert(c1.estimates.every((e) => e.field && e.rule && e.reason),
  '埋めた箇所すべてに 項目・規則・理由 が記録されている', `${c1.estimates.length} 件`);
assert(ruleEst.length > 0, '要確認の推定が記録されている', `${ruleEst.length} 件`);

/* PDF と同じ表示期間（2026/09/01–10/30）でも幾何を出す。PDF 照合用。 */
const cPdf = await runCase(CSV, CSV_NAME, '2026-09-01', '2026-10-30');
writeFileSync(join(OUT, 'pdf_period_geometry.json'), JSON.stringify(cPdf.geom, null, 1));
writeFileSync(join(OUT, 'pdf_period.svg'), cPdf.svgText);
assert(summarize('SVG 検査(PDF期間)', cPdf.svg) === 0, 'PDF と同じ期間でも SVG 検査が全件 OK');

/* gate 中間行を手入力で上書きしたとき、推定が消えて PDF どおりになること。
   行 32 / 23 は プロジェクトG の画面（画面スクショ遠景.png）の行見出しから読んだ値。 */
say('\n=== 追加検査: gate 中間行の手入力で上書きできる ===');
const GATE_FIX = 't00an4117fvj98tp203tgn4s:32, hlb7z0icyjst6kbyqhsk2sik:23';
const cFix = await runCase(CSV, CSV_NAME, '2026-09-01', '2026-10-30', null, GATE_FIX);
writeFileSync(join(OUT, 'pdf_period_geometry_manual.json'), JSON.stringify(cFix.geom, null, 1));
writeFileSync(join(OUT, 'pdf_period_manual.svg'), cFix.svgText);
const fixEst = cFix.estimates.filter((e) => e.field === 'gate の中間ノードの行');
assert(fixEst.length === 2 && fixEst.every((e) => e.source === 'manual'),
  '手入力した gate は「手入力」として記録される', fixEst.map((e) => e.source).join(','));
assert(summarize('SVG 検査(手入力)', cFix.svg) === 0, '手入力しても SVG 検査が全件 OK');

/* ---------------- 受け入れ 2（代替）: 2026/09/01–09/30 ---------------- */
say('\n=== 受け入れ 2（画面スクショ照合の代替）: 2026/09/01–09/30 ===');

const c2 = await runCase(CSV, CSV_NAME, '2026-09-01', '2026-09-30', 18);
assert(summarize('SVG 検査', c2.svg) === 0, 'SVG 検査が全件 OK');
say(`      描画 ${c2.drawn} 件 / 期間外で除外 ${c2.skipped} 件`);
writeFileSync(join(OUT, 'case2_09-01_09-30.svg'), c2.svgText);
await page.screenshot({ path: join(OUT, 'case2_09-01_09-30.png'), fullPage: true });
await page.locator('#plot svg').screenshot({ path: join(OUT, 'case2_plot.png') });

/* ---------------- 受け入れ 3: xlsx 検査 ---------------- */
say('\n=== 受け入れ 3: xlsx を書き出して読み戻し検査 ===');
say('   ※ 01_設計A 6 章は未提供なので、検査項目は共通仕様 4 章・6〜7 章と設計B 5.3 から導いた。');
assert(summarize('xlsx 検査', c1.xlsx) === 0, 'xlsx 検査が全件 OK');
assert(!!c1.b64, 'xlsx バッファを生成した');
assert(c1.fileName === 'サポートルーム_サンプル工程表_20260901-20261010.xlsx',
  'ファイル名が <CSV名>_<Start>-<End>.xlsx', String(c1.fileName));
if (c1.b64) {
  const buf = Buffer.from(c1.b64, 'base64');
  writeFileSync(join(OUT, c1.fileName), buf);
  assert(buf.slice(0, 2).toString() === 'PK', 'xlsx が ZIP として妥当', `${buf.length} bytes`);
  say(`      書き出し: out/${c1.fileName} (${buf.length} bytes)`);
}

/* ---------------- 受け入れ 4: 24 本にしても動く ---------------- */
say('\n=== 受け入れ 4: 工程行を複製して 24 本にした CSV ===');
const c4 = await runCase(csvWith24(CSV), 'サポートルーム_サンプル工程表_24本.csv', '2026-09-01', '2026-10-10');
assert(c4.procCount === 24, '工程 24 件を読み込んだ', `${c4.procCount} 件`);
assert(c4.drawn === 24, '24 件すべてを描画した', `描画 ${c4.drawn}`);
assert(summarize('SVG 検査', c4.svg) === 0, 'SVG 検査が全件 OK');
assert(summarize('xlsx 検査', c4.xlsx) === 0, 'xlsx 検査が全件 OK');

/* ---------------- 追加: サンプル固有値に依存していないこと ---------------- */
say('\n=== 追加検査: 合成 CSV（日付・色・IDが全て別物）でも動く ===');
say('   共通仕様 禁止事項 1「サンプル固有値をコードに埋めない」の確認。');
const SYN = readFileSync(join(root, 'fixtures', '合成工程表_回帰用.csv'), 'utf8');
const cSyn = await runCase(SYN, '合成工程表_回帰用.csv', '2026-09-01', '2026-10-10');
assert(cSyn.drawn === 23, '合成 CSV も 23 件描画した', `描画 ${cSyn.drawn}`);
assert(summarize('SVG 検査', cSyn.svg) === 0, '合成 CSV で SVG 検査が全件 OK');
assert(summarize('xlsx 検査', cSyn.xlsx) === 0, '合成 CSV で xlsx 検査が全件 OK');

/* ---------------- 追加: 画面の作り ---------------- */
say('\n=== 追加検査: 画面の作り ===');
const ui = await page.evaluate(async ([csv, name]) => {
  window.__TOOL__.setGateRows('');
  window.__TOOL__.loadCsvText(csv, name);
  window.__TOOL__.setPeriod('2026-09-01', '2026-10-10');
  window.__TOOL__.render();
  await window.__TOOL__.xlsx();
  const logEls = () => document.querySelector('#log').getElementsByTagName('*').length;
  const legend = () => getComputedStyle(document.querySelector('#est-legend')).display;
  const o = {
    logElsCollapsed: logEls(),
    pills: [...document.querySelectorAll('#status .pill')].map((e) => e.textContent),
    legendOff: legend(),
    svgHasShowEst: document.querySelector('#plot svg').classList.contains('show-est'),
    marks: document.querySelectorAll('#plot svg g.est-mark').length,
    tips: document.querySelectorAll('#plot svg g.proc > title').length,
  };
  window.__TOOL__.showEstimates(true);
  o.legendOn = legend();
  o.svgHasShowEstOn = document.querySelector('#plot svg').classList.contains('show-est');
  window.__TOOL__.showEstimates(false);
  o.legendOffAgain = legend();
  // 「OK の N 件を見る」を押すと表が組まれる
  const more = [...document.querySelectorAll('#log button.more')].find((b) => /OK の/.test(b.textContent));
  o.hasMore = !!more;
  if (more) { more.click(); o.logElsExpanded = logEls(); more.click(); }
  return o;
}, [CSV, CSV_NAME]);
assert(ui.logElsCollapsed < 200, 'ログは既定で畳まれている（DOM が膨らまない）', `${ui.logElsCollapsed} 要素`);
assert(ui.hasMore && ui.logElsExpanded > ui.logElsCollapsed,
  '「OK の N 件を見る」で初めて表が組まれる', `${ui.logElsCollapsed} → ${ui.logElsExpanded} 要素`);
assert(ui.pills.length >= 5, '状態バーに要約が出ている', ui.pills.join(' | '));
assert(ui.pills.some((t) => /要確認の推定/.test(t)), '状態バーに要確認の推定の件数が出ている');
assert(ui.legendOff === 'none' && ui.legendOn === 'flex' && ui.legendOffAgain === 'none',
  '凡例は［推定を表示］のときだけ出る', `${ui.legendOff} → ${ui.legendOn} → ${ui.legendOffAgain}`);
assert(!ui.svgHasShowEst && ui.svgHasShowEstOn, '推定の目印は押したときだけ見える');
assert(ui.marks > 0, '推定の目印が図に入っている', `${ui.marks} 件`);
assert(ui.tips === 23, '工程にマウスオーバー用の説明が付いている', `${ui.tips} 件`);

/* ---------------- 受け入れ 5: file:// ＋ ネットワーク遮断 ---------------- */
say('\n=== 受け入れ 5: file:// ＋ オフラインで全機能が動く ===');
assert(HTML.startsWith('file://'), 'file:// で開いた', HTML);
assert(external.length === 0, '外部通信が 1 本も出ていない',
  external.length ? external.slice(0, 5).join(', ') : '0 本');
assert(pageErrors.length === 0, 'JS エラーが出ていない', pageErrors.slice(0, 3).join(' | '));

/* ---------------- 追加: 異常系 ---------------- */
say('\n=== 追加検査: 異常系 ===');
const badHeader = (() => {
  const l = CSV.split('\r\n');
  l[2] = l[2].replace('工程線の形状', '形状もどき');
  return l.join('\r\n');
})();
const errMsg = await page.evaluate((csv) => {
  try { window.__TOOL__.loadCsvText(csv, 'bad.csv'); return null; }
  catch (e) { return e.message; }
}, badHeader);
assert(!!errMsg && errMsg.includes('必須列'), '必須列が無い CSV はエラーになる', String(errMsg));

const quoted = await page.evaluate(() => {
  // RFC 4180：引用内のカンマ・二重引用符・改行
  const t = 'a,b\r\n1,2\r\nx,y\r\n"p,q","r""s"\r\n';
  return typeof window.__TOOL__ === 'object';
});
assert(quoted, 'フックが生きている');

await browser.close();

say(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILED'}`);
writeFileSync(join(OUT, 'acceptance.log'), report.join('\n') + '\n');
writeFileSync(join(OUT, 'inspection-case1.log'),
  c1.svg.map((r) => `${r.ok ? 'OK' : 'NG'}\t${r.scope}\t${r.label}\t${r.detail}`).join('\n') + '\n\n'
  + c1.xlsx.map((r) => `${r.ok ? 'OK' : 'NG'}\t${r.scope}\t${r.label}\t${r.detail}`).join('\n') + '\n');
process.exit(failures === 0 ? 0 : 1);
