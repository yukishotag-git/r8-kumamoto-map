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
  const stat = {merged:0, droppedUnnamed:0, renamed:0, tidied:0};

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

  // ④ 残った「名称未登録」に短い識別子を付けて一意化
  result.forEach(s=>{
    if(!s.name.includes(UNNAMED)) return;
    const tag = String(s.id).replace(/\D/g, "").slice(-4) || "0000";
    s.name = s.name.replace(UNNAMED, `${UNNAMED} #${tag}`);
    stat.renamed++;
  });

  return {spots: result, stat};
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

  for(const path of targets){
    const j = JSON.parse(await readFile(path, "utf-8"));
    const before = j.spots.length;
    const {spots, stat} = cleanSpots(j.spots);
    j.spots = spots;
    j.count = spots.length;
    await writeFile(path, JSON.stringify(j));
    console.log(`${path}: ${before} → ${spots.length}件 ` +
      `(統合${stat.merged} / 無名削除${stat.droppedUnnamed} / 識別子付与${stat.renamed} / 名称整形${stat.tidied})`);
  }
}
