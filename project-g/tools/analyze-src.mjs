/*
 * src/*.js の「公開している名前」と「他のファイルから借りている名前」を
 * 機械的に洗い出す。
 *
 * 8 つのファイルは 1 つの <script> に連結されるので、全部が同じスコープを
 * 共有する。誰が何を出していて誰が何を使っているのかが見えないと、
 * 1 ファイルだけ切り出してチャット AI に渡したときに事故る。
 * ヘッダーと仕様書はこの出力から作る（手で書くとすぐズレる）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

export const PARTS = [
  '00-holiday.js', '01-csv-model.js', '02-geometry.js', '03-render.js',
  '04-xlsx.js', '05-verify.js', '07-diag.js', '06-ui.js',
];

/** 行コメントと塊コメントと文字列を潰す（名前の検出を邪魔しないように） */
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|\$\{[^}]*\}|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

/**
 * 使っている名前を数えるとき、
 *   obj.state   … プロパティ
 *   { state: 1 }… オブジェクトのキー
 * は「その名前を借りている」ではないので落とす。
 * （ExcelJS の wd.state を UI の state と取り違えていた）
 */
function stripMembers(code) {
  return code
    .replace(/\.\s*[A-Za-z_$][\w$]*/g, '.')
    .replace(/([{,]\s*)[A-Za-z_$][\w$]*\s*:/g, '$1');
}

/** 先頭が字下げされていない宣言＝そのファイルが外に出している名前 */
function declarations(code) {
  const out = [];
  // async function / function* も拾う（拾い漏れると依存が見えなくなる）
  const re = /^(?:const|let|var|class|(?:async\s+)?function\s*\*?)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(code))) out.push(m[1]);
  // 先頭が字下げされていない分割代入も拾う（今は無いが将来のため）
  const re2 = /^const\s*\{([^}]+)\}/gm;
  while ((m = re2.exec(code))) {
    for (const p of m[1].split(',')) {
      const n = p.split(':').pop().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(n)) out.push(n);
    }
  }
  return Array.from(new Set(out));
}

/** ブラウザと言語が最初から持っている名前。依存には数えない */
const BUILTIN = new Set(`
document window navigator screen location console setTimeout clearTimeout setInterval
Math Date JSON Object Array String Number Boolean Set Map RegExp Promise Error Blob URL
Intl isNaN parseInt parseFloat encodeURIComponent decodeURIComponent CSS FileReader
XMLSerializer performance structuredClone Uint8Array ArrayBuffer TextEncoder TextDecoder
getComputedStyle requestAnimationFrame btoa atob ExcelJS undefined NaN Infinity
`.trim().split(/\s+/));

export function analyze() {
  const files = PARTS.map((f) => {
    const raw = readFileSync(join(root, 'src', f), 'utf8');
    const code = strip(raw);
    return { file: f, raw, code, decl: declarations(code) };
  });

  const owner = new Map();            // 名前 → それを宣言したファイル
  for (const f of files) for (const d of f.decl) if (!owner.has(d)) owner.set(d, f.file);

  for (const f of files) {
    const mine = new Set(f.decl);
    const used = new Set();
    const scan = stripMembers(f.code);
    const re = /\b([A-Za-z_$][\w$]*)\b/g;
    let m;
    while ((m = re.exec(scan))) {
      const n = m[1];
      if (mine.has(n) || BUILTIN.has(n)) continue;
      if (owner.has(n)) used.add(n);
    }
    f.uses = {};
    for (const n of Array.from(used).sort()) {
      const from = owner.get(n);
      (f.uses[from] = f.uses[from] || []).push(n);
    }
  }

  // 誰にも使われていない名前＝そのファイルの中だけのもの
  for (const f of files) {
    const usedElsewhere = new Set();
    for (const g of files) {
      if (g.file === f.file) continue;
      for (const names of Object.values(g.uses)) for (const n of names) usedElsewhere.add(n);
    }
    f.exported = f.decl.filter((d) => usedElsewhere.has(d)).sort();
    f.internal = f.decl.filter((d) => !usedElsewhere.has(d)).sort();
    f.lines = f.raw.split('\n').length;
    f.chars = f.raw.length;
  }

  return files;
}

function main() {
  const files = analyze();
  const report = files.map((f) => ({
    file: f.file, lines: f.lines, chars: f.chars,
    exported: f.exported, internal: f.internal, uses: f.uses,
  }));
  writeFileSync(join(root, 'out', 'src-map.json'), JSON.stringify(report, null, 1), 'utf8');

  console.log('ファイル              行   文字  公開  内部  借りている先');
  for (const f of files) {
    const dep = Object.keys(f.uses).map((k) => k.slice(0, 2)).join(',') || '-';
    console.log(`${f.file.padEnd(20)}${String(f.lines).padStart(4)}${String(f.chars).padStart(7)}`
      + `${String(f.exported.length).padStart(6)}${String(f.internal.length).padStart(6)}  ${dep}`);
  }
  console.log('\n--- 公開している名前 ---');
  for (const f of files) {
    console.log(`\n[${f.file}]`);
    console.log('  外に出す: ' + (f.exported.join(' ') || 'なし'));
    for (const [from, names] of Object.entries(f.uses)) {
      console.log(`  ${from} から: ${names.join(' ')}`);
    }
  }
  return report;
}

if (process.argv[1] && process.argv[1].endsWith('analyze-src.mjs')) main();
