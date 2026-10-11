"use strict";
/* ---------- helpers ---------- */
const $=id=>document.getElementById(id);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const angDiff=(a,b)=>Math.abs(((a-b+540)%360)-180);
const D16=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
const comp=d=>D16[Math.round(((d%360)+360)%360/22.5)%16];
const css=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const TZ="America/Los_Angeles";
const DOW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],DOWL=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function laNow(){const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hour12:false}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  const h=p.hour==="24"?"00":p.hour;return{date:`${p.year}-${p.month}-${p.day}`,key:`${p.year}-${p.month}-${p.day}T${h}:00`}}
function tparts(s){const y=+s.slice(0,4),m=+s.slice(5,7),d=+s.slice(8,10),h=+s.slice(11,13);return{y,m,d,h,dow:new Date(Date.UTC(y,m-1,d)).getUTCDay()}}
const h12=h=>(h%12||12)+(h<12?" AM":" PM");
const arrow=(fromDeg,col)=>`<svg class="arr" viewBox="-6 -6 12 12" aria-hidden="true"><g transform="rotate(${Math.round(fromDeg+180)})"><path d="M0 -5 L3.4 3.6 L0 1.8 L-3.4 3.6 Z" fill="${col||"currentColor"}"/></g></svg>`;

/* ---------- rating model ---------- */
const RT=[{k:"flat",n:"Flat",dk:0},{k:"poor",n:"Poor",dk:1},{k:"pf",n:"Poor to fair",dk:0},{k:"fair",n:"Fair",dk:0},{k:"fg",n:"Fair to good",dk:0},{k:"good",n:"Good",dk:1},{k:"epic",n:"Epic",dk:1}];
const rtCol=c=>`var(--r-${RT[c].k})`;
const chip=c=>`<span class="rt${RT[c].dk?" dk":""}" style="background:${rtCol(c)}">${RT[c].n}</span>`;
const rlab=c=>`<span class="rl"><i class="dot" style="background:${rtCol(c)}"></i>${RT[c].n}</span>`;
const K_BREAK=0.8;                       // calibration on the breaker-height estimate
const TIDE_RANGE={low:[-2,2.5],"low-mid":[0,3.5],mid:[1.5,4.5],"mid-high":[2.5,6],high:[4,8]};
function dirFactor(s,dir){let o=180;for(const [a,b] of s.w){const span=(b-a+360)%360,off=(dir-a+360)%360;if(off<=span)return 1;o=Math.min(o,angDiff(dir,a),angDiff(dir,b))}
  return o>=40?0.12:0.12+0.88*(0.5+0.5*Math.cos(Math.PI*o/40))}
// Komar-Gaughan breaker height from deep-water height (ft) and period (s)
// Swell under 9 s is local wind chop: it stands up less and breaks weaker, so it is marked down.
const chopFactor=T=>clamp((T-4)/5,0.3,1);
function breaker(hft,T){if(!(hft>0)||!(T>=5))return 0;const H=hft*0.3048;return 0.39*Math.pow(9.81,0.2)*Math.pow(T*H*H,0.4)/0.3048*K_BREAK*chopFactor(T)}
// Onshore wind sets a ceiling on the rating no matter how much swell there is.
// e = wind speed (kn) scaled by how onshore it is: 0 at cross-offshore, full at 120 deg or more off offshore.
const WIND_CAP=[[4,10],[6,4],[8,2.8],[10,1.9],[30,1]];
function windCap(ws,d){if(ws==null||d==null)return 10;const e=ws*clamp((d-70)/50,0,1);if(e<=WIND_CAP[0][0])return 10;
  for(let i=1;i<WIND_CAP.length;i++)if(e<=WIND_CAP[i][0]){const a=WIND_CAP[i-1],b=WIND_CAP[i];return lerp(a[1],b[1],(e-a[0])/(b[0]-a[0]))}return 1}
function comps(s,i){const m=s.m,out=[];
  const add=(k,h,p,d)=>{if(h==null||p==null||d==null||h<0.15)return;const df=dirFactor(s,d);out.push({k,h,p,d,df,face:breaker(h,p)*df*s.g})};
  add("Primary swell",m.sh[i],m.sp[i],m.sd[i]);add("Secondary swell",m.s2h[i],m.s2p[i],m.s2d[i]);add("Wind waves",m.wwh[i],m.wwp[i],m.wwd[i]);return out}
function windScore(s,ws,wd){if(ws==null||wd==null)return{q:1,word:"No wind data",d:null};
  const d=angDiff(wd,(s.f+180)%360),c=Math.cos(d*Math.PI/180),k=c>=0?14+26*c:14+5*c,q=1-0.9*clamp((ws-4)/k,0,1);
  const word=ws<4?"Light":d<35?"Offshore":d<70?"Cross-offshore":d<110?"Cross-shore":d<145?"Cross-onshore":"Onshore";return{q,word,d}}
function tideScore(td,ft){const r=TIDE_RANGE[td];if(!r||ft==null)return 1;const o=ft<r[0]?r[0]-ft:ft>r[1]?ft-r[1]:0;return 1-Math.min(0.3,0.1*o)}
function sizeScore(f,lo,hi){if(f<1)return 0;if(f<lo)return 0.2+0.4*(f-1)/Math.max(0.5,lo-1);if(f<=hi)return 0.6+0.4*(f-lo)/(hi-lo);return Math.max(0.45,1-0.55*(f-hi)/hi)}
// Energy of one wave per metre of crest, in kJ (deep water), scaled to sit near Surfline's figures.
const waveKJ=(hft,T)=>{if(!(hft>0)||!(T>0))return 0;const H=hft*0.3048;return 0.9*1025*9.81*9.81*H*H*T*T/(16*Math.PI)/1000};
const spotKJ=h=>h.cs.reduce((t,c)=>t+(c.p>=5?waveKJ(c.h,c.p)*c.df*c.df:0),0);
const CCOL=["#e07a4f","#e3b23c","#4fb3d9"];
const clsOf=(face,rate)=>face<1?0:rate<2?1:rate<3.5?2:rate<5?3:rate<6.5?4:rate<8.8?5:6;
function rateHour(s,i){const cs=comps(s,i);let e=0,dom=null;for(const c of cs){e+=c.face*c.face;if(!dom||c.face>dom.face)dom=c}
  const face=Math.sqrt(e),w=windScore(s,s.wx.ws[i],s.wx.wd[i]),tide=s.tide?s.tide[i]:null;
  const per=dom?clamp((dom.p-6)/8,0,1)*0.8+0.2:0.2;
  const rate=Math.min(windCap(s.wx.ws[i],w.d),10*sizeScore(face,s.sz[0],s.sz[1])*(0.25+0.75*w.q)*(0.55+0.45*per)*tideScore(s.td,tide));
  const cls=clsOf(face,rate);
  return{face,rate,cls,dom,w,tide,cs}}
function faceText(f){if(f<1)return"Flat";const lo=Math.max(1,Math.round(f*0.85)),hi=Math.max(lo+1,Math.round(f*1.15));return`${lo}–${hi} ft`}

/* ---------- geometry ---------- */
const LANDR=LAND.map(r=>{const o=[];let x=0,y=0;for(let i=0;i<r.length;i+=2){x+=r[i];y+=r[i+1];o.push([x/1e4,y/1e4])}return o});
const LBB=LANDR.map(r=>{let a=1e9,b=-1e9,c=1e9,d=-1e9;for(const [x,y] of r){a=Math.min(a,x);b=Math.max(b,x);c=Math.min(c,y);d=Math.max(d,y)}return[a,b,c,d]});
function isLand(lon,lat){for(let k=0;k<LANDR.length;k++){const bb=LBB[k];if(lon<bb[0]||lon>bb[1]||lat<bb[2]||lat>bb[3])continue;const r=LANDR[k];let inside=false;
  for(let i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];if((yi>lat)!==(yj>lat)&&lon<(xj-xi)*(lat-yi)/(yj-yi)+xi)inside=!inside}
  if(inside)return true}return false}
const G={lon0:-121.5,lat0:32.0,d:0.25,nx:19,ny:12,pts:[]};
for(let iy=0;iy<G.ny;iy++)for(let ix=0;ix<G.nx;ix++){const lon=G.lon0+ix*G.d,lat=G.lat0+iy*G.d;if(!isLand(lon,lat))G.pts.push({i:iy*G.nx+ix,la:lat,lo:lon})}
const REF={la:33.0,lo:-119.6};           // outer-waters reference point for the swell outlook
const dist2=(a,b)=>{const x=(a.lo-b.lo)*0.84,y=a.la-b.la;return x*x+y*y};

/* ---------- data ---------- */
let DATA=null,NOWI=0,TI=0;
const CACHE_KEY="swellchart.v2",CACHE_MIN=60;
// Spots a few miles apart share one wave-model cell, so they share one forecast request.
const FP=[];{const ix={};for(const s of SPOTS){const k=Math.round(s.la/0.05)+"_"+Math.round(s.lo/0.05);if(ix[k]==null){ix[k]=FP.length;FP.push({la:s.la,lo:s.lo})}s.fp=ix[k]}}
async function getJSON(u){const r=await fetch(u);if(!r.ok)throw new Error(`${r.status} from ${new URL(u).host}`);return r.json()}
async function openMeteo(base,pts,vars,extra){const out=[];
  for(let k=0;k<pts.length;k+=80){const p=pts.slice(k,k+80);
    const u=`${base}?latitude=${p.map(x=>x.la.toFixed(3)).join(",")}&longitude=${p.map(x=>x.lo.toFixed(3)).join(",")}&hourly=${vars}&forecast_days=7&timezone=${encodeURIComponent(TZ)}${extra}`;
    const j=await getJSON(u);out.push(...(Array.isArray(j)?j:[j]))}
  return out}
