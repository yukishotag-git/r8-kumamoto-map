// 「セブン-イレブン（熊本市 #9883）」のような機械的な識別子を、
// 実際の町名（例：「セブン-イレブン 米屋町一丁目」）に置き換える。
// 町名は国土地理院の逆ジオコーディングAPIから取得する。
import { readFile, writeFile, readdir } from "fs/promises";

const UA = "r8-kumamoto-map/1.0 (+https://r8kumamoto.promate2.com; disaster-info site)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TAG = /[（(]\s*[^（()）]*#\d{3,}\s*[)）]|\s*#\d{3,}/g;   // 「（… #1234）」や「 #1234」

// 国土地理院 逆ジオコーディング（町丁目まで取得できる）
async function reverseGSI(lat, lng){
  const url = `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`;
  try{
    const res = await fetch(url, {headers:{"User-Agent": UA}});
    if(!res.ok) return null;
    const j = await res.json();
    const nm = j && j.results && j.results.lv01Nm;
    if(!nm || nm === "－") return null;
    return nm;                       // 例:「米屋町一丁目」「松橋町松橋」
  }catch(e){ return null; }
}

// 予備：Nominatim（町名が取れない場合）
async function reverseNominatim(lat, lng){
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&accept-language=ja`;
  try{
    const res = await fetch(url, {headers:{"User-Agent": UA}});
    if(!res.ok) return null;
    const a = (await res.json()).address || {};
    return a.neighbourhood || a.quarter || a.hamlet || a.suburb || a.village || a.town || null;
  }catch(e){ return null; }
}

const baseName = n => { TAG.lastIndex = 0; return n.replace(TAG, "").replace(/\s+/g, " ").trim(); };

// 座標からおおよその市町村名（同名の区別に使う）
const AREAS = [
  ["宇土市",32.63,130.55,32.72,130.72], ["宇城市",32.56,130.44,32.70,130.78],
  ["氷川町",32.54,130.62,32.61,130.78], ["八代市",32.38,130.53,32.62,130.92],
  ["嘉島町",32.70,130.70,32.78,130.79], ["益城町",32.75,130.78,32.90,130.95],
  ["美里町",32.55,130.72,32.68,130.90], ["御船町",32.66,130.75,32.80,130.95],
  ["甲佐町",32.58,130.75,32.70,130.90], ["上天草市",32.42,130.20,32.62,130.48],
  ["天草市",32.15,129.95,32.62,130.30], ["芦北町",32.20,130.45,32.40,130.75],
  ["水俣市",32.15,130.30,32.30,130.55], ["人吉市",32.15,130.68,32.35,130.85],
  ["玉名市",32.87,130.50,33.05,130.75], ["荒尾市",32.95,130.40,33.08,130.55],
  ["菊池市",32.90,130.75,33.10,131.05], ["合志市",32.85,130.65,32.98,130.82],
  ["大津町",32.85,130.85,33.00,131.05], ["菊陽町",32.83,130.75,32.93,130.90],
  ["山都町",32.60,130.95,32.85,131.25], ["熊本市",32.68,130.55,33.00,130.90]
];
function areaOf(lat, lng){
  for(const [nm, s, w, n, e] of AREAS){
    if(lat >= s && lat <= n && lng >= w && lng <= e) return nm;
  }
  return "";
}
const norm = s => s.replace(/[\s　（）()・\-ー−]/g, "");
// 方角（同じ町名で重複した場合の区別に使う）
function bearing(from, to){
  const dLat = to.lat - from.lat, dLng = to.lng - from.lng;
  if(Math.abs(dLat) > Math.abs(dLng)) return dLat > 0 ? "北側" : "南側";
  return dLng > 0 ? "東側" : "西側";
}

const targets = [];
for(const f of await readdir("data/spots")){
  if(f.endsWith(".json") && f !== "index.json") targets.push("data/spots/" + f);
}
for(const extra of ["data/manual-spots.json", "data/overture-spots.json"]){
  try{ await readFile(extra); targets.push(extra); }catch(e){}
}

// ① 対象を集める
//    (a) 「#1234」のような識別子が付いているもの
//    (b) ファイルをまたいで名前が重複しているもの（どちらも町名を付けて区別する）
const files = [];
for(const path of targets){
  files.push({path, json: JSON.parse(await readFile(path, "utf-8"))});
}
const everySpot = files.flatMap(f => f.json.spots);

const hasTag = s => { TAG.lastIndex = 0; const r = TAG.test(s.name); TAG.lastIndex = 0; return r; };
const plainCount = new Map();
everySpot.forEach(s=>{
  const n = baseName(s.name);
  plainCount.set(n, (plainCount.get(n) || 0) + 1);
});

const jobs = everySpot.filter(s => hasTag(s) || plainCount.get(baseName(s.name)) > 1);
console.log(`町名を付ける対象: ${jobs.length}件` +
  `（識別子付き ${everySpot.filter(hasTag).length}件 / 同名 ${jobs.length - everySpot.filter(hasTag).length}件）\n`);

// ② 逆ジオコーディング（近い地点は結果を使い回して回数を減らす）
const cache = new Map();
let done = 0, ok = 0;
for(const s of jobs){
  const key = s.lat.toFixed(3) + "," + s.lng.toFixed(3);   // 約100m四方で共有
  let town = cache.get(key);
  if(town === undefined){
    await sleep(250);
    town = await reverseGSI(s.lat, s.lng);
    if(!town){ await sleep(1100); town = await reverseNominatim(s.lat, s.lng); }
    cache.set(key, town);
  }
  s._town = town;
  if(town) ok++;
  if(++done % 100 === 0) console.log(`  ${done}/${jobs.length}件 処理済み`);
}
console.log(`町名を取得できたもの: ${ok}/${jobs.length}件\n`);

// ③ 名前を組み立てる
//    対象外（そのまま残る名前）と衝突しないようにする
const jobSet = new Set(jobs);
const nameCount = new Map();
everySpot.forEach(s=>{
  if(jobSet.has(s)) return;
  nameCount.set(s.name, (nameCount.get(s.name) || 0) + 1);
});

const groups = new Map();          // 新しい名前 → 該当スポット
for(const s of jobs){
  const base = baseName(s.name).replace(/（名称未登録\s*）|（\s*）/g, "").trim();
  const town = s._town;
  const newName = town ? `${base} ${town}` : base;
  if(!groups.has(newName)) groups.set(newName, []);
  groups.get(newName).push(s);
}

let renamed = 0;
for(const [newName, list] of groups){
  if(list.length === 1 && !nameCount.has(newName)){
    list[0].name = newName;
    renamed++;
    continue;
  }
  // 同じ町名に複数ある場合は、市町村名 → 方角 → 連番 の順で区別する
  const cx = list.reduce((a, s)=>a + s.lat, 0) / list.length;
  const cy = list.reduce((a, s)=>a + s.lng, 0) / list.length;
  const used = new Set();
  list.forEach((s, i)=>{
    const city = areaOf(s.lat, s.lng);
    let cand = city && !newName.includes(city) ? `${newName} ${city}` : newName;
    if(used.has(cand) || nameCount.has(cand)){
      cand = `${cand}（${bearing({lat:cx, lng:cy}, s)}）`;
    }
    if(used.has(cand) || nameCount.has(cand)) cand = `${cand}（${i + 1}）`;
    used.add(cand);
    s.name = cand;
    renamed++;
  });
}

// ④ 書き出し
for(const f of files){
  f.json.spots.forEach(s=>{ delete s._town; });
  await writeFile(f.path, JSON.stringify(f.json));
}
console.log(`置き換え完了: ${renamed}件`);
