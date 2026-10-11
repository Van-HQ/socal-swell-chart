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
const K_BREAK=0.8;                       // calibration on the breaker-height estimate
const TIDE_RANGE={low:[-2,2.5],"low-mid":[0,3.5],mid:[1.5,4.5],"mid-high":[2.5,6],high:[4,8]};
function dirFactor(s,dir){let o=180;for(const [a,b] of s.w){const span=(b-a+360)%360,off=(dir-a+360)%360;if(off<=span)return 1;o=Math.min(o,angDiff(dir,a),angDiff(dir,b))}
  return o>=40?0.12:0.12+0.88*(0.5+0.5*Math.cos(Math.PI*o/40))}
// Komar-Gaughan breaker height from deep-water height (ft) and period (s)
function breaker(hft,T){if(!(hft>0)||!(T>=5))return 0;const H=hft*0.3048;return 0.39*Math.pow(9.81,0.2)*Math.pow(T*H*H,0.4)/0.3048*K_BREAK}
function comps(s,i){const m=s.m,out=[];
  const add=(k,h,p,d)=>{if(h==null||p==null||d==null||h<0.15)return;const df=dirFactor(s,d);out.push({k,h,p,d,df,face:breaker(h,p)*df*s.g})};
  add("Primary swell",m.sh[i],m.sp[i],m.sd[i]);add("Secondary swell",m.s2h[i],m.s2p[i],m.s2d[i]);add("Wind waves",m.wwh[i],m.wwp[i],m.wwd[i]);return out}
function windScore(s,ws,wd){if(ws==null||wd==null)return{q:1,word:"No wind data",d:null};
  const d=angDiff(wd,(s.f+180)%360),c=Math.cos(d*Math.PI/180),k=c>=0?14+26*c:14+5*c,q=1-0.9*clamp((ws-4)/k,0,1);
  const word=ws<4?"Light":d<35?"Offshore":d<70?"Cross-offshore":d<110?"Cross-shore":d<145?"Cross-onshore":"Onshore";return{q,word,d}}
function tideScore(td,ft){const r=TIDE_RANGE[td];if(!r||ft==null)return 1;const o=ft<r[0]?r[0]-ft:ft>r[1]?ft-r[1]:0;return 1-Math.min(0.3,0.1*o)}
function sizeScore(f,lo,hi){if(f<1)return 0;if(f<lo)return 0.2+0.4*(f-1)/Math.max(0.5,lo-1);if(f<=hi)return 0.6+0.4*(f-lo)/(hi-lo);return Math.max(0.45,1-0.55*(f-hi)/hi)}
function rateHour(s,i){const cs=comps(s,i);let e=0,dom=null;for(const c of cs){e+=c.face*c.face;if(!dom||c.face>dom.face)dom=c}
  const face=Math.sqrt(e),w=windScore(s,s.wx.ws[i],s.wx.wd[i]),tide=s.tide?s.tide[i]:null;
  const per=dom?clamp((dom.p-6)/8,0,1)*0.8+0.2:0.2;
  const rate=10*sizeScore(face,s.sz[0],s.sz[1])*(0.25+0.75*w.q)*(0.55+0.45*per)*tideScore(s.td,tide);
  const cls=face<1?0:rate<2?1:rate<3.5?2:rate<5?3:rate<6.5?4:rate<8.8?5:6;
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
const CACHE_KEY="swellchart.v1",CACHE_MIN=60;
async function getJSON(u){const r=await fetch(u);if(!r.ok)throw new Error(`${r.status} from ${new URL(u).host}`);return r.json()}
async function openMeteo(base,pts,vars,extra){const out=[];
  for(let k=0;k<pts.length;k+=80){const p=pts.slice(k,k+80);
    const u=`${base}?latitude=${p.map(x=>x.la.toFixed(3)).join(",")}&longitude=${p.map(x=>x.lo.toFixed(3)).join(",")}&hourly=${vars}&forecast_days=7&timezone=${encodeURIComponent(TZ)}${extra}`;
    const j=await getJSON(u);out.push(...(Array.isArray(j)?j:[j]))}
  return out}
const r1=a=>a.map(v=>v==null?null:Math.round(v*10)/10);
async function loadForecast(){
  const MAR="https://marine-api.open-meteo.com/v1/marine",WX="https://api.open-meteo.com/v1/forecast";
  const sp=SPOTS.concat([REF]);
  const [sm,sw,gm,gw]=await Promise.all([
    openMeteo(MAR,sp,"wave_height,swell_wave_height,swell_wave_direction,swell_wave_period,secondary_swell_wave_height,secondary_swell_wave_period,secondary_swell_wave_direction,wind_wave_height,wind_wave_direction,wind_wave_period,sea_surface_temperature","&length_unit=imperial&cell_selection=sea"),
    openMeteo(WX,SPOTS,"wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day","&wind_speed_unit=kn"),
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
  const m={};for(const p of j.predictions||[])m[p.t.replace(" ","T")]=+p.v;out[st.id]=m}catch(e){out[st.id]=null}}));return out}
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
  const T=fc.times.length,spots=SPOTS.map((s,k)=>{const o=Object.assign({},s,{idx:k,m:fc.m[k],wx:fc.wx[k]});
    const st=TIDES.slice().sort((a,b)=>dist2(a,s)-dist2(b,s))[0],tm=tides&&tides[st.id];
    o.tideSt=st.n;o.tide=tm?fc.times.map(t=>tm[t]==null?null:tm[t]):null;
    o.ok=o.m.sh.some(v=>v!=null);o.hr=fc.times.map((_,i)=>rateHour(o,i));return o});
  const F={H:[],P:[],U:[],V:[],WS:[],WU:[],WV:[]},rad=Math.PI/180;
  for(let t=0;t<T;t++){
    F.H.push(fillGrid(fc.gm.map(g=>g.h[t])));F.P.push(fillGrid(fc.gm.map(g=>g.p[t])));
    F.U.push(fillGrid(fc.gm.map(g=>g.d[t]==null?null:-Math.sin(g.d[t]*rad))));F.V.push(fillGrid(fc.gm.map(g=>g.d[t]==null?null:-Math.cos(g.d[t]*rad))));
    F.WS.push(fillGrid(fc.gw.map(g=>g.s[t])));
    F.WU.push(fillGrid(fc.gw.map(g=>g.d[t]==null?null:-Math.sin(g.d[t]*rad))));F.WV.push(fillGrid(fc.gw.map(g=>g.d[t]==null?null:-Math.cos(g.d[t]*rad))))}
  return{at:fc.at,times:fc.times,spots,F,ref:fc.m[SPOTS.length],buoys:buoys||BUOYS.map(()=>({ok:false})),tidesOk:!!tides&&Object.values(tides).some(Boolean)}}
