# 08 — 無料静的デプロイ（GitHub Pages）

このサイトは依存ゼロの静的サイトなので、**GitHub Pages に無料でホスティング**できる。
`main` に push するだけで GitHub Actions が自動でビルド・公開する仕組みを導入済み。

**公開URL: `https://<ユーザー名>.github.io/<リポジトリ名>/`**

## 仕組み（gh-pages ブランチ方式）

```
main へ push
  └→ .github/workflows/deploy-pages.yml が起動
       ├→ BASE_PATH=/<リポジトリ名> で node build/build.mjs を実行
       └→ site/ を gh-pages ブランチとして force push
            └→ GitHub Pages が gh-pages ブランチを自動配信
```

- Pages の有効化は **gh-pages ブランチの初回 push 時に GitHub が自動で行った**（設定画面の操作は不要だった）
- `gh-pages` はビルド成果物専用ブランチ。履歴を持たず毎回作り直されるので、**手で触らない**
- ワークフローの GITHUB_TOKEN は Pages サイトの新規作成権限を持たないため、
  `actions/configure-pages` の `enablement: true` 方式は `Resource not accessible by integration`
  で失敗する（初回導入時に実際に失敗した）。gh-pages 方式ならトークンは `contents: write` だけで足りる

### BASE_PATH について

サイト内リンクはすべてルート絶対パス（`/science/` など）で生成される。
GitHub Pages のプロジェクトサイトは `/<リポジトリ名>/` 配下で配信されるため、
ビルド時に環境変数 `BASE_PATH` を渡すと全リンク（`href` / `src`）に接頭辞が付く。

```bash
node build/build.mjs                      # ルート配信用（ローカル閲覧・独自ドメイン）
BASE_PATH=/sodate-no-dodai node build/build.mjs     # サブパス配信用（GitHub Pages）
```

**リポジトリにコミットする `site/` はルート配信版（BASE_PATHなし）を維持する**こと。
ローカルで `python3 -m http.server -d site 8080` でそのまま閲覧できるようにするため。
Pages 用のサブパス版はワークフロー内で毎回ビルドされ、gh-pages にのみ入る。

> **注意（無料条件）:** GitHub Free プランで Pages を使えるのは**公開リポジトリのみ**。
> Private に変更した場合は Pages が止まるので、下記の代替サービスへ移行する。

## その他生成物

ビルドは静的ホスティング向けに以下も出力する:

- `site/404.html` — 存在しないURLで表示されるエラーページ（Pages が自動で使う）
- `site/.nojekyll` — Pages の Jekyll 処理を無効化（Markdownファイル等の誤処理防止）
- `site/sitemap.xml` / `site/robots.txt` — 検索エンジン向け（`SITE_ORIGIN` 指定時のみ生成）

### SEO / OGP メタタグ

全ページに OGP・Twitter カードのメタタグを出力する（`og:title` / `og:description` /
`og:type` / `og:site_name` / `twitter:card` 等）。URLに依存する `canonical` と `og:url`、
および `sitemap.xml` / `robots.txt` は**絶対URLが必要**なため、環境変数 `SITE_ORIGIN`
（例: `https://9p96d9.github.io`）を渡したときだけ生成される。

```bash
node build/build.mjs                                              # 相対配信（canonical/sitemap なし）
SITE_ORIGIN=https://9p96d9.github.io BASE_PATH=/sodate-no-dodai node build/build.mjs  # 絶対URL付き
```

ワークフローでは `SITE_ORIGIN=https://<owner>.github.io` を自動で渡している。
`site/` に**コミットするのは相対配信版**（SITE_ORIGIN なし）なので、絶対URLの
canonical/sitemap はコミットには含まれず、Pages 用にデプロイ時だけ埋め込まれる。

## 代替の無料ホスティング

いずれも git リポジトリを接続するだけで、push のたびに自動デプロイされる。
ルートドメイン配信なので **BASE_PATH は不要**。Private リポジトリでも無料。

| サービス | ビルドコマンド | 出力ディレクトリ | 備考 |
|---|---|---|---|
| Cloudflare Pages | `node build/build.mjs` | `site` | 帯域無制限・独自ドメイン無料 |
| Netlify | `node build/build.mjs` | `site` | 月100GB帯域まで無料 |
| Vercel | `node build/build.mjs` | `site` | 商用利用は有料プラン |

`site/` をコミットしているので、ビルドコマンドを空にして `site` を直接公開する設定でも動く。

## トラブルシューティング

- **CSSが当たらない／リンクが404** → BASE_PATH が渡っていない。ワークフローのビルドステップを確認
- **push しても更新されない** → デプロイ対象は `main` のみ。作業ブランチはマージ後に反映。
  Actions タブで `Deploy to GitHub Pages` の実行状況を確認
- **初回公開直後に404** → Pages の初回ビルドに1〜2分かかる。少し待ってリロード
- **Source を変えたい** → Settings → Pages。「GitHub Actions」方式に切り替える場合は
  ワークフローを actions/deploy-pages 構成に戻す必要がある
