// HTMLテンプレートとコンポーネント（依存ゼロ）
import { inline } from './markdown.mjs';

export const SITE = {
  title: '3歳までの土台づくり大全',
  tagline: '父親が、科学的根拠にもとづいて娘の潜在能力を引き上げるための体系的リファレンス',
};

const EV = {
  A: { label: 'A 強い根拠', cls: 'ev-a', desc: 'メタ分析・RCTなど一貫した強い証拠' },
  B: { label: 'B 中程度', cls: 'ev-b', desc: '一貫した観察研究・複数の支持' },
  C: { label: 'C 限定的', cls: 'ev-c', desc: '理論・専門家合意・小規模研究' },
  D: { label: 'D 弱い/要注意', cls: 'ev-d', desc: '逸話・人気だが根拠は薄い' },
};

export function evidenceBadge(level) {
  const e = EV[level];
  if (!e) return '';
  return `<span class="badge ${e.cls}" title="${e.desc}">${e.label}</span>`;
}

export function domainChip(slug, name) {
  return `<a class="chip" href="/domains/${slug}/">${name || slug}</a>`;
}

export function ageChip(min, max) {
  const f = (m) => m % 12 === 0 ? `${m / 12}歳` : `${m}ヶ月`;
  return `<span class="chip chip-age">${min === 0 ? '0' : f(min)}〜${f(max)}</span>`;
}

// ---- ページシェル ----
export function page({ title, path, body, toc, nav, breadcrumb, description }) {
  const desc = description || SITE.tagline;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? title + ' — ' : ''}${SITE.title}</title>
<meta name="description" content="${desc.replace(/"/g, '&quot;')}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE.title}">
<meta property="og:locale" content="ja_JP">
<meta property="og:title" content="${(title ? title + ' — ' : '') + SITE.title}">
<meta property="og:description" content="${desc.replace(/"/g, '&quot;')}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${(title ? title + ' — ' : '') + SITE.title}">
<meta name="twitter:description" content="${desc.replace(/"/g, '&quot;')}">
<link rel="stylesheet" href="/assets/style.css">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%8C%B1%3C/text%3E%3C/svg%3E">
</head>
<body>
<a class="skip" href="#main">本文へ</a>
<header class="topbar">
  <button class="menu-btn" aria-label="メニュー" onclick="document.body.classList.toggle('nav-open')">☰</button>
  <a class="brand" href="/"><span class="brand-mark">🌱</span><span class="brand-name">${SITE.title}</span></a>
  <button class="theme-btn" aria-label="テーマ切替" onclick="(function(){var r=document.documentElement,d=r.getAttribute('data-theme')==='dark'?'light':'dark';r.setAttribute('data-theme',d);try{localStorage.setItem('theme',d)}catch(e){}})()">◐</button>
</header>
<div class="layout">
  <nav class="sidenav" aria-label="サイト全体">${nav}</nav>
  <div class="nav-scrim" onclick="document.body.classList.remove('nav-open')"></div>
  <main id="main" class="content">
    ${breadcrumb ? `<nav class="breadcrumb">${breadcrumb}</nav>` : ''}
    ${body}
    <footer class="pfoot">
      <p>本資料は情報提供を目的とし、医療・専門的助言に代わるものではありません。気になる兆候は小児科・専門職にご相談ください。</p>
      <p class="muted">『${SITE.title}』 — データ駆動の静的資料 · 最終ビルド ${new Date().toISOString().slice(0, 10)}</p>
    </footer>
  </main>
  ${toc && toc.length ? `<aside class="toc" aria-label="目次"><div class="toc-h">目次</div><ul>${toc.map(t => `<li class="toc-l${t.level}"><a href="#${t.id}">${t.text}</a></li>`).join('')}</ul></aside>` : '<aside class="toc"></aside>'}