async function load(force){
  $("msg").hidden=false;$("msg").innerHTML="<b>Loading the forecast</b>Pulling swell, wind, tide and buoy data.";
  try{
    let fc=null;
    if(!force)try{const c=JSON.parse(localStorage.getItem(CACHE_KEY)||"null");if(c&&Date.now()-c.at<CACHE_MIN*6e4&&c.times&&c.times[0].slice(0,10)===laNow().date)fc=c}catch(e){}
    const fresh=!fc;
    const [f2,tides,buoys]=await Promise.all([fc||loadForecast(),loadTides(laNow().date),loadBuoys()]);
    if(fresh)try{localStorage.setItem(CACHE_KEY,JSON.stringify(f2))}catch(e){}
    DATA=build(f2,tides,buoys);
    NOWI=Math.max(0,DATA.times.indexOf(laNow().key));TI=NOWI;$("t").max=DATA.times.length-1;$("t").value=TI;
    $("msg").hidden=true;buildDays();makeMarks();setTime(TI);redraw();
  }catch(e){
    $("msg").innerHTML=`<b>Could not load the forecast</b>${esc(e.message||e)}. This page needs a network connection to Open-Meteo. <br><button id="retry">Try again</button>`;
    $("retry").onclick=()=>load(true)}}

/* ---------- map ---------- */
const KX=Math.cos(33.6*Math.PI/180);
const FIT={lon:[-121.05,-116.9],lat:[32.3,34.8]};
const V={cx:0,cy:0,z:100,W:0,H:0,dpr:1};
let LAYER="swell";
const mapEl=$("map"),cF=$("cField"),cP=$("cPart"),cL=$("cLand");
const X=lon=>V.W/2+(lon-V.cx)*KX*V.z,Y=lat=>V.H/2-(lat-V.cy)*V.z;
const LON=x=>V.cx+(x-V.W/2)/(KX*V.z),LAT=y=>V.cy-(y-V.H/2)/V.z;
function fit(){V.cx=(FIT.lon[0]+FIT.lon[1])/2;V.cy=(FIT.lat[0]+FIT.lat[1])/2;V.z=Math.min(V.W/((FIT.lon[1]-FIT.lon[0])*KX),V.H/(FIT.lat[1]-FIT.lat[0]))}
function clampView(){V.z=clamp(V.z,Math.min(V.W/(6.2*KX),V.H/3.6),2600);V.cx=clamp(V.cx,-121.6,-116.6);V.cy=clamp(V.cy,31.9,35.0)}
function sample(arr,lon,lat){const gx=clamp((lon-G.lon0)/G.d,0,G.nx-1.001),gy=clamp((lat-G.lat0)/G.d,0,G.ny-1.001),x0=gx|0,y0=gy|0,fx=gx-x0,fy=gy-y0,i=y0*G.nx+x0;
  return(arr[i]*(1-fx)+arr[i+1]*fx)*(1-fy)+(arr[i+G.nx]*(1-fx)+arr[i+G.nx+1]*fx)*fy}
const RAMP={
  swell:{u:"ft",t:"Primary swell height",ticks:[0,2,4,6,8,12],max:12,
    l:[[0,[238,246,246]],[1,[213,236,238]],[2,[166,216,222]],[3,[108,189,208]],[4,[61,156,196]],[6,[61,111,181]],[8,[90,74,166]],[10,[140,63,156]],[12,[194,64,127]]],
    d:[[0,[11,27,37]],[1,[14,48,62]],[2,[17,74,90]],[3,[20,110,126]],[4,[30,146,160]],[6,[58,160,214]],[8,[107,132,224]],[10,[164,104,214]],[12,[224,95,168]]]},
  period:{u:"s",t:"Primary swell period",ticks:[6,9,12,15,18,21],min:6,max:21,
    l:[[6,[240,244,232]],[9,[207,227,176]],[12,[143,207,154]],[15,[63,174,158]],[18,[42,127,176]],[21,[74,74,166]]],
    d:[[6,[11,27,37]],[9,[30,64,44]],[12,[36,112,82]],[15,[32,150,150]],[18,[58,140,214]],[21,[150,110,224]]]},
  wind:{u:"kn",t:"Wind speed",ticks:[0,5,10,15,20,30],max:30,
    l:[[0,[244,246,240]],[5,[220,235,208]],[10,[241,221,140]],[15,[240,176,96]],[20,[227,122,74]],[30,[184,64,90]]],
    d:[[0,[11,27,37]],[5,[22,62,58]],[10,[88,104,36]],[15,[154,106,30]],[20,[184,80,42]],[30,[196,58,96]]]}};