const r1=a=>a.map(v=>v==null?null:Math.round(v*10)/10);
async function loadForecast(){
  const MAR="https://marine-api.open-meteo.com/v1/marine",WX="https://api.open-meteo.com/v1/forecast";
  const sp=FP.concat([REF]);
  const [sm,sw,gm,gw]=await Promise.all([
    openMeteo(MAR,sp,"wave_height,swell_wave_height,swell_wave_direction,swell_wave_period,secondary_swell_wave_height,secondary_swell_wave_period,secondary_swell_wave_direction,wind_wave_height,wind_wave_direction,wind_wave_period,sea_surface_temperature","&length_unit=imperial&cell_selection=sea"),
    openMeteo(WX,FP,"wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day","&wind_speed_unit=kn"),
    openMeteo(MAR,G.pts,"swell_wave_height,swell_wave_direction,swell_wave_period","&length_unit=imperial&cell_selection=sea"),
    openMeteo(WX,G.pts,"wind_speed_10m,wind_direction_10m","&wind_speed_unit=kn")]);
  const pack=h=>({wh:r1(h.wave_height),sh:r1(h.swell_wave_height),sd:h.swell_wave_direction,sp:r1(h.swell_wave_period),s2h:r1(h.secondary_swell_wave_height),s2p:r1(h.secondary_swell_wave_period),s2d:h.secondary_swell_wave_direction,wwh:r1(h.wind_wave_height),wwd:h.wind_wave_direction,wwp:r1(h.wind_wave_period),sst:r1(h.sea_surface_temperature)});
  return{at:Date.now(),times:sm[0].hourly.time,
    m:sm.map(x=>pack(x.hourly)),
    wx:sw.map(x=>({ws:r1(x.hourly.wind_speed_10m),wd:x.hourly.wind_direction_10m,wg:r1(x.hourly.wind_gusts_10m),day:x.hourly.is_day})),
    gm:gm.map(x=>({h:r1(x.hourly.swell_wave_height),d:x.hourly.swell_wave_direction,p:r1(x.hourly.swell_wave_period)})),
    gw:gw.map(x=>({s:r1(x.hourly.wind_speed_10m),d:x.hourly.wind_direction_10m}))}}
async function loadTides(date){const out={};await Promise.all(TIDES.map(async st=>{try{
  const j=await getJSON(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${date.replace(/-/g,"")}&range=168&station=${st.id}&product=predictions&datum=MLLW&time_zone=lst_ldt&units=english&interval=h&format=json`);
  const m={};for(const p of j.predictions||[])m[p.t.replace(" ","T")]=+p.v;out[st.id]=m;
  try{const k=await getJSON(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${date.replace(/-/g,"")}&range=168&station=${st.id}&product=predictions&datum=MLLW&time_zone=lst_ldt&units=english&interval=hilo&format=json`);
    out[st.id+"x"]=(k.predictions||[]).filter(p=>p.type).map(p=>({t:p.t,v:+p.v,hi:p.type==="H"}))}catch(e){out[st.id+"x"]=[]}
  }catch(e){out[st.id]=null}}));return out}
function dods(txt,name){const m=new RegExp("\\n"+name+"\\[\\d+\\]\\n([^\\n]*)").exec(txt);return m?m[1].split(",").map(Number):[]}
async function loadBuoys(){const base="https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/realtime/";
  return Promise.all(BUOYS.map(async b=>{try{
    const dd=await (await fetch(`${base}${b.id}p1_rt.nc.dds?waveTime,sstTime`)).text();
    const n=+(/waveTime\s*=\s*(\d+)/.exec(dd)||[])[1],m=+(/sstTime\s*=\s*(\d+)/.exec(dd)||[])[1];if(!n)throw 0;
    const a=Math.max(0,n-48),r=`[${a}:1:${n-1}]`,sr=m?`,sstSeaSurfaceTemperature[${m-1}:1:${m-1}]`:"";
    const tx=await (await fetch(`${base}${b.id}p1_rt.nc.ascii?waveTime${r},waveHs${r},waveTp${r},waveDp${r}${sr}`)).text();
    const t=dods(tx,"waveTime"),hs=dods(tx,"waveHs"),tp=dods(tx,"waveTp"),dp=dods(tx,"waveDp"),sst=dods(tx,"sstSeaSurfaceTemperature")[0];
    if(!t.length)throw 0;return{ok:true,t,hs:hs.map(v=>v*3.28084),tp,dp,sst:sst==null?null:sst*9/5+32}}catch(e){return{ok:false}}}))}
function fillGrid(vals){const n=G.nx*G.ny;let a=new Float32Array(n).fill(NaN);vals.forEach((v,k)=>{if(v!=null)a[G.pts[k].i]=v});
  for(let pass=0;pass<14;pass++){let left=0;const b=a.slice();
    for(let i=0;i<n;i++){if(!Number.isNaN(a[i]))continue;const x=i%G.nx,y=(i/G.nx)|0;let s=0,c=0;
      if(x>0&&!Number.isNaN(a[i-1])){s+=a[i-1];c++}if(x<G.nx-1&&!Number.isNaN(a[i+1])){s+=a[i+1];c++}
      if(y>0&&!Number.isNaN(a[i-G.nx])){s+=a[i-G.nx];c++}if(y<G.ny-1&&!Number.isNaN(a[i+G.nx])){s+=a[i+G.nx];c++}
      if(c)b[i]=s/c;else left++}
    a=b;if(!left)break}
  for(let i=0;i<n;i++)if(Number.isNaN(a[i]))a[i]=0;return a}
function build(fc,tides,buoys){
  const T=fc.times.length,spots=SPOTS.map((s,k)=>{const o=Object.assign({},s,{idx:k,m:fc.m[s.fp],wx:fc.wx[s.fp]});
    const st=TIDES.slice().sort((a,b)=>dist2(a,s)-dist2(b,s))[0],tm=tides&&tides[st.id];
    o.tideSt=st.n;o.hilo=(tides&&tides[st.id+"x"])||[];o.tide=tm?fc.times.map(t=>tm[t]==null?null:tm[t]):null;
    o.ok=o.m.sh.some(v=>v!=null);o.hr=fc.times.map((_,i)=>rateHour(o,i));return o});
  const F={H:[],P:[],U:[],V:[],WS:[],WU:[],WV:[]},rad=Math.PI/180;
  for(let t=0;t<T;t++){
    F.H.push(fillGrid(fc.gm.map(g=>g.h[t])));F.P.push(fillGrid(fc.gm.map(g=>g.p[t])));
    F.U.push(fillGrid(fc.gm.map(g=>g.d[t]==null?null:-Math.sin(g.d[t]*rad))));F.V.push(fillGrid(fc.gm.map(g=>g.d[t]==null?null:-Math.cos(g.d[t]*rad))));
    F.WS.push(fillGrid(fc.gw.map(g=>g.s[t])));
    F.WU.push(fillGrid(fc.gw.map(g=>g.d[t]==null?null:-Math.sin(g.d[t]*rad))));F.WV.push(fillGrid(fc.gw.map(g=>g.d[t]==null?null:-Math.cos(g.d[t]*rad))))}
  return{at:fc.at,times:fc.times,spots,F,ref:fc.m[FP.length],buoys:buoys||BUOYS.map(()=>({ok:false})),tidesOk:!!tides&&Object.values(tides).some(Boolean)}}
async function load(force){
  $("msg").hidden=false;$("msg").innerHTML="<b>Loading the forecast</b>Pulling swell, wind, tide and buoy data.";
  try{
    let fc=null;
    if(!force)try{const c=JSON.parse(localStorage.getItem(CACHE_KEY)||"null");if(c&&Date.now()-c.at<CACHE_MIN*6e4&&c.times&&c.m&&c.m.length===FP.length+1&&c.times[0].slice(0,10)===laNow().date)fc=c}catch(e){}
    const fresh=!fc;
    const [f2,tides,buoys]=await Promise.all([fc||loadForecast(),loadTides(laNow().date),loadBuoys()]);
    if(fresh)try{localStorage.setItem(CACHE_KEY,JSON.stringify(f2))}catch(e){}
    DATA=build(f2,tides,buoys);
    NOWI=Math.max(0,DATA.times.indexOf(laNow().key));TI=NOWI;$("t").max=DATA.times.length-1;$("t").value=TI;
    $("msg").hidden=true;buildDays();makeMarks();setTime(TI);redraw();
  }catch(e){
    $("msg").innerHTML=`<b>Could not load the forecast</b>${esc(e.message||e)}. This page needs a network connection to Open-Meteo. <br><button id="retry">Try again</button>`;
    $("retry").className="btn";$("retry").onclick=()=>load(true)}}

/* ---------- map ---------- */
// The base map is MapLibre drawing OpenFreeMap vector tiles (OpenStreetMap data). The swell field and
// particles are drawn on canvases above it and clipped to the tiles' own ocean polygons, so the
// overlay follows the real shoreline at every zoom. If tiles fail, the coarse built-in coast is used.
const V={W:0,H:0,dpr:1};
let LAYER="swell",MAP=null,TILES_OK=false;
const mapEl=$("map"),cF=$("cField"),cP=$("cPart");
const FIT=[[-121.05,32.3],[-116.9,34.8]];
const isDark=()=>{const t=document.documentElement.dataset.theme;return t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches};
// Map looks. "chart" follows the page's light/dark theme; the others set their own palette.
// ramp: which colour scale the swell layer uses (l = soft light, d = soft dark, v = vivid). alpha: how solid the swell layer is.
const LOOKS={chart:"Chart",sat:"Satellite",night:"Midnight",paper:"Paper"};
function look(){const k=S.look;
  if(k==="sat")return{sat:true,ramp:"v",alpha:0.5,pcol:"255,255,255",roadMin:10,C:{land:"#1a1f1c",urban:"#000",green:"#000",sand:"#000",water:"#000",road:"rgba(255,255,255,.4)",road2:"rgba(255,255,255,.22)",pier:"rgba(255,255,255,0)",text:"#ffffff",halo:"rgba(0,0,0,.8)"}};
  if(k==="night")return{topo:{line:"#52c2b0",hi:"#2c4046",sh:"#000000",depth:"255,255,255"},ramp:"v",alpha:0.95,pcol:"255,255,255",roadMin:11,C:{land:"#0e1215",urban:"#12171a",green:"#0f1614",sand:"#2b2a21",water:"#0a1420",road:"#262e33",road2:"#1b2226",pier:"#3d474d",text:"#8795a0",halo:"#0a0d0f"}};
  if(k==="paper")return{topo:{line:"#a8946a",hi:"#fff8e6",sh:"#7d6f52",depth:"30,50,70"},ramp:"l",alpha:0.9,pcol:"40,60,80",roadMin:9,C:{land:"#f3ead2",urban:"#eee3c8",green:"#dfe3c0",sand:"#f6e2a8",water:"#d9e8e6",road:"#cdbf9c",road2:"#ddd1b2",pier:"#a89a78",text:"#5a4f3a",halo:"#f6eedb"}};
  return isDark()
  ?{topo:{line:"#6f8a80",hi:"#34403e",sh:"#0b0f0f",depth:"226,244,248"},ramp:"d",alpha:0.93,pcol:css("--particle")||"226,244,248",roadMin:7,C:{land:"#232a29",urban:"#283030",green:"#22302a",sand:"#3a3628",water:"#0b1b25",road:"#3b4644",road2:"#2a3331",pier:"#55605b",text:"#a9bcc2",halo:"#141a1a"}}
  :{topo:{line:"#a79c80",hi:"#ffffff",sh:"#8a8068",depth:"20,52,74"},ramp:"l",alpha:0.93,pcol:css("--particle")||"20,52,74",roadMin:7,C:{land:"#f1ecdf",urban:"#ebe5d6",green:"#dde6cc",sand:"#f4e4b4",water:"#cfe3ea",road:"#d6ccb4",road2:"#e2dac6",pier:"#b9ae93",text:"#4d5c63",halo:"#f6f2e8"}}}
