# 08 — 無料静的デプロイ（GitHub Pages）

このサイトは依存ゼロの静的サイトなので、**GitHub Pages に無料でホスティング**できる。
`main` に push するだけで GitHub Actions が自動でビルド・公開する仕組みを導入済み。

## 仕組み

```
main へ push
  └→ .github/workflows/deploy-pages.yml が起動
       ├→ actions/configure-pages が公開URL（サブパス）を検出
       ├→ BASE_PATH=/<リポジトリ名> で node build/build.mjs を実行
       └→ site/ を GitHub Pages にデプロイ
```

公開URLは `https://<ユーザー名>.github.io/<リポジトリ名>/` になる。

### BASE_PATH について

サイト内リンクはすべてルート絶対パス（`/science/` など）で生成される。
GitHub Pages のプロジェクトサイトは `/<リポジトリ名>/` 配下で配信されるため、
ビルド時に環境変数 `BASE_PATH` を渡すと全リンク（`href` / `src`）に接頭辞が付く。

```bash
node build/build.mjs                      # ルート配信用（ローカル閲覧・独自ドメイン）
BASE_PATH=/C-bet node build/build.mjs     # サブパス配信用（GitHub Pages）
```

**リポジトリにコミットする `site/` はルート配信版（BASE_PATHなし）を維持する**こと。
ローカルで `python3 -m http.server -d site 8080` でそのまま閲覧できるようにするため。
Pages 用のサブパス版はワークフロー内で毎回ビルドされ、コミットには含まれない。

## 初回セットアップ

原則不要。ワークフローの `configure-pages` に `enablement: true` を指定してあるため、
初回実行時に Pages が自動で有効化される（Source は GitHub Actions になる）。
`main` に push（または Actions タブから `Deploy to GitHub Pages` を手動実行）すれば、
数十秒後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開される。

自動有効化が権限エラーで失敗した場合のみ、手動で
**Settings → Pages → Source を「GitHub Actions」** に設定してから再実行する。

> **注意（無料条件）:** GitHub Free プランで Pages を使えるのは**公開リポジトリのみ**。
> リポジトリが Private の場合は、Public に変更するか、下記の代替サービスを使う。

## その他生成物

ビルドは静的ホスティング向けに以下も出力する:

- `site/404.html` — 存在しないURLで表示されるエラーページ（Pages が自動で使う）
- `site/.nojekyll` — Pages の Jekyll 処理を無効化（ブランチ配信時の事故防止）

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

- **CSSが当たらない／リンクが404** → BASE_PATH が渡っていない。ワークフローの
  `configure-pages` ステップと `BASE_PATH: ${{ steps.pages.outputs.base_path }}` を確認。
- **Actions が失敗する（Pages not enabled）** → 初回セットアップの手順1〜2が未実施。
- **push しても更新されない** → デプロイ対象は `main` のみ。作業ブランチからは
  マージ後に反映される。Actions タブで実行状況を確認。
