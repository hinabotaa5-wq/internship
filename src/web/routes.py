import logging

from flask import Blueprint, render_template
from flask_login import current_user, login_required

from web.auth.routes import AUTH_BP
from web.wifi.routes import WIFI_BP

APP_BP = Blueprint("app", __name__)

# ログイン用のエンドポイントを追加する
APP_BP.register_blueprint(AUTH_BP)

# Wi-Fi診断アプリの画面用のエンドポイントを追加する
# （トップページ "/" を含め、CLAUDE.md記載の8画面のルートはすべてここに登録されている）
APP_BP.register_blueprint(WIFI_BP)


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
