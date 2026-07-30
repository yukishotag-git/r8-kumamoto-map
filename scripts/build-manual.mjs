// 手動指定のランドマーク（代表的な施設）をジオコーディングして data/manual-spots.json を生成
// OSM自動取得(build-spots.mjs)では拾えない大型商業施設・道の駅などを補完する
import { writeFile, readFile } from "fs/promises";

// genre: gas / super / bousai / water / medical / bath / road / other
// q はOverpassの名称検索に使う正規表現（部分一致）
const LANDMARKS = [
  // ---- 宇土市 ----
  {name:"カインズ 熊本宇土店（カインズモール宇土）", genre:"super",  q:"カインズ"},
  {name:"宇土シティモール",                          genre:"super",  q:"宇土シティ"},
  {name:"クロス21ウト",                              genre:"super",  q:"クロス21"},
  {name:"ルネサス エレクトロニクス 熊本川尻事業所",  genre:"other",  q:"ルネサス"},
  {name:"道の駅 宇土マリーナ おこしき館",            genre:"super",  q:"宇土マリーナ"},

  // ---- 宇城市 ----
  {name:"イオンモール宇城",                          genre:"super",  q:"イオンモール宇城"},
  {name:"道の駅うき サンサンうきっ子宇城彩館",       genre:"super",  q:"うきっ子|道の駅うき"},
  {name:"道の駅 不知火（不知火温泉）",               genre:"bath",   q:"不知火温泉|道の駅不知火"},
  {name:"宇城市役所（市民活動センター）",            genre:"bousai", q:"宇城市役所"},

  // ---- 八代市 ----
  {name:"ゆめタウン八代",                            genre:"super",  q:"ゆめタウン八代"},
  {name:"イオン八代ショッピングセンター",            genre:"super",  q:"イオン八代"},
  {name:"トライアル 八代店",                         genre:"super",  q:"トライアル"},
  {name:"くまモンポート八代",                        genre:"other",  q:"くまモンポート"},
  {name:"桜の湯（八代）",                            genre:"bath",   q:"桜の湯"},
  {name:"八代市役所",                                genre:"bousai", q:"八代市役所"},
  {name:"八代市立図書館",                            genre:"bousai", q:"八代市立図書館|八代市図書館"},
  {name:"八代市厚生会館",                            genre:"bousai", q:"厚生会館"},

  // ---- 八代郡氷川町 ----
  {name:"道の駅竜北 直売所",                         genre:"super",  q:"道の駅竜北|竜北"},
  {name:"氷川町役場（宮原庁舎）",                    genre:"bousai", q:"氷川町役場"},
  {name:"氷川町 竜北庁舎",                           genre:"bousai", q:"竜北庁舎"}
];

const UA = "r8-kumamoto-map/1.0 (+https://r8kumamoto.promate2.com; disaster-info site; contact: yukishota.g@gmail.com)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ENDPOINTS = [
  "https://overpass.osm.jp/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];
// 対象エリア（宇土〜八代の帯を広めに）
const BB = "32.40,130.40,32.75,130.95";

// OpenStreetMapの名称検索（Overpass）で正確な座標を取得
async function findByName(keyword){
  const q = `[out:json][timeout:60];
(
 nwr["name"~"${keyword}"](${BB});
 nwr["brand"~"${keyword}"](${BB});
);
out center 20;`;
  for(let i = 0; i < ENDPOINTS.length; i++){
    try{
      if(i > 0) await sleep(10000);
      const res = await fetch(ENDPOINTS[i], {
        method:"POST",
        headers:{"Content-Type":"application/x-www-form-urlencoded", "Accept":"application/json", "User-Agent": UA},
        body: "data=" + encodeURIComponent(q)
      });
      if(!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      const cands = (j.elements || []).map(el=>{
        const lat = el.lat !== undefined ? el.lat : el.center && el.center.lat;
        const lng = el.lon !== undefined ? el.lon : el.center && el.center.lon;
        return {lat, lng, name: (el.tags||{}).name || "", tags: el.tags || {}};
      }).filter(c => typeof c.lat === "number");
      if(!cands.length) return null;
      // 建物や敷地よりも本体（name完全一致に近いもの）を優先
      cands.sort((a,b)=>a.name.length - b.name.length);
      return cands[0];
    }catch(e){ console.error(`  overpass(${i}): ${e.message}`); }
  }
  return null;
}

// 予備手段：Nominatim
async function geocode(q){
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=jp"
            + "&accept-language=ja&viewbox=130.40,32.75,130.95,32.40&bounded=1&q=" + encodeURIComponent(q);
  const res = await fetch(url, {headers:{"User-Agent": UA}});
  if(!res.ok) throw new Error("Nominatim HTTP " + res.status);
  const j = await res.json();
  if(!j.length) return null;
  return {lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), name: j[0].display_name || ""};
}

// 既存拠点（自動取得分）を読み込み、重複判定に使う
async function loadExisting(){
  const files = ["core","kumamoto-city","north","central","east","south","amakusa","hitoyoshi"];
  const out = [];
  for(const f of files){
    try{
      const d = JSON.parse(await readFile(`data/spots/${f}.json`, "utf-8"));
      out.push(...d.spots);
    }catch(e){}
  }
  return out;
}
const distM = (a, b) => {
  const R = 6371000, toRad = x => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const norm = s => s.replace(/[\s　（）()・]/g, "").toLowerCase();

const existing = await loadExisting();
const spots = [];
for(const lm of LANDMARKS){
  await sleep(3000);  // 各サーバーの利用ポリシー
  let pos = null;
  try{ pos = await findByName(lm.q); }catch(e){ console.error(lm.name, e.message); }
  if(!pos){
    try{ await sleep(1200); pos = await geocode(lm.name); }catch(e){}
  }
  if(!pos){ console.log(`× 見つからず: ${lm.name}`); continue; }

  // 重複除外：150m以内に既存拠点があればスキップ
  const dup = existing.find(s => distM(s, pos) < 150);
  if(dup){ console.log(`− 重複のためスキップ: ${lm.name}（既存: ${dup.name}）`); continue; }

  spots.push({
    id: "manual-" + norm(lm.name).slice(0, 30),
    name: lm.name, genre: lm.genre,
    lat: Math.round(pos.lat * 1e5) / 1e5, lng: Math.round(pos.lng * 1e5) / 1e5
  });
  console.log(`○ ${lm.name} (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)})`);
}

await writeFile("data/manual-spots.json",
  JSON.stringify({generated: new Date().toISOString(), count: spots.length, spots}, null, 1));
console.log(`\n生成完了: ${spots.length}件`);
