"""
このファイルは「ルートガード」をまとめたファイルです。

■ ルートガードとは
CLAUDE.md には「前提を満たさないルートへの直接アクセスは、
必要な画面へリダイレクトする」という要件があります。

例えば、まだ間取り（部屋の配置）を作っていない利用者が、
ブラウザのURL欄に直接 /router-placement と入力してアクセスしてきた場合、
そのままルーター配置画面を表示すると「間取りがない状態でルーターを置く」
という、アプリの設計上ありえない状態になってしまいます。
そこで、「間取りが無ければ /layout へ転送する」というチェックを、
/router-placement のルート関数が実行される前に必ず行う必要があります。
このチェックの仕組みを「ルートガード」と呼びます。

■ Pythonの「デコレータ」という機能を使う理由
このチェックを、各ルート関数の最初に毎回同じifブロックとして書いてもよい
のですが、そうすると同じようなコードが何箇所にも重複してしまい、
チェック内容を変えたいときに全部を1つずつ直す必要が出てきます。

そこで、Pythonの「デコレータ」という機能を使い、
「この関数を呼ぶ前に、間取りがあるかどうかを自動でチェックする」
という処理を、@requires_house_layout という1行を関数の上に書くだけで
適用できるようにしています。

デコレータの使い方の例：
    @WIFI_BP.route("/router-placement")
    @requires_house_layout
    def router_placement():
        return render_template("wifi/screens/router_placement.html")

この例では、router_placement() が実際に呼ばれる前に
requires_house_layout が間取りの有無をチェックし、
無ければ /layout へリダイレクトするレスポンスを返して終わります
（router_placement() の中身は実行されません）。
"""

import functools

from flask import redirect, session, url_for

from web import wifi_session


def requires_house_layout(view_function):
    """
    「間取り（部屋の配置）が保存されていること」を必須とするデコレータ。

    このデコレータを付けたルート関数は、間取りが未作成の場合、
    間取り作成画面（/layout）へリダイレクトされ、元の関数の中身は実行されない。
    """

    # functools.wraps を使うと、デコレータで包んだあとの関数が
    # 元の関数の名前(__name__)などの情報を保持できる。
    # これを付けないと、Flaskが複数のルートに同じ名前の関数がある、
    # という紛らわしいエラーを出すことがあるため、
    # デコレータを書くときのお約束として必ず付ける。
    @functools.wraps(view_function)
    def wrapped_view(*args, **kwargs):
        if not wifi_session.has_house_layout():
            return redirect(url_for("app.wifi.layout"))
        # 前提を満たしていれば、元のルート関数をそのまま呼び出す。
        return view_function(*args, **kwargs)

    return wrapped_view


def requires_router_position(view_function):
    """
    「間取り＋ルーター（親機）の設置位置が保存されていること」を必須とするデコレータ。

    間取りそのものが無い場合は /layout へ、
    間取りはあるがルーター位置が未設定の場合は /router-placement へ
    リダイレクトする。
    """

    @functools.wraps(view_function)
    def wrapped_view(*args, **kwargs):
        if not wifi_session.has_house_layout():
            return redirect(url_for("app.wifi.layout"))
        if not wifi_session.has_router_position():
            return redirect(url_for("app.wifi.router_placement"))
        return view_function(*args, **kwargs)

    return wrapped_view


def requires_diagnosis_result(view_function):
    """
    「診断が完了し、結果が出ていること」を必須とするデコレータ。

    サポートID発行画面（/support-id）など、診断が終わっていることを
    前提とする画面に付ける。

    診断結果が無い場合は、診断質問の開始画面（/diagnosis/）へ
    リダイレクトする。

    注意：診断結果画面自体（CLAUDE.mdの⑥⑦に相当する画面）は、
    src/web/diagnosis/routes.py（DIAGNOSIS_BP）の "/diagnosis/result"
    が1画面で confidence によって表示を切り替える設計になっており、
    このアプリでは WIFI_BP 側に別途 /result/replacement・/result/unknown
    は存在しない。
    診断結果は DIAGNOSIS_BP が Flask の session に直接
    session["result"] という形で保存する（wifi_session.py が管理する
    session["wifi"]["diagnosis"] とは別の場所）。
    そのため、ここでの判定も session["result"] を直接見る。
    """

    @functools.wraps(view_function)
    def wrapped_view(*args, **kwargs):
        if session.get("result") is None:
            return redirect(url_for("app.diagnosis.start"))
        return view_function(*args, **kwargs)

    return wrapped_view
