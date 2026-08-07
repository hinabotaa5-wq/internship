import logging
import secrets
from datetime import timezone
from zoneinfo import ZoneInfo

from flask import Blueprint, abort, jsonify, request
from sqlalchemy.exc import IntegrityError

from .models import DB, Ticket

TICKETS_BP = Blueprint("tickets", __name__, url_prefix="/api/tickets")

# DB (MySQL) の NOW() はサーバーのタイムゾーン(UTC)で記録されるため、
# 表示時に日本時間(JST)へ変換する
_JST = ZoneInfo("Asia/Tokyo")

# 電話で聞き取りやすいように、見間違いやすい文字 (0/O, 1/I/L, 2/Z, 9/Q) を除いた文字集合を使う
_TICKET_NUMBER_ALPHABET = "ABCDEFGHJKMNPRSTUVWXY345678"
_TICKET_NUMBER_LENGTH = 6
_MAX_GENERATE_ATTEMPTS = 10


def _generate_ticket_number() -> str:
    suffix = "".join(
        secrets.choice(_TICKET_NUMBER_ALPHABET) for _ in range(_TICKET_NUMBER_LENGTH)
    )
    return f"NIF-{suffix}"


@TICKETS_BP.route("", methods=["POST"])
def create_ticket():
    body = request.get_json(silent=True) or {}
    room_layout = body.get("room_layout")
    qa_history = body.get("qa_history")
    diagnosis_result = body.get("diagnosis_result")

    if room_layout is None or qa_history is None:
        abort(400, description="room_layout と qa_history は必須です")

    for _ in range(_MAX_GENERATE_ATTEMPTS):
        ticket = Ticket(
            ticket_number=_generate_ticket_number(),
            room_layout=room_layout,
            qa_history=qa_history,
            diagnosis_result=diagnosis_result,
        )
        DB.session.add(ticket)
        try:
            DB.session.commit()
        except IntegrityError:
            # 受付番号が衝突した場合は生成し直す
            DB.session.rollback()
            continue
        return jsonify({"ticket_number": ticket.ticket_number}), 201

    logging.error("受付番号の生成に失敗しました（衝突が続きました）")
    abort(500, description="受付番号の生成に失敗しました。もう一度お試しください")


@TICKETS_BP.route("/<ticket_number>", methods=["GET"])
def get_ticket(ticket_number: str):
    ticket = Ticket.query.filter_by(ticket_number=ticket_number).first()
    if ticket is None:
        abort(404, description="指定された受付番号が見つかりません")

    return jsonify(
        {
            "ticket_number": ticket.ticket_number,
            "room_layout": ticket.room_layout,
            "qa_history": ticket.qa_history,
            "diagnosis_result": ticket.diagnosis_result,
            "created_at": ticket.created_at.replace(tzinfo=timezone.utc)
            .astimezone(_JST)
            .isoformat(),
        }
    )
