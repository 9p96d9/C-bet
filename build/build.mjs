// ビルドオーケストレータ（依存ゼロ）: node build/build.mjs
import { readdir, readFile, writeFile, mkdir, rm, cp, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

import { SECTIONS, DOMAINS, AGE_BANDS } from '../content/_manifest.mjs';
import { renderMarkdown, parseFrontmatter, extractToc, inline } from './markdown.mjs';
import * as T from './templates.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONTENT = join(ROOT, 'content');
const OUT = join(ROOT, 'site');

// サブパス配信対応（例: GitHub Pages プロジェクトサイト → BASE_PATH=/C-bet）
// 未指定ならルート配信（従来どおり）。末尾スラッシュは除去して正規化。
const BASE = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const withBase = html => BASE ? html.replace(/(href|src)="\//g, `$1="${BASE}/`) : html;

// 正規URL・OGP・sitemap 用のオリジン（例: https://9p96d9.github.io）。
// 未指定なら絶対URL系（canonical/og:url/sitemap）は出力しない（相対配信でも壊れないため）。
const ORIGIN = (process.env.SITE_ORIGIN || '').replace(/\/+$/, '');
const sitePages = []; // sitemap 生成用に書き出したページのURLパスを集める
const urlPath = p => '/' + (p ? p.replace(/\/+$/, '') + '/' : '');

const domainMap = Object.fromEntries(DOMAINS.map(d => [d.slug, d]));
const domainName = slug => (domainMap[slug]?.name) || slug;
const warnings = [];
const warn = m => warnings.push(m);

// ページ内のid（アンカー先）と、ルート相対リンクを集める。BASE_PATH 適用前の素のHTMLで見る。
function collectLinks(from, html) {
  const ids = new Set();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
  emittedPages.set(from, ids);
  for (const m of html.matchAll(/href="(\/[^"]*)"/g)) emittedLinks.push({ from, to: m[1] });
}

// 生成物に対する内部リンク検査（related のリンク切れ・神話などのアンカー切れを拾う）
function checkLinks() {
  const skip = /^\/assets\/|\.(css|js|xml|txt|png|jpg|jpeg|svg|ico|webp)$/;
  const dead = new Map();   // "リンク先" → 参照元ページの集合
  const deadAnchor = new Map();
  for (const { from, to } of emittedLinks) {
    if (skip.test(to)) continue;
    const [rawPath, hash] = to.split('#');
    const p = rawPath === '' ? from : (rawPath.endsWith('/') ? rawPath : rawPath + '/');
    if (!emittedPages.has(p)) {
      if (!dead.has(to)) dead.set(to, new Set());
      dead.get(to).add(from);
    } else if (hash && !emittedPages.get(p).has(hash)) {
      if (!deadAnchor.has(to)) deadAnchor.set(to, new Set());
      deadAnchor.get(to).add(from);
    }
  }
  const fmt = srcs => [...srcs].slice(0, 3).join(', ') + (srcs.size > 3 ? ` ほか${srcs.size - 3}件` : '');
  for (const [to, srcs] of dead) warn(`リンク切れ "${to}" ← ${fmt(srcs)}`);
  for (const [to, srcs] of deadAnchor) warn(`アンカー切れ "${to}" ← ${fmt(srcs)}`);
  return emittedLinks.length;
}

async function readMd(dir) {
  const p = join(CONTENT, dir);
  if (!existsSync(p)) return [];
  const files = (await readdir(p)).filter(f => f.endsWith('.md'));
  const items = [];
  for (const f of files) {
    const src = await readFile(join(p, f), 'utf8');
    const { data, body } = parseFrontmatter(src);
    items.push({ file: f, data, body, order: data.order ? +data.order : parseInt(f) || 999 });
  }
  return items.sort((a, b) => a.order - b.order || a.file.localeCompare(b.file));
}

async function readData(dir) {
  const p = join(CONTENT, dir);
  if (!existsSync(p)) return [];
  const files = (await readdir(p)).filter(f => f.endsWith('.mjs'));
  let all = [];
  for (const f of files) {
    const mod = await import(pathToFileURL(join(p, f)).href);
    const arr = mod.default || mod.items || [];
    all = all.concat(arr);
  }
  return all;
}

// ---- ナビ ----
function buildNav(currentSlug) {
  const items = SECTIONS.filter(s => s.nav !== false).map(s => {
    const active = s.slug === currentSlug ? ' class="active"' : '';
    return `<li${active}><a href="/${s.slug}/"><span class="ico">${s.icon}</span>${s.title}</a></li>`;
  }).join('');
  return `<div class="nav-brand"><a href="/">🌱 ${T.SITE.title}</a></div><ul class="nav-list">${items}</ul>`;
}

function crumb(...parts) {
  return parts.map((p, i) => i < parts.length - 1 && p.href ? `<a href="${p.href}">${p.label}</a>` : `<span>${p.label}</span>`).join('<i>›</i>');
}

// 内部リンク検査用: 出力したページのURLパス → そのページ内のid集合 / 張られたリンク
const emittedPages = new Map();
const emittedLinks = [];

async function writeHtml(path, html) {
  const full = join(OUT, path, 'index.html');
  await mkdir(dirname(full), { recursive: true });
  sitePages.push(urlPath(path));
  collectLinks(urlPath(path), html);
  // URL依存メタ（canonical / og:url）は出力パスが確定するここで注入する
  let out = html;
  if (ORIGIN) {
    const canonical = ORIGIN + BASE + urlPath(path);
    out = out.replace('</head>', `<link rel="canonical" href="${canonical}">\n<meta property="og:url" content="${canonical}">\n</head>`);
  }
  await writeFile(full, withBase(out));
}

function validateEvidence(ev, ctx) { if (ev && !'ABCD'.includes(ev)) warn(`不正なevidence "${ev}" @ ${ctx}`); }

// ---- related のリンク描画 ----
// カード系（activity / myth / milestone）の related は、本文中にリンクを書けないので
// ここでタイトルを解決して描画する。タイトル索引はレンダリング前に一度だけ作る。
const pageTitles = new Map();

async function buildTitleIndex() {
  for (const sec of SECTIONS) {
    if (sec.kind === 'landing') { pageTitles.set('/', 'トップ'); continue; }
    pageTitles.set(urlPath(sec.slug), sec.title);
    if (sec.kind === 'chapters') {
      for (const it of await readMd(sec.dir)) {
        if (it.data.slug) pageTitles.set(urlPath(`${sec.slug}/${it.data.slug}`), it.data.title);
      }
    } else if (sec.kind === 'domains') {
      for (const d of DOMAINS) pageTitles.set(urlPath(`domains/${d.slug}`), d.name);
      const secPath = join(CONTENT, sec.dir);
      if (!existsSync(secPath)) continue;
      const dirs = (await readdir(secPath, { withFileTypes: true })).filter(e => e.isDirectory());
      for (const e of dirs) {
        if (!domainMap[e.name]) continue;
        for (const s of await readMd(join(sec.dir, e.name))) {
          if (s.data.slug) pageTitles.set(urlPath(`domains/${e.name}/${s.data.slug}`), s.data.title);
        }
      }
    } else if (sec.kind === 'activities') {
      for (const a of await readData(sec.dir)) {
        if (a.slug) pageTitles.set(urlPath(`activities/${a.slug}`), a.title);
      }
    } else if (sec.kind === 'myths') {
      // 神話カードは1ページ内のアンカー。#slug 付きで引けるようにする
      for (const m of await readData(sec.dir)) {
        if (m.slug) pageTitles.set(`/myths/#${m.slug}`, m.title);
      }
    } else if (sec.kind === 'milestones') {
      for (const b of AGE_BANDS) pageTitles.set(urlPath(`roadmap/${b}`), `${b}ヶ月のロードマップ`);
    }
  }
}

