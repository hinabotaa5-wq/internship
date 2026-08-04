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
