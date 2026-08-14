# 3歳までの土台づくり大全 🌱

父親が、**科学的根拠にもとづいて娘（0〜3歳）の潜在能力を引き上げる**ための体系的リファレンス。
妻（保育士）が担う基本育児は前提とし、その上乗せ＝能力開発に特化する。

- **煽らない・急がせない・比べない** を貫く（不安を売る早期教育とは一線を画す）
- すべての主張に**エビデンス等級（A〜D）**を付与
- **依存ゼロ**の静的サイトジェネレータ。`content/` にデータを足すだけでページが増える

## クイックスタート

```bash
node build/build.mjs                 # content/ → site/ を生成（Node18+、外部依存なし）
python3 -m http.server -d site 8080  # http://localhost:8080 で閲覧
# または site/index.html を直接ブラウザで開く
```

## デプロイ（無料・自動）

**GitHub Pages** で公開中: **https://9p96d9.github.io/C-bet/**

`main` に push すると GitHub Actions（`.github/workflows/deploy-pages.yml`）が
自動でビルドし、`gh-pages` ブランチへ push して公開する（設定操作は不要）。
`gh-pages` はビルド成果物専用ブランチなので手で触らないこと。
サブパス配信のためのリンク書き換えは `BASE_PATH` 環境変数で自動対応済み。
詳細・代替サービス（Cloudflare Pages / Netlify）は `docs/08-deploy.md` を参照。

## サイト内検索

`/search/` で全ページ（章・ドメイン・実践図鑑・神話・月齢・用語）を横断検索できる。
ビルド時に `site/assets/search-index.json` を生成し、依存ゼロのJSが読み込む方式。
コンテンツを足せば索引も自動で増えるので、手動更新は不要。

## 構成

```
docs/          設計・定義（まずここを読む）
  00-vision …… 07-work-split / 08-deploy
build/         依存ゼロのビルド（markdown.mjs / templates.mjs / build.mjs）
design-system/ トークン・ベース・コンポーネントCSS（ライト/ダーク対応）
content/       コンテンツ本体（Markdown＋frontmatter / JSデータ）
  00-intro 01-science 02-fathers-edge 03-domains 04-roadmap
  05-activities 06-environment 07-myths 08-track 09-appendix
  _manifest.mjs  ← サイト構造の単一情報源
site/          ビルド成果物（ブラウザで即閲覧できるようコミット）
```

## 増築するには（Opus・並列セッション向け）

1. `docs/00-vision.md`〜`docs/07-work-split.md` を順に読む
2. `docs/02-content-schema.md` のスキーマに厳密に従い `content/` にファイルを追加
3. `node build/build.mjs` で警告ゼロを確認 → commit → push

並列で作業する場合は `docs/07-work-split.md` の担当割りに従い、**push前に必ず `git pull --rebase`**。

## 免責

本資料は情報提供を目的とし、医療・発達診断・専門的助言に代わるものではありません。
