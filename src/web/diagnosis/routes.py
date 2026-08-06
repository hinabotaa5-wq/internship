"""質問ページ（原因切り分け診断）のFlaskルーティング。

決定木の分岐ロジック自体はengine.pyに置き、ここでは画面遷移と
セッションの読み書きだけを行う。

戻る操作の方針: 診断途中の戻る操作を明示的にはサポートしない。
質問ページ(GET)は常にセッション上の現在の質問IDを表示するため、
ブラウザの戻る/進む操作をしても表示とセッション状態は食い違わない。
"""

from flask import Blueprint, redirect, render_template, request, session, url_for

from ..session import update_diagnosis_session
from . import engine

DIAGNOSIS_BP = Blueprint(
    "diagnosis",
    __name__,
    url_prefix="/diagnosis",
    template_folder="templates",
    static_folder="static",
)

SESSION_KEY_DIAGNOSIS_ID = "diagnosis_id"
SESSION_KEY_CURRENT_QUESTION_ID = "current_question_id"
SESSION_KEY_ANSWERS = "answers"
SESSION_KEY_RESULT = "result"


def _reset_session() -> None:
    session[SESSION_KEY_DIAGNOSIS_ID] = engine.generate_diagnosis_id()
    session[SESSION_KEY_CURRENT_QUESTION_ID] = engine.INITIAL_QUESTION_ID
    session[SESSION_KEY_ANSWERS] = []
    session[SESSION_KEY_RESULT] = None


def _has_active_diagnosis() -> bool:
    return SESSION_KEY_DIAGNOSIS_ID in session


def _render_question(question_data, diagnosis_id, answered_count, error=None):
    return render_template(
        "diagnosis_question.html",
        question=question_data,
        diagnosis_id=diagnosis_id,
        answered_count=answered_count,
        error=error,
    )


@DIAGNOSIS_BP.route("/", methods=["GET"])
def start():
    return render_template("diagnosis_start.html")


@DIAGNOSIS_BP.route("/start", methods=["POST"])
def begin():
    _reset_session()
    return redirect(url_for("app.diagnosis.question"))


@DIAGNOSIS_BP.route("/question", methods=["GET"])
def question():
    if not _has_active_diagnosis():
        return redirect(url_for("app.diagnosis.start"))

    if session.get(SESSION_KEY_RESULT) is not None:
        # 診断完了後に質問ページへ戻ってきた場合は、結果ページへ送る
        return redirect(url_for("app.diagnosis.result"))

    question_id = session[SESSION_KEY_CURRENT_QUESTION_ID]
    question_data = engine.get_question(question_id)
    if question_data is None:
        # 存在しない質問IDがセッションに入っていた場合は安全に初期化する
        _reset_session()
        return redirect(url_for("app.diagnosis.question"))

    return _render_question(
        question_data,
        session[SESSION_KEY_DIAGNOSIS_ID],
        len(session[SESSION_KEY_ANSWERS]),
    )


@DIAGNOSIS_BP.route("/answer", methods=["POST"])
def answer():
    if not _has_active_diagnosis():
        return redirect(url_for("app.diagnosis.start"))

    if session.get(SESSION_KEY_RESULT) is not None:
        # 診断完了後にフォームが再送信された場合は、結果ページへ送る
        return redirect(url_for("app.diagnosis.result"))

    question_id = session.get(SESSION_KEY_CURRENT_QUESTION_ID)
    question_data = engine.get_question(question_id)
    if question_data is None:
        _reset_session()
        return redirect(url_for("app.diagnosis.question"))

    answer_id = request.form.get("answer")
    if not answer_id or not engine.validate_answer(question_id, answer_id):
        return _render_question(
            question_data,
            session[SESSION_KEY_DIAGNOSIS_ID],
            len(session[SESSION_KEY_ANSWERS]),
            error="回答を1つ選択してください。",
        )

    answers = session[SESSION_KEY_ANSWERS]
    answers.append({"question_id": question_id, "answer_id": answer_id})
    session[SESSION_KEY_ANSWERS] = answers

    step = engine.determine_next_step(question_id, answer_id, answers)

    if step["status"] == "result":
        result = engine.build_diagnosis_result(
            step["cause_id"], answers, session[SESSION_KEY_DIAGNOSIS_ID]
        )
        session[SESSION_KEY_RESULT] = result
        # 送信内容の確認ページ・オペレーター用ページから参照できるよう、
        # 診断セッション（web.session）にも同じ結果を反映する。
        update_diagnosis_session(qa_history=answers, diagnosis_result=result)
        return redirect(url_for("app.diagnosis.result"))

    session[SESSION_KEY_CURRENT_QUESTION_ID] = step["next_question_id"]
    return redirect(url_for("app.diagnosis.question"))


@DIAGNOSIS_BP.route("/result", methods=["GET"])
def result():
    result_data = session.get(SESSION_KEY_RESULT)
    if result_data is None:
        return redirect(url_for("app.diagnosis.start"))

    return render_template("diagnosis_result.html", result=result_data)


@DIAGNOSIS_BP.route("/restart", methods=["POST"])
def restart():
    session.pop(SESSION_KEY_DIAGNOSIS_ID, None)
    session.pop(SESSION_KEY_CURRENT_QUESTION_ID, None)
    session.pop(SESSION_KEY_ANSWERS, None)
    session.pop(SESSION_KEY_RESULT, None)
    return redirect(url_for("app.diagnosis.start"))