// パスからリンク文言を解決する。未知なら末尾セグメントで代用（リンク検査が切れを拾う）
function linkLabel(path) {
  if (pageTitles.has(path)) return pageTitles.get(path);
  const [base] = path.split('#');
  if (pageTitles.has(base)) return pageTitles.get(base);
  const seg = base.replace(/\/+$/, '').split('/').pop();
  return seg || path;
}

function relatedHtml(list) {
  if (!list || !list.length) return '';
  // タイトルが「主題 — 副題」形式なら主題だけを使う（カード内で長くしない）
  const short = t => t.split(' — ')[0];
  const links = list.map(p => `<a href="${p}">${short(linkLabel(p))}</a>`).join('');
  return `<div class="rel-links"><span class="rel-h">関連</span>${links}</div>`;
}

// ================= セクション別ビルド =================

async function buildChapters(sec) {
  const items = await readMd(sec.dir);
  // ハブ
  const list = items.map(it => `<li><a href="/${sec.slug}/${it.data.slug}/"><span class="n">${String(it.order).padStart(2, '0')}</span><span class="t"><strong>${it.data.title}</strong><em>${it.data.summary || ''}</em></span>${T.evidenceBadge(it.data.evidence)}</a></li>`).join('');
  await writeHtml(sec.slug, T.page({
    title: sec.title, path: '/' + sec.slug + '/',
    nav: buildNav(sec.slug),
    breadcrumb: crumb({ label: 'トップ', href: '/' }, { label: sec.title }),
    body: `<article class="doc"><h1><span class="sec-ico">${sec.icon}</span>${sec.title}</h1><p class="lead">${sec.blurb}</p><ol class="chapter-list">${list}</ol></article>`,
    toc: [],
  }));
  // 各章
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    validateEvidence(it.data.evidence, sec.slug + '/' + it.data.slug);
    const prev = items[k - 1], next = items[k + 1];
    const paginav = `<nav class="paginav">${prev ? `<a href="/${sec.slug}/${prev.data.slug}/">← ${prev.data.title}</a>` : '<span></span>'}${next ? `<a class="next" href="/${sec.slug}/${next.data.slug}/">${next.data.title} →</a>` : '<span></span>'}</nav>`;
    const meta = `<div class="doc-meta">${T.evidenceBadge(it.data.evidence)} ${(it.data.domains || []).map(d => T.domainChip(d, domainName(d))).join(' ')} ${it.data.reading_minutes ? `<span class="chip">📖 約${it.data.reading_minutes}分</span>` : ''}</div>`;
    await writeHtml(`${sec.slug}/${it.data.slug}`, T.page({
      title: it.data.title, description: it.data.summary,
      path: `/${sec.slug}/${it.data.slug}/`,
      nav: buildNav(sec.slug),
      breadcrumb: crumb({ label: 'トップ', href: '/' }, { label: sec.title, href: '/' + sec.slug + '/' }, { label: it.data.title }),
      body: `<article class="doc">${meta}<h1>${it.data.title}</h1>${it.data.summary ? `<p class="lead">${inline(it.data.summary)}</p>` : ''}${renderMarkdown(it.body)}${paginav}</article>`,
      toc: extractToc(it.body),
    }));
  }
  return items.length;
}

