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
  '04-xlsx.js', '05-verify.js', '06-ui.js',
];

const excelPath = join(root, 'vendor', 'exceljs.min.js');
if (!existsSync(excelPath)) {
  console.error('vendor/exceljs.min.js がありません');
  process.exit(1);
}
const exceljs = readFileSync(excelPath, 'utf8');
const license = readFileSync(join(root, 'vendor', 'exceljs.LICENSE'), 'utf8');

const app = PARTS.map((f) => readFileSync(join(src, f), 'utf8')).join('\n');

// インライン <script> を壊す並びが混ざっていないこと
for (const [name, body] of [['ExcelJS', exceljs], ['app', app]]) {
  if (/<\/script/i.test(body) || /<!--/.test(body)) {
    console.error(`${name} に <script> を壊す並びがあります`);
    process.exit(1);
  }
}

const banner = [
  '/*!',
  ' * ExcelJS 4.4.0 (MIT) — https://github.com/exceljs/exceljs',
  ...license.trim().split('\n').map((l) => ' * ' + l),
  ' */',
].join('\n');

let html = readFileSync(join(src, 'shell.html'), 'utf8');
html = html.replace('/*__EXCELJS__*/', () => banner + '\n' + exceljs);
html = html.replace('/*__APP__*/', () => app);

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
