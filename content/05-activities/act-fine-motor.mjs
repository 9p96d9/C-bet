// P2-図鑑・fine-motor: 微細運動ドメインを15枚水準へ（+2）
export default [
  {
    slug: 'sticker-play', title: 'シールはがし・ぺたぺた', type: 'activity',
    summary: 'シールを台紙からはがして貼る——それだけで指先の分離・つまみ・力加減の総合練習になる。',
    domains: ['fine-motor', 'executive-function'], ageRange: { minMonths: 12, maxMonths: 30 },
    minutes: 10, effort: 'low', materials: ['大きめのシール', '貼っていい紙やノート'], goals: ['勉強に効く'], evidence: 'C',
    father_edge: 'コンビニで買える最安の知育教材。出張土産を「ご当地シール」にすると、不在明けの再会遊びが定番化する。',
    steps: ['台紙の角を少し折ってはがしやすくして渡す', '自分ではがすのを待つ（もどかしくても手を出さない）', '「ここに貼って」と丸を描いた的に貼らせる', '慣れたら「線の上に並べて貼る」に難度を上げる'],
    why: '薄いシールを端からはがす動作は、親指と人差し指の精密なつまみ（ピンサーグリップ）と両手の役割分担（片手は台紙を保持）を要求する。貼る位置を狙う段階では目と手の協応、我慢して丁寧にやる自己制御も働く。後の鉛筆操作・箸につながる基礎訓練。',
    variations: ['顔の輪郭に目鼻シールで福笑い', '貼ったシールをまたはがして貼り直す（はがす方が高難度）'],
    safety: '小さいシールは誤飲注意。口に入れる時期は大きいサイズのみ。',
    related: ['/activities/rainy-day-tape/', '/domains/fine-motor/'], updated: '2026-07-09',
  },
  {
    slug: 'clothespin-game', title: 'せんたくばさみあそび（つまんで、ぱちん）', type: 'activity',
    summary: '洗濯ばさみを箱のふちに挟む・外す・紙にたてがみとして付ける。バネの抵抗が指の力を育てる。',
    domains: ['fine-motor', 'play', 'math-spatial'], ageRange: { minMonths: 24, maxMonths: 36 },
    minutes: 10, effort: 'low', materials: ['洗濯ばさみ数個', '空き箱か厚紙'], goals: ['勉強に効く', '創造性'], evidence: 'C',
    father_edge: '洗濯物を取り込む家事とセットにできる「ながら遊び」。父の家事参加がそのまま子の指先教材になる。',
    steps: ['父が親指と人差し指で「ぱちん」と開いて見せる', '箱のふちに挟む・外すを自由にやらせる', '丸い厚紙に挟んで「ライオンのたてがみ」を作る', '「赤いのを3つちょうだい」と色・数の指示を混ぜる'],
    why: '洗濯ばさみはバネの抵抗に逆らって開く必要があり、指の対立運動と手内筋の筋力を効率よく鍛える——作業療法でも定番の教材。挟む位置の調整は目と手の協応、色・数の指示は認知課題の重ね掛けになる。',
    variations: ['ロープに人形の服を干す「ミニ物干しごっこ」', '挟んだ数をいっしょに数える'],
    safety: '指を挟んでも痛くない弱めのバネの物を選ぶ。口に入れない見守りを。',
    related: ['/activities/laundry-sorting/', '/activities/sticker-play/', '/domains/fine-motor/'], updated: '2026-07-09',
  },
];