async function buildDomains(sec) {
  const items = await readMd(sec.dir); // 各ドメインのハブ記事（slug = domain slug）
  const bySlug = Object.fromEntries(items.map(it => [it.data.slug, it]));
  // サブ記事: content/03-domains/<domain>/*.md（ハブから深掘りする各論）
  const subsByDomain = {};
  const secPath = join(CONTENT, sec.dir);
  if (existsSync(secPath)) {
    const dirs = (await readdir(secPath, { withFileTypes: true })).filter(e => e.isDirectory());
    for (const e of dirs) {
      if (!domainMap[e.name]) { warn(`未知のドメインのサブ記事ディレクトリ "${sec.dir}/${e.name}"`); continue; }
      if (!bySlug[e.name]) warn(`ハブ記事のないサブ記事ディレクトリ "${sec.dir}/${e.name}"（先に ${e.name}.md を書く）`);
      const subs = (await readMd(join(sec.dir, e.name))).filter(s => {
        if (!s.data.slug) { warn(`slug欠落のサブ記事 ${sec.dir}/${e.name}/${s.file}`); return false; }
        return true;
      });
      const seen = new Set();
      subs.forEach(s => { if (seen.has(s.data.slug)) warn(`重複slug "${s.data.slug}" @ domains/${e.name}`); seen.add(s.data.slug); });
      if (subs.length) subsByDomain[e.name] = subs;
    }
  }
  const grid = DOMAINS.map(d => {
    const has = bySlug[d.slug];
    return `<a class="dom-card" href="/domains/${d.slug}/"><span class="dom-ico">${d.icon}</span><strong>${d.name}</strong><em>${has?.data?.summary || '準備中'}</em>${has ? T.evidenceBadge(has.data.evidence) : '<span class="badge ev-todo">執筆予定</span>'}</a>`;
  }).join('');
  await writeHtml('domains', T.page({
    title: '発達ドメイン', nav: buildNav('domains'),
    breadcrumb: crumb({ label: 'トップ', href: '/' }, { label: '発達ドメイン' }),
    body: `<article class="doc"><h1><span class="sec-ico">🧩</span>発達ドメイン</h1><p class="lead">${sec.blurb}。各ドメインは「なぜ重要か → 何が育つか → 父ができること」で構成。</p><div class="dom-grid">${grid}</div></article>`,
    toc: [],
  }));
  for (const it of items) {
    validateEvidence(it.data.evidence, 'domains/' + it.data.slug);
    const d = domainMap[it.data.slug] || { name: it.data.title, icon: '📄' };
    const subs = subsByDomain[it.data.slug] || [];
    const subList = subs.length
      ? `<h2 id="deep-dive">深掘り記事</h2><ol class="chapter-list">${subs.map((s, k) =>
          `<li><a href="/domains/${it.data.slug}/${s.data.slug}/"><span class="n">${String(k + 1).padStart(2, '0')}</span><span class="t"><strong>${s.data.title}</strong><em>${s.data.summary || ''}</em></span>${T.evidenceBadge(s.data.evidence)}</a></li>`).join('')}</ol>`
      : '';
    const toc = extractToc(it.body);
    if (subs.length) toc.push({ level: 2, text: '深掘り記事', id: 'deep-dive' });
    await writeHtml(`domains/${it.data.slug}`, T.page({
      title: d.name, description: it.data.summary, nav: buildNav('domains'),
      breadcrumb: crumb({ label: 'トップ', href: '/' }, { label: '発達ドメイン', href: '/domains/' }, { label: d.name }),
      body: `<article class="doc"><div class="doc-meta">${T.evidenceBadge(it.data.evidence)} <span class="chip">${d.icon} ${d.name}</span></div><h1>${it.data.title}</h1>${it.data.summary ? `<p class="lead">${inline(it.data.summary)}</p>` : ''}${renderMarkdown(it.body)}${subList}</article>`,
      toc,
    }));
  }
  // 各サブ記事ページ（/domains/<domain>/<slug>/）
  let subCount = 0;
  for (const [dslug, subs] of Object.entries(subsByDomain)) {
    const d = domainMap[dslug];
    for (let k = 0; k < subs.length; k++) {
      const s = subs[k];
      subCount++;
      validateEvidence(s.data.evidence, `domains/${dslug}/${s.data.slug}`);
      const prev = subs[k - 1], next = subs[k + 1];
      const paginav = `<nav class="paginav">${prev ? `<a href="/domains/${dslug}/${prev.data.slug}/">← ${prev.data.title}</a>` : `<a href="/domains/${dslug}/">← ${d.name}（ハブ）</a>`}${next ? `<a class="next" href="/domains/${dslug}/${next.data.slug}/">${next.data.title} →</a>` : '<span></span>'}</nav>`;
      const meta = `<div class="doc-meta">${T.evidenceBadge(s.data.evidence)} <a class="chip" href="/domains/${dslug}/">${d.icon} ${d.name}</a>${s.data.reading_minutes ? ` <span class="chip">📖 約${s.data.reading_minutes}分</span>` : ''}</div>`;
      await writeHtml(`domains/${dslug}/${s.data.slug}`, T.page({
        title: s.data.title, description: s.data.summary, nav: buildNav('domains'),
        breadcrumb: crumb({ label: 'トップ', href: '/' }, { label: '発達ドメイン', href: '/domains/' }, { label: d.name, href: `/domains/${dslug}/` }, { label: s.data.title }),
        body: `<article class="doc">${meta}<h1>${s.data.title}</h1>${s.data.summary ? `<p class="lead">${inline(s.data.summary)}</p>` : ''}${renderMarkdown(s.body)}${paginav}</article>`,
        toc: extractToc(s.body),
      }));
    }
  }
  return items.length + subCount;
}

