"""質問ページ（原因切り分け診断）の質問データと分岐ロジック。

docs/wifi-shindan-spec-final.md 6章「担当E」の契約に従う。
このモジュールはFlask・Jinja・requestに依存しない。ルーティングはroutes.pyが担当する。
"""

import secrets
from datetime import date

INITIAL_QUESTION_ID = "initial_symptom"

QUESTIONS = {
    "initial_symptom": {
        "id": "initial_symptom",
        "text": "現在の症状に最も近いものを選んでください。",
        "description": "複数当てはまる場合は、最も困っている症状を選んでください。",
        "options": [
            {"id": "no_connection", "label": "どの端末でもインターネットに接続できない"},
            {"id": "slow_connection", "label": "接続はできるが通信速度が遅い"},
            {"id": "frequent_disconnect", "label": "接続できるが頻繁に切断される"},
            {"id": "specific_service", "label": "特定のサイトやサービスだけ利用できない"},
        ],
    },
    # --- 接続不能ルート ---
    "all_devices_check": {
        "id": "all_devices_check",
        "text": "インターネットに接続できない端末はどれですか？",
        "description": None,
        "options": [
            {"id": "all_devices", "label": "家にあるすべての端末"},
            {"id": "some_devices", "label": "1台または一部の端末だけ"},
        ],
    },
    "single_device_near_check": {
        "id": "single_device_near_check",
        "text": "問題のある端末は、ルーターのすぐ近くで使っても接続できませんか？",
        "description": None,
        "options": [
            {"id": "near_fails", "label": "近くでも接続できない"},
            {"id": "near_ok", "label": "近くでは接続できる"},
        ],
    },
    "router_lamp_check": {
        "id": "router_lamp_check",
        "text": "ルーターやONU（光回線の機器）のランプに、赤色・消灯・異常な点滅はありますか？",
        "description": None,
        "options": [
            {"id": "lamp_abnormal", "label": "異常なランプがある"},
            {"id": "lamp_normal", "label": "特に異常は見当たらない"},
        ],
    },
    "cable_check": {
        "id": "cable_check",
        "text": "ケーブルの抜けや緩みはありませんか？",
        "description": None,
        "options": [
            {"id": "cable_loose", "label": "抜けていた・緩んでいた"},
            {"id": "cable_ok", "label": "特に問題は見当たらない"},
        ],
    },
    "reboot_check_connection": {
        "id": "reboot_check_connection",
        "text": "ルーターとONU（光回線の機器）を再起動すると、接続できるようになりますか？",
        "description": None,
        "options": [
            {"id": "improved", "label": "改善した"},
            {"id": "not_improved", "label": "改善しない"},
        ],
    },
    "wired_check_connection": {
        "id": "wired_check_connection",
        "text": "LANケーブルで有線接続しても、インターネットに接続できませんか？",
        "description": None,
        "options": [
            {"id": "wired_fails", "label": "有線でも接続できない"},
            {"id": "wired_ok", "label": "有線では接続できる"},
            {"id": "cannot_test", "label": "有線接続を試せない"},
        ],
    },
    "outage_check_connection": {
        "id": "outage_check_connection",
        "text": "お住まいの地域や契約回線で、障害情報は出ていますか？",
        "description": "プロバイダの障害情報ページやスマートフォンのモバイル通信で確認してください。",
        "options": [
            {"id": "outage_yes", "label": "障害が発生している"},
            {"id": "outage_no", "label": "障害情報は出ていない・確認できない"},
        ],
    },
    # --- 速度低下ルート ---
    "slow_device_scope": {
        "id": "slow_device_scope",
        "text": "通信速度が遅いのはどの端末ですか？",
        "description": None,
        "options": [
            {"id": "all_devices", "label": "ほぼすべての端末"},
            {"id": "one_device", "label": "1台だけ"},
        ],
    },
    "slow_device_near_check": {
        "id": "slow_device_near_check",
        "text": "遅い端末は、ルーターのすぐ近くで使っても遅いですか？",
        "description": None,
        "options": [
            {"id": "near_slow", "label": "近くでも遅い"},
            {"id": "near_ok", "label": "近くでは速くなる"},
        ],
    },
    "slow_location_scope": {
        "id": "slow_location_scope",
        "text": "遅くなるのは、特定の部屋・場所だけですか？",
        "description": None,
        "options": [
            {"id": "specific_room", "label": "特定の部屋・場所だけ遅い"},
            {"id": "everywhere", "label": "家のどこでも同じように遅い"},
        ],
    },
    "slow_room_router_position": {
        "id": "slow_room_router_position",
        "text": "遅い部屋と、ルーターの位置の関係を教えてください。",
        "description": None,
        "options": [
            {"id": "router_near_slow_room", "label": "ルーターはその部屋の近くにあるが遅い"},
            {"id": "router_far_from_room", "label": "ルーターはその部屋から離れている"},
        ],
    },
    "slow_wired_check": {
        "id": "slow_wired_check",
        "text": "LANケーブルによる有線接続では、速度は改善しますか？",
        "description": None,
        "options": [
            {"id": "wired_fast", "label": "有線接続では速い"},
            {"id": "wired_slow", "label": "有線接続でも遅い"},
            {"id": "cannot_test", "label": "有線接続を試せない"},
        ],
    },
    "slow_time_check": {
        "id": "slow_time_check",
        "text": "遅くなるのは、決まった時間帯だけですか？",
        "description": None,
        "options": [
            {"id": "specific_time", "label": "夜間・休日など特定の時間帯だけ遅い"},
            {"id": "always", "label": "時間帯に関係なく常に遅い"},
        ],
    },
    "slow_traffic_check": {
        "id": "slow_traffic_check",
        "text": "遅くなるとき、家の中の状況はどれに近いですか？",
        "description": None,
        "options": [
            {"id": "many_devices", "label": "同時に接続している端末の台数が多い"},
            {"id": "heavy_download", "label": "動画視聴や大容量ダウンロードをしている"},
            {"id": "no_relation", "label": "特に当てはまらない"},
        ],
    },
    "slow_router_age_check": {
        "id": "slow_router_age_check",
        "text": "ルーターを使い始めてから、どのくらい経ちますか？",
        "description": None,
        "options": [
            {"id": "five_plus_years", "label": "5年以上"},
            {"id": "less_than_five", "label": "5年未満"},
        ],
    },
    # --- 接続不安定ルート ---
    "disconnect_scope": {
        "id": "disconnect_scope",
        "text": "接続が切れるのはどの端末ですか？",
        "description": None,
        "options": [
            {"id": "all_devices", "label": "すべての端末"},
            {"id": "some_devices", "label": "1台または一部の端末だけ"},
        ],
    },
    "disconnect_near_check": {
        "id": "disconnect_near_check",
        "text": "問題のある端末は、ルーターのすぐ近くでも切断されますか？",
        "description": None,
        "options": [
            {"id": "near_disconnect", "label": "近くでも切断される"},
            {"id": "near_ok", "label": "近くでは切断されない"},
        ],
    },
    "disconnect_wired_check": {
        "id": "disconnect_wired_check",
        "text": "LANケーブルによる有線接続でも切断されますか？",
        "description": None,
        "options": [
            {"id": "wired_disconnect", "label": "有線接続でも切断される"},
            {"id": "wired_ok", "label": "有線接続では切断されない"},
            {"id": "cannot_test", "label": "有線接続を試せない"},
        ],
    },
    "disconnect_reboot_check": {
        "id": "disconnect_reboot_check",
        "text": "ルーターを再起動すると、一時的に安定しますか？",
        "description": None,
        "options": [
            {"id": "improved", "label": "改善する"},
            {"id": "not_improved", "label": "改善しない"},
        ],
    },
    "disconnect_capacity_check": {
        "id": "disconnect_capacity_check",
        "text": "接続している端末の台数が増えたときに、切断が発生しますか？",
        "description": None,
        "options": [
            {"id": "yes_capacity", "label": "台数が多いときに発生する"},
            {"id": "no_capacity", "label": "台数とは関係なく発生する"},
        ],
    },
    "disconnect_age_check": {
        "id": "disconnect_age_check",
        "text": "ルーターの使用年数は5年以上ですか？",
        "description": None,
        "options": [
            {"id": "five_plus", "label": "5年以上"},
            {"id": "less_than_five", "label": "5年未満"},
        ],
    },
    "disconnect_outage_check": {
        "id": "disconnect_outage_check",
        "text": "お住まいの地域や契約回線で、障害情報は出ていますか？",
        "description": None,
        "options": [
            {"id": "outage_yes", "label": "障害が発生している"},
            {"id": "outage_no", "label": "障害情報は出ていない・確認できない"},
        ],
    },
    # --- 特定サービス限定ルート ---
    "other_services_available": {
        "id": "other_services_available",
        "text": "他のWebサイトやアプリは正常に利用できますか？",
        "description": None,
        "options": [
            {"id": "others_ok", "label": "他は正常に利用できる"},
            {"id": "others_also_bad", "label": "他のサイトやアプリも遅い・使えない"},
        ],
    },
    "other_device_check": {
        "id": "other_device_check",
        "text": "同じサービスを、別の端末やモバイル通信でも利用できますか？",
        "description": None,
        "options": [
            {"id": "specific_device_only", "label": "特定のこの端末だけ利用できない"},
            {"id": "others_device_fail", "label": "別の端末やモバイル通信でも利用できない"},
            {"id": "mobile_ok_home_fail", "label": "モバイル通信では使えるが、自宅回線では使えない"},
        ],
    },
    "service_outage_check": {
        "id": "service_outage_check",
        "text": "利用しているサービス公式の障害情報は出ていますか？",
        "description": None,
        "options": [
            {"id": "outage_yes", "label": "障害情報が出ている"},
            {"id": "outage_no", "label": "障害情報は出ていない"},
        ],
    },
}

