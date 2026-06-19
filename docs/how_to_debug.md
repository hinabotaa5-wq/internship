# デバッグ方法

## Flask の出力内容を確認する

Flask の動作途中の変数を出力して確認したい場合は logging モジュールを利用します

### ログの出力方法

```
@APP_BP.route("/")
def index():
    logging.debug("hogehoge")
    return render_template("index.html")
```

### ログの確認方法

Docker Desktop から確認します。

[Containers]->[internship-2025-5days_devcontainer]->[web-1]の Log タブに出力されます。

## DB の中身を確認する

データが正常に入っている場合か DB の中身を直接確認したい場合は、コンテナの中に入って確認します。

[Containers]->[internship-2025-5days_devcontainer]->[db-1]の Exec タブを選択

パスワードは[compose.yml](../docker-images/compose.yml)の MYSQL_ROOT_PASSWORD を参照

```
# mysql -p
use db;
show tables;
```
