/*
 * ファイル仕様書（チャットAI用）を作る。
 *
 * 手で書いた仕様書は 2 週間でコードとズレる。読む相手がチャット AI なら
 * ズレは致命的なので、中身は全部コードから機械的に取り出す。
 * 人が書くのは ROLE（1 行の役割）と HOWTO（困りごと → 触る場所）だけで、
 * HOWTO に出てくる名前は実在するかどうかをここで必ず確かめる。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyze } from './analyze-src.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const ROLE = {
  '00-holiday.js': '土日と日本の祝日を判定する',
  '01-csv-model.js': 'CSV を読んで Document（工程の配列）にする。CSV に無い値の穴埋めもここ',
  '02-geometry.js': '日付と行番号を px 座標に直し、形状ごとの折れ方を決める',
  '03-render.js': '02 の座標を SVG の要素に変換して画面に出す',
  '04-xlsx.js': 'Document から xlsx を組み立てる',
  '05-verify.js': '描いた SVG と書いた xlsx を読み戻して検査する',
  '07-diag.js': '中身を伏せたまま原因を追える診断ログを作る',
  '06-ui.js': 'ボタン・入力欄・進行状況。他の全部をここから呼ぶ',
};

/* 困りごと → 触るファイルと名前。ここだけが手書き。
   name に書いた名前が実在しなければ、このツールは止まる。 */
const HOWTO = [
  ['日付の列の幅を変えたい', '02-geometry.js', ['DEFAULTS']],
  ['1 行の高さを変えたい', '02-geometry.js', ['DEFAULTS']],
  ['図形の高さ（バー１〜６の太さ）を変えたい', '02-geometry.js', ['H_RATIO']],
  ['折れ角の丸みを変えたい', '02-geometry.js', ['CORNER_R_PT']],
  ['斜めの線の寝かせ方を変えたい', '02-geometry.js', ['SLANT_COLS']],
  ['工程線名の文字の大きさを変えたい', '02-geometry.js', ['TEXT_RATIO']],
  ['形状の種類を足したい（新しい折れ方）', '02-geometry.js', ['SHAPE_RULES', 'SHAPE_KIND', 'shapeOf']],
  ['工程線の色や太さの既定値を変えたい', '01-csv-model.js', ['DEFAULT_LINE_COLOR', 'DEFAULT_WEIGHT']],
  ['gate の中間ノードの行の決め方を変えたい', '01-csv-model.js', ['gateRowByRule', 'GATE_RULE_TEXT']],
  ['CSV の列名が違う工程表に対応したい', '01-csv-model.js', ['COL', 'REQUIRED_COLS']],
  ['祝日の扱いを変えたい（会社の休みを足すなど）', '00-holiday.js', ['isNonWorkingDay', 'isPublicHoliday']],
  ['休日の色（灰色）を変えたい', '03-render.js', ['HOLIDAY_FILL']],
  ['格子の線の色を変えたい', '03-render.js', ['GRID_COLOR']],
  ['ノードの丸の大きさを変えたい', '03-render.js', ['NODE_R']],
  ['矢印の形を変えたい', '03-render.js', ['markerId', 'render']],
  ['xlsx の列の並びを変えたい', '04-xlsx.js', ['buildWorkbook']],
  ['xlsx の条件付き書式を変えたい', '04-xlsx.js', ['buildWorkbook']],
  ['検査の項目を足したい', '05-verify.js', ['verifySvg', 'verifyXlsx']],
  ['診断ログに入れる／入れない物を変えたい', '07-diag.js', ['buildDiagnosticText']],
  ['ボタンや入力欄を足したい', '06-ui.js', ['shell.html も直す']],
  ['画面の色や字の大きさを変えたい', 'src/shell.html', ['<style> の中']],
];

