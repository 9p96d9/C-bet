/*
 * tools/組み立て.html の検査。
 *
 * 1. 組み立て : src/ の中身を渡して、Node で作った単一 HTML と
 *               1 バイトも違わないことを見る（目印や禁止の並びが
 *               build-html.mjs とズレたらここで落ちる）。
 * 2. 分解     : その単一 HTML を戻して、元の src/ と一致することを見る。
 * 3. 往復     : 分解 → 組み立て で元に戻ることを見る。
 * 4. 門番     : fetch や外部 URL を混ぜたら組み立てを断ることを見る。
 * 5. zip      : 出す zip のエントリに UTF-8 フラグが立っていることを見る。
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const out = [];
const say = (s) => { console.log(s); out.push(s); };
let fails = 0;
const chk = (ok, label, detail = '') => { if (!ok) fails++; say(`${ok ? 'OK' : 'NG'}\t${label}\t${detail}`); };

const PARTS = ['00-holiday.js', '01-csv-model.js', '02-geometry.js', '03-render.js',
  '04-xlsx.js', '05-verify.js', '07-diag.js', '06-ui.js'];
const got = {};
got['shell.html'] = readFileSync(join(root, 'src', 'shell.html'), 'utf8');
for (const p of PARTS) got[p] = readFileSync(join(root, 'src', p), 'utf8');
got['exceljs.min.js'] = readFileSync(join(root, 'vendor', 'exceljs.min.js'), 'utf8');
got['exceljs.LICENSE'] = readFileSync(join(root, 'vendor', 'exceljs.LICENSE'), 'utf8');
const nodeHtml = readFileSync(join(root, 'プロジェクトG_工程表ツール.html'), 'utf8');

const b = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ offline: true });
const ext = [];
ctx.on('request', (r) => { if (!/^(file|blob|data):/.test(r.url())) ext.push(r.url()); });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(pathToFileURL(join(root, 'tools', '組み立て.html')).href);
await page.waitForFunction(() => !!window.__ASM__);

/* ---- 1. 組み立てが Node と一致 ---- */
const built = await page.evaluate((g) => window.__ASM__.assemble(g), got);
chk(built === nodeHtml, 'ブラウザで組み立てた HTML が Node の出力と完全に一致',
  built === nodeHtml ? `${built.length.toLocaleString()} 文字` : `ブラウザ ${built.length} / Node ${nodeHtml.length} 文字`);
if (built !== nodeHtml) {
  let i = 0; while (i < built.length && built[i] === nodeHtml[i]) i++;
  say(`  最初に違うのは ${i} 文字目: ...${JSON.stringify(built.slice(i - 40, i + 40))}`);
}

/* ---- 2. 分解が元の src/ と一致 ---- */
const back = await page.evaluate((h) => window.__ASM__.split(h), nodeHtml);
const byName = Object.fromEntries(back.map((f) => [f.name, f.text]));
chk(back.length === 11, '分解で 11 個のファイルが出てくる', `${back.length} 個: ${back.map((f) => f.name).join(' ')}`);
for (const p of PARTS) {
  const want = got[p];
  const gotBack = byName['src/' + p];
  chk(gotBack === want, `戻した src/${p} が元と一致`,
    gotBack === want ? `${want.length.toLocaleString()} 文字` : `${(gotBack || '').length} / ${want.length} 文字`);
}
chk(byName['src/shell.html'] === got['shell.html'], '戻した src/shell.html が元と一致',
  `${(byName['src/shell.html'] || '').length} / ${got['shell.html'].length} 文字`);
chk(byName['vendor/exceljs.min.js'] === got['exceljs.min.js'], '戻した vendor/exceljs.min.js が元と一致',
  `${(byName['vendor/exceljs.min.js'] || '').length.toLocaleString()} / ${got['exceljs.min.js'].length.toLocaleString()} 文字`);
{
  // ライセンスは /*! … */ の中に ' * ' 付きで入れているので、行末の空白と
  // 末尾の空行は残せない。本文が 1 文字も変わっていないことだけを見る。
  const tidy = (t) => String(t).split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '\n');
  const a = tidy(byName['vendor/exceljs.LICENSE']), b2 = tidy(got['exceljs.LICENSE']);
  chk(a === b2, '戻した vendor/exceljs.LICENSE の本文が元と一致（行末の空白と末尾の空行を除く）',
    a === b2 ? `${b2.length} 文字` : `${a.length} / ${b2.length} 文字`);
}

