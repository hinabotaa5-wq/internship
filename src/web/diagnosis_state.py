"""診断セッションのデータ構造（初期値生成・更新）。

Flask に依存しない純粋関数群。session への読み書きは web/session.py が担う。
"""

import secrets
from datetime import datetime, timezone

# 受付番号(NIF-XXXXXX)とは別ID体系。診断セッション限りの一時ID。
_DIAGNOSIS_ID_PREFIX = "HM"
_DIAGNOSIS_ID_ALPHABET = "ABCDEFGHJKMNPRSTUVWXY345678"
_DIAGNOSIS_ID_SUFFIX_LENGTH = 6


def generate_diagnosis_id() -> str:
    """診断IDを新規発行する（形式: HM-YYYYMMDD-XXXXXX）。"""
    date_part = datetime.now(timezone.utc).strftime("%Y%m%d")
    suffix = "".join(
        secrets.choice(_DIAGNOSIS_ID_ALPHABET)
        for _ in range(_DIAGNOSIS_ID_SUFFIX_LENGTH)
    )
    return f"{_DIAGNOSIS_ID_PREFIX}-{date_part}-{suffix}"


def create_initial_diagnosis_state() -> dict:
    """診断セッションの初期値を生成する。キーはすべて snake_case。"""
    return {
        "diagnosis_id": generate_diagnosis_id(),
        "device_config": None,
        "room_layout": None,
        "transmitters": None,
        "qa_history": None,
        "diagnosis_result": None,
        "updated_at": None,
    }


def update_diagnosis_state(state: dict, **fields) -> dict:
    """既存状態に snake_case フィールドを shallow merge して返す（破壊的変更はしない）。"""
    updated_state = {**state, **fields}
    updated_state["updated_at"] = datetime.now(timezone.utc).isoformat()
    return updated_state