/** 先頭字下げなしの関数と、その直前のコメント 1 つ */
function functions(raw) {
  const out = [];
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:(async)\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/.exec(lines[i]);
    if (!m) continue;
    // 直前の /** … */ か // 行を 1 つだけ拾う
    let doc = '';
    for (let k = i - 1; k >= 0 && k >= i - 6; k--) {
      const l = lines[k].trim();
      if (!l) break;
      if (/^\/\*\*(.*)\*\/$/.test(l)) { doc = l.replace(/^\/\*\*\s*/, '').replace(/\s*\*\/$/, ''); break; }
      if (/^\/\//.test(l)) { doc = l.replace(/^\/\/\s*/, ''); break; }
      if (/^\*\//.test(l)) {                       // 複数行コメントの最後の行
        for (let j = k - 1; j >= 0 && j >= k - 12; j--) {
          const t = lines[j].trim().replace(/^\*\s?/, '');
          if (/^\/\*/.test(lines[j].trim())) break;
          if (t && !/^-+$/.test(t) && !/^=+$/.test(t)) { doc = t; break; }
        }
        break;
      }
      break;
    }
    out.push({ name: m[2], args: m[3].replace(/\s+/g, ' ').trim(), async: !!m[1], doc, line: i + 1 });
  }
  return out;
}

const files = analyze();
const byFile = Object.fromEntries(files.map((f) => [f.file, f]));
const allNames = new Set(files.flatMap((f) => f.decl));

/* HOWTO に書いた名前が本当にあるか */
const missing = [];
for (const [what, file, names] of HOWTO) {
  for (const n of names) {
    if (/[ <]/.test(n)) continue;                  // 「shell.html も直す」のような案内文
    if (!allNames.has(n)) missing.push(`${what} → ${file} の ${n}`);
  }
}
if (missing.length) {
  console.error('仕様書の「困りごと → 触る場所」に、実在しない名前があります:');
  for (const m of missing) console.error('  ' + m);
  process.exit(1);
}

/* 誰がその名前を使っているか */
const userOf = new Map();
for (const g of files) {
  for (const [from, names] of Object.entries(g.uses)) {
    for (const n of names) {
      if (!userOf.has(n)) userOf.set(n, []);
      userOf.get(n).push(g.file);
    }
  }
}

const L = [];
const w = (s = '') => L.push(s);
const today = new Date().toISOString().slice(0, 10);

w('# ファイル仕様書（チャット AI に渡す用）');
w();
w(`自動生成：\`node tools/build-spec.mjs\`　／　生成日 ${today}`);
w();
w('この文書は **手で書いていません**。`src/*.js` の中身から機械的に作っています。');
w('コードを直したら作り直してください。直さずに書き換えると、コードとズレます。');
w();
w('---');
w();
w('## 0. まず読む：このツールの構造');
w();
w('納品する `プロジェクトG_工程表ツール.html` は 1 枚の HTML ですが、');
w('中身は **8 つの JS ファイルを順番に連結しただけ** です。');
w('8 つは `<script>` 1 つの中に並ぶので、**全部が同じスコープを共有**します。');
w('`import` も `export` もありません。前のファイルで作った名前を、後のファイルがそのまま使います。');
w();
w('```');
w(files.map((f, i) => `${String(i + 1).padStart(2)}. ${f.file}`).join('\n'));
w('```');
w();
w('### チャット AI に 1 ファイルだけ渡すときの言い方');
w();
w('```');
w('これは 1 枚の HTML に連結される JS の一部です。');
w('import/export はありません。ファイルの先頭にある「自動生成」の枠に、');
w('このファイルが他から借りている名前と、他に使われている名前が書いてあります。');
w('・借りている名前は「すでに存在する」ものとして扱ってください（定義し直さないでください）。');
w('・他に使われている名前は、名前も引数も変えないでください。');
w('・新しい外部ライブラリ、fetch、import、URL は使えません（オフラインで動く必要があります）。');
w('・ES モジュール構文（import/export）は使えません。');
w('直してほしいのは次のところです：（ここに用件）');
w('```');
w();
w('### 直したあと');
w();
w('1. `tools/開発用.html` をブラウザで開く（`src/` を直接読みます。組み立て不要）');
w('2. CSV を読ませて［描画］→［xlsx 書き出し］まで通ることを見る');
w('3. 画面下のログに **NG が 1 つも無い**ことを見る（機械検査が自動で走ります）');
w('4. `tools/組み立て.html` で 1 枚の HTML に戻す');
w();
w('---');
w();
w('## 1. どこを触ればいいか（困りごと → 場所）');
w();
w('| やりたいこと | ファイル | 名前 |');
w('| --- | --- | --- |');
for (const [what, file, names] of HOWTO) w(`| ${what} | \`${file}\` | ${names.map((n) => /[ <]/.test(n) ? n : '`' + n + '`').join(' / ')} |`);
w();
w('---');
w();
w('## 2. 一覧');
w();
w('| # | ファイル | 行 | 役割 | 借りる | 使われる |');
w('| --- | --- | --- | --- | --- | --- |');
files.forEach((f, i) => {
  const dep = Object.keys(f.uses).map((k) => k.slice(0, 2)).join(' ') || '—';
  const used = files.filter((g) => g.uses[f.file]).map((g) => g.file.slice(0, 2)).join(' ') || '—';
  w(`| ${i + 1} | \`${f.file}\` | ${f.lines} | ${ROLE[f.file]} | ${dep} | ${used} |`);
});
w();
w('「借りる」「使われる」はファイル名の先頭 2 桁です。');
w();
w('---');
w();

