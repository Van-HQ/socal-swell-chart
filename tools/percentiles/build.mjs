// Builds "how often is it this good here?" tables from Open-Meteo's historical archive.
// Every past daylight hour is scored with the app's own rating code, then counted into a histogram per spot and month.
// Resumable: each (forecast point, year) result is cached as a small file, so a rate-limited run can simply be run again.
// Usage: node tools/percentiles/build.mjs <data-dir>      env YEARS="2018,2019,..." (default 2018-2025)
import fs from "node:fs";import path from "node:path";
import {loadRating,loadSpots} from "./rating.mjs";
const OUT=process.argv[2]||"pct-out",CACHE=path.join(OUT,"cache");fs.mkdirSync(CACHE,{recursive:true});
const YEARS=(process.env.YEARS||"2018,2019,2020,2021,2022,2023,2024,2025").split(",").map(Number);
const MODELS=["original","current"],R=Object.fromEntries(MODELS.map(m=>[m,loadRating(m)]));
const {SPOTS}=loadSpots(),PEAK=R.original.PEAK;
const FP=[],ix={},spotsOf=[];
SPOTS.forEach((s,si)=>{const k=Math.round(s.la/0.05)+"_"+Math.round(s.lo/0.05);if(ix[k]==null){ix[k]=FP.length;FP.push([+s.la.toFixed(3),+s.lo.toFixed(3)]);spotsOf.push([])}spotsOf[ix[k]].push(si)});
const UA={"User-Agent":"swell-chart-percentiles/1.0 (github.com/Van-HQ/socal-swell-chart)"};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let stop=false;
async function getJSON(u){for(let i=0;i<5;i++){
  const r=await fetch(u,{headers:UA}).catch(()=>null);
  if(r&&r.ok)return r.json();
  const txt=r?await r.text().catch(()=>""):"network error";
  if(r&&r.status===429){ if(/daily/i.test(txt)){stop=true;throw new Error("daily limit reached")} await sleep(65000);continue }
  if(r&&r.status>=400&&r.status<500)throw new Error(r.status+" "+txt.slice(0,160));
  await sleep(3000*(i+1))}
  throw new Error("gave up on "+u.slice(0,90))}
const r1=v=>v==null?null:Math.round(v*10)/10;
const NB=41;                                      // histogram bins of 0.25 on the 0-10 score
async function oneYear(k,year){
  const [la,lo]=FP[k],f=path.join(CACHE,`p${k}_${year}.json`);
  if(fs.existsSync(f))return false;
  const q=`latitude=${la}&longitude=${lo}&start_date=${year}-01-01&end_date=${year}-12-31&timezone=America%2FLos_Angeles`;
  const mar=await getJSON(`https://marine-api.open-meteo.com/v1/marine?${q}&hourly=swell_wave_height,swell_wave_direction,swell_wave_period,secondary_swell_wave_height,secondary_swell_wave_direction,secondary_swell_wave_period,wind_wave_height,wind_wave_direction,wind_wave_period&length_unit=imperial&cell_selection=sea`);
  const wx=await getJSON(`https://archive-api.open-meteo.com/v1/archive?${q}&hourly=wind_speed_10m,wind_direction_10m&wind_speed_unit=kn`);
  const h=mar.hourly,w=wx.hourly,n=h.time.length,pk=a=>a.map(v=>v==null?null:Math.round(v*PEAK*10)/10);
  const m={sh:h.swell_wave_height.map(r1),sd:h.swell_wave_direction,sp:pk(h.swell_wave_period),s2h:h.secondary_swell_wave_height.map(r1),s2p:pk(h.secondary_swell_wave_period),s2d:h.secondary_swell_wave_direction,wwh:h.wind_wave_height.map(r1),wwd:h.wind_wave_direction,wwp:pk(h.wind_wave_period)};
  const res={};
  for(const si of spotsOf[k]){const s={...SPOTS[si],m};res[si]={};
    for(const model of MODELS){const hist=Array.from({length:12},()=>new Array(NB).fill(0));
      for(let i=0;i<n;i++){const hr=+h.time[i].slice(11,13);if(hr<6||hr>18)continue;     // daylight hours only (6 AM to 6:59 PM local)
        const mo=+h.time[i].slice(5,7)-1,ws=w.wind_speed_10m[i],wd=w.wind_direction_10m[i];
        const c=R[model].comps(s,i),r=R[model].rateCore(s,c,ws,wd,null),v=r.face<1?0:R[model].shown(r.rate);
        hist[mo][Math.min(NB-1,Math.floor(v*4))]++}
      res[si][model]=hist}}
  fs.writeFileSync(f,JSON.stringify(res));return true}
let did=0,failed=0;
outer:for(const year of YEARS)for(let k=0;k<FP.length;k++){
  if(stop)break outer;
  try{if(await oneYear(k,year)){did++;await sleep(process.env.FAST?0:1500)}}catch(e){failed++;console.log(`::warning title=point ${k} ${year}::${e.message}`);if(stop)break outer}}
// Combine everything cached so far into one small table: for each spot, model and month, the share of hours scoring below each half-point.
const tot={};let done=0;
for(let k=0;k<FP.length;k++)for(const year of YEARS){const f=path.join(CACHE,`p${k}_${year}.json`);if(!fs.existsSync(f))continue;done++;
  const d=JSON.parse(fs.readFileSync(f,"utf8"));
  for(const si in d)for(const model of MODELS){const t=((tot[si]=tot[si]||{})[model]=tot[si][model]||Array.from({length:12},()=>new Array(NB).fill(0)));
    d[si][model].forEach((row,mo)=>row.forEach((c,b)=>t[mo][b]+=c))}}
const table={v:1,years:YEARS,pointsDone:done,pointsTotal:FP.length*YEARS.length,note:"cdf[k] = percent of daylight hours scoring below k*0.5 on the 0-10 score",models:{}};
for(const model of MODELS){table.models[model]={};
  for(const si in tot){const rows=tot[si][model].map(row=>{const n=row.reduce((a,b)=>a+b,0);if(!n)return null;
    const cdf=[];for(let k=0;k<=20;k++){let c=0;for(let b=0;b<Math.min(NB,k*2);b++)c+=row[b];cdf.push(Math.round(100*c/n))}return{n,cdf}});
    table.models[model][SPOTS[si].n]=rows}}
fs.writeFileSync(path.join(OUT,"percentiles.json"),JSON.stringify(table));
console.log(`fetched ${did} new, ${failed} failed, ${done}/${FP.length*YEARS.length} point-years cached; percentiles.json ${fs.statSync(path.join(OUT,"percentiles.json")).size} bytes`);