// Terrain: free AWS/Mapzen elevation tiles (land heights and sea-floor depths). Contour lines are computed in the browser.
let DEM=null,DEM2=null;   // DEM2 reads coarser tiles, the only ones that carry sea-floor depths
function setupTerrain(){if(!window.mlcontour||DEM)return;try{DEM=new mlcontour.DemSource({url:"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",encoding:"terrarium",maxzoom:12,worker:true,cacheSize:120,timeoutMs:10000});DEM.setupMaplibre(maplibregl);
  DEM2=new mlcontour.DemSource({id:"sea",url:"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",encoding:"terrarium",maxzoom:9,worker:true,cacheSize:60,timeoutMs:10000});DEM2.setupMaplibre(maplibregl)}catch(e){DEM=null;DEM2=null}}
const CONTOUR_FT={7:[1000,5000],8:[500,2500],10:[200,1000],11:[100,500],12:[50,250],13:[40,200],14:[20,100]};
function mapStyle(){const LK=look(),C=LK.C,fo=LK.sat?0:1,r0=LK.roadMin,r1=Math.max(11,r0+2),TP=DEM&&LK.topo;
  const name=["coalesce",["get","name_en"],["get","name"]],road=(id,cls,min,col,w)=>({id,type:"line",source:"omt","source-layer":"transportation",minzoom:min,
    filter:["all",["==",["geometry-type"],"LineString"],["in",["get","class"],["literal",cls]]],layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":col,"line-width":["interpolate",["exponential",1.6],["zoom"],...w]}});
  const label=(id,cls,min,size)=>({id,type:"symbol",source:"omt","source-layer":"place",minzoom:min,filter:["in",["get","class"],["literal",cls]],
    layout:{"text-field":name,"text-font":["Noto Sans Regular"],"text-size":size,"text-max-width":8},paint:{"text-color":C.text,"text-halo-color":C.halo,"text-halo-width":1.2}});
  return{version:8,glyphs:"https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources:{...(LK.sat?{sat:{type:"raster",tiles:["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:18,attribution:"Imagery &copy; Esri, Maxar, Earthstar Geographics"}}:{}),
      ...(TP?{dem:{type:"raster-dem",encoding:"terrarium",tiles:[DEM.sharedDemProtocolUrl],maxzoom:12,tileSize:256,attribution:"Terrain: Mapzen, USGS, NOAA"},
        contours:{type:"vector",tiles:[DEM.contourProtocolUrl({multiplier:3.28084,thresholds:CONTOUR_FT,contourLayer:"contours",elevationKey:"ele",levelKey:"level",buffer:1})],maxzoom:14},
        depths:{type:"vector",tiles:[DEM2.contourProtocolUrl({multiplier:3.28084,thresholds:{6:[1000,5000],8:[500,2500],9:[100,500]},contourLayer:"contours",elevationKey:"ele",levelKey:"level",buffer:1})],maxzoom:9}}:{}),omt:{type:"vector",url:"https://tiles.openfreemap.org/planet",attribution:'<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'}},
    layers:[{id:"bg",type:"background",paint:{"background-color":C.land}},...(LK.sat?[{id:"sat",type:"raster",source:"sat"}]:[]),
      {id:"urban",type:"fill",source:"omt","source-layer":"landuse",minzoom:9,filter:["in",["get","class"],["literal",["residential","commercial","industrial","retail"]]],paint:{"fill-color":C.urban,"fill-opacity":fo}},
      {id:"green",type:"fill",source:"omt","source-layer":"landcover",filter:["in",["get","class"],["literal",["wood","grass","wetland"]]],paint:{"fill-color":C.green,"fill-opacity":fo}},
      {id:"park",type:"fill",source:"omt","source-layer":"park",paint:{"fill-color":C.green,"fill-opacity":fo}},
      {id:"sand",type:"fill",source:"omt","source-layer":"landcover",filter:["==",["get","class"],"sand"],paint:{"fill-color":C.sand,"fill-opacity":fo}},
      ...(TP?[{id:"hill",type:"hillshade",source:"dem",paint:{"hillshade-exaggeration":0.6,"hillshade-shadow-color":LK.topo.sh,"hillshade-highlight-color":LK.topo.hi,"hillshade-accent-color":LK.topo.sh}},
        {id:"topo",type:"line",source:"contours","source-layer":"contours",filter:[">",["get","ele"],0],paint:{"line-color":LK.topo.line,"line-opacity":["match",["get","level"],1,0.85,0.42],"line-width":["match",["get","level"],1,1.1,0.6]}}]:[]),
      ...(TP?[{id:"depth-load",type:"line",source:"depths","source-layer":"contours",filter:["<",["get","ele"],0],paint:{"line-opacity":0}}]:[]),
      {id:"water",type:"fill",source:"omt","source-layer":"water",paint:{"fill-color":C.water,"fill-opacity":fo}},
      road("roads2",["secondary","tertiary","minor"],r1,C.road2,[11,0.4,15,3]),
      road("roads",["motorway","trunk","primary"],r0,C.road,[7,0.4,11,1.2,15,5]),
      {id:"pier-fill",type:"fill",source:"omt","source-layer":"transportation",filter:["all",["==",["geometry-type"],"Polygon"],["==",["get","class"],"pier"]],paint:{"fill-color":C.pier,"fill-opacity":fo}},
      {id:"pier-line",type:"line",source:"omt","source-layer":"transportation",filter:["all",["==",["geometry-type"],"LineString"],["==",["get","class"],"pier"]],paint:{"line-color":C.pier,"line-width":["interpolate",["linear"],["zoom"],11,0.8,15,4]}},
      ...(TP?[{id:"topo-lab",type:"symbol",source:"contours","source-layer":"contours",minzoom:10,filter:["all",[">",["get","ele"],0],["==",["get","level"],1]],
        layout:{"symbol-placement":"line","text-field":["concat",["number-format",["get","ele"],{}]," ft"],"text-font":["Noto Sans Regular"],"text-size":10,"symbol-spacing":420},paint:{"text-color":LK.topo.line,"text-halo-color":C.land,"text-halo-width":1.4}}]:[]),
      label("towns",["town","village","suburb"],10,12),label("cities",["city"],6,["interpolate",["linear"],["zoom"],6,11,12,15])]}}
/* screen <-> lon/lat (web mercator, no rotation) */
const PR={ax:1,bx:0,ay:1,by:0};
const mercY=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
function syncProj(){const a=MAP.project([-120,33]),b=MAP.project([-118,34]),m1=mercY(33),m2=mercY(34);PR.ax=(b.x-a.x)/2;PR.bx=a.x+120*PR.ax;PR.ay=(b.y-a.y)/(m2-m1);PR.by=a.y-PR.ay*m1}
const X=lon=>PR.ax*lon+PR.bx,Y=lat=>PR.ay*mercY(lat)+PR.by;
const LON=x=>(x-PR.bx)/PR.ax,LAT=y=>(2*Math.atan(Math.exp((y-PR.by)/PR.ay))-Math.PI/2)*180/Math.PI;
function sample(arr,lon,lat){const gx=clamp((lon-G.lon0)/G.d,0,G.nx-1.001),gy=clamp((lat-G.lat0)/G.d,0,G.ny-1.001),x0=gx|0,y0=gy|0,fx=gx-x0,fy=gy-y0,i=y0*G.nx+x0;
  return(arr[i]*(1-fx)+arr[i+1]*fx)*(1-fy)+(arr[i+G.nx]*(1-fx)+arr[i+G.nx+1]*fx)*fy}
/* ocean mask */
const mask=document.createElement("canvas"),maskS=document.createElement("canvas"),MS=4;let MASKD=null;
function buildMask(){const w=Math.round(V.W*V.dpr),h=Math.round(V.H*V.dpr);if(mask.width!==w||mask.height!==h){mask.width=w;mask.height=h}
  const c=mask.getContext("2d");c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,w,h);c.setTransform(V.dpr,0,0,V.dpr,0,0);c.fillStyle="#000";
  let feats=[];try{feats=MAP.querySourceFeatures("omt",{sourceLayer:"water",filter:["==",["get","class"],"ocean"]})}catch(e){}
  TILES_OK=feats.length>0;
  if(TILES_OK){for(const f of feats){const g=f.geometry,polys=g.type==="Polygon"?[g.coordinates]:g.type==="MultiPolygon"?g.coordinates:[];
      for(const p of polys){c.beginPath();for(const r of p){for(let i=0;i<r.length;i++){const x=X(r[i][0]),y=Y(r[i][1]);if(i)c.lineTo(x,y);else c.moveTo(x,y)}c.closePath()}c.fill("evenodd")}}}
  else{c.fillRect(0,0,V.W,V.H);c.globalCompositeOperation="destination-out";c.beginPath();for(const r of LANDR){r.forEach(([x,y],i)=>i?c.lineTo(X(x),Y(y)):c.moveTo(X(x),Y(y)));c.closePath()}c.fill();c.globalCompositeOperation="source-over"}}
function readMask(){maskS.width=Math.max(1,Math.ceil(V.W/MS));maskS.height=Math.max(1,Math.ceil(V.H/MS));const c=maskS.getContext("2d",{willReadFrequently:true});c.drawImage(mask,0,0,maskS.width,maskS.height);
  try{MASKD=c.getImageData(0,0,maskS.width,maskS.height)}catch(e){MASKD=null}}
