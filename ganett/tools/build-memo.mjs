/* docs/memo-body.md のプレースホルダに、コード全文と検査ログを差し込む。 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8').replace(/\s+$/, '');

const insp = read('out', 'inspection-case1.log').split('\n');
// 工程 1 本ぶん（P0001）＋ 形状ごとに代表 1 本＋格子＋xlsx を抜粋
const pick = [];
const seen = new Set();
for (const l of insp) {
  const id = l.split('\t')[1];
  if (id === 'P0001' || id === '格子' || id === 'xlsx') { pick.push(l); continue; }
  if (!seen.has(id) && seen.size < 6 && /^P00(0[5-9]|1[0-9]|2[0-3])$/.test(id)) {
    seen.add(id);
    pick.push(...insp.filter((x) => x.split('\t')[1] === id).slice(0, 5), '  ...');
  }
}

const MAP = {
  __INSPECTION_HEAD__: pick.join('\n'),
  __OPENPYXL_LOG__: read('out', 'inspection-openpyxl.log'),
  __PDF_COMPARE_LOG__: read('out', 'pdf-compare.log'),
  __PDF_COMPARE_MANUAL_LOG__: read('out', 'pdf-compare-manual.log'),
  __HOLIDAY_LOG__: read('out', 'holiday-test.log').split('\n').slice(0, 20).join('\n'),
  __TOOL_HOLIDAYTEST__: read('tools', 'holiday-test.mjs'),
  __ACCEPTANCE_LOG__: read('out', 'acceptance.log'),
  __SRC_SHELL__: read('src', 'shell.html'),
  __SRC_00__: read('src', '00-holiday.js'),
  __SRC_01__: read('src', '01-csv-model.js'),
  __SRC_02__: read('src', '02-geometry.js'),
  __SRC_03__: read('src', '03-render.js'),
  __SRC_04__: read('src', '04-xlsx.js'),
  __SRC_05__: read('src', '05-verify.js'),
  __SRC_06__: read('src', '06-ui.js'),
  __TOOL_BUILD__: read('tools', 'build-html.mjs'),
  __TOOL_FIXTURE__: read('tools', 'make-fixture.mjs'),
  __TOOL_ACCEPT__: read('tools', 'acceptance.mjs'),
  __TOOL_OPENPYXL__: read('tools', 'verify-xlsx-independent.py'),
  __TOOL_SVGSHOT__: read('tools', 'svgshot.mjs'),
  __TOOL_PDFEXTRACT__: read('tools', 'pdf-extract.py'),
  __TOOL_COMPARE__: read('tools', 'compare-pdf.py'),
};

let md = read('docs', 'memo-body.md');
// 本文に残った差し込み口だけを見る。差し込んだコード自身に含まれる
// __GANETT__ や /*__EXCELJS__*/ を誤検出しないよう、置換前に数える。
for (const k of Object.keys(MAP)) {
  if (!md.includes(k)) { console.error(`プレースホルダ ${k} が本文に無い`); process.exit(1); }
}
for (const [k, v] of Object.entries(MAP)) md = md.replace(k, () => v);
const left = Object.keys(MAP).filter((k) => md.includes(k));
if (left.length) { console.error('未置換のプレースホルダ: ' + left.join(', ')); process.exit(1); }

const out = join(root, '設計B_実装メモ.md');
writeFileSync(out, md + '\n', 'utf8');
console.log(`built ${out} (${(Buffer.byteLength(md, 'utf8') / 1024).toFixed(0)} KB, ${md.split('\n').length} lines)`);
