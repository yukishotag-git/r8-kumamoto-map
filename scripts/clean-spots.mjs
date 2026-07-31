// 生成済みの拠点JSONを点検・整形する
//  ・同一地点の重複を統合
//  ・名前のない施設の近くに名前付き施設があれば、名前なし側を削除
//  ・残った「名称未登録」に識別子を付けて一意化
//  ・OSM由来の「;」区切り名称を読みやすく整形
import { readFile, writeFile, readdir } from "fs/promises";

const distM = (a, b) => {
  const R = 6371000, toRad = x => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const norm = s => s.replace(/[\s　（）()・\-ー−]/g, "").toLowerCase();
const UNNAMED = "名称未登録";

export function cleanSpots(spots){
  const stat = {merged:0, droppedUnnamed:0, renamed:0, tidied:0, disambiguated:0, spread:0};

  // ① 名称の整形（「A;B」→「A／B」、前後の空白除去）
  spots.forEach(s=>{
    const before = s.name;
    s.name = s.name.replace(/\s*;\s*/g, "／").replace(/\s+/g, " ").trim();
    if(s.name !== before) stat.tidied++;
  });

  // ② 同名かつ250m以内は同一施設とみなして1件に統合
  //    （OSMでは同じ店舗が建物・敷地・ノードで重複登録されることがある）
  const kept = [];
  for(const s of spots){
    const same = kept.find(k => norm(k.name) === norm(s.name) && distM(k, s) < 250);
    if(same){ stat.merged++; continue; }
    kept.push(s);
  }

  // ③ 名前のない施設は、80m以内に名前付きの施設があれば削除（実体は同じ）
  const named = kept.filter(s => !s.name.includes(UNNAMED));
  const result = kept.filter(s=>{
    if(!s.name.includes(UNNAMED)) return true;
    const near = named.find(n => distM(n, s) < 80);
    if(near){ stat.droppedUnnamed++; return false; }
    return true;
  });

  // ④ 残った「名称未登録」に短い識別子を付けて一意化（既に付いていれば何もしない）
  result.forEach(s=>{
    if(!s.name.includes(UNNAMED) || /#\d{3,}/.test(s.name)) return;
    const tag = String(s.id).replace(/\D/g, "").slice(-4) || "0000";
    s.name = s.name.replace(UNNAMED, `${UNNAMED} #${tag}`);
    stat.renamed++;
  });

  // ⑤ まだ同名が残るもの（支店名のないチェーン店など）に地域名＋識別子を付けて一意化
  const nameCount = {};
  result.forEach(s=>{ nameCount[s.name] = (nameCount[s.name] || 0) + 1; });
  result.forEach(s=>{
    if(nameCount[s.name] <= 1 || /#\d{3,}/.test(s.name)) return;
    const area = areaOf(s.lat, s.lng);
    const tag = String(s.id).replace(/\D/g, "").slice(-4) || "0000";
    s.name = `${s.name}（${area ? area + " " : ""}#${tag}）`;
    stat.disambiguated++;
  });

  // ⑥ 同一座標に複数の施設がある場合は、地図で重ならないよう少しずらす
  //    （住所検索が大字までしか解決できず、同じ点になることがあるため）
  const byPos = new Map();
  result.forEach(s=>{
    const key = s.lat.toFixed(5) + "," + s.lng.toFixed(5);
    if(!byPos.has(key)) byPos.set(key, []);
    byPos.get(key).push(s);
  });
  for(const group of byPos.values()){
    if(group.length < 2) continue;
    group.sort((a, b)=>String(a.id).localeCompare(String(b.id)));   // 実行のたびに結果が変わらないように
    group.forEach((s, i)=>{
      if(i === 0) return;
      const ang = (2 * Math.PI * i) / group.length;
      const rad = 0.00018;                       // 約20m
      s.lat = Math.round((s.lat + rad * Math.cos(ang)) * 1e5) / 1e5;
      s.lng = Math.round((s.lng + rad * Math.sin(ang) / Math.cos(s.lat * Math.PI/180)) * 1e5) / 1e5;
      stat.spread++;
    });
  }

  return {spots: result, stat};
}

// 座標からおおよその市町村名を求める（同名の区別に使う）
// 小さい市町村を先に判定する（熊本市の範囲は広く、周辺町村と重なるため最後に置く）
const AREAS = [
  ["宇土市", 32.63, 130.55, 32.72, 130.72],
  ["宇城市", 32.56, 130.44, 32.70, 130.78], ["氷川町", 32.54, 130.62, 32.61, 130.78],
  ["八代市", 32.38, 130.53, 32.62, 130.92], ["嘉島町", 32.70, 130.70, 32.78, 130.79],
  ["益城町", 32.75, 130.78, 32.90, 130.95], ["美里町", 32.55, 130.72, 32.68, 130.90],
  ["御船町", 32.66, 130.75, 32.80, 130.95], ["甲佐町", 32.58, 130.75, 32.70, 130.90],
  ["上天草市", 32.42, 130.20, 32.62, 130.48], ["天草市", 32.15, 129.95, 32.62, 130.30],
  ["芦北町", 32.20, 130.45, 32.40, 130.75], ["水俣市", 32.15, 130.30, 32.30, 130.55],
  ["人吉市", 32.15, 130.68, 32.35, 130.85], ["玉名市", 32.87, 130.50, 33.05, 130.75],
  ["荒尾市", 32.95, 130.40, 33.08, 130.55], ["菊池市", 32.90, 130.75, 33.10, 131.05],
  ["合志市", 32.85, 130.65, 32.98, 130.82], ["大津町", 32.85, 130.85, 33.00, 131.05],
  ["菊陽町", 32.83, 130.75, 32.93, 130.90], ["山都町", 32.60, 130.95, 32.85, 131.25],
  ["球磨村", 32.25, 130.55, 32.45, 130.75], ["錦町", 32.20, 130.80, 32.35, 130.95],
  ["苓北町", 32.45, 129.95, 32.60, 130.15],
  ["熊本市", 32.68, 130.55, 33.00, 130.90]
];
function areaOf(lat, lng){
  for(const [name, s, w, n, e] of AREAS){
    if(lat >= s && lat <= n && lng >= w && lng <= e) return name;
  }
  return "";
}

// 名前が実質同じかどうか（表記ゆれ・接頭辞の違いを吸収）
function sameName(a, b){
  const x = norm(a).replace(/^(天然温泉|温泉|株式会社|有限会社)/, "");
  const y = norm(b).replace(/^(天然温泉|温泉|株式会社|有限会社)/, "");
  if(x === y) return true;
  const short = x.length <= y.length ? x : y;
  const long  = x.length <= y.length ? y : x;
  return short.length >= 4 && long.includes(short);
}

// ファイルをまたいだ重複を除去する（優先度の高いデータを残す）
export function dedupeAcrossFiles(datasets){
  // datasets: [{path, spots, priority}] priorityが小さいほど優先
  const sorted = [...datasets].sort((a, b)=>a.priority - b.priority);
  const accepted = [];
  let removed = 0;
  for(const ds of sorted){
    ds.spots = ds.spots.filter(s=>{
      const dup = accepted.find(k => distM(k, s) < 250 && sameName(k.name, s.name));
      if(dup){ removed++; return false; }
      accepted.push(s);
      return true;
    });
  }
  return removed;
}

// 単体実行時：data配下のJSONをその場で整形する
if(import.meta.url === `file://${process.argv[1]}`){
  const targets = [];
  for(const f of await readdir("data/spots")){
    if(f.endsWith(".json") && f !== "index.json") targets.push("data/spots/" + f);
  }
  for(const extra of ["data/manual-spots.json", "data/overture-spots.json"]){
    try{ await readFile(extra); targets.push(extra); }catch(e){}
  }

  // ① ファイルごとの整形
  const datasets = [];
  for(const path of targets){
    const j = JSON.parse(await readFile(path, "utf-8"));
    const before = j.spots.length;
    const {spots, stat} = cleanSpots(j.spots);
    console.log(`${path}: ${before} → ${spots.length}件  統合${stat.merged} / 無名削除${stat.droppedUnnamed}` +
      ` / 識別子${stat.renamed} / 同名区別${stat.disambiguated} / 座標分散${stat.spread} / 名称整形${stat.tidied}`);
    // 優先度：手動登録（店名・電話が正確） > OSM > Overture
    const priority = path.includes("manual") ? 0 : path.includes("overture") ? 2 : 1;
    datasets.push({path, json:j, spots, priority});
  }

  // ② ファイルをまたいだ重複を除去
  const removed = dedupeAcrossFiles(datasets);
  console.log(`\nファイル間の重複除去: ${removed}件`);

  for(const ds of datasets){
    ds.json.spots = ds.spots;
    ds.json.count = ds.spots.length;
    await writeFile(ds.path, JSON.stringify(ds.json));
  }
  console.log('合計:', datasets.reduce((n,d)=>n+d.spots.length, 0), '件');
}