CAUSES = {
    "device_power_or_cable": {
        "cause_name": "通信機器の電源・ケーブル接続の不良",
        "confidence": "high",
        "reason": "ケーブルの抜け・緩みが見つかったため。",
        "recommended_action": [
            "ケーブルを正しく差し直す",
            "ルーターとONUを再起動して接続を確認する",
        ],
        "show_heatmap": False,
        "support_required": False,
    },
    "temporary_router_failure": {
        "cause_name": "ルーター・回線機器の一時的な動作不良",
        "confidence": "high",
        "reason": "再起動したことで症状が改善したため。",
        "recommended_action": [
            "再発する場合は発生日時を記録しておく",
            "頻発する場合は機器の交換を検討する",
        ],
        "show_heatmap": False,
        "support_required": False,
    },
    "router_location": {
        "cause_name": "ルーターの設置場所・遮蔽物による電波減衰",
        "confidence": "high",
        "reason": "遅い部屋の近くにルーターがあるにもかかわらず速度が改善しないため。",
        "recommended_action": [
            "ルーターを住宅の中央付近・高い位置へ移動する",
            "金属製家具や水槽、電子レンジの近くを避ける",
        ],
        "show_heatmap": True,
        "support_required": False,
    },
    "distance_or_obstacle": {
        "cause_name": "端末とルーターの距離による電波不足",
        "confidence": "high",
        "reason": "ルーターの近くでは改善し、離れた場所だけ症状が出るため。",
        "recommended_action": [
            "ルーターの設置位置を見直す",
            "中継機やメッシュWi-Fiの導入を検討する",
        ],
        "show_heatmap": True,
        "support_required": False,
    },
    "router_capacity": {
        "cause_name": "ルーターの同時接続台数不足",
        "confidence": "high",
        "reason": "接続台数が多いときに症状が悪化するため。",
        "recommended_action": [
            "使っていない端末の接続を切る",
            "推奨接続台数の多いルーターへの買い替えを検討する",
        ],
        "show_heatmap": False,
        "support_required": False,
    },
    "router_aging": {
        "cause_name": "ルーターの経年劣化・性能不足",
        "confidence": "medium",
        "reason": "ルーターの使用年数が5年以上であるため。",
        "recommended_action": [
            "Wi-Fi 6以上など、契約速度に対応した機種へ買い替えを検討する",
        ],
        "show_heatmap": False,
        "support_required": False,
    },
    "heavy_simultaneous_usage": {
        "cause_name": "家庭内の通信量の集中",
        "confidence": "high",
        "reason": "動画視聴や大容量ダウンロードをしているときに症状が悪化するため。",
        "recommended_action": [
            "動画視聴やダウンロードの時間を分散する",
            "重要な通信は有線接続に切り替える",
        ],
        "show_heatmap": False,
        "support_required": False,
    },
    "line_congestion": {
        "cause_name": "回線・プロバイダ設備の混雑",
        "confidence": "medium",
        "reason": "有線接続でも時間帯に関係なく症状が続くため。",
        "recommended_action": [
            "IPv6 IPoE対応の契約かどうかを確認する",
            "プロバイダへ混雑状況を問い合わせる",
        ],
        "show_heatmap": False,
        "support_required": True,
    },
    "provider_outage": {
        "cause_name": "回線事業者・プロバイダ側の障害",
        "confidence": "high",
        "reason": "お住まいの地域・契約回線で障害情報が確認されているため。",
        "recommended_action": [
            "復旧情報を確認しながら待つ",
            "障害受付窓口へ問い合わせる",
        ],
        "show_heatmap": False,
        "support_required": True,
    },
    "single_device_issue": {
        "cause_name": "特定端末のWi-Fi設定・性能の問題",
        "confidence": "medium",
        "reason": "問題が特定の端末だけに発生しているため。",
        "recommended_action": [
            "Wi-Fiの登録を削除して再接続する",
            "端末を再起動し、OSを最新版に更新する",
        ],
        "show_heatmap": False,
        "support_required": False,
    },
    "service_side_issue": {
        "cause_name": "利用サービス側の障害",
        "confidence": "high",
        "reason": "利用しているサービスの公式障害情報が確認されているため。",
        "recommended_action": [
            "サービス側の復旧を待つ",
        ],
        "show_heatmap": False,
        "support_required": False,
    },
    "wifi_only_issue": {
        "cause_name": "Wi-Fi接続だけに発生している問題",
        "confidence": "medium",
        "reason": "有線接続では症状が出ず、Wi-Fi接続のときだけ発生するため。",
        "recommended_action": [
            "ルーターのWi-Fi設定を確認する",
            "2.4GHz/5GHzの切り替えを試す",
        ],
        "show_heatmap": False,
        "support_required": False,
    },
    "wired_and_wifi_issue": {
        "cause_name": "有線接続でも発生している問題",
        "confidence": "medium",
        "reason": "有線接続でも同じ症状が発生し、再起動や配線確認でも改善しないため。",
        "recommended_action": [
            "配線と機器の状態を記録しておく",
        ],
        "show_heatmap": False,
        "support_required": True,
    },
    "unknown_issue": {
        "cause_name": "原因を一つに特定できない問題",
        "confidence": "low",
        "reason": "これまでの回答からは、原因を一つに絞り込めなかったため。",
        "recommended_action": [
            "回答内容を控えておく",
        ],
        "show_heatmap": False,
        "support_required": True,
    },
}


