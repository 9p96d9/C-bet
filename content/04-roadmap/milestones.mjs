// 月齢マイルストーン。ageBand × domain で1エントリ。個人差は大きく時期は目安。
// Opusは各ageBand×各domainを埋めていく（現状は代表帯をシード）。
export default [
  // ---- 0-3ヶ月 ----
  {
    ageBand: '0-3', domain: 'gross-motor', slug: '0-3-gross-motor',
    title: '首すわりへ向かう', evidence: 'B', typical_range: '首すわりは多くが3〜4ヶ月',
    emerges: ['うつ伏せで頭を持ち上げる', '手足を活発に動かす', '追視（目で追う）'],
    high_leverage: ['うつ伏せ遊び（tummy time）を少しずつ', '目の高さで声かけ・追視を促す'],
    father_edge: '胸の上のうつ伏せで、父の顔を"的"にして頭上げを促す。',
    red_flags: ['4ヶ月で全く頭を上げようとしない', '手足の動きに明確な左右差'],
    related: ['/activities/tummy-time-play/', '/domains/gross-motor/'], updated: '2026-07-06',
  },
  {
    ageBand: '0-3', domain: 'language', slug: '0-3-language',
    title: '声とやりとりの芽', evidence: 'B', typical_range: '社会的微笑は約2ヶ月',
    emerges: ['クーイング（母音的な発声）', '人の声への注意', '社会的微笑'],
    high_leverage: ['実況中継トーク（サーブ＆リターン）', '子の発声に間を置いて返す'],
    father_edge: '低い声・歌うような抑揚（parentese）で語りかける。',
    red_flags: ['大きな音に全く反応しない', '2ヶ月過ぎても目が合わない/微笑まない'],
    related: ['/activities/serve-return-narration/', '/science/05-serve-return/'], updated: '2026-07-06',
  },
  {
    ageBand: '0-3', domain: 'social-emotional', slug: '0-3-social',
    title: '愛着の土台づくり', evidence: 'A', typical_range: '—',
    emerges: ['泣きで欲求を伝える', '抱っこで落ち着く', 'アイコンタクト'],
    high_leverage: ['泣きに一貫して応じる', '肌の触れ合い・抱っこ', '予測可能な関わりの反復'],
    father_edge: '沐浴・寝かしつけなど"父の担当場面"を一つ持ち、一貫して関わる。',
    red_flags: ['あやしても極端に反応が乏しい'],
    related: ['/science/04-attachment/'], updated: '2026-07-06',
  },
  // ---- 6-9ヶ月 ----
  {
    ageBand: '6-9', domain: 'gross-motor', slug: '6-9-gross-motor',
    title: 'お座り〜ずりばいへ', evidence: 'B', typical_range: '支えなし座位は6〜9ヶ月、はいはいは個人差大',
    emerges: ['支えなしで座る', 'ずりばい・はいはい', '物への手の伸ばしが正確に'],
    high_leverage: ['自由に動ける安全な床の時間', '少し先に玩具を置いて移動を誘う'],
    father_edge: '力強い持ち上げ・低い障害物越えなど、体を大きく使う遊びで前庭感覚を刺激（安全に）。',
    red_flags: ['9ヶ月で支えても座れない', '体の片側だけ使う傾向が続く'],
    related: ['/activities/floor-freedom/', '/domains/gross-motor/'], updated: '2026-07-06',
  },
  {
    ageBand: '6-9', domain: 'language', slug: '6-9-language',
    title: '喃語と共同注意', evidence: 'B', typical_range: '規準喃語（ばばば等）は約6〜9ヶ月',
    emerges: ['子音を含む喃語（ばばば/ままま）', '名前に振り向く', '共同注意の芽（大人の視線を追う）'],
    high_leverage: ['喃語に会話のように返す', '子が見ているものを名づける', '絵本の指さし'],
    father_edge: '散歩で見えるものを名づける"名づけ探検"で語彙のシャワーを。',
    red_flags: ['9ヶ月で喃語が出ない', '声や名前への反応が乏しい'],
    related: ['/activities/naming-walk/', '/domains/language/'], updated: '2026-07-06',
  },
  {
    ageBand: '6-9', domain: 'executive-function', slug: '6-9-ef',
    title: '対象の永続性', evidence: 'B', typical_range: '約8ヶ月前後で芽生え',
    emerges: ['隠れた物を探す', 'いないいないばあを楽しむ', '短い予測（次に何が起こるか）'],
    high_leverage: ['いないいないばあ', '布の下に隠した玩具を探させる'],
    father_edge: '大きな表情と"ため"で予測と驚きの往復を演出。',
    red_flags: [],
    related: ['/activities/peekaboo/', '/domains/executive-function/'], updated: '2026-07-06',
  },
  // ---- 12-18ヶ月 ----
  {
    ageBand: '12-18', domain: 'gross-motor', slug: '12-18-gross-motor',
    title: '歩行の獲得', evidence: 'B', typical_range: '独歩は12〜15ヶ月が多いが9〜18ヶ月と幅広い',
    emerges: ['つたい歩き→独歩', 'しゃがむ・立つ', '押す玩具で歩く'],
    high_leverage: ['安全に歩き回れる空間', '登る・降りるの機会（クッション山）'],
    father_edge: 'ラフ＆タンブルや"抱えて飛行機"でバランス・体幹を遊びに。',
    red_flags: ['18ヶ月で全く歩かない', 'つま先立ちが常態化'],
    related: ['/activities/rough-and-tumble/', '/domains/gross-motor/'], updated: '2026-07-06',
  },
  {
    ageBand: '12-18', domain: 'language', slug: '12-18-language',
    title: '初語〜語彙の入り口', evidence: 'B', typical_range: '初語は約12ヶ月、幅広い',
    emerges: ['意味のある初語', '指さしで要求・共有', '簡単な指示の理解'],
    high_leverage: ['対話的読み聞かせ', '子の一語を"拡張"して返す'],
    father_edge: '父の語彙・話題を持ち込み、言葉の幅を広げる。',
    red_flags: ['指さしが出ない', '18ヶ月で意味のある語が全くない'],
    related: ['/activities/dialogic-reading/', '/domains/language/'], updated: '2026-07-06',
  },
];