async function buildActivities(sec) {
  const acts = await readData(sec.dir);
  acts.forEach(a => validateEvidence(a.evidence, 'activity/' + a.slug));
  // フィルタUI＋カードグリッド
  const cards = acts.map(a => {
    const dattr = (a.domains || []).join(' ');
    return `<div class="filt-item" data-domains="${dattr}" data-min="${a.ageRange.minMonths}" data-max="${a.ageRange.maxMonths}" data-goals="${(a.goals || []).join(' ')}">${T.activityCard(a, domainName)}</div>`;
  }).join('');
  const domFilters = DOMAINS.map(d => `<button class="fbtn" data-f="dom" data-v="${d.slug}">${d.icon} ${d.name}</button>`).join('');
  const ageFilters = AGE_BANDS.map(b => `<button class="fbtn" data-f="age" data-v="${b}">${b}ヶ月</button>`).join('');
  const body = `<article class="doc">
    <h1><span class="sec-ico">🎴</span>実践図鑑</h1>
    <p class="lead">${sec.blurb}。現在 <strong>${acts.length}</strong> 枚（増築中）。</p>
    <div class="filters">
      <div class="frow"><span class="flabel">ドメイン</span>${domFilters}</div>
      <div class="frow"><span class="flabel">月齢</span>${ageFilters}</div>
      <button class="fclear" onclick="AF.clear()">クリア</button>
    </div>
    <div class="card-grid" id="actgrid">${cards}</div>
    <p class="muted" id="actcount"></p>
  </article>
  <script>${activityFilterJS()}</script>`;
  await writeHtml('activities', T.page({ title: '実践図鑑', nav: buildNav('activities'),
    breadcrumb: crumb({ label: 'トップ', href: '/' }, { label: '実践図鑑' }), body, toc: [] }));
  // 各カード個別ページ
  for (const a of acts) {
    await writeHtml(`activities/${a.slug}`, T.page({
      title: a.title, description: a.summary, nav: buildNav('activities'),
      breadcrumb: crumb({ label: 'トップ', href: '/' }, { label: '実践図鑑', href: '/activities/' }, { label: a.title }),
      body: T.activityFull(a, domainName, relatedHtml(a.related)), toc: [],
    }));
  }
  return acts.length;
}

