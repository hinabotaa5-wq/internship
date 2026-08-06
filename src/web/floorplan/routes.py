"""住宅レイアウト作成・ルーター配置のFlaskルーティング（担当B / 画面2・3）。

画面遷移とセッションの読み書きだけを行う。間取りの生成・壁の自動生成・
重なり判定などのロジックは static/wifi/layout.js（UIに依存しない純粋関数群）にあり、
テンプレートやこのモジュールには置かない（仕様書 規則6）。
"""

import logging

from flask import Blueprint, current_app, jsonify, redirect, render_template, request, url_for

from .contract import LayoutValidationError, validate_room_layout
from .state import get_room_layout, has_room_layout, save_room_layout

FLOORPLAN_BP = Blueprint("floorplan", __name__, template_folder="templates")


def _find_get_url(path: str) -> str | None:
    """他担当の画面が登録済みならそのURLを返す。未実装なら None。

    未実装の画面へのリンクを出さないために使う（統合途中でも通しで触れるようにする）。
    """
    base = current_app.url_map
    for rule in base.iter_rules():
        if rule.arguments:
            continue
        if "GET" not in (rule.methods or set()):
            continue
        if rule.rule.endswith(path):
            return url_for(rule.endpoint)
    return None


@FLOORPLAN_BP.route("/layout")
def layout():
    """画面2: 住宅レイアウト作成。"""
    logging.debug("住宅レイアウト作成ページにアクセスされました")
    return render_template(
        "floorplan_layout.html",
        room_layout=get_room_layout(),
        api_url=url_for("app.floorplan.api_room_layout"),
        next_url=url_for("app.floorplan.router_placement"),
    )


@FLOORPLAN_BP.route("/router-placement")
def router_placement():
    """画面3: ルーター配置。間取りがなければ画面2へ戻す。"""
    if not has_room_layout():
        return redirect(url_for("app.floorplan.layout"))

    logging.debug("ルーター配置ページにアクセスされました")
    return render_template(
        "floorplan_router_placement.html",
        room_layout=get_room_layout(),
        api_url=url_for("app.floorplan.api_room_layout"),
        layout_url=url_for("app.floorplan.layout"),
        heatmap_url=_find_get_url("/heatmap"),
        diagnosis_url=_find_get_url("/diagnosis/"),
    )


@FLOORPLAN_BP.route("/api/floorplan", methods=["GET", "PUT"])
def api_room_layout():
    """間取り(仕様書4-1)の取得・保存。保存先はサーバーセッションのみ。"""
    if request.method == "GET":
        return jsonify({"room_layout": get_room_layout()})

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or "room_layout" not in payload:
        return jsonify({"error": "間取りのデータが送られていません"}), 400

    try:
        room_layout = validate_room_layout(payload["room_layout"])
    except LayoutValidationError as error:
        logging.debug("間取りの検証に失敗しました: %s", error)
        return jsonify({"error": str(error)}), 400

    save_room_layout(room_layout)
    return jsonify({"room_layout": room_layout})
