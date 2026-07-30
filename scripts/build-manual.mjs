// 手動指定の拠点（役場・学校・コンビニ・スーパー・GSなど）を住所からジオコーディングし
// data/manual-spots.json を生成する。OSM自動取得(build-spots.mjs)の不足を補う。
// 住所は国土地理院の住所検索API、無い場合はOSM名称検索(Overpass)→Nominatimの順に解決する。
import { writeFile, readFile } from "fs/promises";

// genre: gas / super / bousai / water / medical / bath / road / other
// addr があれば住所検索、無ければ q（名称）で検索する
const LANDMARKS = [
  // ===== 役場・出先機関 =====
  {name:"宇土市役所（本庁舎）", genre:"bousai", addr:"熊本県宇土市浦田町51"},
  {name:"宇土市役所 網田支所", genre:"bousai", addr:"熊本県宇土市下網田町1819"},
  {name:"宇土市役所 網津支所", genre:"bousai", addr:"熊本県宇土市網津町1991-1"},
  {name:"宇城市役所（本庁舎）", genre:"bousai", addr:"熊本県宇城市松橋町大野85"},
  {name:"宇城市役所 小川支所", genre:"bousai", addr:"熊本県宇城市小川町河江87-1"},
  {name:"宇城市役所 不知火支所", genre:"bousai", addr:"熊本県宇城市不知火町高良2273-1"},
  {name:"宇城市役所 豊野支所", genre:"bousai", addr:"熊本県宇城市豊野町山崎380"},
  {name:"宇城市役所 三角支所", genre:"bousai", addr:"熊本県宇城市三角町波多200"},
  {name:"八代市役所（本庁舎）", genre:"bousai", addr:"熊本県八代市松江城町1-25"},
  {name:"八代市役所 鏡支所", genre:"bousai", addr:"熊本県八代市鏡町内田453-1"},
  {name:"八代市役所 千丁支所", genre:"bousai", addr:"熊本県八代市千丁町新牟田1502-1"},
  {name:"八代市役所 坂本支所", genre:"bousai", addr:"熊本県八代市坂本町坂本1051-2"},
  {name:"八代市役所 東陽支所", genre:"bousai", addr:"熊本県八代市東陽町南1105-1"},
  {name:"八代市役所 泉支所", genre:"bousai", addr:"熊本県八代市泉町柿迫3131"},
  {name:"八代市役所 日奈久出張所", genre:"bousai", addr:"熊本県八代市日奈久塩浜町113"},
  {name:"氷川町役場（本庁舎・宮原）", genre:"bousai", addr:"熊本県八代郡氷川町島地642"},
  {name:"嘉島町役場", genre:"bousai", addr:"熊本県上益城郡嘉島町上島547"},

  // ===== 学校（指定避難所等） =====
  {name:"宇土市立宇土小学校", genre:"bousai", addr:"熊本県宇土市本町1-85"},
  {name:"宇土市立鶴城中学校", genre:"bousai", addr:"熊本県宇土市新松原町142"},
  {name:"熊本県立宇土中学校・高等学校", genre:"bousai", addr:"熊本県宇土市古保里町1980"},
  {name:"宇城市立松橋小学校", genre:"bousai", addr:"熊本県宇城市松橋町松橋854"},
  {name:"宇城市立松橋中学校", genre:"bousai", addr:"熊本県宇城市松橋町久具310"},
  {name:"宇城市立小川中学校", genre:"bousai", addr:"熊本県宇城市小川町江頭100"},
  {name:"熊本県立松橋高等学校", genre:"bousai", addr:"熊本県宇城市松橋町久具433"},
  {name:"八代市立代陽小学校", genre:"bousai", addr:"熊本県八代市向島町2521"},
  {name:"八代市立第一中学校", genre:"bousai", addr:"熊本県八代市北の丸町3-35"},
  {name:"熊本県立八代高等学校・中学校", genre:"bousai", addr:"熊本県八代市妙見町900"},
  {name:"氷川町立竜北中学校", genre:"bousai", addr:"熊本県八代郡氷川町吉本515"},
  {name:"氷川町立氷川中学校", genre:"bousai", addr:"熊本県八代郡氷川町宮原680"},

  // ===== コンビニ =====
  {name:"セブン-イレブン 宇土松原町店", genre:"super", addr:"熊本県宇土市松原町11-1"},
  {name:"ファミリーマート 宇土堺町店", genre:"super", addr:"熊本県宇土市堺町51-1"},
  {name:"ローソン 宇土境目店", genre:"super", addr:"熊本県宇土市境目町400-1"},
  {name:"セブン-イレブン 宇城松橋曲野店", genre:"super", addr:"熊本県宇城市松橋町曲野1182-1"},
  {name:"ファミリーマート 宇城松橋きらら店", genre:"super", addr:"熊本県宇城市松橋町きらら2-1-2"},
  {name:"ローソン 宇城小川町店", genre:"super", addr:"熊本県宇城市小川町河江12-1"},
  {name:"セブン-イレブン 八代インター店", genre:"super", addr:"熊本県八代市海士江町2862-1"},
  {name:"ファミリーマート 八代大手町店", genre:"super", addr:"熊本県八代市大手町2-1-1"},
  {name:"ローソン 八代臨港線店", genre:"super", addr:"熊本県八代市田中西町15-1"},
  {name:"セブン-イレブン 熊本氷川町店", genre:"super", addr:"熊本県八代郡氷川町鹿野1089-1"},
  {name:"セブン-イレブン 嘉島町上島店", genre:"super", addr:"熊本県上益城郡嘉島町上島2033"},

  // ===== スーパー・商業施設 =====
  {name:"鮮ど市場 松橋店", genre:"super", addr:"熊本県宇城市松橋町松橋793"},
  {name:"ロッキー 松橋店", genre:"super", addr:"熊本県宇城市松橋町曲野2300"},
  {name:"ゆめマート松橋", genre:"super", addr:"熊本県宇城市松橋町きらら1-1-1"},
  {name:"マルショク 小川店", genre:"super", addr:"熊本県宇城市小川町江頭75-1"},
  {name:"マルショク 松橋店", genre:"super", addr:"熊本県宇城市松橋町松橋889"},
  {name:"サンリブ サンピア（不知火）", genre:"super", addr:"熊本県宇城市不知火町高良2106"},
  {name:"エーコープ 不知火店", genre:"super", addr:"熊本県宇城市不知火町高良2280"},
  {name:"HIヒロセ スーパーコンボ松橋店", genre:"super", addr:"熊本県宇城市松橋町曲野3388-2"},
  {name:"イオンモール宇城（イオンスタイル宇城）", genre:"super", addr:"熊本県宇城市小川町河江1-1"},
  {name:"ゆめマート宇土（宇土シティモール内）", genre:"super", addr:"熊本県宇土市善道寺町95"},
  {name:"フードワン 宇土店（カインズモール内）", genre:"super", addr:"熊本県宇土市水島町370-1"},
  {name:"ロッキー 宇土店", genre:"super", addr:"熊本県宇土市境目町458"},
  {name:"マルショク 宇土店", genre:"super", addr:"熊本県宇土市本町3-43"},
  {name:"えびす屋 宇土店", genre:"super", addr:"熊本県宇土市松原町14-1"},
  {name:"ロッキー 竜北店", genre:"super", addr:"熊本県八代郡氷川町鹿野1137-1"},
  {name:"道の駅竜北 直売所", genre:"super", addr:"熊本県八代郡氷川町鹿野354-1"},
  {name:"ゆめマート 鏡", genre:"super", addr:"熊本県八代市鏡町鏡村881-1"},
  {name:"トライアル 八代店", genre:"super", addr:"熊本県八代市朝日町6-1"},
  {name:"鮮ど市場 八代店", genre:"super", addr:"熊本県八代市田中西町12-1"},
  {name:"ロッキー 八代松江店", genre:"super", addr:"熊本県八代市松江町520-1"},
  {name:"ロッキー 築添店", genre:"super", addr:"熊本県八代市築添町1705"},
  {name:"マルショク 八代店", genre:"super", addr:"熊本県八代市本町2-4-28"},
  {name:"ゆめマート 植柳", genre:"super", addr:"熊本県八代市植柳下町1353"},
  {name:"ゆめタウン八代", genre:"super", addr:"熊本県八代市建美町1106"},
  {name:"イオン八代ショッピングセンター", genre:"super", addr:"熊本県八代市沖町3987-3"},
  {name:"鮮ど市場 本店（嘉島）", genre:"super", addr:"熊本県上益城郡嘉島町上島2038"},
  {name:"イオンモール熊本（イオンスタイル熊本）", genre:"super", addr:"熊本県上益城郡嘉島町上島長池2232"},
  {name:"HIヒロセ スーパーコンボ嘉島店", genre:"super", addr:"熊本県上益城郡嘉島町鯰1792-1"},
  {name:"鮮ど市場 益城店", genre:"super", addr:"熊本県上益城郡益城町宮園704"},

  // ===== ガソリンスタンド =====
  {name:"ENEOS Dr.Drive セルフ松橋店", genre:"gas", addr:"熊本県宇城市松橋町曲野1160-1"},
  {name:"ENEOS セルフ宇土SS", genre:"gas", addr:"熊本県宇土市松原町58-1"},
  {name:"木下石油 セルフ竜北店", genre:"gas", addr:"熊本県八代郡氷川町鹿野354-1"},
  {name:"JAやつしろ ひかわSS", genre:"gas", addr:"熊本県八代郡氷川町鹿島775-1"},
  {name:"ENEOS Dr.Drive セルフネクスト嘉島SS", genre:"gas", addr:"熊本県上益城郡嘉島町上島長池2232"},
  {name:"ENEOS Dr.Drive 八代インターSS", genre:"gas", addr:"熊本県八代市海士江町2869-1"},

  // ===== その他ランドマーク（住所不明のため名称検索） =====
  {name:"カインズ 熊本宇土店（カインズモール宇土）", genre:"super", q:"カインズ"},
  {name:"宇土シティモール", genre:"super", q:"宇土シティ"},
  {name:"クロス21ウト", genre:"super", q:"クロス21"},
  {name:"道の駅 宇土マリーナ おこしき館", genre:"super", q:"宇土マリーナ"},
  {name:"道の駅うき サンサンうきっ子宇城彩館", genre:"super", q:"うきっ子|道の駅うき"},
  {name:"道の駅 不知火（不知火温泉）", genre:"bath", q:"不知火温泉|道の駅不知火"},
  {name:"くまモンポート八代", genre:"other", q:"くまモンポート"},
  {name:"桜の湯（八代）", genre:"bath", q:"桜の湯"},
  {name:"八代市立図書館", genre:"bousai", q:"八代市立図書館|八代市図書館"},
  {name:"八代市厚生会館", genre:"bousai", q:"厚生会館"},
  {name:"ルネサス エレクトロニクス 熊本川尻事業所", genre:"other", q:"ルネサス"}
];

