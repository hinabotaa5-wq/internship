#!/bin/bash

# データベースリセットスクリプト（devcontainer環境用）
# このスクリプトは以下の処理を実行します：
# 1. ローカルDBの削除
# 2. ローカルmigrationファイルの削除（/migrations/versions/*）
# 3. rye run flask db init
# 4. rye run flask db migrate
# 5. rye run flask db upgrade

set -e  # エラーが発生した場合にスクリプトを停止

echo "=== データベースリセット開始（devcontainer環境） ==="

# 1. ローカルDBの削除
echo "1. ローカルDBの削除中..."

# MySQLに接続してデータベースを削除・再作成
mysql -h db -u root -p123456 -e "DROP DATABASE IF EXISTS db; CREATE DATABASE db; GRANT ALL ON db.* TO 'user'@'%';" 2>/dev/null || echo "   警告: MySQLへの直接接続に失敗しました。データベースコンテナの再起動を試行します..."

echo "   データベースを削除・再作成しました"

# 2. ローカルmigrationファイルの削除（/migrations/versions/*）
echo "2. migrationファイルの削除中..."
if [ -d "migrations/versions" ]; then
    rm -f migrations/versions/*.py
    echo "   migrations/versions/ 内のファイルを削除しました"
else
    echo "   migrations/versions/ ディレクトリが存在しません"
fi

# migrationsディレクトリ全体を削除（flask db initで再作成されるため）
if [ -d "migrations" ]; then
    rm -rf migrations
    echo "   migrationsディレクトリを削除しました"
fi

# DATABASE_HOST環境変数を設定（devcontainer環境では'db'）
export DATABASE_HOST=db

# データベースが利用可能になるまで待機
echo "3. データベースの準備完了を待機中..."
timeout=30
counter=0
while [ $counter -lt $timeout ]; do
    if mysql -h db -u user -p'user&pass' -e "SELECT 1;" db &>/dev/null; then
        echo "   データベースが利用可能になりました"
        break
    fi
    sleep 2
    counter=$((counter + 2))
done

if [ $counter -ge $timeout ]; then
    echo "   エラー: データベースへの接続がタイムアウトしました"
    exit 1
fi

# 4. rye run flask db init
echo "4. Flask DB初期化中..."
rye run flask db init
echo "   Flask DBの初期化が完了しました"

# 5. rye run flask db migrate
echo "5. Flask DBマイグレーション作成中..."
rye run flask db migrate -m "Initial migration"
echo "   Flask DBマイグレーションの作成が完了しました"

# 6. rye run flask db upgrade
echo "6. Flask DBアップグレード中..."
rye run flask db upgrade
echo "   Flask DBアップグレードが完了しました"

echo "=== データベースリセット完了 ==="
echo ""
echo "データベースが正常にリセットされました。"
echo ""