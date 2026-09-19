/*
 * src/*.js の先頭に「自動生成ヘッダー」を入れ直す。
 *
 * 1 ファイルだけチャット AI に渡したとき、AI が前後関係を推測しなくて
 * 済むようにするための案内板。中身は tools/analyze-src.mjs が実際の
 * コードから機械的に割り出すので、手で書いたものと違ってズレない。
 *
 *   node tools/gen-headers.mjs        書き換える
 *   node tools/gen-headers.mjs --check 変わるかどうかだけ見る（CI 用）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyze, PARTS } from './analyze-src.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const BEGIN = '/* ===== この下は自動生成（node tools/gen-headers.mjs）。手で直さない =====';
const END = ' * ===== 自動生成ここまで ===================================================== */';

/* 1 行の役割説明だけは人が書く。ここが唯一の手書き箇所。 */
const ROLE = {
  '00-holiday.js': '土日と日本の祝日を判定する。日付の計算はここが土台',
  '01-csv-model.js': 'CSV を読んで Document（工程の配列）にする。CSV に無い値の穴埋めもここ',
  '02-geometry.js': '日付と行番号を px 座標に直し、形状ごとの折れ方を決める',
  '03-render.js': '02 の座標を SVG の要素に変換して画面に出す',
  '04-xlsx.js': 'Document から xlsx を組み立てる（業者に渡す本体）',
  '05-verify.js': '描いた SVG と書いた xlsx を読み戻して検査する',
  '07-diag.js': '中身を伏せたまま原因を追える診断ログを作る',
  '06-ui.js': 'ボタン・入力欄・進行状況。他の全部をここから呼ぶ',
};

/* 「触ると見た目が変わる値」＝ 先頭字下げなしの const で、中身が数値・
   文字列・それらだけのオブジェクト。関数やクラスは含めない。 */
function tunables(raw) {
  const out = [];
  const re = /^const\s+([A-Za-z_$][\w$]*)\s*=\s*([^\n;]+)/gm;
  let m;
  while ((m = re.exec(raw))) {
    const name = m[1];
    if (!/^[A-Z]/.test(name)) continue;   // 小文字始まりは可変の状態や道具。調整値ではない
    const v = m[2].trim();
    if (/^(?:function|\(|async|class|new\s)/.test(v)) continue;
    if (/=>/.test(v)) continue;
    if (/^-?\d/.test(v) || /^['"`]/.test(v)) out.push(`${name}=${v.replace(/,$/, '')}`);
    else if (v === '{') out.push(`${name}{…}`);
    else if (/^\{/.test(v)) out.push(`${name}{…}`);
    else if (/^\[/.test(v)) out.push(`${name}[…]`);
  }
  return out;
}

function wrap(label, items, width = 72) {
  if (!items.length) return [` * ${label ? label + ': ' : '  '}なし`];
  const lines = [];
  let cur = '';
  for (const it of items) {
    if (cur && (cur + ' ' + it).length > width) { lines.push(cur); cur = ''; }
    cur = cur ? cur + ' ' + it : it;
  }
  if (cur) lines.push(cur);
  if (!label) return lines.map((l) => ` *   ${l}`);
  const pad = ' '.repeat(label.length + 2);
  return lines.map((l, i) => ` * ${i === 0 ? label + ': ' : pad}${l}`);
}

function buildHeader(f, i, files, bodyLines) {
  const n = files.length;
  const prev = i > 0 ? files[i - 1].file : 'なし（先頭）';
  const next = i < n - 1 ? files[i + 1].file : 'なし（末尾）';

  // この名前を誰が使っているか
  const userOf = new Map();
  for (const g of files) {
    for (const [from, names] of Object.entries(g.uses)) {
      if (from !== f.file) continue;
      for (const nm of names) {
        if (!userOf.has(nm)) userOf.set(nm, []);
        userOf.get(nm).push(g.file.slice(0, 2));
      }
    }
  }
  const pub = f.exported.map((nm) => `${nm}→${(userOf.get(nm) || []).join(',')}`);

  const L = [BEGIN];
  L.push(` * ファイル: ${f.file}    読み込み順 ${i + 1} / ${n}    ${bodyLines} 行（この案内板を除く）`);
  L.push(` * 役割    : ${ROLE[f.file] || '（未記入）'}`);
  L.push(` * 前      : ${prev}`);
  L.push(` * 後      : ${next}`);
  L.push(' *');
  L.push(' * 【このファイルが他から借りている名前】');
  const deps = Object.entries(f.uses);
  if (!deps.length) L.push(' *   なし。このファイルだけで完結する');
  else for (const [from, names] of deps) L.push(...wrap(`  ${from}`, names));
  L.push(' *');
  L.push(' * 【このファイルが出していて、他が使っている名前】');
  if (pub.length) {
    L.push(...wrap('', pub));
    L.push(' *   ※ → の右は、その名前を使っているファイルの番号');
  } else L.push(' *   なし（他から呼ばれない）');
  const t = tunables(f.raw);
  if (t.length) {
    L.push(' *');
    L.push(' * 【触ると見た目・動きが変わる値】');
    L.push(...wrap('', t));
  }
  L.push(' *');
  L.push(' * 名前を変える・消すときは、上の「他が使っている名前」に載っている');
  L.push(' * ものだけ注意すればよい。載っていない名前はこのファイルの中だけの話。');
  L.push(END);
  return L.join('\n') + '\n\n';
}

function stripOld(raw) {
  const i = raw.indexOf(BEGIN);
  if (i < 0) return raw;
  const j = raw.indexOf(END, i);
  if (j < 0) return raw;
  return raw.slice(0, i) + raw.slice(j + END.length).replace(/^\n+/, '');
}

const check = process.argv.includes('--check');
const files = analyze();
let changed = 0;
for (let i = 0; i < files.length; i++) {
  const f = files[i];
  const path = join(root, 'src', f.file);
  const body = stripOld(readFileSync(path, 'utf8'));
  const next = buildHeader(f, i, files, body.trimEnd().split('\n').length) + body;
  const now = readFileSync(path, 'utf8');
  if (next === now) { console.log(`   そのまま  ${f.file}`); continue; }
  changed++;
  if (check) console.log(`!! 要更新   ${f.file}`);
  else { writeFileSync(path, next, 'utf8'); console.log(`=> 書き直し ${f.file}`); }
}
console.log(check
  ? (changed ? `${changed} ファイルのヘッダーが古い（node tools/gen-headers.mjs で更新）` : 'ヘッダーは最新')
  : `${changed} ファイルを更新`);
process.exit(check && changed ? 1 : 0);
