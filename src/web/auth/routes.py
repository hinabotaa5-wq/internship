from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import login_user, logout_user
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from ..models import DB
from .forms import LoginForm, SignupForm
from .models import User

AUTH_BP = Blueprint("auth", __name__, url_prefix="/auth", template_folder="templates")


@AUTH_BP.route("/signup", methods=["GET", "POST"])
def signup():
    form = SignupForm()
    if not form.validate_on_submit():
        return render_template("signup.html", form=form)

    user = User(form.username.data, generate_password_hash(form.password.data))
    try:
        DB.session.add(user)
        DB.session.commit()
    except IntegrityError:
        DB.session.rollback()
        flash("ユーザー名が既に登録されています", "danger")
        return render_template("signup.html", form=form), 409

    return redirect(url_for("app.auth.login"))


@AUTH_BP.route("/login", methods=["GET", "POST"])
def login():
    form = LoginForm()
    if not form.validate_on_submit():
        return render_template("login.html", form=form)

    user = User.query.filter(User.username == form.username.data).first()
    if user is None or not check_password_hash(
        user.hashed_password, form.password.data
    ):
        flash("ユーザー名またはパスワードが間違っています", "danger")
        return render_template("login.html", form=form), 403

    login_user(user)
    next = request.args.get("next") or url_for("app.index")
    return redirect(next)


@AUTH_BP.route("/logout", methods=["GET"])
def logout():
    logout_user()
    return redirect(url_for("app.index"))