function isWater(x,y){if(!MASKD)return true;const ix=(x/MS)|0,iy=(y/MS)|0;if(ix<0||iy<0||ix>=MASKD.width||iy>=MASKD.height)return false;return MASKD.data[(iy*MASKD.width+ix)*4+3]>128}
const RAMP={
  swell:{u:"ft",t:"Primary swell height",ticks:[0,2,4,6,8,12],max:12,
    l:[[0,[238,246,246]],[1,[213,236,238]],[2,[166,216,222]],[3,[108,189,208]],[4,[61,156,196]],[6,[61,111,181]],[8,[90,74,166]],[10,[140,63,156]],[12,[194,64,127]]],
    d:[[0,[11,27,37]],[1,[14,48,62]],[2,[17,74,90]],[3,[20,110,126]],[4,[30,146,160]],[6,[58,160,214]],[8,[107,132,224]],[10,[164,104,214]],[12,[224,95,168]]],
    v:[[0,[22,30,62]],[1,[38,66,150]],[2,[40,118,202]],[3,[40,168,192]],[4,[62,190,122]],[6,[222,210,62]],[8,[240,142,52]],[10,[226,72,62]],[12,[200,52,140]]]},
  period:{u:"s",t:"Primary swell period",ticks:[6,9,12,15,18,21],min:6,max:21,
    l:[[6,[240,244,232]],[9,[207,227,176]],[12,[143,207,154]],[15,[63,174,158]],[18,[42,127,176]],[21,[74,74,166]]],
    d:[[6,[11,27,37]],[9,[30,64,44]],[12,[36,112,82]],[15,[32,150,150]],[18,[58,140,214]],[21,[150,110,224]]],
    v:[[6,[28,38,80]],[9,[40,110,190]],[12,[50,180,170]],[15,[150,205,80]],[18,[240,190,60]],[21,[235,90,70]]]},
  wind:{u:"kn",t:"Wind speed",ticks:[0,5,10,15,20,30],max:30,
    l:[[0,[244,246,240]],[5,[220,235,208]],[10,[241,221,140]],[15,[240,176,96]],[20,[227,122,74]],[30,[184,64,90]]],
    d:[[0,[11,27,37]],[5,[22,62,58]],[10,[88,104,36]],[15,[154,106,30]],[20,[184,80,42]],[30,[196,58,96]]],
    v:[[0,[28,38,80]],[5,[50,120,190]],[10,[60,185,150]],[15,[220,210,70]],[20,[240,140,60]],[30,[220,60,90]]]}};
function rampCol(stops,v){if(v<=stops[0][0])return stops[0][1];for(let i=1;i<stops.length;i++)if(v<=stops[i][0]){const a=stops[i-1],b=stops[i],t=(v-a[0])/(b[0]-a[0]);return[lerp(a[1][0],b[1][0],t),lerp(a[1][1],b[1][1],t),lerp(a[1][2],b[1][2],t)]}return stops[stops.length-1][1]}
const layerArr=()=>LAYER==="swell"?DATA.F.H[TI]:LAYER==="period"?DATA.F.P[TI]:DATA.F.WS[TI];
const fS=document.createElement("canvas");
function drawField(){const W=Math.round(V.W*V.dpr),H=Math.round(V.H*V.dpr);if(cF.width!==W||cF.height!==H){cF.width=W;cF.height=H}
  const ctx=cF.getContext("2d");ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);if(!DATA||!MAP)return;
  const w=Math.max(2,Math.round(V.W/5)),h=Math.max(2,Math.round(V.H/5));fS.width=w;fS.height=h;const sc=fS.getContext("2d"),img=sc.createImageData(w,h),st=RAMP[LAYER][look().ramp],arr=layerArr();
  const lons=new Float64Array(w);for(let x=0;x<w;x++)lons[x]=LON((x+0.5)*5);let k=0;
  for(let y=0;y<h;y++){const lat=LAT((y+0.5)*5);for(let x=0;x<w;x++){const c=rampCol(st,sample(arr,lons[x],lat));img.data[k++]=c[0];img.data[k++]=c[1];img.data[k++]=c[2];img.data[k++]=255}}
  sc.putImageData(img,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.globalAlpha=look().alpha;ctx.drawImage(fS,0,0,W,H);ctx.globalAlpha=1;
  drawDepth(ctx);
  ctx.globalCompositeOperation="destination-in";ctx.drawImage(mask,0,0);ctx.globalCompositeOperation="source-over"}
let DEPTH=[],depthDirty=true;
function drawDepth(ctx){const LK=look();if(!DEM||!LK.topo||!MAP)return;
  if(depthDirty){depthDirty=false;try{DEPTH=MAP.querySourceFeatures("depths",{sourceLayer:"contours",filter:["all",["<",["get","ele"],0],[">",["get","ele"],-20000]]})}catch(e){DEPTH=[]}}
  if(!DEPTH.length)return;ctx.save();ctx.setTransform(V.dpr,0,0,V.dpr,0,0);ctx.lineJoin="round";const rgb=LK.topo.depth,labs=[],seen=new Set();
  for(const pass of [0,1]){ctx.beginPath();for(const f of DEPTH){if((f.properties.level===1?1:0)!==pass)continue;const g=f.geometry,ls=g.type==="LineString"?[g.coordinates]:g.type==="MultiLineString"?g.coordinates:[];
      for(const l of ls){if(l.length<8)continue;let best=null;for(let i=0;i<l.length;i++){const x=X(l[i][0]),y=Y(l[i][1]);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);if(pass&&!best&&i>l.length/2&&x>30&&x<V.W-30&&y>30&&y<V.H-30)best=[x,y]}
        if(pass&&best&&l.length>12)labs.push([best[0],best[1],-f.properties.ele])}}
    ctx.strokeStyle=`rgba(${rgb},${pass?0.5:0.24})`;ctx.lineWidth=pass?1.1:0.7;ctx.stroke()}
  ctx.font=`500 10px ${css("--f-ui")}`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle=`rgba(${rgb},.85)`;
  for(const [x,y,d] of labs){const k=Math.round(x/90)+"_"+Math.round(y/60);if(seen.has(k))continue;seen.add(k);ctx.fillText(Math.round(d).toLocaleString()+" ft",x,y)}
  ctx.restore()}
/* particles: swell drawn as short crests marching along the swell direction, wind as streaks */
let PART=[],raf=0;const REDUCED=matchMedia("(prefers-reduced-motion: reduce)").matches;
function spawn(p){for(let k=0;k<8;k++){const x=Math.random()*V.W,y=Math.random()*V.H;p.lo=LON(x);p.la=LAT(y);if(isWater(x,y))break}p.age=0;p.life=70+Math.random()*120;return p}
function resetParticles(){cP.width=Math.round(V.W*V.dpr);cP.height=Math.round(V.H*V.dpr);const n=clamp(Math.round(V.W*V.H/1500),160,900);PART=Array.from({length:n},()=>{const p=spawn({});p.age=Math.random()*p.life;return p})}
function clearParticles(){const c=cP.getContext("2d");c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,cP.width,cP.height)}
function tick(){raf=requestAnimationFrame(tick);if(!DATA||!MAP||document.hidden)return;const c=cP.getContext("2d");c.setTransform(V.dpr,0,0,V.dpr,0,0);
  c.globalCompositeOperation="destination-out";c.fillStyle=LAYER==="wind"?"rgba(0,0,0,.09)":"rgba(0,0,0,.3)";c.fillRect(0,0,V.W,V.H);c.globalCompositeOperation="source-over";
  const wind=LAYER==="wind",F=DATA.F,U=wind?F.WU[TI]:F.U[TI],Vv=wind?F.WV[TI]:F.V[TI],M=wind?F.WS[TI]:F.H[TI],P=F.P[TI],rgb=PCOL;
  c.lineCap="round";
  for(const p of PART){if(++p.age>p.life){spawn(p);continue}
    let u=sample(U,p.lo,p.la),v=sample(Vv,p.lo,p.la);const n=Math.hypot(u,v)||1;u/=n;v/=n;const m=sample(M,p.lo,p.la);
    const x0=X(p.lo),y0=Y(p.la),sp=wind?0.25+m*0.07:0.3+sample(P,p.lo,p.la)*0.04;
    const x1=x0+u*sp,y1=y0-v*sp;p.lo=LON(x1);p.la=LAT(y1);
    if(x1<-5||y1<-5||x1>V.W+5||y1>V.H+5){spawn(p);continue}
    const env=Math.sin(Math.PI*p.age/p.life),a=env*(wind?clamp(m/16,0.15,0.7):clamp(m/6,0.14,0.65));
    c.strokeStyle=`rgba(${rgb},${a.toFixed(3)})`;c.beginPath();
    if(wind){c.lineWidth=1.1;c.moveTo(x0,y0);c.lineTo(x1,y1)}
    else{const L=clamp(3.5+m*1.5,4,13);c.lineWidth=1.2;c.moveTo(x1+v*L,y1+u*L);c.lineTo(x1-v*L,y1-u*L)}
    c.stroke()}
  c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation="destination-in";c.drawImage(mask,0,0);c.globalCompositeOperation="source-over"}
function drawStatic(){const c=cP.getContext("2d");c.setTransform(V.dpr,0,0,V.dpr,0,0);c.clearRect(0,0,V.W,V.H);if(!DATA)return;const wind=LAYER==="wind",F=DATA.F;
  c.strokeStyle=c.fillStyle=`rgba(${PCOL},.6)`;c.lineWidth=1.2;
  for(let y=30;y<V.H;y+=46)for(let x=30;x<V.W;x+=46){if(!isWater(x,y))continue;const lo=LON(x),la=LAT(y),u=sample(wind?F.WU[TI]:F.U[TI],lo,la),v=sample(wind?F.WV[TI]:F.V[TI],lo,la),n=Math.hypot(u,v)||1,ux=u/n,uy=-v/n;
    c.beginPath();c.moveTo(x-ux*9,y-uy*9);c.lineTo(x+ux*9,y+uy*9);c.stroke();c.beginPath();c.moveTo(x+ux*11,y+uy*11);c.lineTo(x+ux*5-uy*4,y+uy*5+ux*4);c.lineTo(x+ux*5+uy*4,y+uy*5-ux*4);c.fill()}}
let PCOL="20,52,74";const syncTheme=()=>{PCOL=look().pcol};
/* markers */
let MK=[];
function makeMarks(){const box=$("marks");box.innerHTML="";MK=[];
  DATA.spots.forEach((s,k)=>{const b=document.createElement("button");b.className="mk spot";b.innerHTML=`<i></i><span>${esc(s.n)}</span>`;b.setAttribute("aria-label",s.n);b.onclick=()=>select(k);box.appendChild(b);MK.push({el:b,la:s.la,lo:s.lo,spot:k,w:s.n.length*6.6+22})});
  BUOYS.forEach((b,k)=>{const d=DATA.buoys[k],e=document.createElement("button");e.className="mk buoy"+(d.ok&&buoyAge(d)<180?"":" stale");
    e.innerHTML=`<i></i><span>${esc(b.n)}${d.ok?` · ${d.hs[d.hs.length-1].toFixed(1)} ft @ ${Math.round(d.tp[d.tp.length-1])} s`:" · offline"}</span>`;e.setAttribute("aria-label","Buoy "+b.n);
    e.onclick=()=>{S.tab="buoys";S.sel=null;render()};box.appendChild(e);MK.push({el:e,la:b.la,lo:b.lo})})}
