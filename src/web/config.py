import os


class Config:
    SQLALCHEMY_DATABASE_URI = (
        "mysql+pymysql://{user}:{password}@{host}/{database}?charset=utf8".format(
            **{
                "database": "db",
                "user": "user",
                "password": "user&pass",
                "host": os.getenv("DATABASE_HOST"),
            }
        )
    )
    # devcontainerのホットリロード(watchexecによるプロセス再起動)のたびにSECRET_KEYが
    # 変わってしまい、ログインセッションが切れるのを防ぐため、環境変数があればそれを使う
    SECRET_KEY = os.environ.get("SECRET_KEY") or os.urandom(24)
