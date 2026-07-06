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

## 現状スナップショット（2026-07-06 / 107ページ・警告ゼロ・リンク切れゼロ）

S1〜S8の骨格とシードは**実装済み**。以降は主に「量」の増築フェーズ。

| セクション | 現状 | 次の目標 |
|---|---|---|
| 科学 `01-science` | 12章 | +4〜6章（メディア/ビデオデフィシット独立章・昼寝設計・EFの育て方・腸脳・自然/外遊びの科学 等） |
| 父親 `02-fathers-edge` | 4章 | +2〜3章（不在時間の質・きょうだい/一人っ子・叱りの科学） |
| ドメイン `03-domains` | 全10ハブ | 各ハブから**サブ記事**へ分割（例 language/bilingual, gross-motor/physical-literacy） |
| 月齢 `04-roadmap` | 46エントリ | 8帯×10ドメイン=80マスへ（約34マス不足）。`roadmap-fill-3.mjs` 以降に追加 |
| 図鑑 `05-activities` | 55枚 | **各ドメイン10枚以上／総150枚**目標。薄い所＝literacy, music, executive-function |
| 環境 `06-environment` | 3章 | +（スクリーン方針の独立章・きょうだい環境・安全と危険のバランス） |
| 神話 `07-myths` | 17枚 | +（早期英才教育・IQテスト・砂糖と多動・胎教 等） |
| 付録 `09-appendix` | 用語32/文献18 | 各コンテンツ増加に合わせ随時追記 |

## フェーズ2 担当割り（衝突しない単位で並列化）

| ストリーム | 触るファイル（新規のみ） | タスク |
|---|---|---|
| **P2-図鑑A** | `content/05-activities/act-literacy2.mjs` `act-music2.mjs` | literacy・music を各10枚まで |
| **P2-図鑑B** | `content/05-activities/act-ef.mjs` `act-language2.mjs` | 実行機能・言語を各10枚まで |
| **P2-月齢** | `content/04-roadmap/roadmap-fill-3.mjs` | 未充足マス（math/fine-motor/music/literacy の各帯）を補完 |
| **P2-科学** | `content/01-science/13-*.md` 以降 | メディア章・昼寝設計・EFの育て方 |
| **P2-ドメイン分割** | `content/03-domains/<domain>/*.md`（サブディレクトリ） | 深掘りサブ記事。※現状ビルドは `03-domains` 直下の `.md` をハブ扱い。サブ記事対応には `build/build.mjs` の `buildDomains` 拡張が必要 → **拡張は1セッションに集約**し、他は待つ |

**重要:** `slug` は全セクション内で一意。追加前に既存slugを確認（`grep -rh "slug:" content/05-activities/`）。`related` は実在パスのみ（ビルドのリンク検査を通す）。数値・時期は誇張せず、`evidence` は迷ったら1段下げる（→ `05-evidence-policy.md`）。
