"""
このファイルは「セッション状態の読み書き関数」をまとめたモジュールです。

■ そもそも「セッション」とは何か
Webアプリでは、利用者がページを移動するたびに、サーバーとブラウザの間で
新しい通信（リクエスト）が発生します。何も工夫しないと、サーバー側は
「さっきの通信で何を入力してもらったか」を覚えていません。
「セッション」は、同じ利用者からの複数のリクエストをまたいで、
サーバー側にちょっとしたデータを覚えておく仕組みです。

FlaskのFlaskの `session` オブジェクトは、辞書（dict）のように
値を読み書きできます（例: session["key"] = "value"）。
CLAUDE.md の方針により、このアプリでは診断の途中経過（間取り・
ルーター位置・診断の回答など）を、ブラウザのlocalStorage等ではなく、
このFlaskのサーバーセッションに保存します。

■ このファイルの役割
CLAUDE.md の「統合事故を防ぐ7つの規則」にある通り、
「4章のデータ構造を勝手に変えない」「JSONのキーはsnake_case」という
ルールを守るため、他の担当者（B・D・E）が `session` に直接触れるのではなく、
必ずこのファイルの関数を経由してデータを読み書きするようにします。
これにより、
  - キーの名前を間違えて書いてしまう
  - ある画面ではデータの形が違う、といった不整合
を防ぎます。

■ 実装上の注意点（Flaskのセッションの少しクセのある挙動について）
FlaskのsessionはCookie（ブラウザに保存される小さなデータ）に、
暗号署名をつけた上で保存されます。値を書き込むときに気をつけないと
いけないのが、「session内の辞書やリストを直接書き換えても、
Flaskがその変更に気づかないことがある」という点です。

例えば以下のようなコードは、期待通りに動かない可能性があります：
    layout = session["wifi"]["house_layout"]
    layout["rooms"].append(new_room)   # ← これだけだとFlaskが変更を検知できない

Flaskは「sessionという辞書そのものに対して session[何か] = 値 の形で
代入したとき」だけ、確実に「変更があった」と認識してCookieを更新します。
そのため、このファイルの中では必ず「一度セッション全体の辞書を取り出す
→ Pythonの辞書として自由に書き換える → session[ルートキー] = 書き換えた辞書
を代入して保存する」という手順を徹底します。
こうすることで、うっかり変更が保存されない、というミスを防げます。
"""

from flask import session

# セッションの中で、Wi-Fi診断アプリが使うデータをすべてまとめて入れる、
# 一番外側のキーの名前。
# ログイン機能（Flask-Login）など、他の仕組みも同じ session を使っているため、
# キーの名前がぶつからないように、Wi-Fi診断アプリ専用の名前空間として
# 1つのキーの下にすべてをまとめておく。
_SESSION_ROOT_KEY = "wifi"

# _SESSION_ROOT_KEY の中で使う、2番目の階層のキー名。
# CLAUDE.md 4章にあるデータのまとまり（間取り・シミュレーション結果）に
# それぞれ対応させている（診断セッションは別モジュールで管理するため、
# ここには含まない。詳細は本ファイル内の該当コメントを参照）。
_HOUSE_LAYOUT_KEY = "house_layout"
_SIMULATION_RESULT_KEY = "simulation_result"


# ============================================================
# 内部ヘルパー関数（このファイルの外からは呼ばない想定の関数）
# ============================================================
# Python の慣習として、関数名の先頭にアンダースコア(_)を1つ付けると、
#「このモジュールの中でだけ使う、外部には公開しない関数」という意味になる。
# （import してもエラーにはならないが、外部から使わない約束事として付けている）


def _get_wifi_state() -> dict:
    """
    セッションから、Wi-Fi診断アプリのデータ全体（house_layout・
    simulation_result・diagnosis をまとめた辞書）を取り出す。

    まだ何も保存されていない場合は、空の辞書を返す。
    session.get(key, {}) は「keyが存在すればその値、なければ空の辞書」を返す
    Pythonの辞書のメソッド。
    """
    return session.get(_SESSION_ROOT_KEY, {})


