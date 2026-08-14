# 02 — コンテンツスキーマ（Content Schema）

コンテンツは**構造化データ**として持つ。ビルドが型を見て適切なテンプレートで描画する。
これにより Opus は「データを足すだけ」で一貫した品質のページを量産できる。

2形式を使い分ける：

- **Markdown + frontmatter**（`.md`）… 長文の章（`chapter`, `domain-hub`）
- **JSデータモジュール**（`.mjs`, `export default [...]`）… 定型カード（`activity`, `milestone`, `myth`, `glossary`, `reference`）

すべての type に共通する**エビデンスレベル**は `05-evidence-policy.md` を参照。

---

## 1. 共通フィールド（全type）

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` / `slug` | string | ✔ | URLになる。kebab-case。セクション内で一意 |
| `title` | string | ✔ | 表示タイトル |
| `type` | string | ✔ | `chapter` / `domain-hub` / `domain-article` / `activity` / `milestone` / `myth` / `glossary` / `reference` |
| `summary` | string | ✔ | 1〜2文の要約（カード・OGP・一覧で使用） |
| `evidence` | `A`\|`B`\|`C`\|`D` | 章/カード | エビデンスレベル |
| `domains` | string[] | ✔(活動/月齢) | 関連ドメインslug |
| `updated` | string(YYYY-MM-DD) | ✔ | 更新日 |
| `related` | string[] | – | 関連コンテンツのパス |

---

## 2. `chapter`（長文章・Markdown）

```markdown
---
type: chapter
slug: 03-critical-periods
title: 敏感期 vs 臨界期 — 「窓は閉じる」神話を正す
summary: ほとんどの能力の窓は一生閉じない。臨界期が本当にある領域とそうでない領域を分ける。
evidence: A
domains: [language, sensory]
updated: 2026-07-06
related: [/science/02-plasticity/, /myths/windows-close/]
reading_minutes: 8
---

本文（後述のMarkdown拡張が使える）
```

### 本文で使える Markdown 拡張（ディレクティブ）

```
:::science
科学的機序の解説ボックス（青）
:::

:::father  今日できること
父親向け実践ボックス（緑）
:::

:::warning
安全・注意ボックス（黄）
:::

:::myth
神話 → 是正ボックス（赤／取り消し線見出し）
:::

:::keypoint
要点ボックス
:::

::: evidence A
このブロックの主張の等級バッジを差し込む
:::
```

図：`![alt](path)` に加え、`svg` フェンスで**インラインSVGダイアグラム**を直接埋め込める（依存ゼロで図を量産するため）。

---

## 2.5 `domain-article`（ドメインのサブ記事・Markdown）

ドメインハブ（`content/03-domains/<domain>.md`）から深掘りする各論。
**置き場所は `content/03-domains/<domain-slug>/<slug>.md`**（ディレクトリ名＝ドメインslug、`_manifest.mjs` の既知slugのみ）。
URL は `/domains/<domain>/<slug>/` になり、ハブ末尾の「深掘り記事」一覧に自動で載る。

```markdown
---
type: domain-article
slug: bilingual                # ドメイン内で一意（kebab-case）
title: おうちバイリンガルの実践方針
summary: 1〜2文の要約
evidence: B
domains: [language]
updated: 2026-07-10
order: 2                       # ハブ内の並び順（省略時はファイル名の数字→999）
reading_minutes: 7
related: [/science/11-bilingual/]
---

