# 07 — 並列作業の分担表（Work Split）

複数セッション（Opus等）で同時に増築するための担当割り。**衝突を避けるため、各セッションは自分の担当ディレクトリ／ファイルだけを触る。**

## 共通ルール（再掲）

- push前に必ず `git pull --rebase origin claude/infant-development-resource-8ovg6w`
- `build/` `design-system/` `content/_manifest.mjs` は**触らない**（変更が要るなら1セッションに集約）
- データ系 `.mjs` は担当ごとに別ファイル名（下表）
- コミットは小さくこまめに。メッセージに担当を明記

## 担当割り（推奨）

| ストリーム | 担当ファイル／ディレクトリ | 内容 | 依存 |
|---|---|---|---|
| **S1 科学** | `content/01-science/*.md` | 可塑性・ストレス・睡眠・栄養・運動・言語シャワー等の残り章 | schema 02, evidence 05 |
| **S2 父親** | `content/02-fathers-edge/*.md` | ラフ＆タンブル・押し出す愛着・言語のブリッジ・役割分担 等 | S1の一部を参照 |
| **S3 ドメイン** | `content/03-domains/*.md` | 未執筆の7ドメインハブ（fine-motor, math-spatial, music, sensory, social-emotional, play, literacy） | schema 02 |
| **S4 月齢** | `content/04-roadmap/roadmap-*.mjs` | 8帯 × 10ドメインのマス目を埋める（別ファイルで） | ドメイン名はmanifest |
| **S5 活動図鑑** | `content/05-activities/act-<domain>.mjs` | ドメイン別に活動カードを量産（各20〜50枚目標） | schema 02 |
| **S6 環境** | `content/06-environment/*.md` | 玩具・絵本・家庭の設え・自然/リスク遊び | — |
| **S7 神話** | `content/07-myths/myths-2.mjs` | 神話カードの追加 | — |
| **S8 記録/付録** | `content/08-track/*.md`, `content/09-appendix/glossary.mjs`(追記), `references.mjs`(追記) | チェックリスト・用語・文献 | 全体から用語を回収 |

## ファイル名の衝突回避

- 活動: `act-language.mjs` / `act-motor.mjs` / `act-math.mjs` …（`core.mjs` は既存）
- 月齢: `roadmap-0-3.mjs` / `roadmap-3-6.mjs` …（`milestones.mjs` は既存シード）
- 神話: `myths-2.mjs`, `myths-3.mjs` …（`myths.mjs` は既存）

ビルドは各ディレクトリの `.mjs` を**全て自動で読む**ので、ファイルを分けるほど衝突しない。

## 進め方の型（各ストリーム）

1. `git pull --rebase` → 2. 担当ファイルに追加 → 3. `node build/build.mjs`（警告ゼロ確認）→ 4. commit → 5. `git pull --rebase` → 6. `git push`

---

## 現状スナップショット（2026-07-09 / 182ページ・警告ゼロ・リンク切れゼロ）

S1〜S8の骨格とシードは**実装済み**。目的別コース（/goals/）・ビルド拡張・**無料デプロイ（GitHub Pages / gh-pages方式）** も完了。フェーズ2の「量」の増築を継続中。
※ 公開URL: https://9p96d9.github.io/C-bet/ 。`main` へ push すると自動ビルド・デプロイ（→ `docs/08-deploy.md`）。

| セクション | 現状 | 次の目標 |
|---|---|---|
| 科学 `01-science` | **16章**（腸脳・実行機能の育て方を追加） | +（きょうだい/出生順・睡眠と昼寝の設計 等） |
| 父親 `02-fathers-edge` | **5章**（不在時間の質を追加） | +1〜2章（きょうだい/一人っ子・叱りの科学） |
| ドメイン `03-domains` | 全10ハブ | 各ハブから**サブ記事**へ分割（例 language/bilingual）※ビルド拡張が要るので1セッションに集約 |
| 月齢 `04-roadmap` | **80/80マス完成** | 完了。必要なら各マスの記述を深める程度 |
| 図鑑 `05-activities` | **128枚**（literacy 23・music 22・play 29・fine-motor 30・math 32・social 39・EF 39・gross 34・sensory 33・language 51） | **総150枚**目標（あと約22枚）。全ドメイン22以上。goal: 勉強84・創造性47・情緒31・スポーツ29 |
| 目的別コース `/goals/` | 4コース実装済 | 活動を足せば自動で反映（`build.mjs` の GOALS 定義で科学リンクを調整可） |
| 環境 `06-environment` | **4章**（安全と危険のバランスを追加） | +（きょうだい環境・モンテッソーリ的家庭の設え） |
| 神話 `07-myths` | **22枚**（早期英才・砂糖・胎教・スマホあやし・歩行器を追加） | +（IQテスト・きょうだい比較・利き手 等） |
| 付録 `09-appendix` | 用語31/文献19 | 各コンテンツ増加に合わせ随時追記 |
| デプロイ/SEO | **完了**（自動デプロイ・OGP・sitemap.xml・robots.txt・404） | 独自ドメイン・OG画像を足すなら任意 |

## フェーズ2 担当割り（衝突しない単位で並列化 / Fable単独でも順に）

| ストリーム | 触るファイル（新規のみ） | タスク |
|---|---|---|
| **P2-図鑑・literacy** | `content/05-activities/act-literacy2.mjs` | literacy を +6枚（計15へ） |
| **P2-図鑑・music/play** | `content/05-activities/act-music-play.mjs` | music・play を各15へ |
| **P2-図鑑・fine-motor** | `content/05-activities/act-fine-motor.mjs` | fine-motor を +（計15へ） |
| **P2-神話** | `content/07-myths/myths-4.mjs` | 神話カード +5枚 |
| **P2-環境** | `content/06-environment/04-*.md` 以降 | スクリーン方針・安全と危険・家庭の設え |
| **P2-父親** | `content/02-fathers-edge/05-*.md` 以降 | 不在時間の質・叱りの科学 |
| **P2-科学** | `content/01-science/15-*.md` 以降 | 腸脳・EFの育て方 独立章 |
| **P2-ドメイン分割** | `build/build.mjs` の `buildDomains` 拡張＋`content/03-domains/<domain>/*.md` | サブ記事対応。**ビルド変更を伴うので必ず単独セッションで**、他ストリームと同時に走らせない |

**重要:** `slug` は全セクション内で一意。追加前に既存slugを確認（`grep -rh "slug:" content/05-activities/`）。`related` は実在パスのみ（ビルドのリンク検査を通す）。数値・時期は誇張せず、`evidence` は迷ったら1段下げる（→ `05-evidence-policy.md`）。ビルド系（`build/` `design-system/` `_manifest.mjs`）は原則触らない。
