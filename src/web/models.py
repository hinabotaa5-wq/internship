from flask_migrate import Migrate
from flask_sqlalchemy import SQLAlchemy

DB = SQLAlchemy()
MIGRATE = Migrate()


class Ticket(DB.Model):
    """問い合わせページ用の受付データ。

    間取りデータ（だいき担当）と Q&A 回答履歴（たいよう担当）を保存し、
    受付番号でユーザー側とスタッフ側を紐づける。
    """

    id = DB.Column(DB.Integer, primary_key=True)
    ticket_number = DB.Column(DB.String(16), unique=True, nullable=False, index=True)
    room_layout = DB.Column(DB.JSON, nullable=False)
    qa_history = DB.Column(DB.JSON, nullable=False)
    created_at = DB.Column(DB.DateTime, server_default=DB.func.now(), nullable=False)
