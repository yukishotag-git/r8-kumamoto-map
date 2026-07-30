// 手動指定のランドマーク（代表的な施設）をジオコーディングして data/manual-spots.json を生成
// OSM自動取得(build-spots.mjs)では拾えない大型商業施設・道の駅などを補完する
import { writeFile, readFile } from "fs/promises";

// genre: gas / super / bousai / water / medical / bath / road / other
const LANDMARKS = [
  // ---- 宇土市 ----
  {name:"カインズ 熊本宇土店（カインズモール宇土）", genre:"super",  q:"カインズ 熊本宇土店"},
  {name:"宇土シティモール",                          genre:"super",  q:"宇土シティモール"},
  {name:"クロス21ウト",                              genre:"super",  q:"クロス21ウト 宇土市"},
  {name:"ルネサス エレクトロニクス 熊本川尻事業所",  genre:"other",  q:"ルネサスエレクトロニクス 熊本川尻工場"},
  {name:"道の駅 宇土マリーナ おこしき館",            genre:"super",  q:"道の駅宇土マリーナ"},

  // ---- 宇城市 ----
  {name:"イオンモール宇城",                          genre:"super",  q:"イオンモール宇城"},
  {name:"道の駅うき サンサンうきっ子宇城彩館",       genre:"super",  q:"道の駅うき"},
  {name:"道の駅 不知火（不知火温泉）",               genre:"bath",   q:"道の駅不知火"},
  {name:"宇城市役所（市民活動センター）",            genre:"bousai", q:"宇城市役所"},

  // ---- 八代市 ----
  {name:"ゆめタウン八代",                            genre:"super",  q:"ゆめタウン八代"},
  {name:"イオン八代ショッピングセンター",            genre:"super",  q:"イオン八代店"},
  {name:"トライアル 八代店",                         genre:"super",  q:"トライアル 八代店"},
  {name:"くまモンポート八代",                        genre:"other",  q:"くまモンポート八代"},
  {name:"桜の湯（八代）",                            genre:"bath",   q:"桜の湯 八代市"},
  {name:"八代市役所",                                genre:"bousai", q:"八代市役所"},
  {name:"八代市立図書館",                            genre:"bousai", q:"八代市立図書館"},
  {name:"八代市厚生会館",                            genre:"bousai", q:"八代市厚生会館"},

  // ---- 八代郡氷川町 ----
  {name:"道の駅竜北 直売所",                         genre:"super",  q:"道の駅竜北"},
  {name:"氷川町役場（宮原庁舎）",                    genre:"bousai", q:"氷川町役場"},
  {name:"氷川町 竜北庁舎",                           genre:"bousai", q:"氷川町役場 竜北庁舎"}
];

const UA = "r8-kumamoto-map/1.0 (+https://r8kumamoto.promate2.com; disaster-info site; contact: yukishota.g@gmail.com)";
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function geocode(q){
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=jp"
            + "&accept-language=ja&viewbox=130.30,32.90,131.10,32.30&bounded=1&q=" + encodeURIComponent(q);
  const res = await fetch(url, {headers:{"User-Agent": UA}});
  if(!res.ok) throw new Error("Nominatim HTTP " + res.status);
  const j = await res.json();
  if(!j.length) return null;
  return {lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon)};
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
  await sleep(1200);  // Nominatim利用ポリシー
  let pos = null;
  try{ pos = await geocode(lm.q); }catch(e){ console.error(lm.name, e.message); }
  if(!pos){ console.log(`× 見つからず: ${lm.name}`); continue; }

  // 重複除外：150m以内に名前の似た既存拠点があればスキップ
  const dup = existing.find(s => distM(s, pos) < 150 &&
    (norm(s.name).includes(norm(lm.q)) || norm(lm.name).includes(norm(s.name))));
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
