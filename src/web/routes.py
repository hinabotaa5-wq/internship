import logging

from flask import Blueprint, render_template
from flask_login import current_user, login_required

from web.auth.routes import AUTH_BP
from web.diagnosis.routes import DIAGNOSIS_BP
from web.wifi.routes import WIFI_BP

APP_BP = Blueprint("app", __name__)

# ログイン用のエンドポイントを追加する
APP_BP.register_blueprint(AUTH_BP)

# 質問ページ（原因切り分け診断）用のエンドポイントを追加する
# main側の実装（engine.py・routes.py・テンプレート・CSSを一式）をそのまま使う。
# url_prefix="/diagnosis" で "/diagnosis/", "/diagnosis/start",
# "/diagnosis/question", "/diagnosis/answer", "/diagnosis/result",
# "/diagnosis/restart" を提供する。
APP_BP.register_blueprint(DIAGNOSIS_BP)

# Wi-Fi診断アプリの画面用のエンドポイントを追加する
# （トップページ "/" を含め、CLAUDE.md記載の8画面のうち診断質問以外の
# ルートはここに登録されている）
#
# 注意：WIFI_BP 側にも "/diagnosis" ルートが定義されていたが、これは
# DIAGNOSIS_BP（"/diagnosis/question" 等）と役割・URLが重複するため、
# src/web/wifi/routes.py 側の /diagnosis ルート定義を削除した。
# トップページ等から診断質問へ遷移する場合は、
# url_for("app.diagnosis.start") を使う。
#
# main側の FLOORPLAN_BP（/layout, /router-placement）・HEATMAP_BP（/heatmap）
# は、WIFI_BP がすでに同じURLを提供しているため、ここでは登録しない
# （両方registerするとURLが重複してしまう）。floorplan・heatmapの中身の
# 統合は別タスクとして扱う。
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

# 以下、mainマージで取り込まれた次の3ルートは、いずれも本ブランチの
# 対象スコープ外（今回は診断質問(diagnosis)のみを統合する）のため、
# いったんこのファイルから削除した:
#   - /test-ticket（担当A: Ticket API動作確認ページ）
#   - /staff/tickets（担当A: コールセンター向け照会ページ）
#   - /support-id（担当A: web.session.get_diagnosis_session に依存する
#     送信前確認ページ。src/web/wifi/routes.py 側にも同名の /support-id
#     ルートが既にあり、URLが重複するため）
# これらの機能自体（web/tickets.py, web/session.py, テンプレート）は
# ファイルとしては取り込まれているので、Ticket機能を統合する別タスクで
# あらためて対応する。