const isDark=()=>{const t=document.documentElement.dataset.theme;return t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches};
function rampCol(stops,v){if(v<=stops[0][0])return stops[0][1];for(let i=1;i<stops.length;i++)if(v<=stops[i][0]){const a=stops[i-1],b=stops[i],t=(v-a[0])/(b[0]-a[0]);return[lerp(a[1][0],b[1][0],t),lerp(a[1][1],b[1][1],t),lerp(a[1][2],b[1][2],t)]}return stops[stops.length-1][1]}
const layerArr=()=>LAYER==="swell"?DATA.F.H[TI]:LAYER==="period"?DATA.F.P[TI]:DATA.F.WS[TI];
function drawField(){const w=Math.max(2,Math.round(V.W/5)),h=Math.max(2,Math.round(V.H/5));cF.width=w;cF.height=h;const ctx=cF.getContext("2d");if(!DATA)return;
  const img=ctx.createImageData(w,h),st=RAMP[LAYER][isDark()?"d":"l"],arr=layerArr();let k=0;
  for(let y=0;y<h;y++){const lat=LAT((y+0.5)*5);for(let x=0;x<w;x++){const c=rampCol(st,sample(arr,LON((x+0.5)*5),lat));img.data[k++]=c[0];img.data[k++]=c[1];img.data[k++]=c[2];img.data[k++]=255}}
  ctx.putImageData(img,0,0)}
const WATER=[["Santa Barbara Channel",34.2,-119.95],["Santa Monica Bay",33.9,-118.72],["San Pedro Channel",33.5,-118.33],["Gulf of Santa Catalina",33.08,-117.9],["Outer Santa Barbara Passage",33.02,-118.95],["PACIFIC  OCEAN",32.62,-120.2]];
const PLACES=[["Pt Conception",34.52,-120.4,1],["Santa Barbara",34.5,-119.7],["Ventura",34.35,-119.2],["Los Angeles",34.08,-118.22],["Long Beach",33.84,-118.12],["Oceanside",33.24,-117.28],["San Diego",32.78,-117.08],["Tijuana",32.47,-116.98],
  ["Santa Cruz I.",34.02,-119.77,2],["Santa Rosa I.",33.96,-120.1,2],["Catalina",33.39,-118.42,2],["San Clemente I.",32.9,-118.5,2],["San Nicolas I.",33.25,-119.5,2]];
function drawLand(){cL.width=V.W*V.dpr;cL.height=V.H*V.dpr;const c=cL.getContext("2d");c.scale(V.dpr,V.dpr);
  const grat=css("--grat"),ink=css("--map-ink");
  c.strokeStyle=grat;c.lineWidth=0.6;c.fillStyle=ink;c.font=`500 11px ${css("--f-cond")}`;c.globalAlpha=0.55;
  const step=V.z>420?0.25:0.5;
  for(let lo=Math.ceil(LON(0)/step)*step;lo<LON(V.W);lo+=step){const x=X(lo);c.beginPath();c.moveTo(x,0);c.lineTo(x,V.H);c.stroke()}
  for(let la=Math.ceil(LAT(V.H)/step)*step;la<LAT(0);la+=step){const y=Y(la);c.beginPath();c.moveTo(0,y);c.lineTo(V.W,y);c.stroke()}
  c.globalAlpha=1;
  const p=new Path2D();for(const r of LANDR){r.forEach(([x,y],i)=>i?p.lineTo(X(x),Y(y)):p.moveTo(X(x),Y(y)));p.closePath()}
  c.fillStyle=css("--land");c.fill(p);c.strokeStyle=css("--land-edge");c.lineWidth=1.1;c.lineJoin="round";c.stroke(p);
  c.textAlign="center";c.fillStyle=ink;c.globalAlpha=0.8;
  const fs=clamp(V.z/11,11,17);c.font=`italic 400 ${fs}px ${css("--f-water")}`;
  for(const [n,la,lo] of WATER)if(V.W>520||n.length<17)c.fillText(n,X(lo),Y(la));
  c.globalAlpha=0.9;
  for(const [n,la,lo,kind] of PLACES){if(kind===2&&V.z<150)continue;c.font=`600 ${kind?10.5:12}px ${css("--f-cond")}`;c.fillStyle=kind===2?css("--land-edge"):ink;
    c.fillText(n.toUpperCase(),X(lo),Y(la))}
  c.globalAlpha=0.7;c.fillStyle=ink;c.font=`500 10.5px ${css("--f-cond")}`;c.textAlign="left";
  for(let la=Math.ceil(LAT(V.H)/0.5)*0.5;la<LAT(0);la+=0.5){const y=Y(la);if(y>70&&y<V.H-70)c.fillText(`${Math.floor(la)}°${la%1?"30":"00"}′N`,4,y-3)}
  c.globalAlpha=1}
