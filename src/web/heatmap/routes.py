"""ヒートマップ表示と改善提案のFlaskルーティング（担当D / 画面4）。

画面遷移とセッションの読み出しだけを行う。RSSIの計算・ボトルネックの判定・
提案の決定は static/wifi/engine.js（担当C）と static/wifi/heatmap.js（担当D）の
純粋関数群にあり、このモジュールやテンプレートには置かない（仕様書 規則6）。

注意: 間取りのセッション読み書きは暫定的に `web.floorplan.state` を使う。
担当Aの `web.session` が main に入り次第、そちらへの委譲に差し替える
（`web.floorplan.state` 側も同じ差し替え予定なので、呼び出し方は変えない）。
"""

import logging

from flask import Blueprint, redirect, render_template, url_for

from web.floorplan.state import get_room_layout

HEATMAP_BP = Blueprint("heatmap", __name__, template_folder="templates")


@HEATMAP_BP.route("/heatmap")
def heatmap():
    """画面4: ヒートマップ表示と改善提案。

    前提は「間取り＋ルーター位置がそろっていること」。
    足りない場合は作成元の画面へ戻す。
    """
    room_layout = get_room_layout()
    if not room_layout or not room_layout.get("rooms"):
        return redirect(url_for("app.floorplan.layout"))
    if not room_layout.get("router"):
        return redirect(url_for("app.floorplan.router_placement"))

    logging.debug("ヒートマップページにアクセスされました")
    return render_template(
        "heatmap.html",
        room_layout=room_layout,
        api_url=url_for("app.floorplan.api_room_layout"),
        layout_url=url_for("app.floorplan.layout"),
        router_placement_url=url_for("app.floorplan.router_placement"),
        diagnosis_url=url_for("app.diagnosis.start"),
    )
