# 04 — デザインシステム（Design System）

実体は `design-system/*.css`。本書はその意図と使い方。**信頼できて、温かく、読みやすい**を狙う。

## 原則

- **静けさ。** 情報量が多い資料だからこそ、装飾を抑え余白で整理する。
- **温かさ×信頼。** 緑（成長）を基調に、琥珀（温もり）と青（科学）を補助に。
- **可読性最優先。** 本文16.5px / 行間1.8 / 本文幅760px。日本語の見やすさを最優先。
- **ライト/ダーク両対応。** OSに追従し、右上トグルで上書き（localStorage保存）。

## トークン（`tokens.css`）

- 色は意味で持つ：`--bg` `--surface` `--text` `--muted` `--line` `--accent` と、
  科学＝blue / 注意＝amber / 成長＝green / 誤解＝red / 要点＝purple の系統色。
- 角丸 `--r-sm/-r/-r-lg`、間隔 `--sp-*`、レイアウト幅 `--wrap/--side/--toc-w`。
- ダークは `@media (prefers-color-scheme)` と `:root[data-theme]` の両方で定義。

## レイアウト（`base.css`）

3カラム：**サイドナビ｜本文｜目次(TOC)**。
- 1080px以下でTOCを畳み、820px以下で1カラム＋ハンバーガー（`.nav-open`）。
- 上部に sticky トップバー（ブランド／メニュー／テーマ切替）。

## コンポーネント（`components.css` ＋ `build/templates.mjs`）

| 部品 | 生成元 | 用途 |
|---|---|---|
| エビデンスバッジ `.badge.ev-a…d` | `evidenceBadge()` | 主張の等級表示 |
| チップ `.chip`（age/time）/ タグ `.tag` | `ageChip()` 等 | 月齢・所要時間・ドメイン |
| コールアウト `.cx.cx-*` | Markdown `:::` | 科学/父/注意/誤解/要点 |
| カード `.card`（act/myth/ms） | `activityCard()` 等 | 図鑑・神話・月齢 |
| 章リスト / ドメイングリッド / 月齢バンド | build内 | 各ハブの一覧 |
| ヒーロー / ピラー / スタッツ | `buildLanding()` | トップページ |

## 拡張のルール

- **新コンポーネントはCSSクラス＋templates.mjsの関数**で足す。インラインstyleを本文に書かない。
- 色は必ずトークン経由（生の16進を本文に置かない）。ダーク対応を壊さない。
- コントラスト比・`aria-label`・キーボード操作（skipリンク、`role="img"`）を維持。
