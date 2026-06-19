from flask import redirect, request, url_for
from flask_admin import Admin, AdminIndexView, expose
from flask_admin.contrib.sqla import ModelView
from flask_login import current_user

from .auth.models import User
from .models import DB


class AdminIndexView(AdminIndexView):
    """管理者用のインデックスビュー"""

    @expose("/")
    def index(self):
        if not current_user.is_authenticated or not current_user.is_admin:
            return redirect(url_for("app.auth.login"))
        return super(AdminIndexView, self).index()


class SecureModelView(ModelView):
    """管理者権限が必要なモデルビュー"""

    def is_accessible(self):
        return current_user.is_authenticated and current_user.is_admin

    def inaccessible_callback(self, name, **kwargs):
        return redirect(url_for("app.auth.login"))


class UserAdminView(SecureModelView):
    """ユーザー管理用のビュー"""

    # 表示するカラム
    column_list = ["id", "username", "is_admin"]

    # 検索可能なカラム
    column_searchable_list = ["username"]

    # フィルター可能なカラム
    column_filters = ["is_admin"]

    # 編集可能なカラム
    form_columns = ["username", "is_admin"]

    # パスワードフィールドは表示しない
    column_exclude_list = ["hashed_password"]

    # 作成・編集フォームでパスワードフィールドを除外
    form_excluded_columns = ["hashed_password"]


def init_admin(app):
    """Flask-Adminを初期化"""
    admin = Admin(
        app, name="管理画面", template_mode="bootstrap3", index_view=AdminIndexView()
    )

    # ユーザー管理ビューを追加
    admin.add_view(UserAdminView(User, DB.session, name="ユーザー管理"))

    return admin
