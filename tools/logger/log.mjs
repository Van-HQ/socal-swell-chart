// Hourly forecast + buoy snapshot. Run by .github/workflows/log.yml, which saves the output to the "data" branch.
// Usage: node tools/logger/log.mjs <out-dir>
// Writes <out-dir>/YYYY-MM-DD/HH.json (UTC). One small file per run, so git never rewrites old data.
import fs from "node:fs";import path from "node:path";import vm from "node:vm";
const here=path.dirname(new URL(import.meta.url).pathname);
const {SPOTS,BUOYS}=vm.runInNewContext(fs.readFileSync(path.join(here,"../../src/spots.js"),"utf8")+";({SPOTS,BUOYS})");
const OUT=process.argv[2]||"log-out";
const LEADS=[0,6,12,24,48,72];                       // hours ahead of the run time that we keep
// Same de-duplication the app uses: spots within about 0.05 degrees share one forecast point.
const FP=[],ix={},spotFp=[];
for(const s of SPOTS){const k=Math.round(s.la/0.05)+"_"+Math.round(s.lo/0.05);if(ix[k]==null){ix[k]=FP.length;FP.push([+s.la.toFixed(3),+s.lo.toFixed(3)])}spotFp.push(ix[k])}
const UA={"User-Agent":"swell-chart-logger/1.0 (github.com/Van-HQ/socal-swell-chart)"};
async function getJSON(u,tries=3){let e;for(let i=0;i<tries;i++){try{const r=await fetch(u,{headers:UA});if(!r.ok)throw new Error(r.status+" "+new URL(u).host);return await r.json()}catch(x){e=x;await new Promise(r=>setTimeout(r,1500*(i+1)))}}throw e}
async function om(base,vars,extra){const out=[];
  for(let k=0;k<FP.length;k+=80){const p=FP.slice(k,k+80);
    const j=await getJSON(`${base}?latitude=${p.map(x=>x[0]).join(",")}&longitude=${p.map(x=>x[1]).join(",")}&hourly=${vars}&forecast_days=4&timezone=UTC${extra}`);
    out.push(...(Array.isArray(j)?j:[j]))}
  return out}
const r1=v=>v==null?null:Math.round(v*10)/10, r0=v=>v==null?null:Math.round(v);
const now=new Date(),hourKey=now.toISOString().slice(0,13);   // e.g. 2026-10-18T23
const pick=(arr,i0,round)=>LEADS.map(L=>round(arr?arr[i0+L]:null));
const MV="wave_height,swell_wave_height,swell_wave_direction,swell_wave_period,secondary_swell_wave_height,secondary_swell_wave_direction,secondary_swell_wave_period,wind_wave_height,wind_wave_period,sea_surface_temperature";
const WV="wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,cloud_cover";
const [mar,wx]=await Promise.all([
  om("https://marine-api.open-meteo.com/v1/marine",MV,"&length_unit=imperial&cell_selection=sea").catch(e=>{console.error("marine failed:",e.message);return null}),
  om("https://api.open-meteo.com/v1/forecast",WV,"&wind_speed_unit=kn&temperature_unit=fahrenheit").catch(e=>{console.error("weather failed:",e.message);return null})]);
if(!mar&&!wx){console.error("both forecast sources failed, nothing saved");process.exit(1)}
const t0=(mar||wx)[0].hourly.time, i0=t0.indexOf(hourKey+":00");
if(i0<0){console.error("current hour not found in forecast times");process.exit(1)}
const M=mar&&mar.map(x=>{const h=x.hourly;return{sh:pick(h.swell_wave_height,i0,r1),sd:pick(h.swell_wave_direction,i0,r0),sp:pick(h.swell_wave_period,i0,r1),
  s2h:pick(h.secondary_swell_wave_height,i0,r1),s2d:pick(h.secondary_swell_wave_direction,i0,r0),s2p:pick(h.secondary_swell_wave_period,i0,r1),
  wwh:pick(h.wind_wave_height,i0,r1),wwp:pick(h.wind_wave_period,i0,r1),wh:pick(h.wave_height,i0,r1),sst:pick(h.sea_surface_temperature,i0,r1)}});
const W=wx&&wx.map(x=>{const h=x.hourly;return{ws:pick(h.wind_speed_10m,i0,r1),wd:pick(h.wind_direction_10m,i0,r0),wg:pick(h.wind_gusts_10m,i0,r1),tp:pick(h.temperature_2m,i0,r1),cc:pick(h.cloud_cover,i0,r0)}});
// What the buoys actually measured (last 6 readings, about 3 hours). CDIP reports Hs in metres; we store feet.
const base="https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/realtime/";
const dods=(txt,name)=>{const m=new RegExp("\\n"+name+"\\[\\d+\\]\\n([^\\n]*)").exec(txt);return m?m[1].split(",").map(Number):[]};
const B=await Promise.all(BUOYS.map(async b=>{try{
  const dd=await (await fetch(`${base}${b.id}p1_rt.nc.dds?waveTime`,{headers:UA})).text();const n=+(/waveTime\s*=\s*(\d+)/.exec(dd)||[])[1];if(!n)throw 0;
  const a=Math.max(0,n-6),r=`[${a}:1:${n-1}]`;
  const tx=await (await fetch(`${base}${b.id}p1_rt.nc.ascii?waveTime${r},waveHs${r},waveTp${r},waveDp${r}`,{headers:UA})).text();
  const t=dods(tx,"waveTime"),hs=dods(tx,"waveHs"),tp=dods(tx,"waveTp"),dp=dods(tx,"waveDp");if(!t.length)throw 0;
  return{id:b.id,t,hs:hs.map(v=>r1(v*3.28084)),tp:tp.map(r1),dp:dp.map(r0)}}catch(e){return{id:b.id,t:null}}}));
const rec={v:1,run:hourKey+":00Z",leads:LEADS,fp:FP,spotFp,m:M,w:W,buoys:B};
const day=hourKey.slice(0,10),hh=hourKey.slice(11,13);
fs.mkdirSync(path.join(OUT,day),{recursive:true});
const file=path.join(OUT,day,hh+".json");fs.writeFileSync(file,JSON.stringify(rec));
console.log("wrote",file,fs.statSync(file).size,"bytes;",FP.length,"points;",B.filter(b=>b.t).length+"/"+B.length,"buoys;",M?"marine ok":"marine MISSING",W?"weather ok":"weather MISSING");
