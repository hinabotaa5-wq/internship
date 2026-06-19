#!/bin/bash

set -eo pipefail

# Rye を有効化する
source ~/.rye/env

# Rye で依存関係をインストールする
rye sync

# (可能なら) マイグレーションを実行する
rye run flask db init || true
rye run flask db upgrade || true

# データベースに初期データを追加する
echo "データベースに初期データを追加中..."
python seed_db.py || echo "初期データの追加に失敗しました（既に存在する可能性があります）"

~/.cargo/bin/watchexec --poll 100 -r --exts py,html -v -- \
  rye run flask --debug run --no-reload --host 0.0.0.0

tail -f /dev/null
