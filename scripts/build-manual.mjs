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

  // ===== コンビニ（提供リストより一括登録） =====
  {name:"セブン-イレブン 宇城御領店", genre:"super", addr:"熊本県宇城市不知火町御領390", tel:"0964-32-3181", hours:"24時間営業"},
  {name:"セブン-イレブン 宇城豊野町山崎店", genre:"super", addr:"熊本県宇城市豊野町山崎259-1", tel:"0964-45-2507", hours:"24時間営業"},
  {name:"セブン-イレブン 宇城松橋曲野店", genre:"super", addr:"熊本県宇城市松橋町曲野曲野823-1", tel:"0964-32-7707", hours:"24時間営業"},
  {name:"セブン-イレブン 宇城南豊崎店", genre:"super", addr:"熊本県宇城市松橋町南豊崎572-1", tel:"0964-32-2287", hours:"24時間営業"},
  {name:"セブン-イレブン 宇城氷川インター入口店", genre:"super", addr:"熊本県宇城市小川町南小川207", tel:"0964-43-3373", hours:"24時間営業"},
  {name:"セブン-イレブン 宇城松橋町久具店", genre:"super", addr:"熊本県宇城市松橋町久具313-1", tel:"0964-33-0711", hours:"24時間営業"},
  {name:"セブン-イレブン 熊本三角町店", genre:"super", addr:"熊本県宇城市三角町波多292-1", tel:"0964-52-3377", hours:"24時間営業"},
  {name:"セブン-イレブン 宇城不知火町長崎店", genre:"super", addr:"熊本県宇城市不知火町長崎520-1", tel:"0964-32-8507", hours:"24時間営業"},
  {name:"ローソン 宇城不知火店", genre:"super", addr:"熊本県宇城市不知火町高良字西原2300-1", tel:"0964-33-5133", hours:"24時間営業"},
  {name:"ローソン 松橋古保山店", genre:"super", addr:"熊本県宇城市松橋町古保山字野田2505-1", tel:"0964-33-8822", hours:"24時間営業"},
  {name:"ローソン 松橋きらら店", genre:"super", addr:"熊本県宇城市松橋町久具字松山312-3", tel:"0964-33-0220", hours:"24時間営業"},
  {name:"ローソン 宇城松橋町萩尾店", genre:"super", addr:"熊本県宇城市松橋町萩尾853-1", tel:"0964-34-3101", hours:"24時間営業"},
  {name:"ファミリーマート 宇城松橋曲野店", genre:"super", addr:"熊本県宇城市松橋町曲野2181-1", tel:"0964-34-3530", hours:"24時間営業"},
  {name:"ファミリーマート 宇城松橋両田店", genre:"super", addr:"熊本県宇城市松橋町両田11-1", tel:"0964-34-0301", hours:"24時間営業"},
  {name:"ファミリーマート 宇城小川店", genre:"super", addr:"熊本県宇城市小川町江頭77-1", tel:"0964-43-6550", hours:"24時間営業"},
  {name:"ファミリーマート 三角波多店", genre:"super", addr:"熊本県宇城市三角町波多13-3", tel:"0964-53-2070", hours:"24時間営業"},
  {name:"セブン-イレブン 宇土松山町店", genre:"super", addr:"熊本県宇土市松山町2024-1", tel:"0964-22-3778", hours:"24時間営業"},
  {name:"セブン-イレブン 宇土駅前店", genre:"super", addr:"熊本県宇土市城之浦町56", tel:"0964-22-8287", hours:"24時間営業"},
  {name:"セブン-イレブン 宇土走潟町店", genre:"super", addr:"熊本県宇土市走潟町881-1", tel:"0964-22-2566", hours:"24時間営業"},
  {name:"セブン-イレブン 宇土住吉町店", genre:"super", addr:"熊本県宇土市住吉町2250-1", tel:"0964-27-8550", hours:"24時間営業"},
  {name:"セブン-イレブン 宇土本町４丁目店", genre:"super", addr:"熊本県宇土市本町4丁目42", tel:"0964-22-2363", hours:"24時間営業"},
  {name:"ローソン 宇土境町店", genre:"super", addr:"熊本県宇土市境町字石原471-1", tel:"0964-22-6800", hours:"24時間営業"},
  {name:"ローソン 宇土松原町店", genre:"super", addr:"熊本県宇土市松原町字平原35-1", tel:"0964-23-0808", hours:"24時間営業"},
  {name:"ローソン 宇土新松原町店", genre:"super", addr:"熊本県宇土市新松原町字石原138-1", tel:"0964-23-2811", hours:"24時間営業"},
  {name:"ファミリーマート 宇土花園町店", genre:"super", addr:"熊本県宇土市花園町227-1", tel:"0964-24-3010", hours:"24時間営業"},
  {name:"ファミリーマート 宇土松原町店", genre:"super", addr:"熊本県宇土市松原町13-1", tel:"0964-23-5355", hours:"24時間営業"},
  {name:"ファミリーマート 宇土岩古曽店", genre:"super", addr:"熊本県宇土市岩古曽町1683-1", tel:"0964-24-3200", hours:"24時間営業"},
  {name:"セブン-イレブン 八代上片町店", genre:"super", addr:"熊本県八代市上片町字下ノ森995-1", tel:"0965-31-5602", hours:"24時間営業"},
  {name:"セブン-イレブン 八代鏡店", genre:"super", addr:"熊本県八代市鏡町内田266", tel:"0965-52-5502", hours:"24時間営業"},
  {name:"セブン-イレブン 八代旭中央通り店", genre:"super", addr:"熊本県八代市黄金町8-1", tel:"0965-35-8087", hours:"24時間営業"},
  {name:"セブン-イレブン 八代渡町店", genre:"super", addr:"熊本県八代市渡町1755", tel:"0965-35-0778", hours:"24時間営業"},
  {name:"セブン-イレブン 八代永碇店", genre:"super", addr:"熊本県八代市永碇町1008番", tel:"0965-35-1032", hours:"24時間営業"},
  {name:"セブン-イレブン 八代塩屋町店", genre:"super", addr:"熊本県八代市塩屋町6-3", tel:"0965-31-1577", hours:"24時間営業"},
  {name:"セブン-イレブン 八代海士江町店", genre:"super", addr:"熊本県八代市海士江町字西原2928-1", tel:"0965-39-5807", hours:"24時間営業"},
  {name:"セブン-イレブン 八代田中西町店", genre:"super", addr:"熊本県八代市田中西町14-1", tel:"0965-32-7511", hours:"24時間営業"},
  {name:"セブン-イレブン 八代千丁町店", genre:"super", addr:"熊本県八代市千丁町新牟田1437-1", tel:"0965-46-1330", hours:"24時間営業"},
  {name:"ローソン 八代総合病院前店", genre:"super", addr:"熊本県八代市松江城町2-25", tel:"0965-33-0570", hours:"24時間営業"},
  {name:"ローソン 八代横手町店", genre:"super", addr:"熊本県八代市横手町字上ノ段1661-1", tel:"0965-39-5115", hours:"24時間営業"},
  {name:"ローソン 八代臨港線店", genre:"super", addr:"熊本県八代市古城町字浜添2590-1", tel:"0965-31-1370", hours:"24時間営業"},
  {name:"ローソン 八代通町店", genre:"super", addr:"熊本県八代市通町7-18", tel:"0965-33-2180", hours:"24時間営業"},
  {name:"ローソン 八代坂本町店", genre:"super", addr:"熊本県八代市坂本町坂本4102-1", tel:"0965-45-2120", hours:"24時間営業"},
  {name:"ファミリーマート 八代本町三丁目店", genre:"super", addr:"熊本県八代市本町3丁目4-23", tel:"0965-30-0118", hours:"24時間営業"},
  {name:"ファミリーマート 八代夕葉町店", genre:"super", addr:"熊本県八代市夕葉町4-1", tel:"0965-31-6101", hours:"24時間営業"},
  {name:"ファミリーマート 八代竹原町店", genre:"super", addr:"熊本県八代市竹原町1990-1", tel:"0965-39-3170", hours:"24時間営業"},
  {name:"ファミリーマート 八代大村町店", genre:"super", addr:"熊本県八代市大村町708-1", tel:"0965-30-0150", hours:"24時間営業"},
  {name:"ファミリーマート 八代高小島店", genre:"super", addr:"熊本県八代市高小島町1921-1", tel:"0965-30-0105", hours:"24時間営業"},
  {name:"ヤマザキショップ 坂本いずみ店", genre:"super", addr:"熊本県八代市坂本町荒瀬5240", tel:"0965-45-2015", hours:"7:00～19:00"},
  {name:"セブン-イレブン 氷川鹿島店", genre:"super", addr:"熊本県八代郡氷川町鹿島1541-6", tel:"0965-52-8837", hours:"24時間営業"},
  {name:"セブン-イレブン 氷川宮原店", genre:"super", addr:"熊本県八代郡氷川町宮原556-1", tel:"0965-62-1131", hours:"24時間営業"},
  {name:"ローソン 氷川宮原店", genre:"super", addr:"熊本県八代郡氷川町宮原字小路口801-1", tel:"0965-62-1322", hours:"24時間営業"},
  {name:"ファミリーマート 氷川宮原店", genre:"super", addr:"熊本県八代郡氷川町宮原栄30-1", tel:"0965-62-8110", hours:"24時間営業"},
  {name:"ヤマザキショップ 伊東商店", genre:"super", addr:"熊本県八代郡氷川町河原68", tel:"0965-62-2302", hours:"9:30～22:30"},

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

