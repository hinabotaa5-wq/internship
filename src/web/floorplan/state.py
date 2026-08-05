"""間取りデータのセッション読み書き（担当B）。

保存先はサーバーセッションのみ。ブラウザストレージは使用しない（仕様書2章）。
DBへの永続化は問い合わせ発行時だけなので、ここでは行わない。

注意: セッション状態の読み書き関数は本来担当Aの `web.session` が持つ。
`web.session` が main に入り次第、本モジュールの2関数はそちらへの委譲に差し替える。
その際も呼び出し側（routes.py）のインターフェースは変えない。
"""

from flask import session

# 担当Aの設計に合わせたキー名。診断セッション全体を1つの dict にまとめる
SESSION_KEY = "diagnosis_state"
ROOM_LAYOUT_KEY = "room_layout"


def get_room_layout() -> dict | None:
    """保存済みの間取り(仕様書4-1)を返す。未作成なら None。"""
    state = session.get(SESSION_KEY)
    if not isinstance(state, dict):
        return None
    room_layout = state.get(ROOM_LAYOUT_KEY)
    return room_layout if isinstance(room_layout, dict) else None


def save_room_layout(room_layout: dict) -> None:
    """間取りを保存する。他の担当が入れた値は消さない。"""
    state = session.get(SESSION_KEY)
    if not isinstance(state, dict):
        state = {}
    # session は入れ子の変更を検知しないため、必ず作り直して代入する
    session[SESSION_KEY] = {**state, ROOM_LAYOUT_KEY: room_layout}


def has_room_layout() -> bool:
    """間取りが作成済みか（ルートガードの判定に使う）。"""
    room_layout = get_room_layout()
    return bool(room_layout and room_layout.get("rooms"))
