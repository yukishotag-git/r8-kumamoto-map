#!/usr/bin/env python3
"""
Overture Maps の施設データ（places）から、被災エリアの生活関連施設を取得する。
OpenStreetMapに登録が無いコンビニ・スーパー等を補完するのが目的。
出力: data/overture-spots.json
ライセンス: Overture Maps places は CDLA-Permissive 2.0（表示すれば再配布可）
"""
import json, subprocess, sys, os, math

# 対象範囲（宇土〜八代・氷川・嘉島/益城を含む帯）
BBOX = "130.35,32.30,131.00,32.85"   # west,south,east,north
OUT = "data/overture-spots.json"

# Overtureのカテゴリ → サイト内ジャンル
CATEGORY_MAP = {
    "convenience_store": "super", "supermarket": "super", "grocery_store": "super",
    "shopping": "super", "discount_store": "super", "department_store": "super",
    "food_and_beverage_retail": "super", "farmers_market": "super",
    "drugstore": "super", "pharmacy": "medical", "beverage_store": "super",
    "gas_station": "gas", "ev_charging_station": "gas",
    "hospital": "medical", "clinic": "medical", "doctor": "medical",
    "city_hall": "bousai", "community_center": "bousai", "town_hall": "bousai",
    "school": "bousai", "elementary_school": "bousai", "middle_school": "bousai",
    "high_school": "bousai", "public_gym": "bousai", "stadium_arena": "bousai",
    "library": "bousai", "government_office": "bousai",
    "public_bath": "bath", "onsen": "bath", "spa": "bath",
}
# 名称からの補完判定（カテゴリが取れない場合）
NAME_HINTS = [
    (["セブン-イレブン", "セブンイレブン", "ローソン", "ファミリーマート", "ミニストップ",
      "デイリーヤマザキ", "ポプラ", "スーパー", "マート", "コスモス", "ドラッグ", "ダイレックス",
      "トライアル", "ロッキー", "マルショク", "鮮ど市場", "エーコープ", "直売所"], "super"),
    (["ＥＮＥＯＳ", "ENEOS", "出光", "コスモ石油", "ＳＳ", "給油", "石油"], "gas"),
    (["病院", "医院", "クリニック", "診療所", "薬局"], "medical"),
    (["役場", "市役所", "公民館", "小学校", "中学校", "高等学校", "体育館", "支所"], "bousai"),
    (["温泉", "の湯", "銭湯"], "bath"),
]

def genre_of(cat, name):
    if cat in CATEGORY_MAP:
        return CATEGORY_MAP[cat]
    for words, g in NAME_HINTS:
        if any(w in name for w in words):
            return g
    return None

def main():
    tmp = "/tmp/overture_places.geojson"
    cmd = ["overturemaps", "download", f"--bbox={BBOX}", "-f", "geojson",
           "--type=place", "-o", tmp]
    print("Overtureからダウンロード中...", " ".join(cmd), flush=True)
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("ダウンロード失敗:", r.stderr[-2000:], file=sys.stderr)
        sys.exit(1)

    spots, skipped = [], 0
    with open(tmp, encoding="utf-8") as f:
        for line in f:
            line = line.strip().rstrip(",")
            if not line.startswith("{"):
                continue
            try:
                feat = json.loads(line)
            except Exception:
                continue
            if feat.get("type") != "Feature":
                continue
            props = feat.get("properties", {}) or {}
            geom = feat.get("geometry", {}) or {}
            if geom.get("type") != "Point":
                continue
            lng, lat = geom["coordinates"][:2]

            names = props.get("names") or {}
            name = names.get("primary") if isinstance(names, dict) else None
            if not name:
                skipped += 1
                continue

            cats = props.get("categories") or {}
            cat = cats.get("primary") if isinstance(cats, dict) else None
            g = genre_of(cat or "", name)
            if not g:
                continue

            # 信頼度が極端に低いものは除外
            conf = props.get("confidence")
            if isinstance(conf, (int, float)) and conf < 0.3:
                continue

            spots.append({
                "id": "ovt-" + str(props.get("id") or f"{lat:.5f},{lng:.5f}"),
                "name": name,
                "genre": g,
                "lat": round(lat, 5),
                "lng": round(lng, 5),
            })

    # 同一地点・同名の重複を除去
    seen, uniq = set(), []
    for s in spots:
        key = (s["name"], round(s["lat"], 4), round(s["lng"], 4))
        if key in seen:
            continue
        seen.add(key)
        uniq.append(s)

    os.makedirs("data", exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"source": "Overture Maps Foundation (CDLA-Permissive 2.0)",
                   "count": len(uniq), "spots": uniq}, f, ensure_ascii=False)

    from collections import Counter
    print(f"取得: {len(uniq)}件  内訳: {dict(Counter(s['genre'] for s in uniq))}")
    conv = [s for s in uniq if any(c in s["name"] for c in
            ["セブン", "ローソン", "ファミリーマート", "ミニストップ", "デイリー"])]
    print(f"うちコンビニ相当: {len(conv)}件")

if __name__ == "__main__":
    main()