/* particles: swell drawn as short crests marching along the swell direction, wind as streaks */
let PART=[],raf=0;const REDUCED=matchMedia("(prefers-reduced-motion: reduce)").matches;
function spawn(p){for(let k=0;k<6;k++){p.lo=LON(Math.random()*V.W);p.la=LAT(Math.random()*V.H);if(!isLand(p.lo,p.la))break}p.age=0;p.life=70+Math.random()*120;return p}
function resetParticles(){cP.width=V.W*V.dpr;cP.height=V.H*V.dpr;const n=clamp(Math.round(V.W*V.H/900),250,1400);PART=Array.from({length:n},()=>{const p=spawn({});p.age=Math.random()*p.life;return p})}
function tick(){raf=requestAnimationFrame(tick);if(!DATA||document.hidden)return;const c=cP.getContext("2d");c.setTransform(V.dpr,0,0,V.dpr,0,0);
  c.globalCompositeOperation="destination-out";c.fillStyle=LAYER==="wind"?"rgba(0,0,0,.09)":"rgba(0,0,0,.3)";c.fillRect(0,0,V.W,V.H);c.globalCompositeOperation="source-over";
  const wind=LAYER==="wind",F=DATA.F,U=wind?F.WU[TI]:F.U[TI],Vv=wind?F.WV[TI]:F.V[TI],M=wind?F.WS[TI]:F.H[TI],P=F.P[TI],rgb=css("--particle");
  c.lineCap="round";
  for(const p of PART){if(++p.age>p.life){spawn(p);continue}
    let u=sample(U,p.lo,p.la),v=sample(Vv,p.lo,p.la);const n=Math.hypot(u,v)||1;u/=n;v/=n;const m=sample(M,p.lo,p.la);
    const x0=X(p.lo),y0=Y(p.la),sp=wind?0.25+m*0.07:0.3+sample(P,p.lo,p.la)*0.04;
    const x1=x0+u*sp,y1=y0-v*sp;p.lo=LON(x1);p.la=LAT(y1);
    if(x1<-5||y1<-5||x1>V.W+5||y1>V.H+5){spawn(p);continue}
    const env=Math.sin(Math.PI*p.age/p.life),a=env*(wind?clamp(m/14,0.2,0.85):clamp(m/4.5,0.18,0.85));
    c.strokeStyle=`rgba(${rgb},${a.toFixed(3)})`;c.beginPath();
    if(wind){c.lineWidth=1.1;c.moveTo(x0,y0);c.lineTo(x1,y1)}
    else{const L=clamp(3.5+m*1.5,4,13);c.lineWidth=1.5;c.moveTo(x1+v*L,y1+u*L);c.lineTo(x1-v*L,y1-u*L)}
    c.stroke()}}
function drawStatic(){const c=cP.getContext("2d");c.setTransform(V.dpr,0,0,V.dpr,0,0);c.clearRect(0,0,V.W,V.H);if(!DATA)return;const wind=LAYER==="wind",F=DATA.F,rgb=css("--particle");
  c.strokeStyle=c.fillStyle=`rgba(${rgb},.6)`;c.lineWidth=1.2;
  for(let y=30;y<V.H;y+=46)for(let x=30;x<V.W;x+=46){const lo=LON(x),la=LAT(y);if(isLand(lo,la))continue;const u=sample(wind?F.WU[TI]:F.U[TI],lo,la),v=sample(wind?F.WV[TI]:F.V[TI],lo,la),n=Math.hypot(u,v)||1,ux=u/n,uy=-v/n;
    c.beginPath();c.moveTo(x-ux*9,y-uy*9);c.lineTo(x+ux*9,y+uy*9);c.stroke();c.beginPath();c.moveTo(x+ux*11,y+uy*11);c.lineTo(x+ux*5-uy*4,y+uy*5+ux*4);c.lineTo(x+ux*5+uy*4,y+uy*5-ux*4);c.fill()}}
let MK=[];
function makeMarks(){const box=$("marks");box.innerHTML="";MK=[];
  DATA.spots.forEach((s,k)=>{const b=document.createElement("button");b.className="mk spot";b.innerHTML=`<i></i><span>${esc(s.n)}</span>`;b.setAttribute("aria-label",s.n);b.onclick=()=>select(k);box.appendChild(b);MK.push({el:b,la:s.la,lo:s.lo,spot:k})});
  BUOYS.forEach((b,k)=>{const d=DATA.buoys[k],e=document.createElement("button");e.className="mk buoy"+(d.ok&&buoyAge(d)<180?"":" stale");
    e.innerHTML=`<i></i><span>${esc(b.n)}${d.ok?` · ${d.hs[d.hs.length-1].toFixed(1)} ft @ ${Math.round(d.tp[d.tp.length-1])} s`:" · offline"}</span>`;e.setAttribute("aria-label","Buoy "+b.n);
    e.onclick=()=>{S.tab="buoys";S.sel=null;render()};box.appendChild(e);MK.push({el:e,la:b.la,lo:b.lo})})}
function placeMarks(){for(const m of MK)m.el.style.transform=`translate(${X(m.lo).toFixed(1)}px,${Y(m.la).toFixed(1)}px)`;$("marks").classList.toggle("zoomed",V.z>330)}
function colorMarks(){if(!DATA)return;for(const m of MK)if(m.spot!=null){const s=DATA.spots[m.spot];m.el.firstChild.style.background=s.ok?rtCol(s.hr[TI].cls):"var(--muted)";m.el.classList.toggle("sel",S.sel===m.spot)}}
function legend(){const R=RAMP[LAYER],st=R[isDark()?"d":"l"],lo=R.min||0,g=st.map(([v,c])=>`rgb(${c.map(Math.round).join(",")}) ${((v-lo)/(R.max-lo)*100).toFixed(0)}%`).join(",");
  $("legend").innerHTML=`<b>${R.t} (${R.u})</b><div class="bar" style="background:linear-gradient(90deg,${g})"></div><div class="tk">${R.ticks.map(t=>`<span>${t}${t===R.max?"+":""}</span>`).join("")}</div><div class="probe" id="probe">Hover the water for a reading</div>`}
let pend=false;
function redraw(){if(pend)return;pend=true;requestAnimationFrame(()=>{pend=false;drawField();drawLand();placeMarks();colorMarks();if(REDUCED)drawStatic()})}
function viewChanged(){clampView();cP.getContext("2d").clearRect(0,0,cP.width,cP.height);redraw()}
function resize(){const r=mapEl.getBoundingClientRect();if(!r.width)return;const first=!V.W;V.W=r.width;V.H=r.height;V.dpr=Math.min(2,window.devicePixelRatio||1);if(first)fit();clampView();resetParticles();redraw()}
new ResizeObserver(resize).observe(mapEl);
function zoomAt(f,x,y){const lo=LON(x),la=LAT(y);V.z*=f;clampView();V.cx=lo-(x-V.W/2)/(KX*V.z);V.cy=la+(y-V.H/2)/V.z;viewChanged()}
const PT=new Map();let pinch=0,moved=0;
mapEl.addEventListener("pointerdown",e=>{if(e.target.closest("button,.legend,.brand"))return;mapEl.setPointerCapture(e.pointerId);PT.set(e.pointerId,[e.clientX,e.clientY]);moved=0;mapEl.classList.add("drag");
  if(PT.size===2){const a=[...PT.values()];pinch=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1])}});
