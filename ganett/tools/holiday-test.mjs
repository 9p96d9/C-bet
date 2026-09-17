/*
 * 祝日計算の検査。
 *  1. PDF と CSV から確定した 2026 年の 4 日を含むこと
 *  2. 振替休日・国民の休日が法律どおりの条件でしか出ないこと
 *  3. 本物のサンプル 23 工程の `休日` 列と完全に一致すること
 *  4. 2024〜2030 の一覧を出す（監査用。実装メモに載せる）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = readFileSync(join(root, 'src', '00-holiday.js'), 'utf8');
// 00-holiday.js は素の <script> 用なので、そのまま評価して関数を取り出す
const api = new Function(src + `
  return { holidaysOfYear, holidayName, isPublicHoliday, isWeekend,
           isNonWorkingDay, countNonWorking, nonWorkingReason, holidayRangeWarning };
`)();

const out = [];
let fails = 0;
const say = (s) => { console.log(s); out.push(s); };
function chk(ok, label, detail = '') {
  if (!ok) fails++;
  say(`${ok ? 'OK' : 'NG'}\t${label}\t${detail}`);
}

const D = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const fmt = (k) => String(k).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
const WD = '日月火水木金土';

/* ---- 1. PDF・CSV から確定した 2026 年の祝日 ---- */
for (const [m, d, name] of [[9, 21, '敬老の日'], [9, 22, '国民の休日'], [9, 23, '秋分の日'], [10, 12, 'スポーツの日']]) {
  chk(api.holidayName(D(2026, m, d)) === name,
    `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} が ${name}`,
    String(api.holidayName(D(2026, m, d))));
}

/* ---- 2. 振替休日・国民の休日の条件 ---- */
let subNg = 0, natNg = 0, dupNg = 0;
for (let y = 2007; y <= 2040; y++) {
  const m = api.holidaysOfYear(y);
  const keys = Array.from(m.keys());
  if (new Set(keys).size !== keys.length) dupNg++;
  for (const [k, name] of m) {
    const yy = Math.floor(k / 10000), mo = Math.floor(k / 100) % 100, dd = k % 100;
    const day = D(yy, mo, dd);
    if (name === '振替休日') {
      // 直前に「日曜の祝日」があり、その間が全部祝日であること
      let t = new Date(day.getTime() - 86400000);
      while (m.has(t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate())
             && t.getUTCDay() !== 0) t = new Date(t.getTime() - 86400000);
      if (t.getUTCDay() !== 0) subNg++;
    }
    if (name === '国民の休日') {
      const prev = new Date(day.getTime() - 86400000), next = new Date(day.getTime() + 86400000);
      if (!api.isPublicHoliday(prev) || !api.isPublicHoliday(next) || day.getUTCDay() === 0) natNg++;
    }
  }
}
chk(dupNg === 0, '同じ日が二重に登録されていない', `${dupNg} 年で重複`);
chk(subNg === 0, '振替休日は日曜の祝日の後にしか出ない（2007–2040）', `${subNg} 件が条件外`);
chk(natNg === 0, '国民の休日は祝日に挟まれた平日にしか出ない（2007–2040）', `${natNg} 件が条件外`);

/* 件数の妥当性。下限 15 は山の日が無い 2007–2015、
   上限 22 は即位関連で 2 日増える 2019。 */
let cntNg = [];
for (let y = 2007; y <= 2040; y++) {
  const n = api.holidaysOfYear(y).size;
  if (n < 15 || n > 22) cntNg.push(`${y}:${n}`);
}
chk(cntNg.length === 0, '各年の祝日数が 15〜22 日に収まる（2007–2040）', cntNg.join(' '));
/* 山の日は 2016 年から */
chk(!api.isPublicHoliday(D(2015, 8, 11)) && api.holidayName(D(2016, 8, 11)) === '山の日',
  '山の日は 2016 年から', `2015=${api.holidayName(D(2015, 8, 11))} / 2016=${api.holidayName(D(2016, 8, 11))}`);