function activityFilterJS() {
  return `window.AF={dom:new Set(),age:new Set(),clear:function(){this.dom.clear();this.age.clear();document.querySelectorAll('.fbtn').forEach(b=>b.classList.remove('on'));this.run()},run:function(){var n=0;document.querySelectorAll('.filt-item').forEach(function(el){var ds=(el.dataset.domains||'').split(' ');var mn=+el.dataset.min,mx=+el.dataset.max;var okD=AF.dom.size===0||[...AF.dom].some(d=>ds.includes(d));var okA=AF.age.size===0||[...AF.age].some(function(b){var p=b.split('-');return +p[0]<=mx&&+p[1]>=mn});var show=okD&&okA;el.style.display=show?'':'none';if(show)n++});var c=document.getElementById('actcount');if(c)c.textContent=n+' 件を表示'}};document.querySelectorAll('.fbtn').forEach(function(b){b.onclick=function(){var s=AF[b.dataset.f];b.classList.toggle('on');b.classList.contains('on')?s.add(b.dataset.v):s.delete(b.dataset.v);AF.run()}});AF.run();`;
}

async function buildMilestones(sec) {
  const ms = await readData(sec.dir);
  ms.forEach(m => validateEvidence(m.evidence, 'milestone/' + m.slug));
  const byBand = Object.fromEntries(AGE_BANDS.map(b => [b, []]));
  ms.forEach(m => { if (byBand[m.ageBand]) byBand[m.ageBand].push(m); else warn('未知のageBand ' + m.ageBand); });
  const selector = AGE_BANDS.map(b => `<a class="band-sel${byBand[b].length ? '' : ' empty'}" href="/roadmap/${b}/">${b}<small>ヶ月</small><span>${byBand[b].length}項目</span></a>`).join('');
  await writeHtml('roadmap', T.page({ title: '月齢ロードマップ', nav: buildNav('roadmap'),
    breadcrumb: crumb({ label: 'トップ', href: '/' }, { label: '月齢ロードマップ' }),
    body: `<article class="doc"><h1><span class="sec-ico">🗺️</span>月齢ロードマップ</h1><p class="lead">${sec.blurb}。月齢帯を選ぶと、その時期に芽生える力・高レバレッジ活動・受診の目安が見られます。個人差は大きく、時期は目安です。</p><div class="band-grid">${selector}</div></article>`,
    toc: [] }));
  for (const b of AGE_BANDS) {
    const list = byBand[b];
    const idx = AGE_BANDS.indexOf(b);
    const prev = AGE_BANDS[idx - 1], next = AGE_BANDS[idx + 1];
    const cards = list.length ? `<div class="card-grid">${list.map(m => T.milestoneCard(m, domainName, relatedHtml(m.related))).join('')}</div>` : '<p class="muted">この月齢帯は執筆予定です。</p>';
    const paginav = `<nav class="paginav">${prev ? `<a href="/roadmap/${prev}/">← ${prev}ヶ月</a>` : '<span></span>'}${next ? `<a class="next" href="/roadmap/${next}/">${next}ヶ月 →</a>` : '<span></span>'}</nav>`;
    await writeHtml(`roadmap/${b}`, T.page({ title: `${b}ヶ月`, nav: buildNav('roadmap'),
      breadcrumb: crumb({ label: 'トップ', href: '/' }, { label: '月齢ロードマップ', href: '/roadmap/' }, { label: b + 'ヶ月' }),
      body: `<article class="doc"><h1>${b}ヶ月</h1>${cards}${paginav}</article>`, toc: [] }));
  }
  return ms.length;
}

