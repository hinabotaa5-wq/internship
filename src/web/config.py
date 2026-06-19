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
    SECRET_KEY = os.urandom(24)