def _save_wifi_state(state: dict) -> None:
    """
    Wi-Fi診断アプリのデータ全体を、セッションに保存する。

    ファイルの先頭で説明した通り、Flaskに変更を確実に検知してもらうため、
    「session[ルートキー] = state」という、ルートキーへの代入を必ず行う。
    このファイルの中の他の関数は、データを書き換えるときに必ず
    この関数を通して保存する。
    """
    session[_SESSION_ROOT_KEY] = state
    # dict の中身を書き換えただけでは自動で検知されない場合に備え、
    # 念のため明示的に「セッションが変更された」ことをFlaskに伝えておく。
    # （上の代入だけで通常は検知されるが、二重に安全策を取っている）
    session.modified = True


# ============================================================
# 間取り・機器（CLAUDE.md 4-1 に対応）
# ============================================================

# save_house_layout() で「この引数は渡されなかった（値を変更しない）」ことを
# 表すための特別な目印（センチネル値）。
#
# なぜ None を「渡されなかった」の意味に使わないのか？
# 例えば repeater（中継機）は「まだ設置していない」ことを表すために
# 本当に None が入る（CLAUDE.md 4-1 の例でも "repeater": null）。
# もし「値を変更しない」ことも None で表してしまうと、
# 「repeaterを未設置の状態に変更したい」のか「repeaterは今のままでいい」のか
# 区別できなくなってしまう。
# そこで、None とは別の、この関数専用のユニークな目印オブジェクトを用意する。
_UNSET = object()


def _default_house_layout() -> dict:
    """
    house_layout がまだセッションに存在しないときの初期値（ひな形）。
    CLAUDE.md 4-1 のデータ構造と同じ形にしておく。
    """
    return {
        "rooms": [],
        "walls": [],
        "router": None,
        "repeater": None,
        "environment": None,
    }


def get_house_layout() -> dict | None:
    """
    現在保存されている間取り・機器の情報を取得する。

    戻り値:
        rooms / walls / router / repeater / environment を含む辞書。
        まだ一度も間取りが保存されていない場合は None を返す。
    """
    wifi_state = _get_wifi_state()
    return wifi_state.get(_HOUSE_LAYOUT_KEY)


def save_house_layout(
    rooms: list = _UNSET,
    walls: list = _UNSET,
    router: dict | None = _UNSET,
    repeater: dict | None = _UNSET,
    environment: dict = _UNSET,
) -> None:
    """
    間取り・機器の情報を保存する。

    このアプリでは画面が複数に分かれており（②間取り作成→③ルーター配置）、
    1回の呼び出しで全部の項目が揃わないことがある
    （例: ②の画面ではまだルーターの位置が決まっていない）。
    そのため、この関数の引数はすべて省略可能にしてあり、
    「渡された項目だけを上書きし、渡されなかった項目は今の値をそのまま残す」
    という動きにしている。

    引数:
        rooms, walls, router, repeater, environment
            - CLAUDE.md 4-1 のデータ構造と同じ形の値。
            - 省略した引数は、既存の値がそのまま保持される。
            - 明示的に None を渡した場合は、本当に None として保存される
              （例: repeater=None で「中継機なし」を保存できる）。

    使用例:
        # ②の画面：まず部屋と壁だけを保存する
        save_house_layout(rooms=rooms_data, walls=walls_data)

        # ③の画面：あとからルーターの位置と環境設定を追加で保存する
        # （このとき rooms・walls は変更されず、そのまま残る）
        save_house_layout(router={"x": 4.5, "y": 7.0}, environment=env_data)
    """
    wifi_state = _get_wifi_state()

    # 既存の house_layout があればそれを元に、なければひな形から始める。
    house_layout = wifi_state.get(_HOUSE_LAYOUT_KEY) or _default_house_layout()

    # 「_UNSET のままかどうか」で、引数が渡されたかどうかを判定する。
    # 渡されていれば（_UNSETから変わっていれば）その値で上書きする。
    if rooms is not _UNSET:
        house_layout["rooms"] = rooms
    if walls is not _UNSET:
        house_layout["walls"] = walls
    if router is not _UNSET:
        house_layout["router"] = router
    if repeater is not _UNSET:
        house_layout["repeater"] = repeater
    if environment is not _UNSET:
        house_layout["environment"] = environment

    wifi_state[_HOUSE_LAYOUT_KEY] = house_layout
    _save_wifi_state(wifi_state)


