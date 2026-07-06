// サイト構造の単一情報源。ナビ順・セクション定義・ドメイン一覧。
// Opusはここに章/カードを足し、必要なら新セクションを追加する。

export const DOMAINS = [
  { slug: 'language', name: '言語・コミュニケーション', icon: '💬' },
  { slug: 'gross-motor', name: '粗大運動・スポーツ', icon: '🤸' },
  { slug: 'fine-motor', name: '微細運動・手の巧緻性', icon: '✋' },
  { slug: 'math-spatial', name: '数・量・空間認知', icon: '🔢' },
  { slug: 'executive-function', name: '実行機能・自己制御', icon: '🎯' },
  { slug: 'music', name: '音楽・リズム・聴覚', icon: '🎵' },
  { slug: 'sensory', name: '視覚・感覚統合', icon: '👁️' },
  { slug: 'social-emotional', name: '社会情動・共感', icon: '❤️' },
  { slug: 'play', name: '好奇心・探索・遊び', icon: '🧩' },
  { slug: 'literacy', name: '読み聞かせ・リテラシー', icon: '📖' },
];

// kind: landing | chapters | domains | activities | milestones | myths | glossary | reference
export const SECTIONS = [
  { slug: '', title: 'トップ', icon: '🌱', kind: 'landing', nav: false },
  { slug: 'intro', title: 'はじめに', icon: '🧭', kind: 'chapters', dir: '00-intro',
    blurb: 'この資料の歩き方・大前提・エビデンスの読み方' },
  { slug: 'science', title: '土台の科学', icon: '🧠', kind: 'chapters', dir: '01-science',
    blurb: 'なぜ0-3歳が効くのか。可塑性・敏感期・愛着・睡眠・運動' },
  { slug: 'fathers-edge', title: '父親の強み', icon: '👨', kind: 'chapters', dir: '02-fathers-edge',
    blurb: '父親関与の科学。母親と差別化できる固有の貢献' },
  { slug: 'domains', title: '発達ドメイン', icon: '🧩', kind: 'domains', dir: '03-domains',
    blurb: '10の能力の柱ごとの深掘りハブ' },
  { slug: 'roadmap', title: '月齢ロードマップ', icon: '🗺️', kind: 'milestones', dir: '04-roadmap',
    blurb: '0-36ヶ月。マイルストーンと高レバレッジ活動' },
  { slug: 'activities', title: '実践図鑑', icon: '🎴', kind: 'activities', dir: '05-activities',
    blurb: '父親が今日できる活動カード（月齢・ドメインで絞り込み）' },
  { slug: 'environment', title: '環境デザイン', icon: '🏡', kind: 'chapters', dir: '06-environment',
    blurb: '玩具・絵本・スクリーン方針・家庭の設え' },
  { slug: 'myths', title: '神話と落とし穴', icon: '🚫', kind: 'myths', dir: '07-myths',
    blurb: '早期教育の過剰主張・「窓は閉じる」神話の是正' },
  { slug: 'track', title: '記録と見守り', icon: '📈', kind: 'chapters', dir: '08-track',
    blurb: '発達の記録・急がない姿勢・受診の目安' },
  { slug: 'appendix', title: '付録', icon: '📚', kind: 'glossary', dir: '09-appendix',
    blurb: '用語集・参考文献' },
];

// 月齢帯
export const AGE_BANDS = ['0-3', '3-6', '6-9', '9-12', '12-18', '18-24', '24-30', '30-36'];