// ---- 目的別コース ----
const GOALS = [
  {
    slug: 'study', tag: '勉強に効く', icon: '📚', title: '勉強が得意な子への土台',
    intro: '学業を最もよく予測するのは、早期の読み書き計算ではなく<strong>言語・実行機能・数量感覚の土台</strong>です。ここに挙げる活動は、すべて「遊び」として成立しながらその土台を耕します。',
    science: [
      ['/science/10-language-bath/', '言語のシャワー — 量とやりとり'],
      ['/domains/executive-function/', '実行機能 — 学業最強の予測因子'],
      ['/domains/math-spatial/', '数・量・空間認知'],
      ['/science/14-praise-motivation/', 'ほめ方と動機づけの科学'],
      ['/myths/', 'やらなくていいこと（神話と落とし穴）'],
    ],
  },
  {
    slug: 'sports', tag: 'スポーツに効く', icon: '⚽', title: 'スポーツが得意な子への土台',
    intro: '0〜3歳にやるべきは競技訓練ではなく、<strong>多様な動きの貯金と「体を動かすのは楽しい」という有能感</strong>です。早期特化はむしろ不利になりえます。',
    science: [
      ['/science/12-early-specialization/', '早期特化ではなく「動きの貯金」'],
      ['/science/09-movement/', '運動が認知をつくる'],
      ['/science/13-nature-outdoors/', '外あそびと自然の科学'],
      ['/domains/gross-motor/', '粗大運動・スポーツドメイン'],
      ['/fathers-edge/02-rough-and-tumble/', 'ラフ＆タンブル遊び'],
    ],
  },
  {
    slug: 'emotion', tag: '情緒', icon: '❤️', title: '折れない心と共感の土台',
    intro: '感情を理解し調整できる力は、集中・粘り・人間関係——<strong>勉強とスポーツの両方の前提</strong>です。安心と受容の中でこそ育ちます。',
    science: [
      ['/science/04-attachment/', '愛着 — すべての探索の安全基地'],
      ['/science/06-stress/', '毒性ストレスと緩衝材としての父親'],
      ['/domains/social-emotional/', '社会情動・共感ドメイン'],
      ['/fathers-edge/03-pushing-secure-base/', '探索を促す「押し出す」関わり'],
    ],
  },
  {
    slug: 'creativity', tag: '創造性', icon: '🎨', title: '創造性と好奇心の土台',
    intro: '創造性は教えられません。<strong>自由な遊び・オープンエンドな素材・退屈の余白</strong>の中で、子が自分で育てるものです。大人の仕事は場を用意して邪魔しないこと。',
    science: [
      ['/domains/play/', '好奇心・探索・遊びドメイン'],
      ['/environment/02-toys/', '玩具の選び方 — オープンエンドが最強'],
      ['/science/13-nature-outdoors/', '外あそびと自然の科学'],
    ],
  },
];

async function buildGoals(sec) {
  const acts = await readData(sec.dir);
  const cards = GOALS.map(g => {
    const n = acts.filter(a => (a.goals || []).includes(g.tag)).length;
    return `<a class="dom-card" href="/goals/${g.slug}/"><span class="dom-ico">${g.icon}</span><strong>${g.title}</strong><em>${n}個の活動</em></a>`;
  }).join('');
  await writeHtml('goals', T.page({
    title: '目的別コース', nav: buildNav('goals'),
    breadcrumb: crumb({ label: 'トップ', href: '/' }, { label: '目的別コース' }),
    body: `<article class="doc"><h1><span class="sec-ico">🎯</span>目的別コース</h1><p class="lead">${sec.blurb}。願いから逆引きしつつ、根拠となる科学とセットで。</p><div class="dom-grid">${cards}</div><aside class="cx cx-key"><div class="cx-h">📌 前提</div><p>どのコースも土台は共通です（<a href="/intro/seven-foundations/">土台7原則</a>）。コースは「入口」であって、縦割りの訓練メニューではありません。</p></aside></article>`,
    toc: [],
  }));
  const bands = [[0, 12, '0〜12ヶ月'], [12, 24, '12〜24ヶ月'], [24, 36, '24〜36ヶ月']];
  for (const g of GOALS) {
    const mine = acts.filter(a => (a.goals || []).includes(g.tag));
    const sciList = g.science.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join('');
    const sections = bands.map(([lo, hi, label]) => {
      const list = mine.filter(a => a.ageRange.minMonths < hi && a.ageRange.maxMonths > lo);
      if (!list.length) return '';
      return `<h2 id="${slugifyLocal(label)}">${label}</h2><div class="card-grid">${list.map(a => T.activityCard(a, domainName)).join('')}</div>`;
    }).join('');
    await writeHtml(`goals/${g.slug}`, T.page({
      title: g.title, nav: buildNav('goals'),
      breadcrumb: crumb({ label: 'トップ', href: '/' }, { label: '目的別コース', href: '/goals/' }, { label: g.title }),
      body: `<article class="doc"><h1><span class="sec-ico">${g.icon}</span>${g.title}</h1><p class="lead">${g.intro}</p><aside class="cx cx-science"><div class="cx-h">🧠 まず読む（根拠）</div><ul>${sciList}</ul></aside>${sections}</article>`,
      toc: bands.filter(([lo, hi]) => mine.some(a => a.ageRange.minMonths < hi && a.ageRange.maxMonths > lo)).map(([lo, hi, label]) => ({ level: 2, text: label, id: slugifyLocal(label) })),
    }));
  }
  return GOALS.length;
}
function slugifyLocal(s) { return String(s).toLowerCase().replace(/[^\w぀-ヿ一-龯]+/g, '-').replace(/^-+|-+$/g, ''); }

