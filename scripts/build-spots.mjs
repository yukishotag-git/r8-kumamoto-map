// OSM(Overpass API)から拠点データを取得し、data/spots/ に地域別JSONを生成する
// GitHub Actions で定期実行される（手動実行も可）
import { writeFile, mkdir } from "fs/promises";

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
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function buildQuery(munis){
  return `[out:json][timeout:180];
area["name"="熊本県"]["admin_level"="4"]->.pref;
rel["boundary"="administrative"]["admin_level"="7"]["name"~"^(${munis.join("|")})$"](area.pref);
map_to_area ->.m;
(
nwr["amenity"~"^(fuel|hospital|clinic|townhall|community_centre)$"](area.m);
nwr["shop"~"^(supermarket|convenience|chemist)$"](area.m);
nwr["leisure"="sports_centre"](area.m);
);
out center 8000;`;
}

function genreFromTags(t){
  if(t.amenity === "townhall" || t.amenity === "community_centre" || t.leisure === "sports_centre") return "bousai";
  if(t.amenity === "hospital" || t.amenity === "clinic") return "medical";
  if(t.amenity === "fuel") return "gas";
  if(t.shop === "supermarket" || t.shop === "convenience" || t.shop === "chemist") return "super";
  return "other";
}

async function fetchGroup(munis){
  const q = buildQuery(munis);
  let lastErr;
  for(let attempt = 0; attempt < 6; attempt++){
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    try{
      if(attempt > 0) await sleep(30000);
      const res = await fetch(url, {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: "data=" + encodeURIComponent(q)
      });
      if(!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      return (json.elements || []).map(el => {
        const lat = el.lat !== undefined ? el.lat : el.center && el.center.lat;
        const lng = el.lon !== undefined ? el.lon : el.center && el.center.lon;
        const t = el.tags || {};
        let name = t.name || t.brand || null;
        if(name && t.branch && !name.includes(t.branch)) name += " " + t.branch;
        return {id: "osm-" + el.type + "-" + el.id, name, genre: genreFromTags(t), lat, lng};
      }).filter(s => s.name && s.genre !== "other" && typeof s.lat === "number" && typeof s.lng === "number");
    }catch(e){ lastErr = e; console.error(`attempt ${attempt}: ${e.message}`); }
  }
  throw lastErr;
}

const round = x => Math.round(x * 1e4) / 1e4;

await mkdir("data/spots", {recursive: true});
const index = [];
for(const [file, munis] of Object.entries(GROUPS)){
  console.log(`fetching ${file} (${munis.join(",")})...`);
  const spots = await fetchGroup(munis);
  spots.forEach(s => { s.lat = round(s.lat); s.lng = round(s.lng); });
  const bbox = [
    Math.min(...spots.map(s => s.lat)), Math.min(...spots.map(s => s.lng)),
    Math.max(...spots.map(s => s.lat)), Math.max(...spots.map(s => s.lng))
  ];
  await writeFile(`data/spots/${file}.json`, JSON.stringify({munis, count: spots.length, spots}));
  index.push({file: file + ".json", bbox, count: spots.length});
  console.log(`  -> ${spots.length} spots`);
  await sleep(8000); // レート制限対策
}
await writeFile("data/spots/index.json",
  JSON.stringify({generated: new Date().toISOString(), files: index}, null, 1));
console.log("done");