mapEl.addEventListener("pointermove",e=>{const r=mapEl.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  if(PT.has(e.pointerId)){const p=PT.get(e.pointerId),dx=e.clientX-p[0],dy=e.clientY-p[1];PT.set(e.pointerId,[e.clientX,e.clientY]);moved+=Math.abs(dx)+Math.abs(dy);
    if(PT.size===1){V.cx-=dx/(KX*V.z);V.cy+=dy/V.z;viewChanged()}
    else if(PT.size===2){const a=[...PT.values()],d=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]);if(pinch)zoomAt(d/pinch,(a[0][0]+a[1][0])/2-r.left,(a[0][1]+a[1][1])/2-r.top);pinch=d}}
  else probe(x,y)});
const up=e=>{PT.delete(e.pointerId);if(PT.size<2)pinch=0;if(!PT.size)mapEl.classList.remove("drag")};
mapEl.addEventListener("pointerup",up);mapEl.addEventListener("pointercancel",up);
mapEl.addEventListener("wheel",e=>{e.preventDefault();const r=mapEl.getBoundingClientRect();zoomAt(Math.exp(-e.deltaY*0.0016),e.clientX-r.left,e.clientY-r.top)},{passive:false});
$("zin").onclick=()=>zoomAt(1.5,V.W/2,V.H/2);$("zout").onclick=()=>zoomAt(1/1.5,V.W/2,V.H/2);$("zfit").onclick=()=>{fit();viewChanged()};
function probe(x,y){const el=$("probe");if(!el||!DATA)return;const lo=LON(x),la=LAT(y);if(isLand(lo,la)){el.textContent="Hover the water for a reading";return}
  const F=DATA.F,pos=`${la.toFixed(2)}°N ${(-lo).toFixed(2)}°W`;
  if(LAYER==="wind"){const d=(Math.atan2(-sample(F.WU[TI],lo,la),-sample(F.WV[TI],lo,la))*180/Math.PI+360)%360;el.textContent=`${pos} · ${sample(F.WS[TI],lo,la).toFixed(0)} kn from ${comp(d)}`}
  else{const d=(Math.atan2(-sample(F.U[TI],lo,la),-sample(F.V[TI],lo,la))*180/Math.PI+360)%360;el.textContent=`${pos} · ${sample(F.H[TI],lo,la).toFixed(1)} ft @ ${sample(F.P[TI],lo,la).toFixed(0)} s from ${comp(d)} ${Math.round(d)}°`}}
for(const l of ["swell","period","wind"])$("lyr-"+l).onclick=()=>{LAYER=l;for(const m of ["swell","period","wind"])$("lyr-"+m).setAttribute("aria-pressed",m===l);legend();cP.getContext("2d").clearRect(0,0,cP.width,cP.height);redraw()};
matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>{legend();redraw()});
new MutationObserver(()=>{legend();redraw()}).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});

/* ---------- time ---------- */
function buildDays(){const T=DATA.times;let h="",i=0;while(i<T.length){const p=tparts(T[i]);let n=0;while(i+n<T.length&&T[i+n].slice(0,10)===T[i].slice(0,10))n++;h+=`<span style="flex:${n}">${DOW[p.dow]}<i> ${p.d}</i></span>`;i+=n}$("days").innerHTML=h}
function fmt(i,long){const p=tparts(DATA.times[i]);return long?`${DOWL[p.dow]}, ${MON[p.m-1]} ${p.d} · ${h12(p.h)}`:`${DOW[p.dow]} ${h12(p.h)}`}
function setTime(i,fromPlay){TI=clamp(i,0,DATA.times.length-1);$("t").value=TI;$("when").textContent=fmt(TI,true);
  const d=TI-NOWI;$("whensub").textContent=d===0?"Current hour":d>0?`${d} h ahead`:`${-d} h ago`;
  redraw();render(fromPlay)}
$("t").addEventListener("input",e=>{if(DATA)setTime(+e.target.value)});
$("now").onclick=()=>{if(DATA)setTime(NOWI)};
let playT=0;
$("play").onclick=()=>{if(!DATA)return;const on=!playT;$("play").setAttribute("aria-pressed",on);$("play").textContent=on?"Pause":"Play";
  if(on)playT=setInterval(()=>setTime(TI>=DATA.times.length-1?NOWI:TI+1,true),380);else{clearInterval(playT);playT=0}};

/* ---------- panel ---------- */
const S={tab:"spots",sel:null,region:"all"};
const REG={all:"All",sb:"Santa Barbara",vc:"Ventura",la:"Los Angeles",oc:"Orange County",sd:"San Diego"};
function select(k){S.sel=k;S.tab="spots";render();$("body").scrollTop=0;colorMarks();
  if(k!=null&&window.matchMedia("(max-width:860px)").matches)document.querySelector(".panel").scrollIntoView({behavior:REDUCED?"auto":"smooth"})}
