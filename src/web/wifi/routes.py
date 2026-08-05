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

from flask import Blueprint, redirect, render_template, request, url_for

from web import wifi_session
from web.diagnosis.engine import (
    build_diagnosis_result,
    determine_next_step,
    generate_diagnosis_id,
    get_initial_question,
    get_question,
    validate_answer,
)
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


@WIFI_BP.route("/diagnosis", methods=["GET", "POST"])
def diagnosis():
    """
    ⑤ 診断質問画面。

    前提条件は「なし」。間取り作成・ヒートマップの確認とは
    順序関係を持たない独立したモジュールとして位置づける
    （どちらを先に行ってもよく、片方だけで終えてもよい）。

    質問データ・分岐ロジックは src/web/diagnosis/engine.py
    （担当Eが実装したもの）を利用する。このルート関数の役割は、
    セッション状態の読み書き（wifi_session.py 経由）と、
    質問→次の質問／結果 の画面遷移だけを担当し、
    「どの質問の次にどの質問が来るか」といった診断のロジック自体は
    engine.py 側の責務として、ここには書かない
    （CLAUDE.md 規則6：計算ロジックと診断条件をUIに直書きしない）。

    GET: 現在の質問（診断が未開始なら最初の質問）を表示する。
    POST: 選ばれた回答を記録し、次の質問または結果画面へ進む。
    """
    diagnosis_state = wifi_session.get_diagnosis()

    if request.method == "POST":
        # POSTの際は、diagnosis_state が None（診断未開始）になっているのは
        # 想定外の状態（フォームの改ざんなど）なので、質問画面を出し直す。
        if diagnosis_state is None or diagnosis_state.get("current_question_id") is None:
            return redirect(url_for("app.wifi.diagnosis"))

        current_question_id = diagnosis_state["current_question_id"]
        answer_id = request.form.get("answer_id")

        if not validate_answer(current_question_id, answer_id):
            # 不正な回答IDが送られてきた場合、CLAUDE.mdの「エラーは
            # 何が起きたか＋どうすればいいかを日本語で」に従い、
            # 同じ質問画面にエラーメッセージ付きで戻す。
            question = get_question(current_question_id)
            return render_template(
                "wifi/screens/diagnosis.html",
                question=question,
                error_message="選択肢を選んでからお進みください。",
                has_house_layout=wifi_session.has_house_layout(),
            )

        wifi_session.add_diagnosis_answer(current_question_id, answer_id)
        answers = wifi_session.get_diagnosis()["answers"]

        next_step = determine_next_step(current_question_id, answer_id, answers)

        if next_step["status"] == "result":
            result = build_diagnosis_result(
                next_step["cause_id"], answers, diagnosis_state["diagnosis_id"]
            )
            wifi_session.save_diagnosis_result(result)

            # 確信度が低い（confidence == "low"）場合は「原因不明」画面へ、
            # それ以外は「買い替え・対策あり」画面へ振り分ける
            # （CLAUDE.md 4-3: confidence は high/medium/low の3値）。
            if result["confidence"] == "low":
                return redirect(url_for("app.wifi.result_unknown"))
            return redirect(url_for("app.wifi.result_replacement"))

        wifi_session.set_current_question(next_step["next_question_id"])
        return redirect(url_for("app.wifi.diagnosis"))

    # GET: 診断がまだ始まっていなければ、新しい診断として開始する。
    if diagnosis_state is None:
        diagnosis_id = generate_diagnosis_id()
        wifi_session.start_diagnosis(diagnosis_id)
        question = get_initial_question()
        wifi_session.set_current_question(question["id"])
    else:
        current_question_id = diagnosis_state["current_question_id"]
        question = get_question(current_question_id)

    logging.debug("診断質問画面にアクセスされました")
    return render_template(
        "wifi/screens/diagnosis.html",
        question=question,
        error_message=None,
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
        result=wifi_session.get_diagnosis()["result"],
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
        result=wifi_session.get_diagnosis()["result"],
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
