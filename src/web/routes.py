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
#
# 注意：main側にあった DIAGNOSIS_BP（src/web/diagnosis/routes.py）は、
# ここでは登録しない。DIAGNOSIS_BP は url_prefix="/diagnosis" で
# "/diagnosis/", "/diagnosis/question", "/diagnosis/result" を提供するが、
# これは WIFI_BP がすでに提供している "/diagnosis"（診断質問画面）と役割が
# 重複している。加えて DIAGNOSIS_BP は現状 engine.py に存在しない名前
# （FIRST_NODE_ID, RESULTS, build_result_payload, resolve_next）を
# インポートしており、単体ではインポートエラーで起動できない状態だった。
#
# 質問データ・分岐ロジック自体（src/web/diagnosis/engine.py）は有用なため
# ファイルとしては取り込むが、実際に呼び出す口は WIFI_BP 側の
# /diagnosis ルート（src/web/wifi/routes.py）に実装し直す。
# UIは共通レイアウト（wifi/base.html）を使い、Bootstrap版の
# diagnosis_question.html / diagnosis_result.html は使わない。
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