files.forEach((f, i) => {
  w(`## 3.${i + 1} \`${f.file}\``);
  w();
  w(`**役割**　${ROLE[f.file]}`);
  w();
  w(`**読み込み順**　${i + 1} / ${files.length}　（${f.lines} 行 / ${f.chars.toLocaleString()} 文字）`);
  w();

  const deps = Object.entries(f.uses);
  w('**このファイルが他から借りている名前**');
  w();
  if (!deps.length) w('なし。このファイルだけで完結します。');
  else {
    w('| 借りる先 | 名前 |');
    w('| --- | --- |');
    for (const [from, names] of deps) w(`| \`${from}\` | ${names.map((n) => '`' + n + '`').join(' ')} |`);
  }
  w();

  w('**他のファイルが使っている名前（勝手に変えてはいけない）**');
  w();
  if (!f.exported.length) w('なし。このファイルの中身は他から呼ばれません。');
  else {
    w('| 名前 | 使っているファイル |');
    w('| --- | --- |');
    for (const n of f.exported) w(`| \`${n}\` | ${(userOf.get(n) || []).map((x) => '`' + x + '`').join(' ')} |`);
  }
  w();

  if (f.internal.length) {
    w('**このファイルの中だけの名前（自由に変えてよい）**');
    w();
    w(f.internal.map((n) => '`' + n + '`').join(' 、 '));
    w();
  }

  const fns = functions(f.raw);
  if (fns.length) {
    w('**関数**');
    w();
    w('| 関数 | 何をするか | 行 |');
    w('| --- | --- | --- |');
    for (const fn of fns) {
      const out = f.exported.includes(fn.name) ? '外' : '内';
      w(`| \`${fn.async ? 'async ' : ''}${fn.name}(${fn.args})\` ${out} | ${(fn.doc || '').replace(/\|/g, '\\|') || '—'} | ${fn.line} |`);
    }
    w();
    w('「外」＝他のファイルから呼ばれる。「行」はこのファイルの先頭からの行数（自動生成の枠を含む）。');
    w();
  }
  w('---');
  w();
});

w('## 4. 触ってはいけないこと');
w();
w('| だめなこと | なぜ |');
w('| --- | --- |');
w('| `import` / `export` を書く | `file://` では CORS で読めません。8 つは連結される前提です |');
w('| `fetch` / `XMLHttpRequest` を書く | 外部通信ゼロが要件です。`tools/組み立て.html` が組み立てを断ります |');
w('| `http://` `https://` で始まる文字列を書く | 同上（`www.w3.org` の名前空間だけは例外） |');
w('| `<script src=` `<link href=` `@import` を書く | 同上 |');
w('| コードの中に `</script` と書く | 1 枚に入れたとき、そこで HTML が切れます |');
w('| 他のファイルが使っている名前を変える／消す | 連結した先で落ちます。上の表を見てください |');
w('| 列番号で CSV を読む | 列の並びは変わります。列名（`COL`）で引いてください |');
w();
w('## 5. この仕様書の作り方');
w();
w('```');
w('node tools/analyze-src.mjs    # 依存と公開名を数える（out/src-map.json）');
w('node tools/gen-headers.mjs    # src/*.js の先頭の枠を書き直す');
w('node tools/build-spec.mjs     # この文書を作り直す');
w('node tools/build-html.mjs     # 1 枚の HTML と 開発用.html を作る');
w('```');
w();

const outPath = join(root, 'docs', 'ファイル仕様書_チャットAI用.md');
writeFileSync(outPath, L.join('\n'), 'utf8');
console.log(`built ${outPath} (${L.join('\n').length.toLocaleString()} 文字 / ${L.length} 行)`);
