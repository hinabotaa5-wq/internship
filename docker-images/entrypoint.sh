#!/bin/bash

set -eo pipefail

# データベースの起動を待つ
# Fargateでタスク起動時のdepends_onのcondition=STARTでは不十分なため、sleepで待つ
sleep 60

# マイグレーションを実行する
flask --app /app/src/web/app.py db init || true
flask --app /app/src/web/app.py db upgrade || true

# データベースに初期データを追加する
echo "データベースに初期データを追加中..."
python seed_db.py || echo "初期データの追加に失敗しました（既に存在する可能性があります）"

waitress-serve --call 'web.app:create_app'