for(const t of ["spots","buoys","how"])$("tab-"+t).onclick=()=>{S.tab=t;S.sel=null;render();colorMarks()};
function swellLine(c){return c?`${c.h.toFixed(1)} ft @ ${Math.round(c.p)} s ${arrow(c.d)} ${comp(c.d)} ${Math.round(c.d)}°`:"No swell"}
function outlook(){const r=DATA.ref,T=DATA.times;if(!r||!r.sh.some(v=>v!=null))return"";
  const W=372,H=92,x=i=>26+i*(W-32)/(T.length-1),mx=Math.max(4,...r.sh.map(v=>v||0),...r.s2h.map(v=>v||0)),y=v=>H-22-(v/mx)*(H-34);
  const path=a=>{let d="",pen=false;a.forEach((v,i)=>{if(v==null){pen=false;return}d+=(pen?"L":"M")+x(i).toFixed(1)+" "+y(v).toFixed(1);pen=true});return d};
  let pk=TI;for(let i=TI;i<T.length;i++)if((r.sh[i]||0)>(r.sh[pk]||0))pk=i;
  let days="";for(let i=0;i<T.length;i+=24){const p=tparts(T[i]);days+=`<line x1="${x(i)}" y1="6" x2="${x(i)}" y2="${H-22}" stroke="var(--line)"/><text x="${x(i)+3}" y="${H-10}" font-size="10" fill="var(--muted)">${DOW[p.dow]}</text>`;
    const n=Math.min(i+12,T.length-1);if(r.sd[n]!=null)days+=`<text x="${x(n)}" y="${H}" font-size="9.5" text-anchor="middle" fill="var(--ink)">${comp(r.sd[n])}</text>`}
  const now=`Outer waters, ${fmt(TI)}: ${r.sh[TI]!=null?`${r.sh[TI].toFixed(1)} ft at ${Math.round(r.sp[TI])} s from ${comp(r.sd[TI])} ${Math.round(r.sd[TI])}°`:"no data"}.`;
  const peak=pk>TI+2?` Builds to ${r.sh[pk].toFixed(1)} ft at ${Math.round(r.sp[pk])} s from ${comp(r.sd[pk])} by ${fmt(pk)}.`:` Nothing bigger follows in this forecast.`;
  return`<div class="outlook"><p class="lab">Incoming swell</p><p>${now}${peak}</p>
  <svg viewBox="0 0 ${W} ${H+2}" role="img" aria-label="Seven-day primary and secondary swell height in outer waters">${days}
  <text x="2" y="${y(mx)+4}" font-size="10" fill="var(--muted)">${Math.round(mx)} ft</text>
  <path d="${path(r.s2h)}" fill="none" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="3 3"/><path d="${path(r.sh)}" fill="none" stroke="var(--ink)" stroke-width="1.8"/>
  <line x1="${x(TI)}" y1="4" x2="${x(TI)}" y2="${H-22}" stroke="var(--accent)" stroke-width="1.5"/></svg>
  <p class="note" style="font-size:12px">Solid line is the primary swell, dashed the secondary. Letters show where the primary swell comes from each midday.</p></div>`}
function strip(s){const a=[];for(let k=0;k<24;k++){const i=Math.min(TI+k,DATA.times.length-1),c=rtCol(s.hr[i].cls);a.push(`${c} ${(k/24*100).toFixed(1)}% ${((k+1)/24*100).toFixed(1)}%`)}return`linear-gradient(90deg,${a.join(",")})`}
function listView(){const rows=DATA.spots.filter(s=>S.region==="all"||s.r===S.region).slice().sort((a,b)=>b.hr[TI].rate-a.hr[TI].rate);
  return outlook()+`<div class="chips" role="group" aria-label="Region">${Object.entries(REG).map(([k,n])=>`<button data-reg="${k}" aria-pressed="${S.region===k}">${n}</button>`).join("")}</div>
  <div><p class="lab">Ranked for ${fmt(TI)} · colour bar shows the next 24 h</p><div class="rows" style="margin-top:8px">${rows.map(s=>{const h=s.hr[TI];
    if(!s.ok)return`<button class="row" data-spot="${s.idx}"><span class="rt" style="background:var(--line)">No data</span><span class="nm">${esc(s.n)}</span><span class="ft"></span><span class="sub">No wave model cell near this spot</span></button>`;
    return`<button class="row" data-spot="${s.idx}"><span class="rt${RT[h.cls].dk?" dk":""}" style="background:${rtCol(h.cls)}">${RT[h.cls].n}</span><span class="nm">${esc(s.n)}</span><span class="ft">${faceText(h.face)}</span>
    <span class="sub">${h.dom?`${comp(h.dom.d)} ${Math.round(h.dom.p)} s`:"No swell"} · ${h.w.d==null?"wind n/a":`${h.w.word.toLowerCase()} ${Math.round(s.wx.ws[TI])} kn`}</span><span class="strip" style="background:${strip(s)}"></span></button>`}).join("")}</div></div>${foot()}`}
function foot(){const mins=Math.round((Date.now()-DATA.at)/6e4),nb=DATA.buoys.filter(b=>b.ok).length;
  return`<div class="foot">Forecast from Open-Meteo marine and weather models, loaded ${mins<1?"just now":mins+" min ago"}. ${nb} of ${BUOYS.length} Scripps CDIP buoys reporting. ${DATA.tidesOk?"Tides from NOAA CO-OPS.":"NOAA tides did not load, so ratings ignore tide."}<button id="refresh">Refresh</button></div>`}