</div>
<script>
(function(){try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}})();
</script>
</body>
</html>`;
}

// ---- カード等の部品 ----
export function activityCard(a, domainName) {
  const goals = (a.goals || []).map(g => `<span class="tag tag-goal">${g}</span>`).join('');
  return `<article class="card act-card">
  <div class="card-top">${evidenceBadge(a.evidence)} ${ageChip(a.ageRange.minMonths, a.ageRange.maxMonths)} <span class="chip chip-time">⏱ ${a.minutes || '?'}分</span></div>
  <h3><a href="/activities/${a.slug}/">${a.title}</a></h3>
  <p class="card-sum">${inline(a.summary)}</p>
  <div class="card-tags">${(a.domains || []).map(d => `<span class="tag">${domainName(d)}</span>`).join('')} ${goals}</div>
</article>`;
}

export function activityFull(a, domainName) {
  return `<article class="doc">
  <div class="doc-meta">${evidenceBadge(a.evidence)} ${ageChip(a.ageRange.minMonths, a.ageRange.maxMonths)} <span class="chip chip-time">⏱ ${a.minutes || '?'}分</span> <span class="chip">負荷: ${({low:'低',medium:'中',high:'高'})[a.effort] || '—'}</span></div>
  <h1>${a.title}</h1>
  <p class="lead">${inline(a.summary)}</p>
  ${a.materials && a.materials.length ? `<p><strong>道具:</strong> ${a.materials.join(' / ')}</p>` : '<p><strong>道具:</strong> 不要</p>'}
  <h2>やり方</h2>
  <ol class="steps">${(a.steps || []).map(s => `<li>${inline(s)}</li>`).join('')}</ol>
  <aside class="cx cx-science"><div class="cx-h">🧠 なぜ効くのか</div><p>${inline(a.why || '')}</p></aside>
  <aside class="cx cx-father"><div class="cx-h">👨 父ならではの強み</div><p>${inline(a.father_edge || '')}</p></aside>
  ${a.variations && a.variations.length ? `<h2>バリエーション</h2><ul>${a.variations.map(v => `<li>${inline(v)}</li>`).join('')}</ul>` : ''}
  ${a.safety ? `<aside class="cx cx-warning"><div class="cx-h">⚠️ 注意</div><p>${inline(a.safety)}</p></aside>` : ''}
  <div class="card-tags">${(a.domains || []).map(d => domainChip(d, domainName(d))).join(' ')}</div>
</article>`;
}

export function mythCard(m) {
  const V = { false: ['誤り', 'v-false'], 'mostly-false': ['ほぼ誤り', 'v-false'], mixed: ['一部正しい', 'v-mixed'], oversold: ['誇張・商品化', 'v-oversold'] };
  const v = V[m.verdict] || ['—', ''];
  return `<article class="card myth-card" id="${m.slug}">
  <div class="card-top"><span class="verdict ${v[1]}">${v[0]}</span> ${evidenceBadge(m.evidence)}</div>
  <h3 class="myth-claim">「${m.claim}」</h3>
  <p><strong>実際は:</strong> ${inline(m.reality)}</p>
  ${m.harm ? `<p class="muted"><strong>害:</strong> ${inline(m.harm)}</p>` : ''}
  <p class="instead"><strong>👉 代わりに:</strong> ${inline(m.instead)}</p>
</article>`;
}

export function milestoneCard(m, domainName) {
  return `<article class="card ms-card">
  <div class="card-top">${evidenceBadge(m.evidence)} <span class="tag">${domainName(m.domain)}</span></div>
  <h3>${m.title}</h3>
  <p class="muted">${m.typical_range || ''}</p>
  <p><strong>芽生えるもの:</strong> ${(m.emerges || []).join(' / ')}</p>
  <div class="cx cx-father"><div class="cx-h">👨 高レバレッジ活動</div><ul>${(m.high_leverage || []).map(h => `<li>${inline(h)}</li>`).join('')}</ul>${m.father_edge ? `<p>${inline(m.father_edge)}</p>` : ''}</div>
  ${m.red_flags && m.red_flags.length ? `<div class="cx cx-warning"><div class="cx-h">⚠️ 受診の目安（赤旗）</div><ul>${m.red_flags.map(r => `<li>${inline(r)}</li>`).join('')}</ul></div>` : ''}
</article>`;
}
