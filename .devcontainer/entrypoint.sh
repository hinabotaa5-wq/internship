#!/bin/bash

set -eo pipefail

# uv で仮想環境を作成し、依存関係をインストールする
# (ホストとコンテナでインタプリタのパスが変わりうるため、既存の .venv があっても毎回作り直す)
uv venv .venv --python 3.12 --clear
uv pip sync --python .venv/bin/python requirements-dev.lock

# (可能なら) マイグレーションを実行する
.venv/bin/flask db init || true
.venv/bin/flask db upgrade || true

# データベースに初期データを追加する
echo "データベースに初期データを追加中..."
.venv/bin/python seed_db.py || echo "初期データの追加に失敗しました（既に存在する可能性があります）"

~/.cargo/bin/watchexec --poll 100 -r --exts py,html -v -- \
  .venv/bin/flask --debug run --no-reload --host 0.0.0.0

tail -f /dev/null