function fcChart(s){const T=DATA.times,W=372,H=176,x0=24,bw=(W-x0-4)/T.length,x=i=>x0+i*bw,top=18,base=112,mx=Math.max(6,Math.ceil(Math.max(...s.hr.map(h=>h.face)))),y=v=>base-(v/mx)*(base-top);
  let g="";
  for(let i=0;i<T.length;i++){if(s.wx.day[i]===0)g+=`<rect x="${x(i).toFixed(1)}" y="${top}" width="${(bw+.05).toFixed(2)}" height="${H-top-14}" fill="var(--night)"/>`}
  for(let v=0;v<=mx;v+=mx>10?4:2)g+=`<line x1="${x0}" x2="${W-4}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width=".6"/><text x="${x0-4}" y="${y(v)+3.5}" font-size="10" text-anchor="end" fill="var(--muted)">${v}</text>`;
  for(let i=0;i<T.length;i+=24){const p=tparts(T[i]);g+=`<line x1="${x(i)}" x2="${x(i)}" y1="6" y2="${H-14}" stroke="var(--line)"/><text x="${x(i)+3}" y="13" font-size="10.5" font-weight="600" fill="var(--muted)">${DOW[p.dow].toUpperCase()} ${p.d}</text>`}
  s.hr.forEach((h,i)=>{if(h.face>0.05)g+=`<rect x="${x(i).toFixed(1)}" y="${y(h.face).toFixed(1)}" width="${(bw+.05).toFixed(2)}" height="${(base-y(h.face)).toFixed(1)}" fill="${rtCol(h.cls)}"/>`});
  if(s.tide){const t0=124,t1=158,vals=s.tide.filter(v=>v!=null),lo=Math.min(...vals),hi=Math.max(...vals),ty=v=>t1-(v-lo)/(hi-lo||1)*(t1-t0);let d="",pen=false;
    s.tide.forEach((v,i)=>{if(v==null){pen=false;return}d+=(pen?"L":"M")+(x(i)+bw/2).toFixed(1)+" "+ty(v).toFixed(1);pen=true});
    g+=`<path d="${d}" fill="none" stroke="var(--map-ink)" stroke-width="1.3"/><text x="${x0-4}" y="${t0+5}" font-size="9" text-anchor="end" fill="var(--muted)">${hi.toFixed(0)}</text><text x="${x0-4}" y="${t1+2}" font-size="9" text-anchor="end" fill="var(--muted)">${lo.toFixed(0)}</text>`}
  g+=`<line x1="${x(TI)+bw/2}" x2="${x(TI)+bw/2}" y1="6" y2="${H-14}" stroke="var(--accent)" stroke-width="1.5"/>`;
  return`<div class="fc" id="fc" data-x0="${x0/W}" data-x1="${(W-4)/W}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Seven-day surf height, rating and tide for ${esc(s.n)}">${g}</svg></div><p class="note" style="font-size:12px;margin-top:5px">Bars are surf face height in feet, coloured by rating. The line is the tide in feet. Shaded hours are night.</p>`}
function windows(s){const T=DATA.times,out=[];let i=0;
  while(i<T.length){const day=T[i].slice(0,10);let best=null;let j=i;for(;j<T.length&&T[j].slice(0,10)===day;j++){if(j<NOWI||j+2>=T.length||T[j+2].slice(0,10)!==day)continue;if(!(s.wx.day[j]&&s.wx.day[j+2]))continue;
      const r=(s.hr[j].rate+s.hr[j+1].rate+s.hr[j+2].rate)/3;if(!best||r>best.r)best={r,j}}
    if(best)out.push(best);i=j}
  return out.map(b=>{const h=s.hr[b.j+1],p=tparts(T[b.j]);return`<button class="win" data-time="${b.j+1}">${chip(h.cls)}<span><b>${DOW[p.dow]}</b> ${h12(p.h)}–${h12(p.h+3)}</span><span>${faceText(h.face)}</span></button>`}).join("")}
function detail(s){const h=s.hr[TI];
  if(!s.ok)return`<div class="det"><button class="back" data-back="1">← All spots</button><h2>${esc(s.n)}</h2><p class="note">The wave model has no ocean cell close enough to this spot, so there is nothing to rate.</p></div>`;
  const tide=h.tide,nx=s.tide&&s.tide[Math.min(TI+1,s.tide.length-1)],trend=tide==null||nx==null?"":nx>tide+0.05?"rising":nx<tide-0.05?"falling":"slack";
  const nb=BUOYS.map((b,k)=>({b,d:DATA.buoys[k]})).filter(o=>o.d.ok).sort((a,c)=>dist2(a.b,s)-dist2(c.b,s))[0];
  const sst=s.m.sst[TI];
  return`<div class="det"><button class="back" data-back="1">← All spots</button>
  <div><h2>${esc(s.n)}</h2><p class="note">${REG[s.r]} · ${esc(s.t)} · ${fmt(TI)}</p></div>
  <div class="hero">${chip(h.cls)}<span class="big">${faceText(h.face)} <small>${h.face>=1?"FACES":""}</small></span></div>
  <dl class="kv" style="margin:0">
   <div><dt>Wind</dt><dd>${h.w.d==null?"n/a":`${Math.round(s.wx.ws[TI])} kn ${arrow(s.wx.wd[TI])} ${comp(s.wx.wd[TI])}<small>${h.w.word}, gusts ${Math.round(s.wx.wg[TI]||0)} kn</small>`}</dd></div>
   <div><dt>Tide · ${esc(s.tideSt)}</dt><dd>${tide==null?"n/a":`${tide.toFixed(1)} ft ${trend}<small>Likes ${s.td} tide</small>`}</dd></div>
   <div><dt>Water</dt><dd>${sst==null?"n/a":`${Math.round(sst*9/5+32)}°F<small>Model sea surface</small>`}</dd></div>
   <div><dt>Nearest buoy</dt><dd>${nb?`${nb.d.hs[nb.d.hs.length-1].toFixed(1)} ft @ ${Math.round(nb.d.tp[nb.d.tp.length-1])} s<small>${esc(nb.b.n)}, ${ageText(nb.d)}</small>`:"n/a"}</dd></div>
  </dl>
  <div><p class="lab" style="margin-bottom:6px">Swell in the water</p><table><thead><tr><th>Source</th><th>Offshore</th><th>From</th><th class="num">At this spot</th></tr></thead><tbody>
  ${h.cs.length?h.cs.map(c=>`<tr><td>${c.k}</td><td>${c.h.toFixed(1)} ft @ ${Math.round(c.p)} s</td><td>${arrow(c.d)} ${comp(c.d)} ${Math.round(c.d)}°</td><td class="num">${c.face<0.5?(c.p<5?"too short":c.df<0.5?"blocked":"under 1 ft"):c.face.toFixed(1)+" ft"}</td></tr>`).join(""):`<tr><td colspan="4">No swell reaching this point</td></tr>`}</tbody></table></div>
  <div><p class="lab" style="margin-bottom:6px">Seven days · tap to move the clock</p>${fcChart(s)}</div>
  <div><p class="lab">Best daylight window each day</p><div class="wins" style="margin-top:6px">${windows(s)||'<p class="note">No daylight hours left in the forecast.</p>'}</div></div>
  <p class="note">${esc(s.note)} Accepts swell from ${s.w.map(([a,b])=>`${comp(a)} to ${comp(b)}`).join(" and ")}; ideal faces ${s.sz[0]}–${s.sz[1]} ft.</p></div>`}