def get_initial_question() -> dict:
    """最初に表示する質問を返す。"""
    return QUESTIONS[INITIAL_QUESTION_ID]


def get_question(question_id: str) -> dict | None:
    """質問IDに対応する質問データを返す。存在しなければNoneを返す。"""
    return QUESTIONS.get(question_id)


def validate_answer(question_id: str, answer_id: str) -> bool:
    """質問に対して有効な回答IDかどうかを確認する。"""
    question = get_question(question_id)
    if question is None:
        return False
    return any(option["id"] == answer_id for option in question["options"])


def describe_answer(question_id: str, answer_id: str) -> dict:
    """質問IDと回答IDに、日本語の質問文・回答ラベルを添えた辞書を返す。

    コールセンター向け照会画面などでID表示にならないよう、qa_history保存時に使う。
    """
    question = get_question(question_id)
    question_text = question["text"] if question else question_id
    answer_label = answer_id
    if question is not None:
        for option in question["options"]:
            if option["id"] == answer_id:
                answer_label = option["label"]
                break
    return {
        "question_id": question_id,
        "answer_id": answer_id,
        "question_text": question_text,
        "answer_label": answer_label,
    }


def _prior_answer(answer_history: list[dict], question_id: str) -> str | None:
    """回答履歴から、指定した質問IDへの回答を探す。"""
    for entry in answer_history:
        if entry["question_id"] == question_id:
            return entry["answer_id"]
    return None