本文（chapter と同じ Markdown 拡張が使える）
```

注意：**先にハブ記事（`<domain>.md`）があること**（ないと警告）。サブ記事はハブの重複ではなく、ハブから一段深い各論を書く。

---

## 3. `activity`（活動カード・JSデータ）

図鑑の中核。1オブジェクト＝1カード。

```js
{
  slug: 'serve-return-narration',
  title: '実況中継トーク（サーブ＆リターン）',
  summary: '赤ちゃんの声・視線に0.5秒で応じ、見ているものを言葉にして返す。',
  type: 'activity',
  domains: ['language', 'social-emotional', 'executive-function'],
  ageRange: { minMonths: 0, maxMonths: 36 },  // 適用月齢
  minutes: 5,                                  // 目安所要時間
  effort: 'low',                               // low | medium | high（親の負荷）
  materials: [],                               // 道具（空=不要）
  goals: ['勉強に効く'],                        // 目的タグ: 勉強に効く/スポーツに効く/情緒/創造性
  evidence: 'A',
  father_edge: '低い声・違う語彙・違う遊び方が、言語入力の多様性を増やす。',
  steps: [
    '赤ちゃんが声を出す/何かを見たら、すぐ反応する（間を空けない）',
    'その対象を短い言葉で実況する（「わんわん、いたね」）',
    '赤ちゃんの反応を待ち、返ってきたらまた返す（ラリーを続ける）',
  ],
  why: 'サーブ＆リターンは前頭前皮質の神経回路を形成する…（機序）',
  variations: ['月齢が上がったら質問形式に', '入浴中・着替え中に習慣化'],
  safety: null,                                // 注意（なければnull）
  related: ['/science/05-serve-return/'],
  updated: '2026-07-06',
}
```

必須：`slug,title,summary,domains,ageRange,evidence,steps,why,father_edge`。

---

## 4. `milestone`（月齢エントリ・JSデータ）

```js
{
  ageBand: '6-9',                 // 0-3|3-6|6-9|9-12|12-18|18-24|24-30|30-36
  domain: 'gross-motor',
  slug: '6-9-gross-motor',
  title: 'お座り〜ずりばい〜つかまり立ちへ',
  emerges: ['支えなし座位', 'ずりばい/はいはい', '物への手の伸ばし精度向上'],
  typical_range: '多くは6〜10ヶ月（個人差大）',
  high_leverage: [                // slug参照 or 短文
    'うつ伏せ時間(tummy time)を遊びに',
    '床で自由に動ける安全空間',
  ],
  father_edge: '力強い持ち上げ遊び・高い高いで前庭感覚を刺激（安全に）',
  red_flags: ['9ヶ月で支えても座れない', '左右差が明確'],  // 受診目安
  evidence: 'B',
  related: ['/domains/gross-motor/'],
  updated: '2026-07-06',
}
```

---

## 5. `myth`（神話カード・JSデータ）

```js
{
  slug: 'windows-close',
  title: '「3歳までに◯◯しないと手遅れ」',
  claim: '発達の窓は3歳で閉じ、逃すと取り返せない。',
  verdict: 'mostly-false',        // false | mostly-false | mixed | oversold
  reality: '臨界期が明確なのは視覚・第一言語の音韻など一部。多くの認知・学業能力の窓は一生開き続ける。',
  evidence: 'A',
  harm: '親の不安を煽り、詰め込みや商品購入に走らせる。',
  instead: '締切ではなく"豊かで応答的な日常"の積み重ねを。',
  related: ['/science/03-critical-periods/'],
  updated: '2026-07-06',
}
```

`verdict` 表示: `false`=誤り / `mostly-false`=ほぼ誤り / `mixed`=一部正しい / `oversold`=誇張・商品化。

---

## 6. `glossary` / `reference`（JSデータ）

```js
// glossary
{ term: 'サーブ＆リターン', reading: 'サーブアンドリターン', slug: 'serve-return',
  definition: '子の発信に養育者が応じ合う往復のやりとり。神経回路形成の基本単位。',
  see_also: ['アタッチメント', '実行機能'] }

// reference
{ slug: 'center-dev-child', authors: 'Center on the Developing Child',
  year: 2016, title: 'From Best Practices to Breakthrough Impacts',
  org: 'Harvard University', url: 'https://developingchild.harvard.edu/',
  note: '土台の科学の一次情報源', tags: ['plasticity','serve-return'] }
```

---

## 7. バリデーション（ビルド時）

ビルドは以下を検査し、違反は**警告**として出力する（ビルドは止めない）：

- 必須フィールド欠落
- `evidence` が A〜D 以外
- `domains` が既知slug外
- 重複slug／ハブのないサブ記事ディレクトリ
- `ageRange.minMonths <= maxMonths`
- **内部リンク切れ・アンカー切れ**（`related` と本文中のリンクの両方）

→ 実装は `build/build.mjs`（リンク検査は生成後のHTMLに対して `checkLinks()` が実行し、
`✓ 内部リンク検査: N本 / Mページ` を出力する）。`/myths/#slug` のようなアンカーも
存在チェックの対象なので、神話カードのslugを変えたら参照元も直すこと。