async function buildMyths(sec) {
  const myths = await readData(sec.dir);
  myths.forEach(m => validateEvidence(m.evidence, 'myth/' + m.slug));
  const cards = myths.map(m => T.mythCard(m, relatedHtml(m.related))).join('');
  await writeHtml('myths', T.page({ title: '神話と落とし穴', nav: buildNav('myths'),
    breadcrumb: crumb({ label: 'トップ', href: '/' }, { label: '神話と落とし穴' }),
    body: `<article class="doc"><h1><span class="sec-ico">🚫</span>神話と落とし穴</h1><p class="lead">${sec.blurb}。不安を煽る言説から距離を取り、根拠に基づいて判断するために。</p><div class="card-grid">${cards}</div></article>`,
    toc: [] }));
  return myths.length;
}

async function buildGlossary(sec) {
  let glossary = [], refs = [], intro = [];
  const p = join(CONTENT, sec.dir);
  if (existsSync(join(p, 'glossary.mjs'))) glossary = (await import(pathToFileURL(join(p, 'glossary.mjs')).href)).default || [];
  if (existsSync(join(p, 'references.mjs'))) refs = (await import(pathToFileURL(join(p, 'references.mjs')).href)).default || [];
  intro = await readMd(sec.dir);
  const gl = glossary.slice().sort((a, b) => (a.reading || a.term).localeCompare(b.reading || b.term, 'ja'))
    .map(g => `<dt id="${g.slug}">${g.term}</dt><dd>${inline(g.definition)}${g.see_also && g.see_also.length ? `<div class="see">関連: ${g.see_also.join(' / ')}</div>` : ''}</dd>`).join('');
  const rl = refs.map(r => `<li id="${r.slug}"><strong>${r.authors}</strong> (${r.year}). <em>${r.title}</em>. ${r.org || ''} ${r.url ? `<a href="${r.url}">🔗</a>` : ''}${r.note ? `<br><span class="muted">${r.note}</span>` : ''}</li>`).join('');
  const introHtml = intro.map(it => renderMarkdown(it.body)).join('');
  await writeHtml('appendix', T.page({ title: '付録', nav: buildNav('appendix'),
    breadcrumb: crumb({ label: 'トップ', href: '/' }, { label: '付録' }),
    body: `<article class="doc"><h1><span class="sec-ico">📚</span>付録</h1>${introHtml}<h2 id="glossary">用語集</h2><dl class="glossary">${gl || '<dd class="muted">準備中</dd>'}</dl><h2 id="references">参考文献</h2><ol class="refs">${rl || '<li class="muted">準備中</li>'}</ol></article>`,
    toc: [{ level: 2, text: '用語集', id: 'glossary' }, { level: 2, text: '参考文献', id: 'references' }] }));
  return glossary.length + refs.length;
}