/* ---- 3. 分解 → 組み立て で往復 ---- */
const round = await page.evaluate((h) => {
  const files = window.__ASM__.split(h);
  const g = {};
  for (const f of files) g[f.name.split('/').pop()] = f.text;
  return window.__ASM__.assemble(g);
}, nodeHtml);
chk(round === nodeHtml, '分解 → 組み立て で元の HTML に戻る',
  round === nodeHtml ? '一致' : `${round.length} / ${nodeHtml.length} 文字`);

/* ---- 4. 門番が効く ---- */
const guards = await page.evaluate((g) => {
  const tryOne = (mutate) => {
    const c = Object.assign({}, g);
    mutate(c);
    try { window.__ASM__.assemble(c); return null; } catch (e) { return e.message; }
  };
  return {
    fetch: tryOne((c) => { c['06-ui.js'] += '\nfunction bad(){ return fetch("x"); }\n'; }),
    url: tryOne((c) => { c['03-render.js'] += '\nvar u = "https://example.com/a.js";\n'; }),
    script: tryOne((c) => { c['04-xlsx.js'] += '\nvar s = "</scr" + "ipt>";\n'.replace('" + "', ''); }),
    noPlace: tryOne((c) => { c['shell.html'] = c['shell.html'].replace('/*__APP__*/', ''); }),
    ok: tryOne(() => {}),
  };
}, got);
chk(!!guards.fetch && /fetch/.test(guards.fetch), 'fetch( を混ぜると組み立てを断る', guards.fetch || '通ってしまった');
chk(!!guards.url, '外部 URL を混ぜると組み立てを断る', guards.url || '通ってしまった');
chk(!!guards.script, '</script を混ぜると組み立てを断る', guards.script || '通ってしまった');
chk(!!guards.noPlace, 'shell.html の差し込み口が無いと断る', guards.noPlace || '通ってしまった');
chk(guards.ok === null, '正しい入力は断らない', guards.ok || '');

/* ---- 5. 出す zip が Windows で文字化けしない形式か ---- */
const zipArr = await page.evaluate(async () => {
  const blob = window.__ASM__.zip([
    { name: 'src/日本語のファイル名.js', text: 'var a = 1;\n' },
    { name: 'vendor/ascii.txt', text: 'hello' },
  ]);
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
});
const zip = Buffer.from(zipArr);
{
  // ローカルヘッダを順に見て、general purpose bit flag に 0x800 が立っているか
  let off = 0, seen = 0, noFlag = 0;
  while (off + 30 <= zip.length && zip.readUInt32LE(off) === 0x04034b50) {
    const flag = zip.readUInt16LE(off + 6);
    const nameLen = zip.readUInt16LE(off + 26);
    const extraLen = zip.readUInt16LE(off + 28);
    const size = zip.readUInt32LE(off + 18);
    const name = zip.slice(off + 30, off + 30 + nameLen).toString('utf8');
    seen++;
    if (!(flag & 0x800)) noFlag++;
    if (seen === 1) chk(name === 'src/日本語のファイル名.js', 'zip の中の日本語名が UTF-8 で往復する', name);
    off += 30 + nameLen + extraLen + size;
  }
  chk(seen === 2, 'zip に 2 つ入っている', `${seen} 個`);
  chk(noFlag === 0, 'zip の全エントリに UTF-8 フラグ（0x800）が立っている', `立っていない ${noFlag} 件`);
  chk(zip.readUInt32LE(off) === 0x02014b50, 'zip の中央ディレクトリが続いている');
}

chk(ext.length === 0, '組み立て.html は外部通信を 1 本も出さない', `${ext.length} 本`);
chk(errs.length === 0, 'JS エラーが出ていない', errs.join(' '));

say('');
say(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
writeFileSync(join(root, 'out', 'assemble-check.log'), out.join('\n') + '\n', 'utf8');
await b.close();
process.exit(fails === 0 ? 0 : 1);
