"""間取りデータ(仕様書4-1)の検証（担当B）。

Flask に依存しない純粋関数群。ブラウザから送られてきた JSON をそのまま
セッションへ書かないための入口チェックを行う。キーはすべて snake_case。
値の一覧は仕様書4-1の表に対応する。
"""

from typing import Any

ROOM_TYPES = frozenset(
    {
        "ldk",
        "bedroom",
        "room",
        "tatami",
        "study",
        "kitchen",
        "wash",
        "bath",
        "toilet",
        "entrance",
        "hall",
    }
)
WALL_MATERIALS = frozenset({"concrete", "wood", "water"})
ROUTER_GENERATIONS = frozenset({"wifi4", "wifi5", "wifi6"})
PLANS = frozenset({"giga1", "giga10"})
BANDS = frozenset({"b5", "b24"})
USAGE_KINDS = frozenset({"video", "meeting", "game", "work"})

# 座標・寸法の許容範囲(m)。極端な値でキャンバス描画や計算が壊れるのを防ぐ
MAX_COORDINATE_M = 60.0
MIN_ROOM_SIDE_M = 0.5
MAX_ROOMS = 30
MAX_WALLS = 400


class LayoutValidationError(ValueError):
    """間取りデータが契約に合わない場合に投げる。message は利用者向けの日本語。"""


def _require_number(value: Any, label: str, *, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise LayoutValidationError(f"{label}が数値ではありません")
    number = float(value)
    if number != number or number in (float("inf"), float("-inf")):
        raise LayoutValidationError(f"{label}が数値ではありません")
    if not minimum <= number <= maximum:
        raise LayoutValidationError(f"{label}が範囲外です")
    return number


def _validate_point(raw: Any, label: str) -> dict:
    if not isinstance(raw, dict):
        raise LayoutValidationError(f"{label}の形式が正しくありません")
    return {
        "x": _require_number(raw.get("x"), f"{label}のx座標", minimum=0.0, maximum=MAX_COORDINATE_M),
        "y": _require_number(raw.get("y"), f"{label}のy座標", minimum=0.0, maximum=MAX_COORDINATE_M),
    }


def _validate_room(raw: Any, index: int) -> dict:
    if not isinstance(raw, dict):
        raise LayoutValidationError(f"{index + 1}番目の部屋の形式が正しくありません")

    room_id = raw.get("id")
    if not isinstance(room_id, str) or not room_id:
        raise LayoutValidationError(f"{index + 1}番目の部屋にIDがありません")

    room_type = raw.get("type")
    if room_type not in ROOM_TYPES:
        raise LayoutValidationError(f"{index + 1}番目の部屋の種類が不明です")

    name = raw.get("name")
    if not isinstance(name, str) or not name.strip():
        raise LayoutValidationError(f"{index + 1}番目の部屋に名前がありません")

    return {
        "id": room_id,
        "name": name.strip()[:20],
        "type": room_type,
        "x": _require_number(raw.get("x"), f"{name}のx座標", minimum=0.0, maximum=MAX_COORDINATE_M),
        "y": _require_number(raw.get("y"), f"{name}のy座標", minimum=0.0, maximum=MAX_COORDINATE_M),
        "width": _require_number(
            raw.get("width"), f"{name}の幅", minimum=MIN_ROOM_SIDE_M, maximum=MAX_COORDINATE_M
        ),
        "height": _require_number(
            raw.get("height"), f"{name}の奥行き", minimum=MIN_ROOM_SIDE_M, maximum=MAX_COORDINATE_M
        ),
    }


def _validate_wall(raw: Any, index: int) -> dict:
    if not isinstance(raw, dict):
        raise LayoutValidationError(f"{index + 1}番目の壁の形式が正しくありません")

    material = raw.get("material")
    if material not in WALL_MATERIALS:
        raise LayoutValidationError(f"{index + 1}番目の壁の材質が不明です")

    wall = {
        "material": material,
        "door": None,
    }
    for key in ("x1", "y1", "x2", "y2"):
        wall[key] = _require_number(
            raw.get(key), f"{index + 1}番目の壁の座標", minimum=0.0, maximum=MAX_COORDINATE_M
        )

    door = raw.get("door")
    if door is not None:
        if not isinstance(door, dict):
            raise LayoutValidationError(f"{index + 1}番目の壁の開口の形式が正しくありません")
        start = _require_number(door.get("start"), "開口の位置", minimum=0.0, maximum=MAX_COORDINATE_M)
        end = _require_number(door.get("end"), "開口の位置", minimum=0.0, maximum=MAX_COORDINATE_M)
        if end <= start:
            raise LayoutValidationError(f"{index + 1}番目の壁の開口の幅が正しくありません")
        wall["door"] = {"start": start, "end": end}

    return {"x1": wall["x1"], "y1": wall["y1"], "x2": wall["x2"], "y2": wall["y2"], "material": material, "door": wall["door"]}


def _validate_environment(raw: Any) -> dict:
    if not isinstance(raw, dict):
        raise LayoutValidationError("ご利用環境の形式が正しくありません")

    for key, allowed, label in (
        ("router_gen", ROUTER_GENERATIONS, "ルーターの世代"),
        ("plan", PLANS, "ご契約プラン"),
        ("band", BANDS, "周波数帯"),
    ):
        if raw.get(key) not in allowed:
            raise LayoutValidationError(f"{label}の値が不明です")

    people = raw.get("people")
    if isinstance(people, bool) or not isinstance(people, int) or not 1 <= people <= 10:
        raise LayoutValidationError("ご利用人数が範囲外です")

    uses = raw.get("uses")
    if not isinstance(uses, list) or any(use not in USAGE_KINDS for use in uses):
        raise LayoutValidationError("ご利用用途の値が不明です")

    return {
        "router_gen": raw["router_gen"],
        "plan": raw["plan"],
        "band": raw["band"],
        "people": people,
        # 重複を除きつつ、送られてきた順序を保つ
        "uses": list(dict.fromkeys(uses)),
    }


def validate_room_layout(raw: Any) -> dict:
    """間取りデータを検証し、契約どおりのキーだけを持つ dict を作って返す。

    余計なキーは落とす。壊れている場合は LayoutValidationError を投げる。
    """
    if not isinstance(raw, dict):
        raise LayoutValidationError("間取りデータの形式が正しくありません")

    rooms_raw = raw.get("rooms")
    if not isinstance(rooms_raw, list) or not rooms_raw:
        raise LayoutValidationError("部屋が1つもありません")
    if len(rooms_raw) > MAX_ROOMS:
        raise LayoutValidationError(f"部屋が多すぎます（{MAX_ROOMS}室まで）")

    rooms = [_validate_room(room, index) for index, room in enumerate(rooms_raw)]
    room_ids = [room["id"] for room in rooms]
    if len(set(room_ids)) != len(room_ids):
        raise LayoutValidationError("部屋のIDが重複しています")

    walls_raw = raw.get("walls")
    if not isinstance(walls_raw, list):
        raise LayoutValidationError("壁のデータがありません")
    if len(walls_raw) > MAX_WALLS:
        raise LayoutValidationError("壁が多すぎます")
    walls = [_validate_wall(wall, index) for index, wall in enumerate(walls_raw)]

    router = _validate_point(raw.get("router"), "親機の位置")
    repeater_raw = raw.get("repeater")
    repeater = None if repeater_raw is None else _validate_point(repeater_raw, "中継機の位置")

    return {
        "rooms": rooms,
        "walls": walls,
        "router": router,
        "repeater": repeater,
        "environment": _validate_environment(raw.get("environment")),
    }
