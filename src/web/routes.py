import logging

from flask import Blueprint, render_template
from flask_login import current_user, login_required

from web.auth.models import User
from web.auth.routes import AUTH_BP
from web.diagnosis.routes import DIAGNOSIS_BP
from web.floorplan.routes import FLOORPLAN_BP
from web.heatmap.routes import HEATMAP_BP

APP_BP = Blueprint("app", __name__)

# ログイン用のエンドポイントを追加する
APP_BP.register_blueprint(AUTH_BP)

# 質問ページ（原因切り分け診断）用のエンドポイントを追加する
APP_BP.register_blueprint(DIAGNOSIS_BP)

# 住宅レイアウト作成・ルーター配置用のエンドポイントを追加する
APP_BP.register_blueprint(FLOORPLAN_BP)

# ヒートマップ表示・改善提案用のエンドポイントを追加する
APP_BP.register_blueprint(HEATMAP_BP)


@APP_BP.route("/")
def index():
    # ログ出力の方法
    logging.debug("トップページにアクセスされました")

    # データベースからすべてのユーザーを取得
    users = User.query.all()

    return render_template("index.html", users=users)


@APP_BP.route("/secret")
@login_required
def secret():
    logging.debug("シークレットページにアクセスされました")
    # テンプレート内で直接 current_user を使わずに外から明示的に渡してあげると、画面デザ
    # イン時にダミーデータを渡すことができて便利

    # 例: 画面デザイン中
    # return render_template(
    #     "secret.html",
    #     user=User(
    #         username="test_user",
    #         hashed_password="dummy_value",
    #     ),
    # )

    # 画面デザイン完了後、動作確認中
    return render_template("secret.html", user=current_user)