function placeMarks(){if(!MAP)return;const z=MAP.getZoom(),lab=z>=10.6,used=[];
  const order=MK.filter(m=>m.spot!=null).sort((a,b)=>(S.sel===b.spot)-(S.sel===a.spot)||DATA.spots[b.spot].hr[TI].rate-DATA.spots[a.spot].hr[TI].rate);
  for(const m of MK){m.x=X(m.lo);m.y=Y(m.la);m.el.style.transform=`translate(${m.x.toFixed(1)}px,${m.y.toFixed(1)}px)`;m.el.hidden=m.x<-40||m.y<-40||m.x>V.W+40||m.y>V.H+40||(m.spot!=null&&m.spot!==S.sel&&!inFilter(DATA.spots[m.spot]))}
  for(const m of order){let show=false;if(lab&&!m.el.hidden){const r=[m.x+8,m.y-22,m.x+8+m.w,m.y+4];show=!used.some(u=>r[0]<u[2]&&r[2]>u[0]&&r[1]<u[3]&&r[3]>u[1]);if(show)used.push(r)}m.el.classList.toggle("lab",show)}}
function colorMarks(){if(!DATA)return;for(const m of MK)if(m.spot!=null){const s=DATA.spots[m.spot];m.el.firstChild.style.background=s.ok?rtCol(s.hr[TI].cls):"var(--muted)";m.el.classList.toggle("sel",S.sel===m.spot)}}
function legend(){const R=RAMP[LAYER],st=R[look().ramp],lo=R.min||0,g=st.map(([v,c])=>`rgb(${c.map(Math.round).join(",")}) ${((v-lo)/(R.max-lo)*100).toFixed(0)}%`).join(",");
  $("legend").innerHTML=`<b>${R.t}, ${R.u}</b><div class="bar" style="background:linear-gradient(90deg,${g})"></div><div class="tk">${R.ticks.map(t=>`<span>${t}${t===R.max?"+":""}</span>`).join("")}</div><div class="probe" id="probe"></div>`}
let pend=false,maskT=0;
function redraw(){if(pend||!MAP)return;pend=true;requestAnimationFrame(()=>{pend=false;syncProj();buildMask();drawField();if(DATA){placeMarks();colorMarks()}
  clearTimeout(maskT);maskT=setTimeout(()=>{readMask();if(REDUCED)drawStatic()},160)})}
function viewChanged(){clearParticles();redraw()}
function resize(){const r=mapEl.getBoundingClientRect();if(!r.width)return;V.W=r.width;V.H=r.height;V.dpr=Math.min(2,window.devicePixelRatio||1);if(MAP)MAP.resize();resetParticles();redraw()}
function probe(x,y){const el=$("probe");if(!el||!DATA)return;if(!isWater(x,y)){el.textContent="";return}
  const lo=LON(x),la=LAT(y),F=DATA.F,pos=`${la.toFixed(2)}°N ${(-lo).toFixed(2)}°W`;
  if(LAYER==="wind"){const d=(Math.atan2(-sample(F.WU[TI],lo,la),-sample(F.WV[TI],lo,la))*180/Math.PI+360)%360;el.textContent=`${pos} · ${sample(F.WS[TI],lo,la).toFixed(0)} kn from ${comp(d)}`}
  else{const d=(Math.atan2(-sample(F.U[TI],lo,la),-sample(F.V[TI],lo,la))*180/Math.PI+360)%360;el.textContent=`${pos} · ${sample(F.H[TI],lo,la).toFixed(1)} ft @ ${sample(F.P[TI],lo,la).toFixed(0)} s from ${comp(d)} ${Math.round(d)}°`}}
function initMap(){
  if(!window.maplibregl){$("msg").hidden=false;$("msg").innerHTML="<b>Could not load the map</b>The map library did not download. Check your connection and reload.";return false}
  setupTerrain();
  const touch=matchMedia("(pointer: coarse)").matches&&matchMedia("(max-width:860px)").matches;
  MAP=new maplibregl.Map({container:"mapgl",style:mapStyle(),bounds:FIT,fitBoundsOptions:{padding:8},minZoom:6.5,maxZoom:15.5,maxBounds:[[-125,30],[-113.5,37]],dragRotate:false,pitchWithRotate:false,attributionControl:false,cooperativeGestures:touch});
  MAP.touchZoomRotate.disableRotation();MAP.keyboard.disableRotation();
  MAP.addControl(new maplibregl.AttributionControl({compact:true}),"bottom-right");
  MAP.on("move",viewChanged);MAP.on("idle",()=>{depthDirty=true;redraw()});MAP.on("sourcedata",e=>{if(e.sourceId==="depths")depthDirty=true;if((e.sourceId==="omt"||e.sourceId==="depths")&&e.tile)redraw()});
  MAP.on("mousemove",e=>probe(e.point.x,e.point.y));MAP.on("mouseout",()=>{const el=$("probe");if(el)el.textContent=""});
  $("zin").onclick=()=>MAP.zoomIn();$("zout").onclick=()=>MAP.zoomOut();$("zfit").onclick=()=>MAP.fitBounds(FIT,{padding:8});
  new ResizeObserver(resize).observe(mapEl);resize();return true}
const inView=(lo,la)=>{const x=X(lo),y=Y(la);return x>24&&x<V.W-24&&y>64&&y<V.H-24};
function goTo(lo,la,minZoom){if(!MAP)return;const z=MAP.getZoom();if(z>=minZoom&&inView(lo,la))return;MAP.easeTo({center:[lo,la],zoom:Math.max(z,minZoom),duration:REDUCED?0:700})}
for(const l of ["swell","period","wind"])$("lyr-"+l).onclick=()=>{LAYER=l;for(const m of ["swell","period","wind"])$("lyr-"+m).setAttribute("aria-pressed",m===l);legend();clearParticles();redraw()};
function lookButtons(){$("looks").innerHTML=Object.entries(LOOKS).map(([k,n])=>`<button data-look="${k}" aria-pressed="${S.look===k}">${n}</button>`).join("")}
$("looks").addEventListener("click",e=>{const b=e.target.closest("[data-look]");if(!b)return;S.look=b.dataset.look;try{localStorage.setItem("swellchart.look",S.look)}catch(e){}lookButtons();themeChanged()});
const themeChanged=()=>{syncTheme();legend();if(MAP)MAP.setStyle(mapStyle());redraw()};
matchMedia("(prefers-color-scheme: dark)").addEventListener("change",themeChanged);
new MutationObserver(themeChanged).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});

/* ---------- time ---------- */
function buildDays(){const T=DATA.times;let h="",i=0;while(i<T.length){const p=tparts(T[i]);let n=0;while(i+n<T.length&&T[i+n].slice(0,10)===T[i].slice(0,10))n++;h+=`<span style="flex:${n}">${DOW[p.dow]}<i> ${p.d}</i></span>`;i+=n}$("days").innerHTML=h}
function fmt(i,long){const p=tparts(DATA.times[i]);return long?`${DOW[p.dow]} ${MON[p.m-1]} ${p.d}, ${h12(p.h)}`:`${DOW[p.dow]} ${h12(p.h)}`}
function setTime(i,fromPlay){TI=clamp(i,0,DATA.times.length-1);$("t").value=TI;$("when").textContent=fmt(TI,true);
  const d=TI-NOWI;$("whensub").textContent=d===0?"Now":d>0?`${d} h from now`:`${-d} h ago`;
  redraw();render(fromPlay)}
$("t").addEventListener("input",e=>{if(DATA)setTime(+e.target.value)});
$("now").onclick=()=>{if(DATA)setTime(NOWI)};
let playT=0;
$("play").onclick=()=>{if(!DATA)return;const on=!playT;$("play").setAttribute("aria-pressed",on);$("play").textContent=on?"Pause":"Play";
  if(on)playT=setInterval(()=>setTime(TI>=DATA.times.length-1?NOWI:TI+1,true),380);else{clearInterval(playT);playT=0}};

/* ---------- panel ---------- */
const S={tab:"spots",sel:null,region:"all",step:1,sort:"best",look:"chart"};try{const l=localStorage.getItem("swellchart.look");if(l&&["chart","sat","night","paper"].includes(l))S.look=l}catch(e){}try{if(localStorage.getItem("swellchart.step")==="3")S.step=3}catch(e){}
const REG={all:"All",sb:"Santa Barbara",vc:"Ventura",la:"Los Angeles",oc:"Orange County",sd:"San Diego"};
const CHIPS={all:"All",fav:"\u2605 Favorites",sb:"Santa Barbara",vc:"Ventura",la:"Los Angeles",oc:"Orange County",sd:"San Diego"};
// Favorites and list preferences are kept in this browser only.
const FAVS=new Set();try{for(const n of JSON.parse(localStorage.getItem("swellchart.favs")||"[]"))FAVS.add(n);if(localStorage.getItem("swellchart.sort")==="ns")S.sort="ns"}catch(e){}
const saveFavs=()=>{try{localStorage.setItem("swellchart.favs",JSON.stringify([...FAVS]))}catch(e){}};
const inFilter=s=>S.region==="all"||(S.region==="fav"?FAVS.has(s.n):s.r===S.region);
function fitFilter(){if(!MAP||!DATA)return;const ss=DATA.spots.filter(inFilter);if(S.region==="all"||!ss.length){MAP.fitBounds(FIT,{padding:8,duration:REDUCED?0:700});return}
  let w=180,e=-180,so=90,n=-90;for(const s of ss){w=Math.min(w,s.lo);e=Math.max(e,s.lo);so=Math.min(so,s.la);n=Math.max(n,s.la)}
  MAP.fitBounds([[w,so],[e,n]],{padding:{top:70,bottom:50,left:40,right:60},maxZoom:12.5,duration:REDUCED?0:700})}
function select(k){S.sel=k;S.tab="spots";render();$("body").scrollTop=0;colorMarks();placeMarks();
  if(k!=null&&window.matchMedia("(max-width:860px)").matches)document.querySelector(".panel").scrollIntoView({behavior:REDUCED?"auto":"smooth"})}
