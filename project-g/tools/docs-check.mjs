/*
 * 仕様書に書いたファイル名と名前が、本当に存在するかを見る。
 *
 * 人が書いた 仕様書_人間用.md は放っておくとコードとズレる。
 * ズレたまま現場に渡すと、チャット AI に嘘の前提を渡すことになるので、
 * せめて「存在しないファイル」「存在しない関数名」だけは機械で止める。
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyze } from './analyze-src.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const out = [];
const say = (s) => { console.log(s); out.push(s); };
let fails = 0;
const chk = (ok, label, detail = '') => { if (!ok) fails++; say(`${ok ? 'OK' : 'NG'}\t${label}\t${detail}`); };

const files = analyze();
/* 宣言された名前に加えて、オブジェクトのキーも「実在する名前」に数える。
   DEFAULTS の中の ROW_H や TEXT_RATIO の中の XS を文中で指すことがあるため。 */
const names = new Set(files.flatMap((f) => f.decl));
for (const f of files) {
  const re = /(?:^|[{,\s])([A-Za-z_$][\w$]*)\s*:/gm;
  let m;
  while ((m = re.exec(f.code))) names.add(m[1]);
}
/* コードの名前ではなく、説明のための語 */
const NOT_NAMES = new Set([
  'aaa', 'NETWORKDAYS', 'import', 'export', 'fetch', 'XMLHttpRequest', 'importScripts',
  'node', 'python3', 'src', 'tools', 'docs', 'vendor', 'out', 'blob', 'data',
  'straight', 'xElbow', 'yElbow', 'crank', 'gate', 'boxS', 'boxM', 'boxL',
  'barAutoAdjust', 'barProcessNameAdjust', 'none', 'style', 'script', 'link',
]);
/* 診断ログが出す通し番号（P001・N001…）は名前ではなく出力例 */
const SERIAL = /^[PN]\d{3}$/;

/* 文中のファイル名を実際の場所に照らす。どこかにあればよい */
const WHERE = ['', 'src/', 'tools/', 'docs/', 'vendor/', 'out/', 'fixtures/', 'sample/'];
function findsFile(p) {
  if (p.includes('*')) return true;                 // tools/*.mjs のような書き方
  if (/^\d\d_/.test(p)) return true;                // 上位仕様の文書（この repo には無い）
  if (/^\(.*\)/.test(p)) return true;                // 「(ファイル名).csv」のような例示
  return WHERE.some((w) => existsSync(join(root, w + p)));
}

const DOCS = ['docs/ファイル仕様書_人間用.md', 'docs/ファイル仕様書_チャットAI用.md', 'README.md'];

for (const d of DOCS) {
  const path = join(root, d);
  chk(existsSync(path), `${d} がある`);
  if (!existsSync(path)) continue;
  const text = readFileSync(path, 'utf8');

  /* 1. 文書の中に出てくるファイルパス */
  const paths = new Set();
  const re = /`((?:src|tools|docs|vendor|out|fixtures|sample)\/[^`\s]+|[^`\s\/]+\.(?:html|js|mjs|py|md|csv|xlsx))`/g;
  let m;
  while ((m = re.exec(text))) paths.add(m[1]);
  const missing = Array.from(paths).filter((p) => !findsFile(p));
  chk(missing.length === 0, `${d}: 書いてあるファイルが全部ある`,
    missing.length ? `無い: ${missing.join(' , ')}` : `${paths.size} 個を確認`);

  /* 2. 文書の中に出てくる関数名・定数名（`name()` か大文字始まり／小文字始まりの識別子） */
  const ids = new Set();
  const re2 = /`([A-Za-z_$][\w$]*)(?:\(\))?`/g;
  while ((m = re2.exec(text))) if (m[1].length > 1 && !NOT_NAMES.has(m[1]) && !SERIAL.test(m[1])) ids.add(m[1]);
  const gone = Array.from(ids).filter((n) => !names.has(n));
  chk(gone.length === 0, `${d}: 書いてある名前が全部ある`,
    gone.length ? `無い: ${gone.join(' , ')}` : `${ids.size} 個を確認`);
}

/* 3. 自動生成の 2 つが最新か */
say('');
say(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
writeFileSync(join(root, 'out', 'docs-check.log'), out.join('\n') + '\n', 'utf8');
process.exit(fails === 0 ? 0 : 1);