const UA = "r8-kumamoto-map/1.0 (+https://r8kumamoto.promate2.com; disaster-info site; contact: yukishota.g@gmail.com)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ENDPOINTS = [
  "https://overpass.osm.jp/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];
const BB = "32.30,130.30,32.95,131.00";   // 宇土〜八代＋益城/嘉島を含む範囲

// ① 国土地理院 住所検索API（日本の住所に強い）
async function geocodeGSI(addr){
  const url = "https://msearch.gsi.go.jp/address-search/AddressSearch?q=" + encodeURIComponent(addr);
  const res = await fetch(url, {headers:{"User-Agent": UA}});
  if(!res.ok) throw new Error("GSI HTTP " + res.status);
  const j = await res.json();
  if(!Array.isArray(j) || !j.length) return null;
  const c = j[0].geometry && j[0].geometry.coordinates;
  if(!c) return null;
  return {lat: c[1], lng: c[0], src: "GSI住所検索", matched: j[0].properties && j[0].properties.title};
}

// ② OSM名称検索（Overpass）
async function findByName(keyword){
  const q = `[out:json][timeout:60];(nwr["name"~"${keyword}"](${BB});nwr["brand"~"${keyword}"](${BB}););out center 20;`;
  for(let i = 0; i < ENDPOINTS.length; i++){
    try{
      if(i > 0) await sleep(8000);
      const res = await fetch(ENDPOINTS[i], {
        method:"POST",
        headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json","User-Agent":UA},
        body:"data=" + encodeURIComponent(q)
      });
      if(!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      const c = (j.elements || []).map(el=>({
        lat: el.lat !== undefined ? el.lat : el.center && el.center.lat,
        lng: el.lon !== undefined ? el.lon : el.center && el.center.lon,
        name: (el.tags||{}).name || ""
      })).filter(x=>typeof x.lat === "number");
      if(!c.length) return null;
      c.sort((a,b)=>a.name.length - b.name.length);
      return {...c[0], src:"OSM名称検索", matched:c[0].name};
    }catch(e){ console.error(`  overpass(${i}): ${e.message}`); }
  }
  return null;
}

// ③ Nominatim（予備）
async function geocodeNominatim(q){
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=jp"
            + "&accept-language=ja&viewbox=130.30,32.95,131.00,32.30&bounded=1&q=" + encodeURIComponent(q);
  const res = await fetch(url, {headers:{"User-Agent": UA}});
  if(!res.ok) throw new Error("Nominatim HTTP " + res.status);
  const j = await res.json();
  if(!j.length) return null;
  return {lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), src:"Nominatim", matched:j[0].display_name};
}