for(const t of ["spots","buoys","how"])$("tab-"+t).onclick=()=>{S.tab=t;S.sel=null;render();colorMarks()};
function swellLine(c){return c?`${c.h.toFixed(1)} ft @ ${Math.round(c.p)} s ${arrow(c.d)} ${comp(c.d)} ${Math.round(c.d)}°`:"No swell"}
function outlook(){const r=DATA.ref,T=DATA.times;if(!r||!r.sh.some(v=>v!=null))return"";
  const W=372,H=92,x=i=>26+i*(W-32)/(T.length-1),mx=Math.max(4,...r.sh.map(v=>v||0),...r.s2h.map(v=>v||0)),y=v=>H-22-(v/mx)*(H-34);
  const path=a=>{let d="",pen=false;a.forEach((v,i)=>{if(v==null){pen=false;return}d+=(pen?"L":"M")+x(i).toFixed(1)+" "+y(v).toFixed(1);pen=true});return d};
  let pk=TI;for(let i=TI;i<T.length;i++)if((r.sh[i]||0)>(r.sh[pk]||0))pk=i;
  let days="";for(let i=0;i<T.length;i+=24){const p=tparts(T[i]);days+=`<text x="${x(i)+3}" y="${H-10}" font-size="10" fill="var(--muted)">${DOW[p.dow]}</text>`;
    const n=Math.min(i+12,T.length-1);if(r.sd[n]!=null)days+=`<text x="${x(n)}" y="${H}" font-size="9.5" text-anchor="middle" fill="var(--muted)">${comp(r.sd[n])}</text>`}
  const now=`Outer waters, ${fmt(TI)}: ${r.sh[TI]!=null?`${r.sh[TI].toFixed(1)} ft at ${Math.round(r.sp[TI])} s from ${comp(r.sd[TI])} ${Math.round(r.sd[TI])}°`:"no data"}.`;
  const peak=pk>TI+2?` Builds to ${r.sh[pk].toFixed(1)} ft at ${Math.round(r.sp[pk])} s from ${comp(r.sd[pk])} by ${fmt(pk)}.`:` Nothing bigger follows in this forecast.`;
  return`<div class="outlook"><p class="lab">Incoming swell</p><p>${now}${peak}</p>
  <svg viewBox="0 0 ${W} ${H+2}" role="img" aria-label="Seven-day swell height in outer waters. Solid line is the primary swell, dashed the secondary; letters give the primary swell direction each midday."><title>Solid: primary swell. Dashed: secondary swell. Letters: primary swell direction at midday.</title>${days}
  <text x="2" y="${y(mx)+4}" font-size="10" fill="var(--muted)">${Math.round(mx)} ft</text>
  <path d="${path(r.s2h)}" fill="none" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="3 3"/><path d="${path(r.sh)}" fill="none" stroke="var(--ink)" stroke-width="1.8"/>
  <line x1="${x(TI)}" y1="8" x2="${x(TI)}" y2="${H-22}" stroke="var(--ink)" stroke-width="1" opacity=".55"/><circle cx="${x(TI)}" cy="6" r="2.5" fill="var(--ink)"/></svg></div>`}
function listView(){const rows=DATA.spots.filter(inFilter);if(S.sort==="best")rows.sort((a,b)=>b.hr[TI].rate-a.hr[TI].rate);else rows.sort((a,b)=>a.idx-b.idx);
  return outlook()+`<div style="display:flex;flex-direction:column;gap:8px"><div class="chips" role="group" aria-label="Region">${Object.entries(CHIPS).map(([k,n])=>`<button data-reg="${k}" aria-pressed="${S.region===k}">${n}</button>`).join("")}</div>
  <div class="steprow" style="margin-top:2px;justify-content:space-between;align-items:center"><span class="lab">${rows.length} spot${rows.length===1?"":"s"}</span><div class="seg2" role="group" aria-label="Sort order"><button data-sort="best" aria-pressed="${S.sort==="best"}">Best first</button><button data-sort="ns" aria-pressed="${S.sort==="ns"}">North to south</button></div></div>
  ${rows.length?"":`<p class="note">${S.region==="fav"?"No favorites yet. Open a spot and tap Save to add it here.":"No spots here."}</p>`}<div class="rows">${rows.map(s=>{const h=s.hr[TI];
    if(!s.ok)return`<button class="row" data-spot="${s.idx}"><i class="dot" style="background:var(--line)"></i><span class="nm">${esc(s.n)}</span><span class="ft"></span><span class="sub">No wave data near this spot</span></button>`;
    return`<button class="row" data-spot="${s.idx}"><i class="dot" style="background:${rtCol(h.cls)}"></i><span class="nm">${esc(s.n)}${FAVS.has(s.n)?' <span class="fv" aria-label="Favorite">★</span>':""}</span><span class="ft">${faceText(h.face)}</span>
    <span class="sub"><b>${RT[h.cls].n}</b> · ${h.dom?`${comp(h.dom.d)} ${Math.round(h.dom.p)} s`:"no swell"} · ${h.w.d==null?"wind n/a":`${h.w.word.toLowerCase()} ${Math.round(s.wx.ws[TI])} kn`}</span></button>`}).join("")}</div></div>${foot()}`}
function foot(){const mins=Math.round((Date.now()-DATA.at)/6e4),nb=DATA.buoys.filter(b=>b.ok).length;
  return`<div class="foot">Updated ${mins<1?"just now":mins+" min ago"} · ${nb} of ${BUOYS.length} buoys reporting${DATA.tidesOk?"":" · tides did not load, so ratings ignore tide"}.<button id="refresh">Refresh</button></div>`}
function fcChart(s){const T=DATA.times,W=372,H=176,x0=24,bw=(W-x0-4)/T.length,x=i=>x0+i*bw,top=18,base=112,mx=Math.max(6,Math.ceil(Math.max(...s.hr.map(h=>h.face)))),y=v=>base-(v/mx)*(base-top);
  let g="";
  for(let i=0;i<T.length;i++){if(s.wx.day[i]===0)g+=`<rect x="${x(i).toFixed(1)}" y="${top}" width="${(bw+.05).toFixed(2)}" height="${H-top-14}" fill="var(--night)"/>`}
  for(let v=0;v<=mx;v+=mx>10?4:2)g+=`<line x1="${x0}" x2="${W-4}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width=".6"/><text x="${x0-4}" y="${y(v)+3.5}" font-size="10" text-anchor="end" fill="var(--muted)">${v}</text>`;
  for(let i=0;i<T.length;i+=24){const p=tparts(T[i]);g+=`<text x="${x(i)+3}" y="13" font-size="10" fill="var(--muted)">${DOW[p.dow]} ${p.d}</text>`}
  s.hr.forEach((h,i)=>{if(h.face>0.05)g+=`<rect x="${x(i).toFixed(1)}" y="${y(h.face).toFixed(1)}" width="${(bw+.05).toFixed(2)}" height="${(base-y(h.face)).toFixed(1)}" fill="${rtCol(h.cls)}"/>`});
  if(s.tide){const t0=124,t1=158,vals=s.tide.filter(v=>v!=null),lo=Math.min(...vals),hi=Math.max(...vals),ty=v=>t1-(v-lo)/(hi-lo||1)*(t1-t0);let d="",pen=false;
    s.tide.forEach((v,i)=>{if(v==null){pen=false;return}d+=(pen?"L":"M")+(x(i)+bw/2).toFixed(1)+" "+ty(v).toFixed(1);pen=true});
    g+=`<path d="${d}" fill="none" stroke="var(--map-ink)" stroke-width="1.3"/><text x="${x0-4}" y="${t0+5}" font-size="9" text-anchor="end" fill="var(--muted)">${hi.toFixed(0)}</text><text x="${x0-4}" y="${t1+2}" font-size="9" text-anchor="end" fill="var(--muted)">${lo.toFixed(0)}</text>`}
  g+=`<line x1="${x(TI)+bw/2}" x2="${x(TI)+bw/2}" y1="18" y2="${H-14}" stroke="var(--ink)" stroke-width="1" opacity=".55"/><circle cx="${x(TI)+bw/2}" cy="${H-14}" r="2.5" fill="var(--ink)"/>`;
  return`<div class="fc" id="fc" data-x0="${x0/W}" data-x1="${(W-4)/W}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Seven-day surf height, rating and tide for ${esc(s.n)}">${g}</svg></div><p class="note" style="font-size:12px;margin-top:6px">Bars: surf height in feet, coloured by rating. Line: tide. Tap to jump to a time.</p>`}
function dayIdx(){const T=DATA.times,out=[];let i=0;while(i<T.length){const d=T[i].slice(0,10),idx=[];for(;i<T.length&&T[i].slice(0,10)===d;i++)idx.push(i);out.push({d,idx})}return out}
const hourOf=k=>+DATA.times[k].slice(11,13);
function rangeText(fs){const mn=Math.min(...fs),mx=Math.max(...fs);if(mx<1)return"Flat";const lo=Math.max(1,Math.round(mn*0.9)),hi=Math.max(lo+1,Math.round(mx*1.1));return`${lo}\u2013${hi} ft`}
function dayCards(s){const T=DATA.times,cur=T[TI].slice(0,10),today=laNow().date,hNow=hourOf(TI);
  return`<div class="dcards" role="group" aria-label="Forecast day">${dayIdx().map(({d,idx})=>{const p=tparts(T[idx[0]]),lit=idx.filter(k=>s.wx.day[k]),use=lit.length?lit:idx;
    const seg=[[5,10,"Morning"],[10,14,"Midday"],[14,19,"Afternoon"]].map(([a,b,nm])=>{const ks=idx.filter(k=>hourOf(k)>=a&&hourOf(k)<b);if(!ks.length)return`<i style="background:var(--line)"></i>`;
      const f=ks.reduce((t,k)=>t+s.hr[k].face,0)/ks.length,r=ks.reduce((t,k)=>t+s.hr[k].rate,0)/ks.length,c=clsOf(f,r);return`<i style="background:${rtCol(c)}" title="${nm}: ${RT[c].n}"></i>`}).join("");
    const go=idx.find(k=>hourOf(k)===hNow)??idx[Math.min(idx.length-1,12)];
    return`<button class="dcard" data-time="${go}" aria-pressed="${d===cur}"><span class="dn">${d===today?"Today":DOW[p.dow]+" "+p.d}</span><span class="dh">${rangeText(use.map(k=>s.hr[k].face))}</span><span class="dseg">${seg}</span></button>`}).join("")}</div>`}
