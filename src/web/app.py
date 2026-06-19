import logging

from flask import Flask

from web.custom_rule import AddTeamNamePrefixCustomRule, get_base_path

from . import auth
from .admin import init_admin
from .config import Config
from .models import DB, MIGRATE
from .routes import APP_BP

# DEBUG ログを表示する
logging.basicConfig(level=logging.DEBUG)


# アプリケーション ファクトリ
# 注意: この関数は基本的に変更する必要はないはずです。
def create_app():
    # /static パスにも環境に応じてプレフィックスを付与する
    app = Flask(
        __name__,
        static_url_path=f"{get_base_path()}/static",
    )
    app.config.from_object(Config)

    # URL のマッピングルールをカスタマイズ
    # 環境に応じて全ての URL にプレフィックスを付与する
    app.url_rule_class = AddTeamNamePrefixCustomRule

    # SQLAlchemy と Flask-Migrate を初期化
    DB.init_app(app)
    MIGRATE.init_app(app, DB)

    # ログインモジュールを初期化
    auth.init_app(app)

    # Flask-Adminを初期化
    init_admin(app)

    # アプリ用に、ルートとなる Blueprint を登録
    # 注意: 新しいルートを登録する場合も個々を変更する必要はありません。
    # /src/web/routes.py の APP_BP に登録してください。
    app.register_blueprint(APP_BP)

    return app
