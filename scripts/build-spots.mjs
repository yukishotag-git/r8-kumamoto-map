// OSM(Overpass API)から拠点データを取得し、data/spots/ に地域別JSONを生成する
// GitHub Actions で定期実行される（手動実行も可）
import { writeFile, mkdir } from "fs/promises";
import { cleanSpots } from "./clean-spots.mjs";

const GROUPS = {
  "core":          ["宇城市", "八代市", "氷川町"],                    // 初期表示で必ず読み込む地域
  "kumamoto-city": ["熊本市"],
  "north":         ["荒尾市", "玉名市", "菊池市", "合志市", "大津町", "菊陽町"],
  "central":       ["宇土市", "美里町"],
  "east":          ["益城町", "嘉島町", "御船町", "甲佐町", "山都町"],
  "south":         ["芦北町", "津奈木町", "水俣市"],
  "amakusa":       ["上天草市", "天草市", "苓北町"],
  "hitoyoshi":     ["人吉市", "錦町", "あさぎり町", "多良木町", "湯前町", "水上村", "相良村", "五木村", "山江村", "球磨村"]
};

const ENDPOINTS = [
  "https://overpass.osm.jp/api/interpreter",          // 日本サーバー（国内データ向き）
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
const HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  "Accept": "application/json",
  "User-Agent": "r8-kumamoto-map/1.0 (+https://r8kumamoto.promate2.com; disaster-info site; contact: yukishota.g@gmail.com)"
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

function buildQuery(munis){
  return `[out:json][timeout:180];
area["name"="熊本県"]["admin_level"="4"]->.pref;
rel["boundary"="administrative"]["admin_level"="7"]["name"~"^(${munis.join("|")})$"](area.pref);
map_to_area ->.m;
(
nwr["amenity"~"^(fuel|charging_station|hospital|clinic|doctors|pharmacy|townhall|community_centre|marketplace|public_bath|drinking_water|water_point)$"](area.m);
nwr["shop"~"^(supermarket|convenience|chemist|grocery|greengrocer|butcher|bakery|department_store|general|variety_store|discount|wholesale|farm|seafood|hardware|doityourself|kiosk)$"](area.m);
nwr["leisure"~"^(sports_centre|sports_hall)$"](area.m);
nwr["shop"="mall"](area.m);
nwr["tourism"="information"]["information"="office"](area.m);
);
out center 20000;`;
}

const SUPER_SHOPS = ["supermarket","convenience","chemist","grocery","greengrocer","butcher","bakery",
  "department_store","general","variety_store","discount","wholesale","farm","seafood","kiosk","mall",
  "hardware","doityourself"];

function genreFromTags(t){
  if(t.amenity === "fuel" || t.amenity === "charging_station") return "gas";
  if(t.amenity === "drinking_water" || t.amenity === "water_point") return "water";
  if(t.amenity === "public_bath") return "bath";
  if(["hospital","clinic","doctors","pharmacy"].includes(t.amenity)) return "medical";
  if(t.amenity === "townhall" || t.amenity === "community_centre"
     || t.leisure === "sports_centre" || t.leisure === "sports_hall"
     || (t.tourism === "information" && t.information === "office")) return "bousai";
  if(SUPER_SHOPS.includes(t.shop) || t.amenity === "marketplace") return "super";
  return "other";
}

// 名称が無い施設向けの表示名（災害時は位置情報が重要なので捨てずに残す）
function fallbackName(t, genre){
  if(t.operator) return t.operator;
  const label = {
    gas:"ガソリンスタンド", super:"店舗", medical:"医療機関",
    bousai:"公共施設", water:"給水設備", bath:"入浴施設"
  }[genre] || "施設";
  const sub = {
    convenience:"コンビニ", supermarket:"スーパー", chemist:"ドラッグストア",
    bakery:"パン屋", greengrocer:"青果店", butcher:"精肉店", seafood:"鮮魚店",
    hardware:"金物店", doityourself:"ホームセンター", kiosk:"売店"
  }[t.shop];
  return (sub || label) + "（名称未登録）";
}

async function fetchGroup(munis){
  const q = buildQuery(munis);
  let lastErr;
  for(let attempt = 0; attempt < 10; attempt++){
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try{
      if(attempt > 0) await sleep(20000);
      const res = await fetch(url, {
        method: "POST",
        headers: HEADERS,
        body: "data=" + encodeURIComponent(q)
      });
      if(!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      return (json.elements || []).map(el => {
        const lat = el.lat !== undefined ? el.lat : el.center && el.center.lat;
        const lng = el.lon !== undefined ? el.lon : el.center && el.center.lon;
        const t = el.tags || {};
        const genre = genreFromTags(t);
        let name = t.name || t.brand || null;
        if(name && t.branch && !name.includes(t.branch)) name += " " + t.branch;
        if(!name) name = fallbackName(t, genre);   // 無名でも位置情報として残す
        // 住所タグから地区名を控えておく（同名店舗の店名導出用）
        const loc = t["addr:quarter"] || t["addr:neighbourhood"] || t["addr:suburb"] || null;
        return {id: "osm-" + el.type + "-" + el.id, name, genre, lat, lng, loc};
      }).filter(s => s.genre !== "other" && typeof s.lat === "number" && typeof s.lng === "number");
    }catch(e){ lastErr = e; console.error(`attempt ${attempt}: ${e.message}`); }
  }
  throw lastErr;
}

const round = x => Math.round(x * 1e4) / 1e4;

// Nominatim逆ジオコーディングで地区名を取得（同名店舗の店名導出用）
async function reverseLocality(lat, lng){
  try{
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&accept-language=ja`;
    const res = await fetch(url, {headers: {"User-Agent": HEADERS["User-Agent"]}});
    if(!res.ok) return null;
    const a = (await res.json()).address || {};
    return a.neighbourhood || a.quarter || a.hamlet || a.suburb || a.village || a.town || null;
  }catch(e){ return null; }
}

// ---- 取得 ----
await mkdir("data/spots", {recursive: true});
const groupSpots = {};
for(const [file, munis] of Object.entries(GROUPS)){
  console.log(`fetching ${file} (${munis.join(",")})...`);
  groupSpots[file] = await fetchGroup(munis);
  console.log(`  -> ${groupSpots[file].length} spots`);
  await sleep(8000); // レート制限対策
}

// ---- 同名店舗に地名から「〇〇店」を付与 ----
const all = Object.values(groupSpots).flat();
const counts = {};
all.forEach(s => counts[s.name] = (counts[s.name] || 0) + 1);
// 名称未登録のものは店名導出の対象外（無駄なジオコーディングを避ける）
const targets = all.filter(s => counts[s.name] > 1 && !s.name.includes("名称未登録"));
console.log(`同名重複 ${targets.length} 件の店名を導出...`);
let nomiUsed = 0;
for(const s of targets){
  let loc = s.loc;
  if(!loc && nomiUsed < 500){
    nomiUsed++;
    await sleep(1200); // Nominatim利用ポリシー（1req/秒以下）
    loc = await reverseLocality(s.lat, s.lng);
  }
  if(loc){
    loc = loc.replace(/^大字/, "").replace(/[0-9０-９丁目番地\-ー−]+$/, "").trim();
    if(loc && !s.name.includes(loc)){
      s.name = (s.genre === "super" || s.genre === "gas")
        ? `${s.name} ${loc}店`
        : `${s.name}（${loc}）`;
    }
  }
}
console.log(`Nominatim使用: ${nomiUsed}件`);

// ---- 書き出し ----
const index = [];
for(const [file, raw] of Object.entries(groupSpots)){
  raw.forEach(s => { s.lat = round(s.lat); s.lng = round(s.lng); delete s.loc; });
  // 重複統合・名称の一意化などの点検を通す
  const {spots, stat} = cleanSpots(raw);
  console.log(`${file}: ${raw.length} → ${spots.length}件 ` +
    `(統合${stat.merged} / 無名削除${stat.droppedUnnamed} / 識別子付与${stat.renamed})`);
  const bbox = [
    Math.min(...spots.map(s => s.lat)), Math.min(...spots.map(s => s.lng)),
    Math.max(...spots.map(s => s.lat)), Math.max(...spots.map(s => s.lng))
  ];
  await writeFile(`data/spots/${file}.json`, JSON.stringify({munis: GROUPS[file], count: spots.length, spots}));
  index.push({file: file + ".json", bbox, count: spots.length});
}
await writeFile("data/spots/index.json",
  JSON.stringify({generated: new Date().toISOString(), files: index}, null, 1));
console.log("done");
