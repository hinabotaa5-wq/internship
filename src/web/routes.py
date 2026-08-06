import logging

from flask import Blueprint, render_template
from flask_login import current_user, login_required

from web.auth.routes import AUTH_BP
from web.diagnosis.routes import DIAGNOSIS_BP
from web.floorplan.routes import FLOORPLAN_BP
from web.heatmap.routes import HEATMAP_BP
from web.session import get_diagnosis_session
from web.tickets import TICKETS_BP
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

# 住宅レイアウト作成・ルーター配置用のエンドポイントを追加する
# （担当Bのmain側の実装：/layout, /router-placement, /api/floorplan を一式で提供）
# 以前は WIFI_BP 側に同名の /layout・/router-placement （枠のみの
# プレースホルダー）があったが、DIAGNOSIS_BP と同様の理由（役割・URLの
# 完全な重複）で FLOORPLAN_BP に統合し、WIFI_BP 側の定義は削除した。
APP_BP.register_blueprint(FLOORPLAN_BP)

# ヒートマップ表示・改善提案用のエンドポイントを追加する
# （担当Dのmain側の実装：/heatmap を提供。内部で web.floorplan.state の
# 間取りセッションを読み取るため、FLOORPLAN_BP と対になっている）
# 以前は WIFI_BP 側に同名の /heatmap（枠のみのプレースホルダー）があったが、
# 同様の理由で HEATMAP_BP に統合し、WIFI_BP 側の定義は削除した。
APP_BP.register_blueprint(HEATMAP_BP)

# Wi-Fi診断アプリの画面用のエンドポイントを追加する
# （トップページ "/" が、CLAUDE.md記載の8画面のうち本ブランチで
# WIFI_BP が担当している範囲）
#
# 注意：診断質問（DIAGNOSIS_BP）・住宅レイアウト作成・ルーター配置
# （FLOORPLAN_BP）・ヒートマップ（HEATMAP_BP）は、いずれも main側の
# 実装一式（Python・HTML・CSS・JS）に統合済みで、WIFI_BP 側の対応する
# ルート・テンプレートは削除済み。⑧サポートID発行画面（/support-id）も
# 同様の理由でこのファイル側（担当A実装）に統合し、WIFI_BP側は削除した。
APP_BP.register_blueprint(WIFI_BP)

# 問い合わせ受付用のエンドポイントを追加する
# （担当A: /api/tickets。support_id.html が送信ボタンから
# url_for("app.tickets.create_ticket") でこのAPIを呼び出すため、
# /support-id を機能させるには本Blueprintの登録が必須。）
APP_BP.register_blueprint(TICKETS_BP)


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


@APP_BP.route("/support-id")
def support_id():
    logging.debug("送信前確認ページ（画面8）にアクセスされました")
    diagnosis_state = get_diagnosis_session()
    return render_template("support_id.html", diagnosis_state=diagnosis_state)

# 以下、mainマージで取り込まれた次の2ルートは、いずれも本ブランチの
# 対象スコープ外（今回は診断質問(diagnosis)のみを統合する）のため、
# いったんこのファイルから削除した:
#   - /test-ticket（担当A: Ticket API動作確認ページ）
#   - /staff/tickets（担当A: コールセンター向け照会ページ）
# これらの機能自体（web/tickets.py, テンプレート）は
# ファイルとしては取り込まれているので、Ticket機能を統合する別タスクで
# あらためて対応する。