function hourly(s){const T=DATA.times,cur=T[TI].slice(0,10),day=dayIdx().find(x=>x.d===cur),step=S.step,ks=day.idx.filter(k=>hourOf(k)>=5&&hourOf(k)<=20&&(step===1||((hourOf(k)-5)%3===0&&hourOf(k)<20)));
  const head=`<div class="hrow hhead${step===3?" w3":""}"><span>Time</span><span>Surf</span><span>Swell</span><span>Wind</span><span class="num">Tide</span></div>`;
  return`<div class="hours">${head}${ks.map(k=>{const grp=step===1?[k]:day.idx.filter(j=>j>=k&&j<k+3&&hourOf(j)<=20),n=grp.length,mid=grp[Math.min(1,n-1)],hm=s.hr[mid];
    const face=grp.reduce((t,j)=>t+s.hr[j].face,0)/n,rate=grp.reduce((t,j)=>t+s.hr[j].rate,0)/n,cls=clsOf(face,rate),wsv=grp.map(j=>s.wx.ws[j]).filter(v=>v!=null),ws=wsv.length?wsv.reduce((t,v)=>t+v,0)/wsv.length:null,wd=s.wx.wd[mid];
    const h0=hourOf(k),h1=h0+n,label=step===1?h12(h0):`${h0%12||12}–${h1%12||12} ${h1<12?"AM":"PM"}`;
    const tide=step===1?(hm.tide==null?"\u2013":hm.tide.toFixed(1)):(s.hr[k].tide==null?"\u2013":`${s.hr[k].tide.toFixed(1)}\u2192${s.hr[grp[n-1]].tide.toFixed(1)}`);
    return`<button class="hrow${step===3?" w3":""}${grp.includes(TI)?" on":""}${grp.some(j=>s.wx.day[j])?"":" night"}" data-time="${grp.includes(TI)?TI:mid}" title="${RT[cls].n}"><span>${label}</span><span class="hs"><i class="dot" style="background:${rtCol(cls)}"></i>${faceText(face)}</span>
    <span>${hm.dom?`${hm.dom.h.toFixed(1)} ft ${Math.round(hm.dom.p)} s ${comp(hm.dom.d)}`:"\u2013"}</span><span>${ws==null?"\u2013":`${Math.round(ws)} kn ${arrow(wd)}<small>${hm.w.word}</small>`}</span><span class="num">${tide}</span></button>`}).join("")}</div>`}
function dayChart(s){const T=DATA.times,cur=T[TI].slice(0,10),ks=dayIdx().find(x=>x.d===cur).idx,n=ks.length,W=372,H=268,x0=4,bw=(W-8)/n,x=h=>x0+h*bw,xc=h=>x0+(h+0.5)*bw;
  const kj=ks.map(k=>spotKJ(s.hr[k])),mx=Math.max(20,...kj),top=10,base=74;let g="";
  ks.forEach((k,i)=>{if(s.wx.day[k]===0)g+=`<rect x="${x(i).toFixed(1)}" y="2" width="${(bw+.05).toFixed(2)}" height="${H-22}" fill="var(--night)"/>`});
  ks.forEach((k,i)=>{const bh=Math.max(2,kj[i]/mx*(base-top));g+=`<rect x="${(x(i)+1).toFixed(1)}" y="${(base-bh).toFixed(1)}" width="${(bw-2).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="var(--map-ink)" opacity="${k===TI?1:.45}"/>`;
    g+=`<rect x="${x(i).toFixed(1)}" y="${base+16}" width="${(bw+.05).toFixed(2)}" height="4" fill="${rtCol(s.hr[k].cls)}"/>`});
  g+=`<text x="${x0}" y="${base+12}" font-size="9.5" fill="var(--muted)">kJ</text>`;
  for(let i=3;i<n;i+=3){const k=ks[i];g+=`<text x="${xc(i)}" y="${base+12}" font-size="10" text-anchor="middle" fill="var(--ink)">${Math.round(kj[i])}</text>`;
    const ws=s.wx.ws[k],wd=s.wx.wd[k];if(ws!=null)g+=`<g transform="translate(${xc(i)},110) rotate(${Math.round(wd+180)})"><path d="M0 -5.5 L3.8 4 L0 2 L-3.8 4 Z" fill="var(--ink)"/></g><text x="${xc(i)}" y="130" font-size="12" font-weight="600" text-anchor="middle" fill="var(--ink)">${Math.round(ws)}</text><text x="${xc(i)}" y="143" font-size="10" text-anchor="middle" fill="var(--muted)">${Math.round(s.wx.wg[k]||ws)}</text>`;
    g+=`<text x="${xc(i)}" y="${H-6}" font-size="10" text-anchor="middle" fill="var(--muted)">${h12(hourOf(k)).replace(" ","").toLowerCase()}</text>`}
  const wm=Math.max(15,...ks.map(k=>s.wx.wg[k]||0));let wa=`M${x(0)} 150`;ks.forEach((k,i)=>{wa+=`L${xc(i).toFixed(1)} ${(150-(s.wx.ws[k]||0)/wm*46).toFixed(1)}`});wa+=`L${x(n)} 150Z`;
  g=`<path d="${wa}" fill="var(--map-ink)" opacity=".13"/>`+g+`<text x="${x0}" y="100" font-size="9.5" fill="var(--muted)">Wind, kn (gust below)</text>`;
  if(s.tide){const vals=ks.map(k=>s.tide[k]).filter(v=>v!=null),ex=s.hilo.filter(e=>e.t.slice(0,10)===cur),lo=Math.min(...vals,...ex.map(e=>e.v)),hi=Math.max(...vals,...ex.map(e=>e.v)),t0=192,t1=232,ty=v=>t1-(v-lo)/(hi-lo||1)*(t1-t0);
    let d="",pen=false;ks.forEach((k,i)=>{const v=s.tide[k];if(v==null){pen=false;return}d+=(pen?"L":"M")+x(i).toFixed(1)+" "+ty(v).toFixed(1);pen=true});
    g+=`<text x="${x0}" y="166" font-size="9.5" fill="var(--muted)">Tide, ft</text><path d="${d}" fill="none" stroke="var(--map-ink)" stroke-width="1.6"/>`;
    for(const e of ex){const hh=+e.t.slice(11,13)+(+e.t.slice(14,16))/60,px=clamp(x(hh),26,W-26),py=ty(e.v);
      g+=`<line x1="${x(hh).toFixed(1)}" x2="${x(hh).toFixed(1)}" y1="${py.toFixed(1)}" y2="${t1+6}" stroke="var(--map-ink)" stroke-width=".8" opacity=".6"/><text x="${px.toFixed(1)}" y="${(py-15).toFixed(1)}" font-size="10" font-weight="600" text-anchor="middle" fill="var(--ink)">${e.t.slice(11,16)}</text><text x="${px.toFixed(1)}" y="${(py-4).toFixed(1)}" font-size="10" text-anchor="middle" fill="var(--muted)">${e.v.toFixed(1)} ft</text>`}}
  const ci=ks.indexOf(TI);if(ci>=0)g=`<rect x="${x(ci).toFixed(1)}" y="2" width="${bw.toFixed(1)}" height="${H-22}" rx="3" fill="var(--ink)" opacity=".09"/>`+g;
  return`<div class="fc" data-chart="1" data-i0="${ks[0]}" data-n="${n}" data-x0="${x0/W}" data-x1="${(W-4)/W}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Hourly wave energy, rating, wind and tide for the selected day">${g}</svg></div>
  <p class="note" style="font-size:12px;margin-top:6px">Bars: wave energy reaching the spot. Colour strip: rating. Tap to jump to an hour.</p>`}
function spectra(s){const h=s.hr[TI],cs=h.cs.map((c,i)=>Object.assign({i,kj:waveKJ(c.h,c.p)},c));if(!cs.length)return`<p class="note">No swell reaching this point.</p>`;
  const R=58,C=75,mx=Math.max(...cs.map(c=>c.kj),1),pt=(deg,r)=>[C+r*Math.sin(deg*Math.PI/180),C-r*Math.cos(deg*Math.PI/180)];let g="";
  for(const [a,b] of s.w){const span=(b-a+360)%360,[x1,y1]=pt(a,R),[x2,y2]=pt(b,R);g+=`<path d="M${C} ${C}L${x1.toFixed(1)} ${y1.toFixed(1)}A${R} ${R} 0 ${span>180?1:0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}Z" fill="var(--map-ink)" opacity=".13"/>`}
  g+=`<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="var(--muted)" stroke-width="1"/><circle cx="${C}" cy="${C}" r="${R*0.6}" fill="none" stroke="var(--line)" stroke-dasharray="2 3"/><circle cx="${C}" cy="${C}" r="${R*0.3}" fill="none" stroke="var(--line)" stroke-dasharray="2 3"/>`;
  for(const [d,l] of [[0,"N"],[90,"E"],[180,"S"],[270,"W"]]){const [tx,ty]=pt(d,R+9);g+=`<text x="${tx.toFixed(1)}" y="${(ty+3.5).toFixed(1)}" font-size="10" text-anchor="middle" fill="var(--muted)">${l}</text>`}
  for(const c of cs.slice().sort((a,b)=>b.kj-a.kj)){const r=Math.max(10,Math.sqrt(c.kj/mx)*R*0.95),[xa,ya]=pt(c.d-9,r),[xb,yb]=pt(c.d+9,r);g+=`<path d="M${C} ${C}L${xa.toFixed(1)} ${ya.toFixed(1)}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${xb.toFixed(1)} ${yb.toFixed(1)}Z" fill="${CCOL[c.i%3]}" opacity="${c.df<0.5?.45:.95}"/>`}
  const ws=s.wx.ws[TI],wd=s.wx.wd[TI];if(ws!=null){const [wx1,wy1]=pt(wd,R+4);g+=`<g transform="translate(${wx1.toFixed(1)},${wy1.toFixed(1)}) rotate(${Math.round(wd+180)})"><path d="M0 -7 L4.5 5 L0 2.5 L-4.5 5 Z" fill="var(--ink)" stroke="var(--panel)" stroke-width="1"/></g>`}
  return`<div class="spec"><div class="slist">${cs.map(c=>`<div class="srow"><svg class="arr" viewBox="-6 -6 12 12" aria-hidden="true"><g transform="rotate(${Math.round(c.d+180)})"><path d="M0 -5 L3.4 3.6 L0 1.8 L-3.4 3.6 Z" fill="${CCOL[c.i%3]}"/></g></svg><b>${c.h.toFixed(1)} ft</b><span>${Math.round(c.p)} s</span><span>${comp(c.d)} ${Math.round(c.d)}°</span><span class="num">${Math.round(c.kj)} kJ</span>
    <small>${c.k} · ${c.face<0.5?(c.p<5?"too short to surf":c.df<0.5?"blocked here":"under 1 ft here"):c.face.toFixed(1)+" ft faces here"}</small></div>`).join("")}</div>
  <svg class="rose" viewBox="0 0 150 150" role="img" aria-label="Compass showing where each swell comes from, the spot's swell window, and the wind">${g}</svg></div>
  <p class="note" style="font-size:12px;margin-top:6px">Wedges point to where each swell comes from, sized by energy. The shaded sector is the swell window this spot accepts. The dark arrow is the wind.</p>`}
