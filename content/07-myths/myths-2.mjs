// 神話カード（追加分）
export default [
  {
    slug: 'comparison-trap', title: '「隣の子はもう歩く/話すのに」', evidence: 'B',
    claim: '同月齢の子より遅い＝発達に問題がある。', verdict: 'mostly-false',
    reality: '歩行も初語も正常範囲は非常に幅広い。時期の早い遅いは、その後の能力とほとんど関係しない。比較でなく、その子自身の連続的な変化を見るべき。',
    harm: '親の不安を煽り、焦りから詰め込みや叱責を招く。子にも伝わる。',
    instead: '正常範囲の広さを知り、明確な赤旗サインだけに注意する（→ 受診の目安）。',
    related: ['/track/01-red-flags/'], updated: '2026-07-06',
  },
  {
    slug: 'perfect-parent', title: '「完璧に関わらないと悪影響」', evidence: 'A',
    claim: '親は常に正しく、応答的で、失敗してはいけない。', verdict: 'false',
    reality: '"ほどよい親(good enough parenting)"で十分。すれ違いは避けられず、大切なのは仲直り(修復)。むしろ修復の経験が子の回復力を育てる。',
    harm: '親を追い詰め、罪悪感やストレスを生む。それ自体が家庭の空気を悪くする。',
    instead: '完璧を目指さず、一貫して応答し、すれ違ったら修復する。長く続けられる関わりを。',
    related: ['/science/04-attachment/', '/fathers-edge/04-teamwork/'], updated: '2026-07-06',
  },
  {
    slug: 'more-stimulation', title: '「刺激は多いほど脳に良い」', evidence: 'B',
    claim: '知育玩具・習い事・教材で刺激を詰め込むほど賢くなる。', verdict: 'oversold',
    reality: '過剰な刺激やスケジュールは、むしろ自由な遊び・休息・退屈から生まれる工夫を奪う。効くのは量でなく応答的で質の高いやりとり。',
    harm: '子と親を消耗させ、内発的動機や集中を損ないうる。',
    instead: '予定を詰めすぎない。自由な遊びと"何もしない"時間を守る。',
    related: ['/domains/play/', '/intro/seven-foundations/'], updated: '2026-07-06',
  },
  {
    slug: 'gendered-toys', title: '「女の子だから激しい遊びやブロックは不要」', evidence: 'B',
    claim: '性別で向いた遊びが決まっており、娘には静かな遊びを。', verdict: 'mostly-false',
    reality: '空間認知を育てるブロックや、情動調整を育てる活発な遊びの効果に性別は関係ない。遊びを性別で狭めることは、能力の芽を狭めることになりうる。',
    harm: '空間・運動・挑戦の経験機会を性別で制限してしまう。',
    instead: '性別で遊びを分けず、ブロック・ボール・ラフ＆タンブルも幅広く。',
    related: ['/domains/math-spatial/', '/fathers-edge/02-rough-and-tumble/'], updated: '2026-07-06',
  },
  {
    slug: 'talking-late-genius', title: '「男の子/賢い子は言葉が遅い」', evidence: 'C',
    claim: '言葉が遅いのは賢さや性別のせいで、心配ない。', verdict: 'mixed',
    reality: '多くの遅めの子は追いつくが、"必ず追いつく"わけではない。逸話的な思い込みで様子見を続けず、指さし・理解・やりとりの有無を確認し、気になれば相談を。',
    harm: '早期の気づき・支援のタイミングを逃しうる。',
    instead: '個人差は前提としつつ、赤旗サイン（指さしがない・理解が乏しい等）があれば早めに相談。',
    related: ['/track/01-red-flags/', '/domains/language/'], updated: '2026-07-06',
  },
];