def determine_next_step(
    current_question_id: str, answer_id: str, answer_history: list[dict]
) -> dict:
    """現在の質問・今回の回答・回答履歴から、次の質問または診断結果を決定する。"""

    def question(next_id: str) -> dict:
        return {"status": "question", "next_question_id": next_id}

    def result(cause_id: str) -> dict:
        return {"status": "result", "cause_id": cause_id}

    if current_question_id == "initial_symptom":
        if answer_id == "no_connection":
            return question("all_devices_check")
        if answer_id == "slow_connection":
            return question("slow_device_scope")
        if answer_id == "frequent_disconnect":
            return question("disconnect_scope")
        return question("other_services_available")  # specific_service

    # --- 接続不能ルート ---
    if current_question_id == "all_devices_check":
        if answer_id == "all_devices":
            return question("router_lamp_check")
        return question("single_device_near_check")  # some_devices

    if current_question_id == "single_device_near_check":
        if answer_id == "near_ok":
            return result("distance_or_obstacle")
        return result("single_device_issue")  # near_fails

    if current_question_id == "router_lamp_check":
        if answer_id == "lamp_abnormal":
            return question("cable_check")
        return question("reboot_check_connection")  # lamp_normal

    if current_question_id == "cable_check":
        if answer_id == "cable_loose":
            return result("device_power_or_cable")
        return question("reboot_check_connection")  # cable_ok

    if current_question_id == "reboot_check_connection":
        if answer_id == "improved":
            return result("temporary_router_failure")
        return question("wired_check_connection")  # not_improved

    if current_question_id == "wired_check_connection":
        if answer_id == "wired_ok":
            return result("wifi_only_issue")
        return question("outage_check_connection")  # wired_fails / cannot_test

    if current_question_id == "outage_check_connection":
        if answer_id == "outage_yes":
            return result("provider_outage")
        if _prior_answer(answer_history, "wired_check_connection") == "wired_fails":
            return result("wired_and_wifi_issue")
        return result("unknown_issue")

    # --- 速度低下ルート ---
    if current_question_id == "slow_device_scope":
        if answer_id == "all_devices":
            return question("slow_location_scope")
        return question("slow_device_near_check")  # one_device

    if current_question_id == "slow_device_near_check":
        if answer_id == "near_ok":
            return result("distance_or_obstacle")
        return result("single_device_issue")  # near_slow

    if current_question_id == "slow_location_scope":
        if answer_id == "specific_room":
            return question("slow_room_router_position")
        return question("slow_wired_check")  # everywhere

    if current_question_id == "slow_room_router_position":
        if answer_id == "router_near_slow_room":
            return result("router_location")
        return result("distance_or_obstacle")  # router_far_from_room

    if current_question_id == "slow_wired_check":
        if answer_id == "wired_fast":
            return result("wifi_only_issue")
        return question("slow_time_check")  # wired_slow / cannot_test

    if current_question_id == "slow_time_check":
        if answer_id == "specific_time":
            return question("slow_traffic_check")
        return question("slow_router_age_check")  # always

    if current_question_id == "slow_traffic_check":
        if answer_id == "many_devices":
            return result("router_capacity")
        if answer_id == "heavy_download":
            return result("heavy_simultaneous_usage")
        return result("line_congestion")  # no_relation

    if current_question_id == "slow_router_age_check":
        if answer_id == "five_plus_years":
            return result("router_aging")
        if _prior_answer(answer_history, "slow_wired_check") == "cannot_test":
            return result("unknown_issue")
        return result("line_congestion")  # less_than_five

    # --- 接続不安定ルート ---
    if current_question_id == "disconnect_scope":
        if answer_id == "all_devices":
            return question("disconnect_wired_check")
        return question("disconnect_near_check")  # some_devices

    if current_question_id == "disconnect_near_check":
        if answer_id == "near_ok":
            return result("distance_or_obstacle")
        return result("single_device_issue")  # near_disconnect

    if current_question_id == "disconnect_wired_check":
        if answer_id == "wired_ok":
            return result("wifi_only_issue")
        return question("disconnect_reboot_check")  # wired_disconnect / cannot_test

    if current_question_id == "disconnect_reboot_check":
        if answer_id == "improved":
            return result("temporary_router_failure")
        return question("disconnect_capacity_check")  # not_improved

    if current_question_id == "disconnect_capacity_check":
        if answer_id == "yes_capacity":
            return result("router_capacity")
        return question("disconnect_age_check")  # no_capacity

    if current_question_id == "disconnect_age_check":
        if answer_id == "five_plus":
            return result("router_aging")
        return question("disconnect_outage_check")  # less_than_five

    if current_question_id == "disconnect_outage_check":
        if answer_id == "outage_yes":
            return result("provider_outage")
        if _prior_answer(answer_history, "disconnect_wired_check") == "wired_disconnect":
            return result("wired_and_wifi_issue")
        return result("unknown_issue")

    # --- 特定サービス限定ルート ---
    if current_question_id == "other_services_available":
        if answer_id == "others_also_bad":
            return question("slow_device_scope")
        return question("other_device_check")  # others_ok

    if current_question_id == "other_device_check":
        if answer_id == "specific_device_only":
            return result("single_device_issue")
        if answer_id == "others_device_fail":
            return question("service_outage_check")
        return result("unknown_issue")  # mobile_ok_home_fail

    if current_question_id == "service_outage_check":
        if answer_id == "outage_yes":
            return result("service_side_issue")
        return result("unknown_issue")

    raise ValueError(f"未知の質問IDです: {current_question_id}")


def generate_diagnosis_id() -> str:
    """`HM-YYYYMMDD-XXXXXX` 形式の診断IDを発行する。"""
    today = date.today().strftime("%Y%m%d")
    suffix_chars = "ABCDEFGHJKMNPRSTUVWXY345678"
    suffix = "".join(secrets.choice(suffix_chars) for _ in range(6))
    return f"HM-{today}-{suffix}"


def build_diagnosis_result(
    cause_id: str, answer_history: list[dict], diagnosis_id: str
) -> dict:
    """原因IDと回答履歴から診断結果データを作成する。"""
    cause = CAUSES[cause_id]
    support_message = None
    if cause["support_required"]:
        support_message = (
            f"診断ID {diagnosis_id} の内容についてご相談です。"
            f"「{cause['cause_name']}」が疑われます。"
        )

    return {
        "diagnosis_id": diagnosis_id,
        "cause_id": cause_id,
        "cause_name": cause["cause_name"],
        "confidence": cause["confidence"],
        "reason": cause["reason"],
        "recommended_action": cause["recommended_action"],
        "show_heatmap": cause["show_heatmap"],
        "support_required": cause["support_required"],
        "support_message": support_message,
        "answers": answer_history,
    }
