/*
 * src/*.js と src/shell.html から単一 HTML を組み立てる。
 * CDN 参照は作らない。ExcelJS はインライン同梱する。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = join(root, 'src');

const PARTS = [
  '00-holiday.js',
  '01-csv-model.js', '02-geometry.js', '03-render.js',
  '04-xlsx.js', '05-verify.js', '07-diag.js', '06-ui.js',
];

const excelPath = join(root, 'vendor', 'exceljs.min.js');
if (!existsSync(excelPath)) {
  console.error('vendor/exceljs.min.js がありません');
  process.exit(1);
}
const exceljs = readFileSync(excelPath, 'utf8');
const license = readFileSync(join(root, 'vendor', 'exceljs.LICENSE'), 'utf8');

/* 目印。単一 HTML から src/*.js を取り出し直すために入れる（tools/組み立て.html）。
   ここを変えたら 組み立て.html の同じ文字列も変えること
   （tools/assemble-check.mjs が食い違いを見つける）。 */
const MARK = (name) => `/*[[FILE:${name}]]*/`;
const VENDOR_BEGIN = '/*[[VENDOR-BEGIN]]*/';
const VENDOR_END = '/*[[VENDOR-END]]*/';
const APP_BEGIN = '/*[[APP-BEGIN]]*/';
const APP_END = '/*[[APP-END]]*/';

const app = PARTS.map((f) => MARK(f) + '\n' + readFileSync(join(src, f), 'utf8')).join('\n');

// インライン <script> を壊す並びが混ざっていないこと
for (const [name, body] of [['ExcelJS', exceljs], ['app', app]]) {
  if (/<\/script/i.test(body) || /<!--/.test(body)) {
    console.error(`${name} に <script> を壊す並びがあります`);
    process.exit(1);
  }
}

/* ライセンス本文の始まりにも目印を置く。こうしておくと 組み立て.html が
   vendor/exceljs.LICENSE をそのまま取り出せる（勘で切り出さなくて済む）。 */
const LICENSE_MARK = ' * [[LICENSE]]';
const banner = [
  '/*!',
  ' * ExcelJS 4.4.0 (MIT) — https://github.com/exceljs/exceljs',
  LICENSE_MARK,
  ...license.trim().split('\n').map((l) => (' * ' + l).replace(/\s+$/, '')),
  ' */',
].join('\n');

let html = readFileSync(join(src, 'shell.html'), 'utf8');
html = html.replace('/*__EXCELJS__*/',
  () => `${banner}\n${VENDOR_BEGIN}\n${exceljs}\n${VENDOR_END}`);
html = html.replace('/*__APP__*/', () => `${APP_BEGIN}\n${app}\n${APP_END}`);

// 外部通信につながる書き方が残っていないこと（設計B 2 章）
const app_and_shell = app + readFileSync(join(src, 'shell.html'), 'utf8');
const banned = [
  [/\bfetch\s*\(/, 'fetch('],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/\bimportScripts\b/, 'importScripts'],
  // XML 名前空間 URI（取得されない識別子）だけは許す
  [/https?:\/\/(?!www\.w3\.org\/)/, 'http(s) URL'],
  [/<script[^>]+\bsrc=/i, 'script src'],
  [/<link[^>]+\bhref=/i, 'link href'],
  [/@import/, '@import'],
];
let ng = 0;
for (const [re, label] of banned) {
  if (re.test(app_and_shell)) { console.error(`自前コードに ${label} があります`); ng++; }
}
if (ng) process.exit(1);

const out = join(root, 'プロジェクトG_工程表ツール.html');
writeFileSync(out, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(`built ${out} (${kb} KB)`);

/* -------------------------------------------------------------------
 * 開発用.html
 *
 * 納品する単一 HTML は 100 万文字あるので、その中の 1 行を直すのは
 * つらい。開発用.html は同じ shell.html を使いながら、中身を
 * src/*.js から <script src> で読む。src/ のファイルを直して
 * ブラウザを再読み込みすれば、組み立て直さずに結果が見える。
 *
 * <script src> は file:// でも読める（ES モジュールは CORS で読めない）。
 * 連結したときと同じく全部が 1 つのスコープを共有するので、
 * 単一 HTML との差は「どこから読むか」だけになる。
 * ------------------------------------------------------------------- */
const devTags = ['../vendor/exceljs.min.js', ...PARTS.map((f) => '../src/' + f)]
  .map((p) => `<script src="${p}"></script>`).join('\n');
let dev = readFileSync(join(src, 'shell.html'), 'utf8');
dev = dev.replace('<title>', '<title>【開発用】');
dev = dev.replace('<span class="note">ステップ 1（往路）／ 外部通信なし</span>',
  '<span class="note" style="color:#b42318;font-weight:bold">開発用（src/ を直接読んでいます）</span>');
dev = dev.replace('<script>/*__EXCELJS__*/</script>\n<script>/*__APP__*/</script>', devTags);
if (dev.includes('__EXCELJS__') || dev.includes('__APP__')) {
  console.error('shell.html の <script> の並びが変わったので 開発用.html を作れません');
  process.exit(1);
}
const devOut = join(root, 'tools', '開発用.html');
writeFileSync(devOut, dev, 'utf8');
console.log(`built ${devOut}`);