async function buildLanding(stats) {
  const secCards = SECTIONS.filter(s => s.nav !== false).map(s =>
    `<a class="home-card" href="/${s.slug}/"><span class="home-ico">${s.icon}</span><strong>${s.title}</strong><em>${s.blurb || ''}</em></a>`).join('');
  const body = `<div class="hero">
    <h1>${T.SITE.title}</h1>
    <p class="hero-tag">${T.SITE.tagline}</p>
    <p class="hero-note">妻（保育士）が担う基本育児はできている前提で、<strong>潜在能力を引き上げる「上乗せ」</strong>に特化。すべての主張にエビデンス等級（A〜D）を付し、<strong>不安を煽る神話とは一線を画します。</strong></p>
    <div class="hero-cta"><a class="btn" href="/intro/">まず読む：はじめに</a><a class="btn btn-ghost" href="/science/">土台の科学へ</a></div>
  </div>
  <section class="home-pillars">
    <h2>3つの軸で引く</h2>
    <div class="pillar-row">
      <a class="pillar" href="/domains/"><span>🧩</span><strong>能力（ドメイン）から</strong><em>言語・運動・数量・実行機能…</em></a>
      <a class="pillar" href="/roadmap/"><span>🗺️</span><strong>月齢から</strong><em>「今うちの子は◯ヶ月」で引く</em></a>
      <a class="pillar" href="/activities/"><span>🎴</span><strong>今日やることから</strong><em>5分でできる活動カード</em></a>
    </div>
  </section>
  <section class="home-sections"><h2>全セクション</h2><div class="home-grid">${secCards}</div></section>
  <section class="home-stats"><h2>収録状況</h2><div class="stat-row">${Object.entries(stats).map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('')}</div></section>`;
  await writeHtml('', T.page({ title: '', path: '/', nav: buildNav(''), body, toc: [] }));
}

// ================= main =================
async function main() {
  console.log('🌱 ビルド開始');
  if (existsSync(OUT)) await rm(OUT, { recursive: true });
  await mkdir(OUT, { recursive: true });
  // アセット
  await mkdir(join(OUT, 'assets'), { recursive: true });
  const cssFiles = ['tokens.css', 'base.css', 'components.css'];
  let css = '';
  for (const f of cssFiles) css += await readFile(join(ROOT, 'design-system', f), 'utf8') + '\n';
  await writeFile(join(OUT, 'assets', 'style.css'), css);
  if (existsSync(join(ROOT, 'assets', 'img'))) await cp(join(ROOT, 'assets', 'img'), join(OUT, 'assets', 'img'), { recursive: true });

  await buildTitleIndex();

  const stats = {};
  for (const sec of SECTIONS) {
    if (sec.kind === 'landing') continue;
    let n = 0;
    if (sec.kind === 'chapters') n = await buildChapters(sec);
    else if (sec.kind === 'domains') n = await buildDomains(sec);
    else if (sec.kind === 'activities') n = await buildActivities(sec);
    else if (sec.kind === 'goals') n = await buildGoals(sec);
    else if (sec.kind === 'milestones') n = await buildMilestones(sec);
    else if (sec.kind === 'myths') n = await buildMyths(sec);
    else if (sec.kind === 'glossary') n = await buildGlossary(sec);
    stats[sec.title] = n;
    console.log(`  ✓ ${sec.title}: ${n}`);
  }
  await buildLanding(stats);

  // 静的ホスティング用: 404ページ（GitHub Pages 等が任意パスで配信）と .nojekyll
  await writeFile(join(OUT, '404.html'), withBase(T.page({
    title: 'ページが見つかりません', nav: buildNav(''),
    body: `<article class="doc"><h1>404 — ページが見つかりません</h1><p class="lead">お探しのページは移動または削除された可能性があります。</p><p><a class="btn" href="/">🌱 トップへ戻る</a></p></article>`,
    toc: [],
  })));
  await writeFile(join(OUT, '.nojekyll'), '');

  // sitemap.xml / robots.txt（絶対URLが要るので SITE_ORIGIN 指定時のみ生成）
  if (ORIGIN) {
    const base = ORIGIN + BASE;
    const urls = [...new Set(sitePages)].sort();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map(u => `  <url><loc>${base}${u}</loc></url>`).join('\n') + `\n</urlset>\n`;
    await writeFile(join(OUT, 'sitemap.xml'), xml);
    await writeFile(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
    console.log(`  ✓ sitemap.xml: ${urls.length} URL`);
  } else {
    console.log('  · sitemap/robots はスキップ（SITE_ORIGIN 未指定）');
  }

  const nLinks = checkLinks();
  console.log(`  ✓ 内部リンク検査: ${nLinks}本 / ${emittedPages.size}ページ`);

  if (warnings.length) {
    console.log('\n⚠️ 警告 ' + warnings.length + '件:');
    warnings.slice(0, 30).forEach(w => console.log('   - ' + w));
  }
  console.log('\n✅ 完了 → site/');
}
main().catch(e => { console.error(e); process.exit(1); });