function windows(s){const T=DATA.times,out=[];let i=0;
  while(i<T.length){const day=T[i].slice(0,10);let best=null;let j=i;for(;j<T.length&&T[j].slice(0,10)===day;j++){if(j<NOWI||j+2>=T.length||T[j+2].slice(0,10)!==day)continue;if(!(s.wx.day[j]&&s.wx.day[j+2]))continue;
      const r=(s.hr[j].rate+s.hr[j+1].rate+s.hr[j+2].rate)/3;if(!best||r>best.r)best={r,j}}
    if(best)out.push(best);i=j}
  return out.map(b=>{const h=s.hr[b.j+1],p=tparts(T[b.j]);return`<button class="win" data-time="${b.j+1}"><span>${DOW[p.dow]} <span class="m">${h12(p.h)}–${h12(p.h+3)}</span></span>${rlab(h.cls)}<span>${faceText(h.face)}</span></button>`}).join("")}
function detail(s){const h=s.hr[TI];
  if(!s.ok)return`<div class="det"><button class="back" data-back="1">← All spots</button><h2>${esc(s.n)}</h2><p class="note">The wave model has no ocean cell close enough to this spot, so there is nothing to rate.</p></div>`;
  const tide=h.tide,nx=s.tide&&s.tide[Math.min(TI+1,s.tide.length-1)],trend=tide==null||nx==null?"":nx>tide+0.05?"rising":nx<tide-0.05?"falling":"slack";
  const nb=BUOYS.map((b,k)=>({b,d:DATA.buoys[k]})).filter(o=>o.d.ok).sort((a,c)=>dist2(a.b,s)-dist2(c.b,s))[0];
  const sst=s.m.sst[TI];
  return`<div class="det"><button class="back" data-back="1">← All spots</button>
  <div class="dhead"><div><h2>${esc(s.n)}</h2><p class="note">${REG[s.r]} · ${esc(s.t)} · ${fmt(TI)}</p></div><button class="btn favb" data-fav="${s.idx}" aria-pressed="${FAVS.has(s.n)}">${FAVS.has(s.n)?"★ Saved":"☆ Save"}</button></div>
  <div class="hero">${chip(h.cls)}<span class="big">${faceText(h.face)}</span></div>
  <dl class="kv">
   <div><dt>Wind</dt><dd>${h.w.d==null?"n/a":`${Math.round(s.wx.ws[TI])} kn ${arrow(s.wx.wd[TI])} ${comp(s.wx.wd[TI])}<small>${h.w.word}, gusts ${Math.round(s.wx.wg[TI]||0)} kn</small>`}</dd></div>
   <div><dt>Tide · ${esc(s.tideSt)}</dt><dd>${tide==null?"n/a":`${tide.toFixed(1)} ft ${trend}<small>Likes ${s.td} tide</small>`}</dd></div>
   <div><dt>Water</dt><dd>${sst==null?"n/a":`${Math.round(sst*9/5+32)}°F<small>Model sea surface</small>`}</dd></div>
   <div><dt>Nearest buoy</dt><dd>${nb?`${nb.d.hs[nb.d.hs.length-1].toFixed(1)} ft @ ${Math.round(nb.d.tp[nb.d.tp.length-1])} s<small>${esc(nb.b.n)}, ${ageText(nb.d)}</small>`:"n/a"}</dd></div>
  </dl>
  <div><p class="lab" style="margin-bottom:8px">By day</p>${dayCards(s)}</div>
  <div><p class="lab" style="margin-bottom:8px">${fmt(TI).split(" ")[0]} through the day</p>${dayChart(s)}<div class="steprow"><div class="seg2" role="group" aria-label="Table interval"><button data-step="1" aria-pressed="${S.step===1}">Hourly</button><button data-step="3" aria-pressed="${S.step===3}">3-hour</button></div></div>${hourly(s)}</div>
  <div><p class="lab" style="margin-bottom:8px">Swell breakdown · ${fmt(TI)}</p>${spectra(s)}</div>
  <div><p class="lab" style="margin-bottom:8px">Next seven days</p>${fcChart(s)}</div>
  <p class="note">${esc(s.note)} Faces ${comp(s.f)}. Accepts swell from ${s.w.map(([a,b])=>`${comp(a)} to ${comp(b)}`).join(" and ")}; ideal faces ${s.sz[0]}–${s.sz[1]} ft.</p></div>`}
const buoyAge=d=>(Date.now()/1000-d.t[d.t.length-1])/60;
function ageText(d){const m=Math.round(buoyAge(d));return m<90?`${m} min ago`:`${Math.round(m/60)} h ago`}
function buoyView(){return`<p class="note">Live wave buoys, north to south. Harvest and San Nicolas sit outside the islands and see new swell first.</p><div class="rows">${BUOYS.map((b,k)=>{const d=DATA.buoys[k];
  if(!d.ok)return`<button class="brow" data-buoy="${k}"><span class="nm">${esc(b.n)}</span><span class="v">Offline</span><span class="sub">No recent data from this buoy</span></button>`;
  const n=d.hs.length-1,mx=Math.max(...d.hs,1),pts=d.hs.map((v,i)=>`${(i/n*368+2).toFixed(1)},${(24-v/mx*20).toFixed(1)}`).join(" ");
  return`<button class="brow" data-buoy="${k}"><span class="nm">${esc(b.n)}</span><span class="v">${d.hs[n].toFixed(1)} ft @ ${Math.round(d.tp[n])} s</span>
  <span class="sub">Peak direction ${arrow(d.dp[n])} ${comp(d.dp[n])} ${Math.round(d.dp[n])}° · ${d.sst==null?"":`water ${Math.round(d.sst)}°F · `}${ageText(d)}</span>
  <svg viewBox="0 0 372 26" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--muted)" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg></button>`}).join("")}</div>
  <p class="note" style="font-size:12px">Height is significant wave height; the line is the last 24 hours.</p>`}
function howView(){return`<div class="det"><h2>How a spot gets its rating</h2>
  <p class="note" style="color:var(--ink)">Each spot is scored every hour from four things, then multiplied together so a flat ocean can never rate well.</p>
  <dl class="kv" style="grid-template-columns:1fr">
  <div><dt>Surf size</dt><dd><small>Each swell train from the wave model is converted to a breaking-wave height from its height and period, marked down if it is short-period wind chop (under 9 seconds), cut down if its direction falls outside the spot's swell window, and scaled by a local factor for spots that focus or shelter swell. Size scores best inside the spot's ideal range.</small></dd></div>
  <div><dt>Wind</dt><dd><small>Under 4 knots counts as glassy. Above that, offshore wind costs little and onshore wind costs a lot, judged against the direction the beach faces. Onshore wind also sets a ceiling: about 6 knots onshore caps a spot at Fair, 8 knots at Poor to fair, and 10 knots or more at Poor, however big the swell.</small></dd></div>
  <div><dt>Period</dt><dd><small>Longer-period swell scores higher, from 6 seconds (weak) to 14 seconds and up (full marks).</small></dd></div>
  <div><dt>Tide</dt><dd><small>A small penalty when the NOAA tide prediction is outside the tide the spot likes.</small></dd></div></dl>
  <div class="wins">${RT.map((r,c)=>`<div class="win" style="grid-template-columns:130px 1fr">${rlab(c)}<span class="m">${["Faces under 1 ft","Score below 2","2 to 3.5","3.5 to 5","5 to 6.5","6.5 to 8.8","Above 8.8"][c]}</span></div>`).join("")}</div>
  <p class="note">These are model estimates, not surf-cam reports. The wave model's cells are several miles wide, so sandbars, kelp, local shadowing and crowds are invisible to it. Spot windows and gain factors are hand-set starting values and are meant to be tuned against what you see in the water.</p>
  <p class="note">Sources: Open-Meteo marine and weather forecast APIs, Scripps CDIP buoy network, NOAA CO-OPS tide predictions.</p></div>`}
let lastRender=0;
function render(fromPlay){if(!DATA)return;const b=$("body"),keep=b.scrollTop;
  for(const t of ["spots","buoys","how"])$("tab-"+t).setAttribute("aria-selected",S.tab===t);
  b.innerHTML=S.tab==="buoys"?buoyView():S.tab==="how"?howView():S.sel!=null?detail(DATA.spots[S.sel]):listView();
  b.scrollTop=keep;lastRender=Date.now();
  const ch=b.querySelector(".chips"),on=ch&&ch.querySelector('[aria-pressed="true"]');if(on)ch.scrollLeft=Math.max(0,on.offsetLeft-ch.offsetLeft-(ch.clientWidth-on.offsetWidth)/2)}
$("body").addEventListener("click",e=>{const t=e.target.closest("[data-spot],[data-fav],[data-sort],[data-reg],[data-back],[data-time],[data-buoy],[data-step],#refresh,#fc,[data-chart]");if(!t||!DATA)return;
  if(t.dataset.spot!=null){const k=+t.dataset.spot,s=DATA.spots[k];select(k);goTo(s.lo,s.la,11.5)}
  else if(t.dataset.step){S.step=+t.dataset.step;try{localStorage.setItem("swellchart.step",String(S.step))}catch(e){}render()}
  else if(t.dataset.reg){S.region=t.dataset.reg;render();placeMarks();fitFilter()}
  else if(t.dataset.sort){S.sort=t.dataset.sort;try{localStorage.setItem("swellchart.sort",S.sort)}catch(e){}render()}
  else if(t.dataset.fav!=null){const n=DATA.spots[+t.dataset.fav].n;if(FAVS.has(n))FAVS.delete(n);else FAVS.add(n);saveFavs();render();placeMarks()}
  else if(t.dataset.back){select(null)}
  else if(t.dataset.time){setTime(+t.dataset.time)}
  else if(t.dataset.buoy){const b=BUOYS[+t.dataset.buoy];goTo(b.lo,b.la,9.5)}
  else if(t.id==="refresh"){load(true)}
  else if(t.dataset.chart){const r=t.querySelector("svg").getBoundingClientRect(),f=((e.clientX-r.left)/r.width-+t.dataset.x0)/(+t.dataset.x1-+t.dataset.x0);setTime(+t.dataset.i0+Math.floor(clamp(f,0,0.9999)*+t.dataset.n))}
  else if(t.id==="fc"){const r=t.querySelector("svg").getBoundingClientRect(),f=((e.clientX-r.left)/r.width-+t.dataset.x0)/(+t.dataset.x1-+t.dataset.x0);setTime(Math.floor(clamp(f,0,0.9999)*DATA.times.length))}});
lookButtons();syncTheme();legend();if(initMap()){if(!REDUCED)tick();load(false)}
