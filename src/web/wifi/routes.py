"""
このファイルは、Wi-Fi診断アプリの画面（利用者が実際にブラウザで開くページ）の
ルートをまとめたファイルです。

■ 「ルート」とは
Flaskでいう「ルート」とは、「あるURL（例: /layout）にアクセスされたときに、
どの処理を実行して、どんな画面（HTML）を返すか」の対応関係のことです。
@WIFI_BP.route("/layout") のように書くと、「/layout にアクセスされたら、
すぐ下に書いた関数を実行する」という意味になります。

■ このファイルの現在の実装方針（UIの枠だけを作る段階）
CLAUDE.mdの方針に基づき、この段階では各画面の「中身」（間取りキャンバスの
描画やドラッグ操作など）はまだ実装しません。
各ルートは、対応する空のテンプレート（プレースホルダー）を表示するだけの
状態にしておき、後から各担当（B・D・E）が中身を実装していきます。

■ ルートガードについて
CLAUDE.mdには「前提を満たさないルートへの直接アクセスは、
必要な画面へリダイレクトする」という要件があります。
このファイルでは、route_guards.py に定義したデコレータ
（@requires_house_layout など）をルート関数に付けることで、
この要件を満たしています。
デコレータの仕組み自体の説明は route_guards.py 側のコメントを参照。
"""

import logging

from flask import Blueprint, render_template

from web import wifi_session
from web.wifi.route_guards import (
    requires_diagnosis_result,
    requires_house_layout,
    requires_router_position,
)

# Blueprint とは、Flaskで「関連するルートをひとまとめにするための単位」。
# ここでは、Wi-Fi診断アプリの画面群を1つのBlueprintとしてまとめておき、
# あとで src/web/routes.py の APP_BP にこのBlueprintをまとめて登録する。
#
# CLAUDE.mdのルート表（/layout, /router-placement など）はすべて
# URLの先頭に共通のプレフィックス（例: /wifi）を付けない設計になっているため、
# url_prefix は指定しない（AUTH_BPが url_prefix="/auth" を指定しているのとは
# 対照的な設計）。
WIFI_BP = Blueprint("wifi", __name__, template_folder="templates")


@WIFI_BP.route("/")
def top():
    """
    ① トップ画面。

    CLAUDE.mdのルート表では前提条件が「なし」となっているため、
    誰でも直接アクセスできる。ルートガードは付けない。
    """
    logging.debug("Wi-Fi診断アプリのトップページにアクセスされました")
    return render_template("wifi/screens/top.html")


@WIFI_BP.route("/layout")
def layout():
    """
    ② 住宅レイアウト作成画面。

    前提条件が「なし」なので、トップページを経由しなくても
    直接アクセスできる（ルートガードなし）。
    """
    logging.debug("住宅レイアウト作成画面にアクセスされました")
    return render_template("wifi/screens/layout.html")


@WIFI_BP.route("/router-placement")
@requires_house_layout
def router_placement():
    """
    ③ ルーター配置画面。

    前提条件：間取りが作成済みであること。
    @requires_house_layout デコレータが、間取りが無い場合に
    自動的に /layout へリダイレクトしてくれるため、
    この関数の中では「間取りがある」ことを前提にした処理だけを書ける。
    """
    logging.debug("ルーター配置画面にアクセスされました")
    return render_template("wifi/screens/router_placement.html")


@WIFI_BP.route("/heatmap")
@requires_router_position
def heatmap():
    """
    ④ ヒートマップ表示画面。

    前提条件：間取り＋ルーターの設置位置が保存済みであること。
    """
    logging.debug("ヒートマップ表示画面にアクセスされました")
    return render_template("wifi/screens/heatmap.html")


@WIFI_BP.route("/diagnosis")
def diagnosis():
    """
    ⑤ 診断質問画面。

    前提条件は「なし」。間取り作成・ヒートマップの確認とは
    順序関係を持たない独立したモジュールとして位置づける
    （どちらを先に行ってもよく、片方だけで終えてもよい）。

    テンプレート側で「間取り作成へのリンク」を出し分けるために、
    間取りが作成済みかどうかを has_house_layout として渡す。
    間取り未作成なら「くわしく調べたい場合は間取りを作成する」という
    誘導リンクを表示し、作成済みならヒートマップへ戻れるリンクを表示する
    （実際の分岐はテンプレート側で行う）。
    """
    logging.debug("診断質問画面にアクセスされました")
    return render_template(
        "wifi/screens/diagnosis.html",
        has_house_layout=wifi_session.has_house_layout(),
    )


@WIFI_BP.route("/result/replacement")
@requires_diagnosis_result
def result_replacement():
    """
    ⑥ 結果：買い替え・対策あり画面。

    前提条件：診断が完了し、結果が出ていること。
    ヒートマップを見ているかどうかは問わない（診断質問だけで
    ここに到達できる利用者もいる想定）。
    間取り未作成の利用者には「より詳しく知りたい場合は間取りを作成する」
    という導線を出すため、has_house_layout をテンプレートに渡す。
    """
    logging.debug("結果画面（買い替え・対策あり）にアクセスされました")
    return render_template(
        "wifi/screens/result_replacement.html",
        has_house_layout=wifi_session.has_house_layout(),
    )


@WIFI_BP.route("/result/unknown")
@requires_diagnosis_result
def result_unknown():
    """
    ⑦ 結果：原因不明画面。

    前提条件：診断が完了し、結果が出ていること
    （確信度が低いと判定された場合にこちらの画面に案内される想定だが、
    その振り分けの判断は診断ロジック側の責務であり、
    このルート自体は「診断結果があるかどうか」だけをチェックする）。
    result_replacement と同様、間取り未作成なら間取り作成へ、
    作成済みならヒートマップへの導線を出すため has_house_layout を渡す。
    """
    logging.debug("結果画面（原因不明）にアクセスされました")
    return render_template(
        "wifi/screens/result_unknown.html",
        has_house_layout=wifi_session.has_house_layout(),
    )


@WIFI_BP.route("/support-id")
@requires_diagnosis_result
def support_id():
    """
    ⑧ サポートID発行画面。

    前提条件：診断結果があること。
    """
    logging.debug("サポートID発行画面にアクセスされました")
    return render_template("wifi/screens/support_id.html")
