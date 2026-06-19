import os
import sys

# プロジェクトのルートディレクトリをPythonパスに追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from werkzeug.security import generate_password_hash

from web.app import create_app
from web.auth.models import User
from web.models import DB


def seed_db():
    """データベースに初期データを追加する"""

    # ユーザー情報を追加（既存のUserモデルに合わせて簡略化）
    users = [
        {"username": "admin", "password": "admin", "is_admin": True},
        {"username": "user1", "password": "admin1", "is_admin": False},
        {"username": "user2", "password": "admin2", "is_admin": False},
        {"username": "user3", "password": "admin3", "is_admin": False},
        {"username": "user4", "password": "admin4", "is_admin": False},
        {"username": "user5", "password": "admin5", "is_admin": False},
        {"username": "user6", "password": "admin6", "is_admin": False},
    ]

    for user_data in users:
        existing_user = (
            DB.session.query(User)
            .filter(User.username == user_data["username"])
            .one_or_none()
        )
        if existing_user:
            print(f"ユーザー '{user_data['username']}' は既に存在します")
            continue

        user = User(
            username=user_data["username"],
            hashed_password=generate_password_hash(user_data["password"]),
            is_admin=user_data.get("is_admin", False),
        )
        DB.session.add(user)
        print(f"ユーザー '{user_data['username']}' を追加しました")

    DB.session.commit()
    print("データベースの初期化が完了しました！")


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        seed_db()