def has_house_layout() -> bool:
    """
    間取り（部屋の情報）が最低限保存されているかどうかを返す。

    ルートガード（担当A）が、「/router-placement に間取りなしで直接
    アクセスしてきたら /layout に戻す」といった判定をするときに使う想定。

    「保存されている」とみなす条件は、house_layout自体が存在し、
    かつ rooms に1件以上部屋が入っていること。
    rooms が空リストのままでは、まだ間取り作成が完了していないと判断する。
    """
    house_layout = get_house_layout()
    if house_layout is None:
        return False
    return len(house_layout.get("rooms", [])) > 0


def has_router_position() -> bool:
    """
    ルーター（親機）の設置位置が保存されているかどうかを返す。

    ルートガードが「/heatmap に間取りだけでルーター未設置のまま
    アクセスしてきたら /router-placement に戻す」といった判定に使う想定。
    """
    house_layout = get_house_layout()
    if house_layout is None:
        return False
    return house_layout.get("router") is not None


# ============================================================
# シミュレーション結果（CLAUDE.md 4-2 に対応）
# ============================================================


def get_simulation_result() -> dict | None:
    """
    直前に計算されたシミュレーション結果（部屋ごとのRSSI・速度など）を取得する。

    戻り値:
        CLAUDE.md 4-2 の構造の辞書。まだ計算されていない場合は None。
    """
    wifi_state = _get_wifi_state()
    return wifi_state.get(_SIMULATION_RESULT_KEY)


def save_simulation_result(result: dict) -> None:
    """
    シミュレーション結果を保存する。

    引数:
        result - CLAUDE.md 4-2 の構造そのままの辞書
                 （room_summaries, worst_room_id, bottleneck など）。
                 このファイルは値の形式チェックは行わない。
                 計算エンジン（engine.js に対応するPython実装）側で
                 4-2の形に整えた上で渡すこと。
    """
    wifi_state = _get_wifi_state()
    wifi_state[_SIMULATION_RESULT_KEY] = result
    _save_wifi_state(wifi_state)


# ============================================================
# 診断セッション（CLAUDE.md 4-3 に対応）
# ============================================================


# 注意：このセクションにあった診断セッション関連の関数群
# （start_diagnosis, get_diagnosis, set_current_question,
# add_diagnosis_answer, save_diagnosis_result, has_diagnosis_result）は
# 削除した。診断機能はmainブランチに存在する実装一式
# （src/web/diagnosis/routes.py の DIAGNOSIS_BP と
# src/web/session.py・src/web/diagnosis_state.py）に統合したため、
# この session["wifi"]["diagnosis"] という構造での管理は使わなくなった
# （DIAGNOSIS_BPは session["result"] のようにFlaskのsessionへ
# トップレベルキーで直接読み書きする、別の実装方針を採っている）。


# ============================================================
# 共通
# ============================================================


def clear_all() -> None:
    """
    Wi-Fi診断アプリに関するセッションの内容を、すべて消去する。

    診断のやり直し（画面9「診断結果」から、もう一度トップからやり直す等）や、
    テストで使うことを想定している。
    ログイン情報など、Wi-Fi診断アプリ以外のセッションの内容には影響しない
    （_SESSION_ROOT_KEY の中身だけを消すため）。
    """
    # session.pop(key, None) は「keyが存在すれば削除し、存在しなければ
    # 何もしない（エラーにしない）」という安全な削除方法。
    session.pop(_SESSION_ROOT_KEY, None)
    session.modified = True
