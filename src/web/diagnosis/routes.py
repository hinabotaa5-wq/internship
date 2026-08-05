import uuid

from flask import Blueprint, redirect, render_template, request, session, url_for

from .engine import FIRST_NODE_ID, QUESTIONS, RESULTS, build_result_payload, resolve_next

DIAGNOSIS_BP = Blueprint(
    "diagnosis", __name__, url_prefix="/diagnosis", template_folder="templates"
)

SESSION_KEY_ID = "diagnosis_id"
SESSION_KEY_NODE = "diagnosis_node"
SESSION_KEY_ANSWERS = "diagnosis_answers"
SESSION_KEY_RESULT = "diagnosis_result"


@DIAGNOSIS_BP.route("/")
def start():
    # 新しい診断を開始し、これまでの回答・結果をリセットする
    session[SESSION_KEY_ID] = uuid.uuid4().hex
    session[SESSION_KEY_NODE] = FIRST_NODE_ID
    session[SESSION_KEY_ANSWERS] = {}
    session.pop(SESSION_KEY_RESULT, None)
    return redirect(url_for("app.diagnosis.question"))


@DIAGNOSIS_BP.route("/question", methods=["GET", "POST"])
def question():
    if SESSION_KEY_NODE not in session:
        return redirect(url_for("app.diagnosis.start"))

    node_id = session[SESSION_KEY_NODE]

    if request.method == "POST":
        answer = request.form.get("answer")
        question_def = QUESTIONS[node_id]
        valid_answers = {key for key, _ in question_def["options"]}
        if answer not in valid_answers:
            return render_template(
                "diagnosis_question.html",
                node_id=node_id,
                question=question_def,
                error="選択肢を選んでください",
            )

        answers = session[SESSION_KEY_ANSWERS]
        answers[node_id] = answer
        session[SESSION_KEY_ANSWERS] = answers

        next_id = resolve_next(node_id, answer, answers)

        if next_id in RESULTS:
            # 原因が確定したので、以後の質問には進ませず結果を保存して終了する
            result = build_result_payload(session[SESSION_KEY_ID], next_id)
            session[SESSION_KEY_RESULT] = result
            return redirect(url_for("app.diagnosis.result"))

        session[SESSION_KEY_NODE] = next_id
        return redirect(url_for("app.diagnosis.question"))

    question_def = QUESTIONS[node_id]
    return render_template(
        "diagnosis_question.html", node_id=node_id, question=question_def, error=None
    )


@DIAGNOSIS_BP.route("/result")
def result():
    result_data = session.get(SESSION_KEY_RESULT)
    if result_data is None:
        return redirect(url_for("app.diagnosis.start"))

    return render_template("diagnosis_result.html", result=result_data)
