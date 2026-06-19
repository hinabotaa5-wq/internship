from flask_login import UserMixin

from ..models import DB


class User(DB.Model, UserMixin):
    id = DB.Column(DB.Integer, primary_key=True)
    username = DB.Column(DB.String(128), unique=True)
    hashed_password = DB.Column(DB.String(256))
    is_admin = DB.Column(DB.Boolean, default=False, nullable=False)

    def __init__(self, username: str, hashed_password: str, is_admin: bool = False):
        self.username = username
        self.hashed_password = hashed_password
        self.is_admin = is_admin