// 既存の自動取得データ（重複判定用）
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
const norm = s => s.replace(/[\s　（）()・\-ー−]/g, "").toLowerCase();
// 名前の主要部分（チェーン名や施設名）が一致するか
function sameish(a, b){
  const x = norm(a), y = norm(b);
  if(x === y) return true;
  const shorter = x.length <= y.length ? x : y;
  const longer  = x.length <= y.length ? y : x;
  return shorter.length >= 4 && longer.includes(shorter);
}

const existing = await loadExisting();
console.log(`既存拠点 ${existing.length} 件と重複チェックします\n`);

const spots = [];
let skipped = 0, failed = 0;
for(const lm of LANDMARKS){
  let pos = null;
  try{
    if(lm.addr){
      await sleep(700);
      pos = await geocodeGSI(lm.addr);
      if(!pos){ await sleep(1200); pos = await findByName(norm(lm.name).slice(0,6)); }
    }else{
      await sleep(2500);
      pos = await findByName(lm.q);
    }
    if(!pos){ await sleep(1200); pos = await geocodeNominatim(lm.addr || lm.name); }
  }catch(e){ console.error(`  ${lm.name}: ${e.message}`); }

  if(!pos){ console.log(`× 座標が取れませんでした: ${lm.name}`); failed++; continue; }

  // 重複チェック：①既存データと近接かつ名前が似ている ②今回追加分と近接かつ名前が似ている
  const dupEx = existing.find(s => distM(s, pos) < 200 && sameish(s.name, lm.name));
  const dupNew = spots.find(s => distM(s, pos) < 60 && sameish(s.name, lm.name));
  if(dupEx || dupNew){
    console.log(`− 重複スキップ: ${lm.name}（既存: ${(dupEx||dupNew).name}）`);
    skipped++; continue;
  }

  spots.push({
    id: "manual-" + norm(lm.name).slice(0, 32),
    name: lm.name, genre: lm.genre,
    lat: Math.round(pos.lat * 1e5) / 1e5, lng: Math.round(pos.lng * 1e5) / 1e5
  });
  console.log(`○ ${lm.name} [${pos.src}] (${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)})`);
}

await writeFile("data/manual-spots.json",
  JSON.stringify({generated: new Date().toISOString(), count: spots.length, spots}, null, 1));
console.log(`\n=== 生成完了 ===`);
console.log(`追加: ${spots.length}件 / 重複スキップ: ${skipped}件 / 取得失敗: ${failed}件`);