// ②' 住所で得た概略位置の周辺から、施設名でピンポイントの座標を探し直す
//     （国土地理院の住所検索は「大字」までしか解決できない場合があり、同一座標に重なるのを防ぐ）
function nameKey(name){
  // 「セブン-イレブン 宇土松原町店」→「セブン-イレブン」、「嘉島町役場」→「嘉島町役場」
  const base = name.replace(/（.*?）/g, "").trim();
  const head = base.split(/[\s　]/)[0];
  return (head.length >= 3 ? head : base).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
async function refineByName(name, pos){
  const key = nameKey(name);
  const q = `[out:json][timeout:40];nwr["name"~"${key}"](around:2500,${pos.lat},${pos.lng});out center 30;`;
  for(let i = 0; i < 2; i++){
    try{
      if(i > 0) await sleep(8000);
      const res = await fetch(ENDPOINTS[i], {
        method:"POST",
        headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json","User-Agent":UA},
        body:"data=" + encodeURIComponent(q)
      });
      if(!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      const cands = (j.elements || []).map(el=>({
        lat: el.lat !== undefined ? el.lat : el.center && el.center.lat,
        lng: el.lon !== undefined ? el.lon : el.center && el.center.lon,
        name: (el.tags||{}).name || ""
      })).filter(x=>typeof x.lat === "number");
      if(!cands.length) return null;
      // 住所から得た位置に最も近いものを採用
      cands.sort((a,b)=>distM(pos,a) - distM(pos,b));
      return {...cands[0], src:"住所＋OSM照合", matched:cands[0].name};
    }catch(e){ /* 失敗時は住所の座標をそのまま使う */ }
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
      if(pos){
        // 住所の概略位置の周辺で施設名を照合し、より正確な座標に置き換える
        await sleep(2200);
        const refined = await refineByName(lm.name, pos);
        if(refined) pos = refined;
      }else{
        await sleep(1500);
        pos = await findByName(nameKey(lm.name));
      }
    }else{
      await sleep(2500);
      pos = await findByName(lm.q);
    }
    if(!pos){ await sleep(1200); pos = await geocodeNominatim(lm.addr || lm.name); }
  }catch(e){ console.error(`  ${lm.name}: ${e.message}`); }

  if(!pos){ console.log(`× 座標が取れませんでした: ${lm.name}`); failed++; continue; }

  // 重複チェック：①既存データと近接かつ名前が似ている ②今回追加分の同名 or 近接同名
  const dupEx = existing.find(s => distM(s, pos) < 200 && sameish(s.name, lm.name));
  const dupNew = spots.find(s => norm(s.name) === norm(lm.name)
                              || (distM(s, pos) < 60 && sameish(s.name, lm.name)));
  if(dupEx || dupNew){
    console.log(`− 重複スキップ: ${lm.name}（既存: ${(dupEx||dupNew).name}）`);
    skipped++; continue;
  }

  const rec = {
    id: "manual-" + norm(lm.name).slice(0, 32),
    name: lm.name, genre: lm.genre,
    lat: Math.round(pos.lat * 1e5) / 1e5, lng: Math.round(pos.lng * 1e5) / 1e5
  };
  if(lm.tel) rec.tel = lm.tel;
  if(lm.hours) rec.hours = lm.hours;
  spots.push(rec);
  console.log(`○ ${lm.name} [${pos.src}] (${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)})`);
}

await writeFile("data/manual-spots.json",
  JSON.stringify({generated: new Date().toISOString(), count: spots.length, spots}, null, 1));
console.log(`\n=== 生成完了 ===`);
console.log(`追加: ${spots.length}件 / 重複スキップ: ${skipped}件 / 取得失敗: ${failed}件`);
