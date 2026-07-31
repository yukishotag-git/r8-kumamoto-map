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

const baseName = n => n.replace(TAG, "").replace(/\s+/g, " ").trim();
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
const files = [];
const jobs = [];
for(const path of targets){
  const json = JSON.parse(await readFile(path, "utf-8"));
  files.push({path, json});
  json.spots.forEach(s=>{ if(TAG.test(s.name)){ TAG.lastIndex = 0; jobs.push(s); } TAG.lastIndex = 0; });
}
console.log(`識別子付きの拠点: ${jobs.length}件を町名に置き換えます\n`);

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
const allSpots = files.flatMap(f => f.json.spots);
const nameCount = new Map();
allSpots.forEach(s=>{
  const n = TAG.test(s.name) ? null : s.name;
  TAG.lastIndex = 0;
  if(n) nameCount.set(n, (nameCount.get(n) || 0) + 1);
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
  // 同じ町名に複数ある場合は方角で区別する
  const cx = list.reduce((a, s)=>a + s.lat, 0) / list.length;
  const cy = list.reduce((a, s)=>a + s.lng, 0) / list.length;
  const used = new Set();
  list.forEach((s, i)=>{
    let cand = `${newName}（${bearing({lat:cx, lng:cy}, s)}）`;
    if(used.has(cand) || nameCount.has(cand)) cand = `${newName}（${i + 1}）`;
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
