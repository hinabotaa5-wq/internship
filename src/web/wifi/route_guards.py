"""
このファイルは「ルートガード」をまとめたファイルです。

■ ルートガードとは
CLAUDE.md には「前提を満たさないルートへの直接アクセスは、
必要な画面へリダイレクトする」という要件があります。

例えば、まだ診断結果が出ていない利用者が、ブラウザのURL欄に直接
/support-id と入力してアクセスしてきた場合、そのままサポートID発行
画面を表示すると「診断結果がない状態で問い合わせを送る」という、
アプリの設計上ありえない状態になってしまいます。
そこで、「診断結果が無ければ診断開始画面へ転送する」というチェックを、
/support-id のルート関数が実行される前に必ず行う必要があります。
このチェックの仕組みを「ルートガード」と呼びます。

■ Pythonの「デコレータ」という機能を使う理由
このチェックを、各ルート関数の最初に毎回同じifブロックとして書いてもよい
のですが、そうすると同じようなコードが何箇所にも重複してしまい、
チェック内容を変えたいときに全部を1つずつ直す必要が出てきます。

そこで、Pythonの「デコレータ」という機能を使い、
「この関数を呼ぶ前に、診断結果があるかどうかを自動でチェックする」
という処理を、@requires_diagnosis_result という1行を関数の上に書くだけで
適用できるようにしています。

デコレータの使い方の例：
    @WIFI_BP.route("/support-id")
    @requires_diagnosis_result
    def support_id():
        return render_template("wifi/screens/support_id.html")

この例では、support_id() が実際に呼ばれる前に
requires_diagnosis_result が診断結果の有無をチェックし、
無ければ診断開始画面へリダイレクトするレスポンスを返して終わります
（support_id() の中身は実行されません）。

注意：間取り（/layout）・ルーター配置（/router-placement）・
ヒートマップ（/heatmap）に関するルートガードは、それぞれの
実装一式が統合された src/web/floorplan/routes.py（FLOORPLAN_BP）・
src/web/heatmap/routes.py（HEATMAP_BP）側に、
has_room_layout() 等を使った同様の仕組みで実装されている。
"""

import functools

from flask import redirect, session, url_for


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