/* 天皇誕生日は 2018 年まで 12/23、2019 年は無し、2020 年から 2/23 */
chk(api.holidayName(D(2018, 12, 23)) === '天皇誕生日'
  && !api.isPublicHoliday(D(2019, 12, 23)) && !api.isPublicHoliday(D(2019, 2, 23))
  && api.holidayName(D(2020, 2, 23)) === '天皇誕生日',
  '天皇誕生日が 2018→2019→2020 で法律どおり移る');
/* 2019 の即位関連と、それに挟まれた国民の休日 */
chk(api.holidayName(D(2019, 5, 1)) === '天皇の即位の日'
  && api.holidayName(D(2019, 4, 30)) === '国民の休日'
  && api.holidayName(D(2019, 5, 2)) === '国民の休日'
  && api.holidayName(D(2019, 10, 22)) === '即位礼正殿の儀の行われる日',
  '2019 の即位関連 4 日が正しい',
  `${api.holidayName(D(2019, 4, 30))} / ${api.holidayName(D(2019, 5, 1))} / ${api.holidayName(D(2019, 5, 2))} / ${api.holidayName(D(2019, 10, 22))}`);
/* 2020・2021 の五輪特例 */
chk(api.holidayName(D(2020, 7, 23)) === '海の日' && api.holidayName(D(2020, 7, 24)) === 'スポーツの日'
  && api.holidayName(D(2020, 8, 10)) === '山の日' && !api.isPublicHoliday(D(2020, 10, 12)),
  '2020 の五輪特例（海の日 7/23・スポーツの日 7/24・山の日 8/10）');
chk(api.holidayName(D(2021, 7, 22)) === '海の日' && api.holidayName(D(2021, 7, 23)) === 'スポーツの日'
  && api.holidayName(D(2021, 8, 8)) === '山の日',
  '2021 の五輪特例（海の日 7/22・スポーツの日 7/23・山の日 8/8）');
/* 2007 年より前は警告を出す */
chk(!!api.holidayRangeWarning(D(2005, 1, 1), D(2005, 12, 31)), '2007 年より前は警告を出す');
chk(api.holidayRangeWarning(D(2026, 9, 1), D(2026, 10, 30)) === null, '2026 年は警告なし');

/* ---- 3. 本物のサンプルの `休日` 列と一致 ---- */
const csv = readFileSync(join(root, 'sample', 'Sample', 'サポートルーム_サンプル工程表.csv'), 'utf8')
  .replace(/^﻿/, '');
const rows = csv.split('\r\n').filter((l) => l.trim() !== '');
const headers = rows[2].split(',');
const ix = (n) => headers.indexOf(n);
let holNg = [], checked = 0;
for (const line of rows.slice(3)) {
  // 工程線名 JSON に引用カンマがあるので、必要な列だけ簡易に取り出す
  const cells = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { cells.push(cur); cur = ''; }
    else cur += c;
  }
  cells.push(cur);
  const s = cells[ix('開始日')].slice(0, 10), e = cells[ix('終了日')].slice(0, 10);
  const want = parseInt(cells[ix('休日')], 10);
  const id = cells[ix('工程ID')];
  const got = api.countNonWorking(new Date(s + 'T00:00:00Z'), new Date(e + 'T00:00:00Z'));
  checked++;
  if (got !== want) holNg.push(`${id} CSV=${want} 計算=${got}`);
}
chk(holNg.length === 0, `サンプル ${checked} 工程の 休日 列と完全一致`, holNg.slice(0, 3).join(' / '));

/* ---- 4. 一覧（監査用） ---- */
say('');
say('=== 算出した祝日（2024–2030） ===');
for (let y = 2024; y <= 2030; y++) {
  const m = api.holidaysOfYear(y);
  const ks = Array.from(m.keys()).sort((a, b) => a - b);
  say(`${y} (${ks.length} 日)`);
  for (const k of ks) {
    const d = new Date(Date.UTC(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100));
    say(`  ${fmt(k)} (${WD[d.getUTCDay()]}) ${m.get(k)}`);
  }
}

say('');
say(`${fails === 0 ? 'ALL PASS' : fails + ' FAILED'}`);
writeFileSync(join(root, 'out', 'holiday-test.log'), out.join('\n') + '\n', 'utf8');
process.exit(fails === 0 ? 0 : 1);
