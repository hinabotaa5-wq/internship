# ブランチ戦略（GitHub Flow）

## ブランチの種類と用途

| ブランチ名 | 用途 |
|---|---|
| `main` | 本番相当の安定ブランチ。直接コミット禁止、PR経由でのみマージする |
| `feature/<名前>` | 新機能の開発。`main` から分岐し、完了後に PR を出す |
| `fix/<名前>` | バグ修正。`main` から分岐し、完了後に PR を出す |
| `docs/<名前>` | ドキュメントのみの変更 |
| `chore/<名前>` | 設定・ツール・依存関係などの雑務 |

## 命名規則

- 形式: `<type>/<kebab-case-description>`
- 英小文字・数字・ハイフンのみ使用する
- 例:
  - `feature/google-oauth`
  - `fix/cache-race-condition`
  - `docs/update-readme`

## ルール

- `main` への直接プッシュは禁止。必ず PR を経由する
- ブランチは作業完了後にマージ・削除する
- 1ブランチ = 1目的（複数の変更を混在させない）

---

# コミットメッセージ規約

VS Code(および Claude Code)でコミットを作成する際は、[Conventional Commits](https://www.conventionalcommits.org/ja/v1.0.0/) の形式に従うこと。

## 基本フォーマット

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## type 一覧

| type | 用途 |
|---|---|
| `feat` | 新機能の追加 |
| `fix` | バグ修正 |
| `docs` | ドキュメントのみの変更 |
| `style` | フォーマット・セミコロン等、動作に影響しない変更 |
| `refactor` | バグ修正や機能追加を伴わないコード変更 |
| `perf` | パフォーマンス改善 |
| `test` | テストの追加・修正 |
| `build` | ビルドシステムや外部依存関係の変更(例: npm, webpack) |
| `ci` | CI設定ファイル・スクリプトの変更 |
| `chore` | その他、上記に当てはまらない変更(ソース・テスト以外) |
| `revert` | 過去のコミットの取り消し |

## ルール

- `description` は命令形・現在形で簡潔に(例: `add`, `fix`, ~`added`, `fixed`)
- `description` および `body` は日本語での記述を許可する
- 1行目(タイトル)は50文字程度以内を目安にする
- 破壊的変更がある場合は、`type` の後に `!` を付けるか、フッターに `BREAKING CHANGE:` を記載する
  - 例: `feat!: change API response format`
- scope は変更範囲を括弧で示す(任意)。例: `fix(auth): correct token refresh logic`
- body には「何を」ではなく「なぜ」変更したかを書く
- Issue番号がある場合はフッターに記載する(例: `Closes #123`)

## 例

```
feat(login): add support for Google OAuth

Google OAuthでのログインを可能にし、既存のメール/パスワード
ログインと共存させる。

Closes #45
```

```
fix: prevent race condition in cache invalidation

Closes #102
```

```
feat!: drop support for Node 16

BREAKING CHANGE: Node 16のサポートを終了し、最低要件をNode 18に引き上げる
```
