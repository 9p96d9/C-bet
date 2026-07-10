# 06 — 増築ガイド（実装セッション向け / for Opus & 並列セッション）

このリポジトリは「データを足すだけでページが増える」構造です。**コードはほぼ触らず、`content/` にファイルを追加**してください。

---

## 0. まず読む（順に）

1. `docs/00-vision.md` — 編集方針（煽らない・土台優先・父親の固有性・エビデンス等級）
2. `docs/01-information-architecture.md` — サイト地図
3. `docs/02-content-schema.md` — 各コンテンツtypeの正確なスキーマ ← **これに厳密に従う**
4. `docs/05-evidence-policy.md` — A〜D等級の付け方

## 1. ビルドと確認

```bash
node build/build.mjs        # content/ → site/ を生成（依存ゼロ）
python3 -m http.server -d site 8080   # http://localhost:8080 で確認
```

警告（必須フィールド欠落・不正なevidence・リンク切れ）はビルドログ末尾に出ます。**警告ゼロを目標に。**

## 2. どこに何を足すか

| 追加したいもの | 置き場所 | 形式 |
|---|---|---|
| 長文の章（科学・環境・記録） | `content/01-science/` 等の該当dir | `NN-slug.md`（frontmatter必須） |
| ドメインのハブ記事 | `content/03-domains/<domain-slug>.md` | `.md`（slug=ドメインslug） |
| ドメインのサブ記事（深掘り） | `content/03-domains/<domain-slug>/<slug>.md` | `.md`（type: domain-article。ハブに自動で一覧が載る） |
| 活動カード | `content/05-activities/*.mjs` | `export default [ {…}, … ]` |
| 月齢エントリ | `content/04-roadmap/*.mjs` | 同上 |
| 神話カード | `content/07-myths/*.mjs` | 同上 |
| 用語 | `content/09-appendix/glossary.mjs` | 配列に追記 |
| 参考文献 | `content/09-appendix/references.mjs` | 配列に追記 |

データ系（`.mjs`）は**1ファイルに何十件でも**入れてよい。ファイルは分割しても自動で全部読まれる（例: `activities/language.mjs`, `activities/motor.mjs`）。

## 3. 品質チェックリスト（1コンテンツ = Done条件）

- [ ] `evidence` を付けた（誇張しない。迷ったら1段下げる）
- [ ] 「なぜ効くか」を**具体的機序**で書いた（`:::science`）
- [ ] 「父が今日できること」に落ちている（`:::father` / `steps`）
- [ ] 安全上の注意があれば `:::warning` / `safety`
- [ ] 神話・過剰主張を含まない（含むなら是正として明示）
- [ ] `related` で関連ページへリンク（孤立させない）
- [ ] `summary` は1〜2文（一覧・カードに出る）

## 4. Markdown拡張（章で使える）

```
:::science  …機序…            :::   （🧠 青ボックス）
:::father  今日できること …    :::   （👨 緑ボックス）
:::warning …注意…             :::   （⚠️ 黄ボックス）
:::myth …誤解…                :::   （🚫 赤ボックス）
:::keypoint …要点…            :::   （📌 紫ボックス）
```

図は依存ゼロで増やすため **インラインSVG** を推奨：
````
```svg
<svg viewBox="0 0 640 300" role="img" aria-label="…">…</svg>
```
````

## 5. 並列作業のルール（複数セッションで同時に増築する場合）

**衝突を避けるため、セッションごとに担当ディレクトリを分ける。**

- 各セッションは**push前に必ず** `git pull --rebase origin <branch>` する。
- 触るのは**自分の担当 `content/` サブディレクトリのみ**。`build/`・`design-system/`・`_manifest.mjs` は原則触らない（変更が必要なら1セッションに集約し、他は待つ）。
- データ系 `.mjs` は**担当ごとに別ファイル名**にする（例: 言語担当は `activities/language.mjs`）。同一ファイルを複数セッションで編集しない。
- コミットは小さく、こまめに。コミットメッセージに担当範囲を書く（例: `content(activities): 言語カード12枚追加`）。

推奨の担当分割は `docs/07-work-split.md` を参照。

## 6. やってはいけない

- スキーマ外のフィールドを勝手に足す（テンプレートが拾わない）
- `evidence` を盛る／根拠のない断定
- 基本育児（授乳・寝かしつけ・病気対応）を書く（スコープ外）
- 特定商品・教室の宣伝