const buoyAge=d=>(Date.now()/1000-d.t[d.t.length-1])/60;
function ageText(d){const m=Math.round(buoyAge(d));return m<90?`${m} min ago`:`${Math.round(m/60)} h ago`}
function buoyView(){return`<p class="note">Live readings from Scripps CDIP wave buoys. Harvest and San Nicolas sit outside the islands and see new swell first.</p><div class="rows">${BUOYS.map((b,k)=>{const d=DATA.buoys[k];
  if(!d.ok)return`<button class="brow" data-buoy="${k}"><span class="nm">${esc(b.n)}<small>${b.id}</small></span><span class="v">Offline</span><span class="sub">No recent data from this buoy</span></button>`;
  const n=d.hs.length-1,mx=Math.max(...d.hs,1),pts=d.hs.map((v,i)=>`${(i/n*368+2).toFixed(1)},${(24-v/mx*20).toFixed(1)}`).join(" ");
  return`<button class="brow" data-buoy="${k}"><span class="nm">${esc(b.n)}<small>${b.id}</small></span><span class="v">${d.hs[n].toFixed(1)} ft @ ${Math.round(d.tp[n])} s</span>
  <span class="sub">Peak direction ${arrow(d.dp[n])} ${comp(d.dp[n])} ${Math.round(d.dp[n])}° · ${d.sst==null?"":`water ${Math.round(d.sst)}°F · `}${ageText(d)}</span>
  <svg viewBox="0 0 372 26" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg></button>`}).join("")}</div>
  <p class="note" style="font-size:12px">Height is significant wave height; the line is the last 24 hours.</p>`}
function howView(){return`<div class="det"><h2>How a spot gets its rating</h2>
  <p class="note" style="color:var(--ink)">Each spot is scored every hour from four things, then multiplied together so a flat ocean can never rate well.</p>
  <dl class="kv" style="margin:0;grid-template-columns:1fr">
  <div><dt>Surf size</dt><dd><small>Each swell train from the wave model is converted to a breaking-wave height from its height and period, cut down if its direction falls outside the spot's swell window, and scaled by a local factor for spots that focus or shelter swell. Size scores best inside the spot's ideal range.</small></dd></div>
  <div><dt>Wind</dt><dd><small>Under 4 knots counts as glassy. Above that, offshore wind costs little and onshore wind costs a lot, judged against the direction the beach faces.</small></dd></div>
  <div><dt>Period</dt><dd><small>Longer-period swell scores higher, from 6 seconds (weak) to 14 seconds and up (full marks).</small></dd></div>
  <div><dt>Tide</dt><dd><small>A small penalty when the NOAA tide prediction is outside the tide the spot likes.</small></dd></div></dl>
  <div class="wins">${RT.map((r,c)=>`<div class="win" style="grid-template-columns:86px 1fr">${chip(c)}<span>${["Faces under 1 ft","Score below 2","2 to 3.5","3.5 to 5","5 to 6.5","6.5 to 8.8","Above 8.8"][c]}</span></div>`).join("")}</div>
  <p class="note">These are model estimates, not surf-cam reports. The wave model's cells are several miles wide, so sandbars, kelp, local shadowing and crowds are invisible to it. Spot windows and gain factors are hand-set starting values and are meant to be tuned against what you see in the water.</p>
  <p class="note">Sources: Open-Meteo marine and weather forecast APIs, Scripps CDIP buoy network, NOAA CO-OPS tide predictions.</p></div>`}
let lastRender=0;
function render(fromPlay){if(!DATA)return;const b=$("body"),keep=b.scrollTop;
  for(const t of ["spots","buoys","how"])$("tab-"+t).setAttribute("aria-selected",S.tab===t);
  b.innerHTML=S.tab==="buoys"?buoyView():S.tab==="how"?howView():S.sel!=null?detail(DATA.spots[S.sel]):listView();
  b.scrollTop=keep;lastRender=Date.now()}
$("body").addEventListener("click",e=>{const t=e.target.closest("[data-spot],[data-reg],[data-back],[data-time],[data-buoy],#refresh,#fc");if(!t||!DATA)return;
  if(t.dataset.spot!=null){const k=+t.dataset.spot,s=DATA.spots[k];select(k);if(X(s.lo)<20||X(s.lo)>V.W-20||Y(s.la)<60||Y(s.la)>V.H-20){V.cx=s.lo;V.cy=s.la;viewChanged()}}
  else if(t.dataset.reg){S.region=t.dataset.reg;render()}
  else if(t.dataset.back){select(null)}
  else if(t.dataset.time){setTime(+t.dataset.time)}
  else if(t.dataset.buoy){const b=BUOYS[+t.dataset.buoy];V.cx=b.lo;V.cy=b.la;V.z=Math.max(V.z,340);viewChanged()}
  else if(t.id==="refresh"){load(true)}
  else if(t.id==="fc"){const r=t.querySelector("svg").getBoundingClientRect(),f=((e.clientX-r.left)/r.width-+t.dataset.x0)/(+t.dataset.x1-+t.dataset.x0);setTime(Math.floor(clamp(f,0,0.9999)*DATA.times.length))}});
legend();if(!REDUCED)tick();load(false);
