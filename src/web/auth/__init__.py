from flask import Flask
from flask_login import LoginManager

from .models import User

login_manager = LoginManager()


def init_app(app: Flask):
    login_manager.init_app(app)

    # @login_required でログイン画面に飛ばす
    login_manager.login_view = "app.auth.login"  # type: ignore
    login_manager.login_message_category = "info"


@login_manager.user_loader
def load_user(user_id: int):
    return User.query.get(user_id)
