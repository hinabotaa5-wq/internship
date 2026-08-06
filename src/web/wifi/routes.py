"""
このファイルは、Wi-Fi診断アプリの画面（利用者が実際にブラウザで開くページ）の
ルートをまとめたファイルです。

■ 「ルート」とは
Flaskでいう「ルート」とは、「あるURL（例: /layout）にアクセスされたときに、
どの処理を実行して、どんな画面（HTML）を返すか」の対応関係のことです。
@WIFI_BP.route("/support-id") のように書くと、「/support-id にアクセスされたら、
すぐ下に書いた関数を実行する」という意味になります。

■ このファイルが担当するルート
CLAUDE.mdのルート表にある8画面のうち、①トップページと⑧サポートID発行
画面だけをここで担当する。②③④⑤（住宅レイアウト作成・ルーター配置・
ヒートマップ表示・診断質問）は、いずれもmainブランチに存在する各担当の
実装一式（FLOORPLAN_BP・HEATMAP_BP・DIAGNOSIS_BP）に統合済みで、
このファイルには存在しない（src/web/routes.py でそれぞれ個別に
Blueprint登録されている）。

■ ルートガードについて
CLAUDE.mdには「前提を満たさないルートへの直接アクセスは、
必要な画面へリダイレクトする」という要件があります。
このファイルでは、route_guards.py に定義したデコレータ
（@requires_diagnosis_result）をルート関数に付けることで、
この要件を満たしています。
デコレータの仕組み自体の説明は route_guards.py 側のコメントを参照。
"""

import logging

from flask import Blueprint, render_template

from web.wifi.route_guards import requires_diagnosis_result

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


# 注意：CLAUDE.mdのルート表にある②住宅レイアウト作成・③ルーター配置・
# ④ヒートマップ表示・⑤診断質問・⑥結果（買い替え）・⑦結果（原因不明）に
# 相当する画面は、以前はここに自作の /layout, /router-placement, /heatmap,
# /diagnosis, /result/replacement, /result/unknown ルートとして
# 実装していたが、mainブランチに存在する各担当の実装一式
# （FLOORPLAN_BP・HEATMAP_BP・DIAGNOSIS_BP）と役割・URLが完全に
# 重複するため、そちらに統合し、ここでは削除した。
#
# FLOORPLAN_BP（住宅レイアウト作成・ルーター配置。担当B）：
#   /layout           - 住宅レイアウト作成画面
#   /router-placement - ルーター配置画面（間取り未作成なら/layoutへ戻す）
#   /api/floorplan     - 間取りデータのJSON API（GET/PUT）
#
# HEATMAP_BP（ヒートマップ表示。担当D）：
#   /heatmap - ヒートマップ表示画面（前提未達なら作成元の画面へ戻す）
#
# DIAGNOSIS_BP（診断質問。担当E）：
#   /diagnosis/         - 診断開始画面（endpoint名: app.diagnosis.start）
#   /diagnosis/start    - POST専用（endpoint名: app.diagnosis.begin）
#   /diagnosis/question - 質問画面（GET, endpoint名: app.diagnosis.question）
#   /diagnosis/answer   - POST専用。回答を記録して次へ進む
#   /diagnosis/result   - 結果画面（1画面でconfidenceにより表示を切替）
#   /diagnosis/restart  - POST専用。診断をやり直す
#
# 他画面からこれらへ遷移する場合は、それぞれ
# url_for("app.floorplan.layout") / url_for("app.floorplan.router_placement") /
# url_for("app.heatmap.heatmap") / url_for("app.diagnosis.start") を使う。


@WIFI_BP.route("/support-id")
@requires_diagnosis_result
def support_id():
    """
    ⑧ サポートID発行画面。

    前提条件：診断結果があること。
    """
    logging.debug("サポートID発行画面にアクセスされました")
    return render_template("wifi/screens/support_id.html")
