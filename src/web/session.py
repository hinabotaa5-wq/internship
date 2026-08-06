"""Flask session の読み書きラッパー（診断セッションの境界API）。

他担当（間取り・Q&A・ヒートマップ計算など）はこのモジュールの関数経由で
診断中のデータをやりとりする。DBへの永続化は POST /api/tickets のみで行う。
"""

from flask import session

from .diagnosis_state import create_initial_diagnosis_state, update_diagnosis_state

# flask.session に格納する際のキー
SESSION_KEY = "diagnosis_state"


def start_diagnosis_session() -> dict:
    """診断フローの開始時に呼ぶ。初期状態を生成して session にセットし、その dict を返す。"""
    state = create_initial_diagnosis_state()
    session[SESSION_KEY] = state
    return state


def get_diagnosis_session() -> dict | None:
    """現在の診断セッション状態を読み取る。未開始（=session未セット）なら None。"""
    return session.get(SESSION_KEY)


def update_diagnosis_session(**fields) -> dict:
    """診断セッションの内容を更新する。未開始の場合は自動で開始してから更新する。"""
    state = get_diagnosis_session() or start_diagnosis_session()
    updated_state = update_diagnosis_state(state, **fields)
    session[SESSION_KEY] = updated_state
    return updated_state


def clear_diagnosis_session() -> None:
    """診断セッションを破棄する（受付番号発行後に呼ぶ）。"""
    session.pop(SESSION_KEY, None)
