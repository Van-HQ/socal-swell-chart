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
const K_BREAK=0.68;                      // calibration on the breaker-height estimate (tuned for peak period)
const PEAK=1.3;                         // Open-Meteo gives mean period; buoys and Surfline quote peak period, about 1.3x longer
const TIDE_RANGE={low:[-2,2.5],"low-mid":[0,3.5],mid:[1.5,4.5],"mid-high":[2.5,6],high:[4,8]};
function dirFactor(s,dir){let o=180;for(const [a,b] of s.w){const span=(b-a+360)%360,off=(dir-a+360)%360;if(off<=span)return 1;o=Math.min(o,angDiff(dir,a),angDiff(dir,b))}
  return o>=40?0.12:0.12+0.88*(0.5+0.5*Math.cos(Math.PI*o/40))}
// Komar-Gaughan breaker height from deep-water height (ft) and period (s)
// Swell under 9 s is local wind chop: it stands up less and breaks weaker, so it is marked down.
const chopFactor=T=>clamp((T/PEAK-4)/5,0.3,1);
function breaker(hft,T){if(!(hft>0)||!(T>=5))return 0;const H=hft*0.3048;return 0.39*Math.pow(9.81,0.2)*Math.pow(T*H*H,0.4)/0.3048*K_BREAK*chopFactor(T)}
// Onshore wind sets a ceiling on the rating no matter how much swell there is.
// e = wind speed (kt) scaled by how onshore it is: 0 at cross-offshore, full at 120 deg or more off offshore.
/* Two versions of the scoring can be switched between in the app to compare them. "current" is today's tuned version; "original" is how it was before today's tuning
   (stricter wind ceiling, steeper size curve, and the number shown is the raw score). */
let MODEL="original";try{if(localStorage.getItem("swellchart.model2")==="current")MODEL="current"}catch(e){}
const CUR=MODEL==="current";
const WIND_CAP=CUR?[[3,10],[6,4.9],[8,3.8],[10,2.9],[12,2.3],[15,1.8],[20,1.3],[30,1]]:[[4,10],[6,4],[8,2.8],[10,1.9],[30,1]];
const SZ=CUR?{a:0.5,b:0.7,d:0.5,m:0.5}:{a:0.4,b:0.6,d:0.55,m:0.45};
function windCap(ws,d){if(ws==null||d==null)return 10;const e=ws*clamp((d-70)/50,0,1);if(e<=WIND_CAP[0][0])return 10;
  for(let i=1;i<WIND_CAP.length;i++)if(e<=WIND_CAP[i][0]){const a=WIND_CAP[i-1],b=WIND_CAP[i];return lerp(a[1],b[1],(e-a[0])/(b[0]-a[0]))}return 1}
function comps(s,i){const m=s.m,out=[];
  const add=(k,h,p,d)=>{if(h==null||p==null||d==null||h<0.15)return;const df=dirFactor(s,d);out.push({k,h,p,d,df,face:breaker(h,p)*df*s.g})};
  add("Primary swell",m.sh[i],m.sp[i],m.sd[i]);add("Secondary swell",m.s2h[i],m.s2p[i],m.s2d[i]);add("Wind waves",m.wwh[i],m.wwp[i],m.wwd[i]);return out}
function windScore(s,ws,wd){if(ws==null||wd==null)return{q:1,word:"No wind data",d:null};
  const d=angDiff(wd,(s.f+180)%360),c=Math.cos(d*Math.PI/180),k=c>=0?14+26*c:14+5*c,q=1-0.9*clamp((ws-4)/k,0,1);
  const word=ws<4?"Light":d<35?"Offshore":d<70?"Cross-offshore":d<110?"Cross-shore":d<145?"Cross-onshore":"Onshore";return{q,word,d}}
function tideScore(td,ft){const r=TIDE_RANGE[td];if(!r||ft==null)return 1;const o=ft<r[0]?r[0]-ft:ft>r[1]?ft-r[1]:0;return 1-Math.min(0.3,0.1*o)}
function sizeScore(f,lo,hi){if(f<1)return 0;if(f<lo)return 0.2+SZ.a*(f-1)/Math.max(0.5,lo-1);if(f<=hi)return SZ.b+(1-SZ.b)*(f-lo)/(hi-lo);return Math.max(SZ.m,1-SZ.d*(f-hi)/hi)}
// Energy of one wave per metre of crest, in kJ (deep water), scaled to sit near Surfline's figures.
const waveKJ=(hft,T)=>{if(!(hft>0)||!(T>0))return 0;const H=hft*0.3048;return 0.9*1025*9.81*9.81*H*H*T*T/(16*Math.PI)/1000};
const spotKJ=h=>h.cs.reduce((t,c)=>t+(c.p>=5?waveKJ(c.h,c.p)*c.df*c.df:0),0);
const CCOL=["#e07a4f","#e3b23c","#4fb3d9"];
/* The score is stretched (SC_RAW to SC_SHOW) so the number reads naturally on a 0-10 scale; labels are chosen from that stretched number (see clsOf). */
const SC_RAW=[0,2,3.5,5,6.5,8.8,10],SC_SHOW=CUR?[0,2,4,6,7.5,9,10]:SC_RAW;
const shown=r=>{if(!(r>0))return 0;for(let i=1;i<SC_RAW.length;i++)if(r<=SC_RAW[i])return lerp(SC_SHOW[i-1],SC_SHOW[i],(r-SC_RAW[i-1])/(SC_RAW[i]-SC_RAW[i-1]));return 10};
/* Labels and colours are decided on the number the person sees (the stretched score): Poor under 2, Poor to fair 2-4, Fair 4-5.5, Fair to good 5.5-7, Good 7-8.8, Epic 8.8+. Both versions use the same cutoffs. */
const CLS_AT=[2,4,5.5,7,8.8];
const clsOf=(face,rate)=>{if(face<1)return 0;const v=shown(rate);let c=1;for(const t of CLS_AT)if(v>=t)c++;return c};
function rateCore(s,cs,ws,wd,tide){let e=0,dom=null;for(const c of cs){e+=c.face*c.face;if(!dom||c.face>dom.face)dom=c}
  const face=Math.sqrt(e),w=windScore(s,ws,wd);
  const per=dom?clamp((dom.p-6)/8,0,1)*0.8+0.2:0.2;
  const rate=Math.min(windCap(ws,w.d),10*sizeScore(face,s.sz[0],s.sz[1])*(0.25+0.75*w.q)*(0.55+0.45*per)*tideScore(s.td,tide));
  return{face,rate,cls:clsOf(face,rate),dom,w,tide,cs}}
function rateHour(s,i){return rateCore(s,comps(s,i),s.wx.ws[i],s.wx.wd[i],s.tide?s.tide[i]:null)}
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
const CACHE_KEY="swellchart.v4",CACHE_MIN=60;
// Spots a few miles apart share one wave-model cell, so they share one forecast request.
const FP=[];{const ix={};for(const s of SPOTS){const k=Math.round(s.la/0.05)+"_"+Math.round(s.lo/0.05);if(ix[k]==null){ix[k]=FP.length;FP.push({la:s.la,lo:s.lo})}s.fp=ix[k]}}
async function getJSON(u){const r=await fetch(u);if(!r.ok)throw new Error(`${r.status} from ${new URL(u).host}`);return r.json()}
async function openMeteo(base,pts,vars,extra){const out=[];
  for(let k=0;k<pts.length;k+=80){const p=pts.slice(k,k+80);
    const u=`${base}?latitude=${p.map(x=>x.la.toFixed(3)).join(",")}&longitude=${p.map(x=>x.lo.toFixed(3)).join(",")}&hourly=${vars}&forecast_days=7&timezone=${encodeURIComponent(TZ)}${extra}`;
    const j=await getJSON(u);out.push(...(Array.isArray(j)?j:[j]))}
  return out}
const r1=a=>a.map(v=>v==null?null:Math.round(v*10)/10);
const pk=a=>a?a.map(v=>v==null?null:Math.round(v*PEAK*10)/10):a;
async function loadForecast(){
  const MAR="https://marine-api.open-meteo.com/v1/marine",WX="https://api.open-meteo.com/v1/forecast";
  const sp=FP.concat([REF]);
  const WM=["ncep_hrrr_conus","ncep_nbm_conus","icon_seamless","gem_seamless"];
  const [sm,sw,gm,gw,sn]=await Promise.all([
    openMeteo(MAR,sp,"wave_height,swell_wave_height,swell_wave_direction,swell_wave_period,secondary_swell_wave_height,secondary_swell_wave_period,secondary_swell_wave_direction,wind_wave_height,wind_wave_direction,wind_wave_period,sea_surface_temperature","&length_unit=imperial&cell_selection=sea"),
    openMeteo(WX,FP,"wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day,temperature_2m,cloud_cover,precipitation_probability,uv_index,relative_humidity_2m","&wind_speed_unit=kn&temperature_unit=fahrenheit&daily=sunrise,sunset"),
    openMeteo(MAR,G.pts,"swell_wave_height,swell_wave_direction,swell_wave_period","&length_unit=imperial&cell_selection=sea"),
    openMeteo(WX,G.pts,"wind_speed_10m,wind_direction_10m","&wind_speed_unit=kn"),
    openMeteo(WX,FP,"wind_speed_10m,wind_direction_10m,wind_gusts_10m","&wind_speed_unit=kn&models="+WM.join(",")).catch(()=>null)]);
  // Wind: median across several weather models. HRRR alone misses afternoon sea breezes.
  const med=a=>{a=a.filter(v=>v!=null).sort((x,y)=>x-y);const n=a.length;return n?(n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2):null};
  /* Daytime onshore wind (westerly half) uses the HIGHEST model, because the median under-reads the coastal sea breeze.
     Everything else uses the median. wmed keeps the plain median and wm keeps every model so the Wind check card can show them. */
  const ONSHORE=d=>d>=180&&d<=330;
  const blend=(h,i,day)=>{const sp=[],gu=[],u=[],v=[],per={};for(const m of WM){const S=h["wind_speed_10m_"+m],D=h["wind_direction_10m_"+m],G=h["wind_gusts_10m_"+m];if(!S||S[i]==null||D[i]==null)continue;sp.push(S[i]);u.push(S[i]*Math.sin(D[i]*Math.PI/180));v.push(S[i]*Math.cos(D[i]*Math.PI/180));if(G&&G[i]!=null)gu.push(G[i]);per[m]={s:S[i],d:D[i]}}
    if(!sp.length)return null;const mu=u.reduce((a,b)=>a+b,0)/u.length,mv=v.reduce((a,b)=>a+b,0)/v.length,d=(Math.atan2(mu,mv)*180/Math.PI+360)%360,md=med(sp),hi=day&&ONSHORE(d);
    return{s:hi?Math.max(...sp):md,md,g:med(gu),d,per,hi}};
  sw.forEach(x=>{x.hourly.wmed=[];x.hourly.wm={}});
  if(sn)sw.forEach((x,k)=>{const h=sn[k]&&sn[k].hourly;if(!h)return;const n=x.hourly.wind_speed_10m.length,S=[],D=[],G=[],M=[],P={};WM.forEach(m=>P[m]=[]);
    for(let i=0;i<n;i++){const b=blend(h,i,x.hourly.is_day&&x.hourly.is_day[i]===1);S.push(b?b.s:x.hourly.wind_speed_10m[i]);M.push(b?b.md:x.hourly.wind_speed_10m[i]);D.push(b?b.d:x.hourly.wind_direction_10m[i]);G.push(b&&b.g!=null?Math.max(b.g,b.s):x.hourly.wind_gusts_10m[i]);
      WM.forEach(m=>P[m].push(b&&b.per[m]?[Math.round(b.per[m].s*10)/10,Math.round(b.per[m].d)]:null))}
    x.hourly.wind_speed_10m=S;x.hourly.wind_direction_10m=D;x.hourly.wind_gusts_10m=G;x.hourly.wmed=M;x.hourly.wm=P});
  const pack=h=>({wh:r1(h.wave_height),sh:r1(h.swell_wave_height),sd:h.swell_wave_direction,sp:pk(h.swell_wave_period),s2h:r1(h.secondary_swell_wave_height),s2p:pk(h.secondary_swell_wave_period),s2d:h.secondary_swell_wave_direction,wwh:r1(h.wind_wave_height),wwd:h.wind_wave_direction,wwp:pk(h.wind_wave_period),sst:r1(h.sea_surface_temperature)});
  return{at:Date.now(),times:sm[0].hourly.time,
    m:sm.map(x=>pack(x.hourly)),
    wx:sw.map(x=>({ws:r1(x.hourly.wind_speed_10m),wmed:r1(x.hourly.wmed),wm:x.hourly.wm,wd:x.hourly.wind_direction_10m,wg:r1(x.hourly.wind_gusts_10m),day:x.hourly.is_day,tp:r1(x.hourly.temperature_2m),cc:x.hourly.cloud_cover,pp:x.hourly.precipitation_probability,uv:r1(x.hourly.uv_index),rh:x.hourly.relative_humidity_2m,sun:x.daily?{d:x.daily.time,r:x.daily.sunrise,s:x.daily.sunset}:null})),
    gm:gm.map(x=>({h:r1(x.hourly.swell_wave_height),d:x.hourly.swell_wave_direction,p:pk(x.hourly.swell_wave_period)})),
    gw:gw.map(x=>({s:r1(x.hourly.wind_speed_10m),d:x.hourly.wind_direction_10m}))}}
/* NWS alerts that matter to a surfer. One request per region, using the middle of that region's spots. */
const ALERT_RE=/surf|beach hazard|rip current|coastal flood|tsunami|tropical|hurricane|storm warning/i;
let ALERTS={};
async function loadAlerts(){const reg={};for(const s of SPOTS){(reg[s.r]=reg[s.r]||[]).push(s)}
  await Promise.all(Object.entries(reg).map(async([k,a])=>{try{
    const la=a.reduce((t,x)=>t+x.la,0)/a.length,lo=a.reduce((t,x)=>t+x.lo,0)/a.length;
    const j=await getJSON(`https://api.weather.gov/alerts/active?point=${la.toFixed(3)},${lo.toFixed(3)}`);
    ALERTS[k]=(j.features||[]).map(f=>f.properties).filter(p=>ALERT_RE.test(p.event)).map(p=>({id:p.id,event:p.event,ends:p.ends||p.expires,by:p.senderName,text:(p.description||p.headline||"").replace(/\s*\n\s*/g," ").trim()}))}catch(e){ALERTS[k]=ALERTS[k]||[]}}));
  if(DATA)render()}
/* How often is it this good here? Tables are built by tools/percentiles from Open-Meteo's historical archive and live on the data branch.
   If they are missing or fail to load, the line simply does not appear. */
const MONL=["January","February","March","April","May","June","July","August","September","October","November","December"];
let PCT=null;
async function loadPct(){try{const j=await getJSON("https://raw.githubusercontent.com/Van-HQ/socal-swell-chart/data/data/percentiles/percentiles.json");if(j&&j.models&&j.v>=2){PCT=j;if(DATA)render()}}catch(e){}}
function pctText(s,h){if(!PCT||!h||h.face<1)return"";const row=PCT.models[MODEL]&&PCT.models[MODEL][s.n],mo=+DATA.times[TI].slice(5,7)-1,r=row&&row[mo];if(!r||r.n<200)return"";
  const x=clamp(shown(h.rate)*2,0,20),k=Math.min(19,Math.floor(x)),p=Math.round(lerp(r.cdf[k],r.cdf[k+1],x-k));
  let avg=0;for(let i=0;i<20;i++)avg+=(r.cdf[i+1]-r.cdf[i])/100*(i+0.5)*0.5;
  const typ=r.cdf[1]>=50||avg<0.5?"typically flat":"averages "+avg.toFixed(1);   // more than half the sessions flat counts as typically flat
  return (p>=99?`Better than nearly all ${MONL[mo]} sessions`:p<=1?`Among the weakest ${MONL[mo]} sessions`:`Better than ${p}% of ${MONL[mo]} sessions`)+", "+typ}
function untilText(iso){if(!iso)return"";const d=new Date(iso);if(isNaN(d))return"";const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:TZ,weekday:"short",hour:"numeric",hour12:true}).formatToParts(d).map(x=>[x.type,x.value]));return`Until ${p.weekday} ${p.hour} ${p.dayPeriod}`}
const alertSvg='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4.5M12 17.5v.1"/></svg>';
/* Banner HTML for a region key, or for every region when none is given. Easy to move: call alertBanner() wherever it should sit. */
function alertBanner(region){const seen=new Set(),out=[];
  for(const k of region&&ALERTS[region]?[region]:Object.keys(ALERTS))for(const a of ALERTS[k]||[]){if(seen.has(a.event+a.ends))continue;seen.add(a.event+a.ends);out.push(a)}
  return out.map(a=>`<details class="al"><summary>${alertSvg}<span><b>${esc(a.event)}</b><small>${esc(untilText(a.ends))}${a.by?" \u00b7 "+esc(a.by):""}</small></span></summary><p>${esc(a.text.length>420?a.text.slice(0,420).replace(/\s\S*$/,"")+"\u2026":a.text)}</p></details>`).join("")}
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
  $("msg").hidden=false;$("msg").innerHTML="<b>Loading forecast</b>Swell, wind, tide and buoys.";
  try{
    let fc=null;
    if(!force)try{const c=JSON.parse(localStorage.getItem(CACHE_KEY)||"null");if(c&&Date.now()-c.at<CACHE_MIN*6e4&&c.times&&c.m&&c.m.length===FP.length+1&&c.wx&&c.wx[0]&&c.wx[0].tp&&c.wx[0].wm&&c.times[0].slice(0,10)===laNow().date)fc=c}catch(e){}
    const fresh=!fc;
    const [f2,tides,buoys]=await Promise.all([fc||loadForecast(),loadTides(laNow().date),loadBuoys()]);
    if(fresh)try{localStorage.setItem(CACHE_KEY,JSON.stringify(f2))}catch(e){}
    DATA=build(f2,tides,buoys);SB.ov=null;
    NOWI=Math.max(0,DATA.times.indexOf(laNow().key));TI=NOWI;$("t").max=DATA.times.length-1;$("t").value=TI;
    $("msg").hidden=true;buildDays();makeMarks();setTime(TI);redraw();loadAlerts();if(!PCT)loadPct();
  }catch(e){
    $("msg").innerHTML=`<b>Forecast unavailable</b>${esc(e.message||e)}. Check your connection. <br><button id="retry">Try again</button>`;
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
  score:{u:"0 to 10",t:"Surf score",ticks:["Poor","P-F","Fair","F-G","Good","Epic"],min:0,max:10,get l(){return scoreStops()},get d(){return scoreStops()},get v(){return scoreStops()}},
  wind:{u:"kt",t:"Wind speed",ticks:[0,5,10,15,20,30],max:30,
    l:[[0,[244,246,240]],[5,[220,235,208]],[10,[241,221,140]],[15,[240,176,96]],[20,[227,122,74]],[30,[184,64,90]]],
    d:[[0,[11,27,37]],[5,[22,62,58]],[10,[88,104,36]],[15,[154,106,30]],[20,[184,80,42]],[30,[196,58,96]]],
    v:[[0,[28,38,80]],[5,[50,120,190]],[10,[60,185,150]],[15,[220,210,70]],[20,[240,140,60]],[30,[220,60,90]]]}};
/* Score layer: the same band colours the spots use, blended between band centres. */
function hexRGB(h){h=(h||"").replace("#","");if(h.length===3)h=h.replace(/./g,"$&$&");const n=parseInt(h,16);return[n>>16&255,n>>8&255,n&255]}
function scoreStops(){const c=k=>hexRGB(css("--r-"+k));return [[0,c("flat")],[1,c("poor")],[3,c("pf")],[4.75,c("fair")],[6.25,c("fg")],[7.9,c("good")],[9.4,c("epic")],[10,c("epic")]]}
/* The ocean takes its colour from the spots' own scores for the selected hour. Each water point blends nearby spots (closer counts far more) and fades out away from the coast. */
let SPX=null;
function spotField(){SPX=[];for(const s of DATA.spots)if(s.ok){const h=s.hr[TI];SPX.push({lo:s.lo,la:s.la,v:h.face<1?0:shown(h.rate),n:s.n,h})}}
function scoreAt(lo,la){const kx=111.32*Math.cos(la*Math.PI/180);let sw=0,sv=0,dm=1e9,nn=null;
  for(const q of SPX){const dx=(q.lo-lo)*kx,dy=(q.la-la)*110.57,d=Math.hypot(dx,dy);if(d<dm){dm=d;nn=q}const w=1/Math.pow(d+4,3);sw+=w;sv+=w*q.v}
  return{v:sv/sw,a:clamp(1-(dm-18)/40,0,1),near:nn,d:dm}}
function rampCol(stops,v){if(v<=stops[0][0])return stops[0][1];for(let i=1;i<stops.length;i++)if(v<=stops[i][0]){const a=stops[i-1],b=stops[i],t=(v-a[0])/(b[0]-a[0]);return[lerp(a[1][0],b[1][0],t),lerp(a[1][1],b[1][1],t),lerp(a[1][2],b[1][2],t)]}return stops[stops.length-1][1]}
const layerArr=()=>LAYER==="swell"?DATA.F.H[TI]:LAYER==="period"?DATA.F.P[TI]:DATA.F.WS[TI];
const fS=document.createElement("canvas");
function drawField(){const W=Math.round(V.W*V.dpr),H=Math.round(V.H*V.dpr);if(cF.width!==W||cF.height!==H){cF.width=W;cF.height=H}
  const ctx=cF.getContext("2d");ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);if(!DATA||!MAP)return;
  const w=Math.max(2,Math.round(V.W/5)),h=Math.max(2,Math.round(V.H/5));fS.width=w;fS.height=h;const sc=fS.getContext("2d"),img=sc.createImageData(w,h),st=RAMP[LAYER][look().ramp],arr=LAYER==="score"?null:layerArr();if(!arr)spotField();
  const lons=new Float64Array(w);for(let x=0;x<w;x++)lons[x]=LON((x+0.5)*5);let k=0;
  for(let y=0;y<h;y++){const lat=LAT((y+0.5)*5);for(let x=0;x<w;x++){let c,al=255;if(arr)c=rampCol(st,sample(arr,lons[x],lat));else{const o=scoreAt(lons[x],lat);c=rampCol(st,o.v);al=Math.round(255*o.a)}img.data[k++]=c[0];img.data[k++]=c[1];img.data[k++]=c[2];img.data[k++]=al}}
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
  c.globalCompositeOperation="destination-out";c.fillStyle=LAYER!=="swell"&&LAYER!=="period"?"rgba(0,0,0,.09)":"rgba(0,0,0,.3)";c.fillRect(0,0,V.W,V.H);c.globalCompositeOperation="source-over";
  const wind=LAYER==="wind"||LAYER==="score",F=DATA.F,U=wind?F.WU[TI]:F.U[TI],Vv=wind?F.WV[TI]:F.V[TI],M=wind?F.WS[TI]:F.H[TI],P=F.P[TI],rgb=PCOL;
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
function drawStatic(){const c=cP.getContext("2d");c.setTransform(V.dpr,0,0,V.dpr,0,0);c.clearRect(0,0,V.W,V.H);if(!DATA)return;const wind=LAYER==="wind"||LAYER==="score",F=DATA.F;
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
function legend(){const R=RAMP[LAYER],st=R[look().ramp],lo=R.min||0,sc=LAYER==="score",
  g=sc?st.slice(1,7).map(([v,c],i)=>`rgb(${c.map(Math.round).join(",")}) ${(i/5*100).toFixed(0)}%`).join(","):st.map(([v,c])=>`rgb(${c.map(Math.round).join(",")}) ${((v-lo)/(R.max-lo)*100).toFixed(0)}%`).join(",");
  $("legend").innerHTML=`<b>${R.t}, ${R.u}</b><div class="bar" style="background:linear-gradient(90deg,${g})"></div><div class="tk">${R.ticks.map(t=>`<span>${t}${t===R.max&&!sc?"+":""}</span>`).join("")}</div><div class="probe" id="probe"></div>`}
let pend=false,maskT=0;
function redraw(){if(pend||!MAP)return;pend=true;requestAnimationFrame(()=>{pend=false;syncProj();buildMask();drawField();if(DATA){placeMarks();colorMarks();pinPlace()}
  clearTimeout(maskT);maskT=setTimeout(()=>{readMask();if(REDUCED)drawStatic()},160)})}
function viewChanged(){clearParticles();redraw()}
function resize(){const r=mapEl.getBoundingClientRect();if(!r.width)return;V.W=r.width;V.H=r.height;V.dpr=Math.min(2,window.devicePixelRatio||1);if(MAP)MAP.resize();resetParticles();redraw()}
function probe(x,y){const el=$("probe");if(!el||!DATA)return;if(!isWater(x,y)){el.textContent="";return}
  const lo=LON(x),la=LAT(y),F=DATA.F,pos=`${la.toFixed(2)}°N ${(-lo).toFixed(2)}°W`;
  if(LAYER==="score"){spotField();const o=scoreAt(lo,la),d=(Math.atan2(-sample(F.WU[TI],lo,la),-sample(F.WV[TI],lo,la))*180/Math.PI+360)%360,ws=sample(F.WS[TI],lo,la);
    el.textContent=o.near&&o.d<30?`${o.near.n} · ${o.near.h.face<1?"Flat":RT[o.near.h.cls].n+" "+o.near.v.toFixed(1)} · wind ${ws.toFixed(0)} kt from ${comp(d)}`:`${pos} · wind ${ws.toFixed(0)} kt from ${comp(d)}`}
  else if(LAYER==="wind"){const d=(Math.atan2(-sample(F.WU[TI],lo,la),-sample(F.WV[TI],lo,la))*180/Math.PI+360)%360;el.textContent=`${pos} · ${sample(F.WS[TI],lo,la).toFixed(0)} kt from ${comp(d)}`}
  else{const d=(Math.atan2(-sample(F.U[TI],lo,la),-sample(F.V[TI],lo,la))*180/Math.PI+360)%360;el.textContent=`${pos} · ${sample(F.H[TI],lo,la).toFixed(1)} ft @ ${sample(F.P[TI],lo,la).toFixed(0)} s from ${comp(d)} ${Math.round(d)}°`}}

/* Map pin: tap open water to drop a pin that reads out whatever the active layer shows at that point. */
let PIN=null,PINK="";
function pinText(lo,la){const F=DATA.F,dir=(u,v)=>comp((Math.atan2(-sample(u,lo,la),-sample(v,lo,la))*180/Math.PI+360)%360);
  if(LAYER==="wind")return[`${sample(F.WS[TI],lo,la).toFixed(0)} kt ${dir(F.WU[TI],F.WV[TI])}`,"Wind speed"];
  if(LAYER==="period")return[`${sample(F.P[TI],lo,la).toFixed(0)} s`,`${sample(F.H[TI],lo,la).toFixed(1)} ft ${dir(F.U[TI],F.V[TI])}`];
  if(LAYER==="score"){spotField();const o=scoreAt(lo,la);return[o.v.toFixed(1),o.near&&o.d<30?`Near ${o.near.n}`:"Open water"]}
  return[`${sample(F.H[TI],lo,la).toFixed(1)} ft ${dir(F.U[TI],F.V[TI])}`,`Period ${sample(F.P[TI],lo,la).toFixed(0)} s`]}
function pinPlace(){const el=$("pin");if(!el)return;if(!PIN||!DATA){el.hidden=true;return}
  const x=X(PIN.lo),y=Y(PIN.la);if(x<-20||y<-20||x>V.W+20||y>V.H+20){el.hidden=true;return}
  const [b,s]=pinText(PIN.lo,PIN.la),k=b+"|"+s;if(k!==PINK){PINK=k;$("pbig").textContent=b;$("psm").textContent=s}
  el.hidden=false;el.className=(y<150?"dn ":"up ")+(x>V.W-170?"r":"l");el.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`}
function initMap(){
  if(!window.maplibregl){$("msg").hidden=false;$("msg").innerHTML="<b>Map unavailable</b>Check your connection and reload.";return false}
  setupTerrain();
  const touch=matchMedia("(pointer: coarse)").matches&&matchMedia("(max-width:860px)").matches;
  MAP=new maplibregl.Map({container:"mapgl",style:mapStyle(),bounds:FIT,fitBoundsOptions:{padding:camPad()},minZoom:6.5,maxZoom:15.5,maxBounds:[[-125,30],[-113.5,37]],dragRotate:false,pitchWithRotate:false,attributionControl:false,cooperativeGestures:touch});
  MAP.touchZoomRotate.disableRotation();MAP.keyboard.disableRotation();
  MAP.on("move",viewChanged);MAP.on("idle",()=>{depthDirty=true;redraw()});MAP.on("sourcedata",e=>{if(e.sourceId==="depths")depthDirty=true;if((e.sourceId==="omt"||e.sourceId==="depths")&&e.tile)redraw()});
  MAP.on("click",e=>{if(!DATA||!isWater(e.point.x,e.point.y))return;PIN={lo:e.lngLat.lng,la:e.lngLat.lat};pinPlace()});$("px").onclick=()=>{PIN=null;pinPlace()};
  MAP.on("mousemove",e=>probe(e.point.x,e.point.y));MAP.on("mouseout",()=>{const el=$("probe");if(el)el.textContent=""});
  $("zin").onclick=()=>MAP.zoomIn();$("zout").onclick=()=>MAP.zoomOut();$("zfit").onclick=()=>MAP.fitBounds(FIT,{padding:camPad()});
  new ResizeObserver(resize).observe(mapEl);resize();return true}
const inView=(lo,la)=>{const x=X(lo),y=Y(la);return x>24&&x<V.W-24&&y>64&&y<V.H-24};
function goTo(lo,la,minZoom){if(!MAP)return;const z=MAP.getZoom(),pb=phone()?SH.px[SH.snap]:0;if(z>=minZoom&&inView(lo,la)&&Y(la)<V.H-pb-30)return;MAP.easeTo({center:[lo,la],zoom:Math.max(z,minZoom),offset:[0,-pb/2],duration:REDUCED?0:700})}
for(const l of ["swell","period","wind","score"])$("lyr-"+l).onclick=()=>{LAYER=l;for(const m of ["swell","period","wind","score"])$("lyr-"+m).setAttribute("aria-pressed",m===l);legend();clearParticles();redraw()};
// The map look is fixed to Midnight for now; the other looks stay defined above for a future settings screen.
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
const PLAYI='<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M7 4v16l14-8z"/></svg>',PAUSEI='<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
$("play").innerHTML=PLAYI;
$("play").onclick=()=>{if(!DATA)return;const on=!playT;$("play").setAttribute("aria-pressed",on);$("play").innerHTML=on?PAUSEI:PLAYI;$("play").setAttribute("aria-label",on?"Pause":"Play");$("play").title=on?"Pause":"Play";
  if(on)playT=setInterval(()=>setTime(TI>=DATA.times.length-1?NOWI:TI+1,true),900);else{clearInterval(playT);playT=0}};

/* ---------- panel ---------- */
const S={tab:"spots",sel:null,region:"best",step:3,look:"night",loc:null,locWait:false};
const REG={all:"All",sb:"Santa Barbara",vc:"Ventura",la:"Los Angeles",oc:"Orange County",sd:"San Diego"};
const CHIPS={fav:"\u2605 Favs",best:"Best",local:"Local",all:"All"};
// Favorites and list preferences are kept in this browser only.
const FAVS=new Set();try{for(const n of JSON.parse(localStorage.getItem("swellchart.favs")||"[]"))FAVS.add(n)}catch(e){}
const saveFavs=()=>{try{localStorage.setItem("swellchart.favs",JSON.stringify([...FAVS]))}catch(e){}};
// Local: the 15 spots nearest the user (GPS on tap). Falls back to Seal Beach when location is off or far from SoCal.
const HOME={la:33.744,lo:-118.115,n:"Seal Beach"};
let LOCSET=new Map();
const miles=(la1,lo1,la2,lo2)=>{const r=Math.PI/180,a=Math.sin((la2-la1)*r/2)**2+Math.cos(la1*r)*Math.cos(la2*r)*Math.sin((lo2-lo1)*r/2)**2;return 3958.8*2*Math.asin(Math.sqrt(a))};
function computeLocal(){LOCSET=new Map();if(!DATA||!S.loc)return;
  let arr=DATA.spots.map(s=>[s,miles(S.loc.la,S.loc.lo,s.la,s.lo)]).sort((x,y)=>x[1]-y[1]);
  if(S.loc.gps&&arr[0][1]>150){S.loc={...HOME,gps:false,far:true};arr=DATA.spots.map(s=>[s,miles(HOME.la,HOME.lo,s.la,s.lo)]).sort((x,y)=>x[1]-y[1])}
  for(const [s,d] of arr.slice(0,15))LOCSET.set(s.n,d)}
const inFilter=s=>S.region==="best"||S.region==="all"||(S.region==="fav"?FAVS.has(s.n):LOCSET.has(s.n));
const phone=()=>matchMedia("(max-width:860px)").matches;
const camPad=()=>phone()?{top:70,bottom:SH.px[SH.snap]+14,left:12,right:12}:{top:70,bottom:50,left:40,right:60};
function fitFilter(){if(!MAP||!DATA)return;const ss=DATA.spots.filter(inFilter);if(S.region==="best"||S.region==="all"||!ss.length){MAP.fitBounds(FIT,{padding:camPad(),duration:REDUCED?0:700});return}
  let w=180,e=-180,so=90,n=-90;for(const s of ss){w=Math.min(w,s.lo);e=Math.max(e,s.lo);so=Math.min(so,s.la);n=Math.max(n,s.la)}
  MAP.fitBounds([[w,so],[e,n]],{padding:camPad(),maxZoom:12.5,duration:REDUCED?0:700})}
function setRegion(r){S.region=r;S.sel=null;S.tab="spots";const done=()=>{S.locWait=false;computeLocal();render();placeMarks();colorMarks();fitFilter()};
  if(r!=="local"){render();placeMarks();colorMarks();fitFilter();return}
  if(S.loc){done();return}
  S.locWait=true;render();
  if(!navigator.geolocation){S.loc={...HOME,gps:false};done();return}
  navigator.geolocation.getCurrentPosition(p=>{S.loc={la:p.coords.latitude,lo:p.coords.longitude,gps:true};done()},()=>{S.loc={...HOME,gps:false};done()},{timeout:6000,maximumAge:6e5})}
/* Bottom sheet (phones). Three snaps: peek (time scrubber + one summary row), half, full. */
const SH={snap:"peek",px:{peek:196,half:420,full:700},drag:null};
const PANEL=$("panel");
function sheetCalc(){const g=PANEL.querySelector(".grab"),t=document.querySelector(".time"),pk=$("peek"),pad=parseFloat(getComputedStyle(PANEL).paddingBottom)||0,st=Math.max(0,(parseFloat(getComputedStyle(document.querySelector(".maphead")).top)||23)-23);
  const gone=pk.hidden||getComputedStyle(pk).display==="none";const pm=gone?0:(parseFloat(getComputedStyle(pk).marginBottom)||0)+(parseFloat(getComputedStyle(pk).marginTop)||0);
  const base=g.offsetHeight+t.offsetHeight+(gone?0:pk.offsetHeight+pm)+pad+4;
  SH.px={peek:Math.max(150,Math.round(base)),half:Math.round(innerHeight*.55),full:Math.round(innerHeight-64-st)}}
function setSnap(n,instant){SH.snap=n;sheetCalc();const r=document.documentElement;PANEL.dataset.snap=n;r.dataset.snap=n;
  if(instant)PANEL.classList.add("drag");r.style.setProperty("--sheet-h",SH.px[n]+"px");if(instant)requestAnimationFrame(()=>requestAnimationFrame(()=>PANEL.classList.remove("drag")))}
function placeSheet(){const t=document.querySelector(".time");
  if(phone()){if(t.parentNode!==PANEL)PANEL.insertBefore(t,$("peek"));setSnap(SH.snap,true)}
  else{if(t.parentNode!==document.querySelector(".chart"))document.querySelector(".chart").appendChild(t);document.documentElement.style.removeProperty("--sheet-h");delete PANEL.dataset.snap;delete document.documentElement.dataset.snap}}
function dragStart(e){if(!phone()||(e.pointerType==="mouse"&&e.button)||e.target.closest("input,.btn"))return;sheetCalc();SH.drag={y:e.clientY,h:PANEL.getBoundingClientRect().height,t:performance.now(),moved:false,last:e.clientY,lt:performance.now(),v:0,el:e.currentTarget};SH.pid=e.pointerId;if(e.currentTarget.id==="grab"){try{e.currentTarget.setPointerCapture(e.pointerId)}catch(_){}}}
function dragMove(e){const d=SH.drag;if(!d)return;const dy=d.y-e.clientY;if(!d.moved&&Math.abs(dy)<6)return;if(!d.moved){d.moved=true;PANEL.classList.add("drag");document.documentElement.classList.add("dragging");try{d.el.setPointerCapture(SH.pid)}catch(_){}}const now=performance.now();d.v=(d.last-e.clientY)/Math.max(1,now-d.lt);d.last=e.clientY;d.lt=now;
  const h=Math.max(SH.px.peek,Math.min(SH.px.full,d.h+dy));document.documentElement.style.setProperty("--sheet-h",h+"px")}
function dragEnd(e){const d=SH.drag;if(!d)return;SH.drag=null;PANEL.classList.remove("drag");document.documentElement.classList.remove("dragging");
  if(!d.moved){if(d.el.id==="grab")setSnap(SH.snap==="peek"?"half":SH.snap==="half"?"full":"peek");else setSnap(SH.snap);return}
  d.el._dragged=true;setTimeout(()=>d.el._dragged=false,0);
  const h=PANEL.getBoundingClientRect().height+d.v*160;let best="peek",bd=1e9;for(const k of ["peek","half","full"]){const x=Math.abs(SH.px[k]-h);if(x<bd){bd=x;best=k}}
  setSnap(best)}
for(const el of [$("grab"),$("peek"),document.querySelector(".tabs"),document.querySelector(".time")]){el.addEventListener("pointerdown",dragStart);el.addEventListener("pointermove",dragMove);el.addEventListener("pointerup",dragEnd);el.addEventListener("pointercancel",dragEnd)}
$("peek").addEventListener("click",e=>{if($("peek")._dragged){e.stopImmediatePropagation();e.preventDefault();return}},true);
$("peek").addEventListener("click",()=>{const k=SH.pk;if(k!=null){const s=DATA.spots[k];select(k);goTo(s.lo,s.la,11.5)}});
addEventListener("resize",()=>{if(phone())setSnap(SH.snap,true)});
const refit=()=>{if(phone()&&!SH.drag){const b=SH.px[SH.snap];sheetCalc();if(SH.px[SH.snap]!==b)setSnap(SH.snap,true)}};
if(window.ResizeObserver){const ro=new ResizeObserver(refit);for(const el of [document.querySelector(".time"),$("peek"),$("grab")])ro.observe(el)}
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(refit);
matchMedia("(max-width:860px)").addEventListener("change",placeSheet);
function peekRender(){const pk=$("peek");if(!DATA){pk.hidden=true;return}
  let s,lab;if(S.sel!=null){s=DATA.spots[S.sel];lab="Selected"}else{lab="Best right now";for(const x of DATA.spots)if(x.ok&&(!s||x.hr[TI].rate>s.hr[TI].rate))s=x}
  if(!s){pk.hidden=true;return}const h=s.hr[TI];SH.pk=s.idx;pk.hidden=false;
  pk.innerHTML=`<i class="dot" style="background:${s.ok?rtCol(h.cls):"var(--line)"}"></i><span class="pn"><small>${lab}</small><b>${esc(s.n)}</b></span><span class="pf"><b>${s.ok?faceText(h.face):""}</b><small>${s.ok?RT[h.cls].n:""}</small></span>`;
  if(phone()&&SH.snap==="peek"){const b=SH.px.peek;sheetCalc();if(SH.px.peek!==b)setSnap("peek",true)}}
function select(k){S.sel=k;if(k!=null)S.last=k;S.tab="spots";render();$("body").scrollTop=0;colorMarks();placeMarks();
  if(k!=null&&phone()&&SH.snap==="peek")setSnap("half")}
for(const t of ["spots","best","cmp","sbox","buoys","how"])$("tab-"+t).onclick=e=>{S.tab=t;S.sel=null;if(t==="sbox")SB.dirty=true;render();colorMarks();try{e.currentTarget.scrollIntoView({inline:"center",block:"nearest"})}catch(_){}};
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
function listView(){const rows=DATA.spots.filter(inFilter);if(S.region==="local")rows.sort((a,b)=>LOCSET.get(a.n)-LOCSET.get(b.n));else if(S.region==="all")rows.sort((a,b)=>a.idx-b.idx);else rows.sort((a,b)=>b.hr[TI].rate-a.hr[TI].rate);
  const lm=s=>S.region==="local"&&LOCSET.has(s.n)?`${LOCSET.get(s.n).toFixed(LOCSET.get(s.n)<10?1:0)} mi \u00b7 `:"";
  const info=S.region==="local"?(S.locWait?"Finding your location\u2026":S.loc&&S.loc.gps?"15 nearest to you":`15 nearest to ${HOME.n}${S.loc&&S.loc.far?" (you are far from SoCal)":" (location off)"}`):S.region==="fav"?`${rows.length} favorite${rows.length===1?"":"s"}`:S.region==="all"?`${rows.length} spots, north to south`:`${rows.length} spots, best first`;
  return`<div style="display:flex;flex-direction:column;gap:8px"><div class="chips three" role="group" aria-label="Spot list">${Object.entries(CHIPS).map(([k,n])=>`<button data-reg="${k}" aria-pressed="${S.region===k}">${n}</button>`).join("")}</div>${modelSeg()}
  <div class="steprow" style="margin-top:2px"><span class="lab">${info}</span></div>
  ${alertBanner(null)}
  ${rows.length||S.locWait?"":`<p class="note">${S.region==="fav"?"No favorites yet. Open a spot and tap the star.":"No spots here."}</p>`}<div class="rows">${rows.map(s=>{const h=s.hr[TI];
    if(!s.ok)return`<button class="row" data-spot="${s.idx}"><i class="dot" style="background:var(--line)"></i><span class="nm">${esc(s.n)}</span><span class="ft"></span><span class="sub">No wave data near this spot</span></button>`;
    return`<button class="row" data-spot="${s.idx}"><i class="dot" style="background:${rtCol(h.cls)}"></i><span class="nm">${esc(s.n)}${FAVS.has(s.n)?' <span class="fv" aria-label="Favorite">★</span>':""}</span><span class="ft">${faceText(h.face)}</span>
    <span class="sub">${lm(s)}<b>${RT[h.cls].n}</b> · ${h.dom?`${comp(h.dom.d)} ${Math.round(h.dom.p)} s`:"no swell"} · ${h.w.d==null?"wind n/a":`${h.w.word.toLowerCase()} ${Math.round(s.wx.ws[TI])} kt`}</span></button>`}).join("")}</div></div>${outlook()}${foot()}`}
function foot(){const mins=Math.round((Date.now()-DATA.at)/6e4),nb=DATA.buoys.filter(b=>b.ok).length;
  return`<div class="foot">Updated ${mins<1?"just now":mins+" min ago"} · ${nb} of ${BUOYS.length} buoys reporting${DATA.tidesOk?"":" · tides did not load, so ratings ignore tide"}.<button id="refresh">Refresh</button></div>`}

/* ---------- Best tab: each spot's best stretch in the chosen range ---------- */
const BEST=(()=>{const o={range:"3d",scope:"local"};try{Object.assign(o,JSON.parse(localStorage.getItem("swellchart.best")||"{}"))}catch(e){}if(!["today","3d","wknd"].includes(o.range))o.range="3d";if(!["fav","local","all"].includes(o.scope))o.scope="local";return o})();
const saveBest=()=>{try{localStorage.setItem("swellchart.best",JSON.stringify(BEST))}catch(e){}};
const BRANGE={today:"Today","3d":"Next 3 days",wknd:"Weekend"},BSCOPE={fav:"★ Favs",local:"Local",all:"All"};
function bestScope(sc){BEST.scope=sc;saveBest();
  if(sc!=="local"||S.loc){if(sc==="local")computeLocal();render();return}
  S.locWait=true;render();const done=()=>{S.locWait=false;computeLocal();render()};
  if(!navigator.geolocation){S.loc={...HOME,gps:false};done();return}
  navigator.geolocation.getCurrentPosition(p=>{S.loc={la:p.coords.latitude,lo:p.coords.longitude,gps:true};done()},()=>{S.loc={...HOME,gps:false};done()},{timeout:6000,maximumAge:6e5})}
const bestDays=()=>{const t=laNow().date,ds=dayIdx().filter(x=>x.d>=t);
  return BEST.range==="today"?ds.slice(0,1):BEST.range==="wknd"?ds.filter(x=>{const w=tparts(DATA.times[x.idx[0]]).dow;return w===0||w===6}):ds.slice(0,3)};
// The best run of 2 or more daylight hours at Fair to good or better, judged by its average score.
function bestWindow(s,days){let best=null;
  for(const {idx} of days){let run=[];const close=()=>{if(run.length>=2){const m=run.reduce((t,k)=>t+s.hr[k].rate,0)/run.length;if(!best||m>best.m+1e-9||(Math.abs(m-best.m)<1e-9&&run.length>best.ks.length))best={ks:run,m}}run=[]};
    for(const k of idx){if(k>=NOWI&&s.wx.day[k]&&s.hr[k].cls>=4)run.push(k);else close()}close()}
  return best}
const spanText=(a,b)=>{const r=h=>h%12||12,p=h=>h%24<12?"AM":"PM";return p(a)===p(b)?`${r(a)}–${r(b)} ${p(a)}`:`${r(a)} ${p(a)}–${r(b)} ${p(b)}`};
function bestView(){const days=bestDays(),today=laNow().date;
  const inScope=s=>BEST.scope==="all"||(BEST.scope==="fav"?FAVS.has(s.n):LOCSET.has(s.n));
  const items=[];if(!S.locWait)for(const s of DATA.spots){if(!s.ok||!inScope(s))continue;const w=bestWindow(s,days);if(w)items.push({s,w})}
  items.sort((a,b)=>b.w.m-a.w.m);
  const info=S.locWait?"Finding your location…":BEST.scope==="local"?(S.loc&&S.loc.gps?"15 spots nearest to you":`15 spots nearest ${HOME.n}${S.loc&&S.loc.far?" (you are far from SoCal)":" (location off)"}`):BEST.scope==="fav"?`${FAVS.size} favorite${FAVS.size===1?"":"s"}`:"All spots";
  const empty=S.locWait?"":!days.length?`<p class="note">${BEST.range==="wknd"?"No weekend days in this forecast yet.":"No forecast days left."}</p>`:items.length?"":`<p class="note">${BEST.scope==="fav"&&!FAVS.size?"No favorites yet. Open a spot and tap the star.":"No stretch of Fair to good or better in this range. Try a longer range or a wider list."}</p>`;
  return`<div style="display:flex;flex-direction:column;gap:8px"><div class="chips three" role="group" aria-label="Which spots">${Object.entries(BSCOPE).map(([k,n])=>`<button data-bscope="${k}" aria-pressed="${BEST.scope===k}">${n}</button>`).join("")}</div>
  <div class="chips three" role="group" aria-label="When">${Object.entries(BRANGE).map(([k,n])=>`<button data-brange="${k}" aria-pressed="${BEST.range===k}">${n}</button>`).join("")}</div>
  <div class="steprow" style="margin-top:2px"><span class="lab">${info} · stretches of 2+ hours at Fair to good or better</span></div>
  ${empty}<div class="bcards">${items.map(({s,w})=>{const ks=w.ks,pk=ks.reduce((a,k)=>s.hr[k].rate>s.hr[a].rate?k:a,ks[0]),mid=ks[Math.floor(ks.length/2)],hm=s.hr[mid],face=ks.reduce((t,k)=>t+s.hr[k].face,0)/ks.length,cls=clsOf(face,w.m),ws=s.wx.ws[mid],p=tparts(DATA.times[ks[0]]),d=DATA.times[ks[0]].slice(0,10);
    const dist=BEST.scope==="local"&&LOCSET.has(s.n)?`${LOCSET.get(s.n).toFixed(LOCSET.get(s.n)<10?1:0)} mi · `:"";
    return`<button class="bcard" data-best="${s.idx}:${pk}" style="--rc:${rtCol(cls)}"><span class="bring" style="--p:${Math.round(shown(w.m)*10)}"><b>${shown(w.m).toFixed(1)}</b></span>
      <span class="bm"><span class="bn">${esc(s.n)}${FAVS.has(s.n)?' <span class="fv" aria-label="Favorite">★</span>':""}</span><span class="bs">${dist}${faceText(face)} · ${hm.dom?`${Math.round(hm.dom.p)} s ${comp(hm.dom.d)}`:"no swell"} · ${hm.w.d==null||ws==null?"wind n/a":`${Math.round(ws)} kt ${hm.w.word.toLowerCase()}`}</span></span>
      <span class="bt"><b>${d===today?"Today":DOW[p.dow]} ${spanText(hourOf(ks[0]),hourOf(ks[ks.length-1])+1)}</b>${RT[cls].n}</span></button>`}).join("")}</div></div>${foot()}`}

/* ---------- Compare tab: up to three spots side by side at the timeline hour ---------- */
let CMP=[],CMPINIT=false;try{CMP=JSON.parse(localStorage.getItem("swellchart.cmp")||"[]");if(!Array.isArray(CMP))CMP=[]}catch(e){CMP=[]}
const saveCmp=()=>{try{localStorage.setItem("swellchart.cmp",JSON.stringify(CMP))}catch(e){}};
function cmpView(){const ok=DATA.spots.filter(s=>s.ok);
  CMP=CMP.filter(n=>ok.some(s=>s.n===n)).slice(0,3);
  if(!CMP.length&&!CMPINIT){const fv=ok.filter(s=>FAVS.has(s.n));CMP=(fv.length>=2?fv:[...ok].sort((a,b)=>b.hr[TI].rate-a.hr[TI].rate)).slice(0,3).map(s=>s.n)}
  CMPINIT=true;const cols=CMP.map(n=>ok.find(s=>s.n===n)),cur=DATA.times[TI].slice(0,10),day=dayIdx().find(x=>x.d===cur);
  const star=(vals,i)=>cols.length>1&&vals[i]!=null&&vals[i]===Math.max(...vals.filter(v=>v!=null))?" best":"";
  const rates=cols.map(s=>s.hr[TI].rate),faces=cols.map(s=>s.hr[TI].face),qs=cols.map(s=>s.hr[TI].w.d==null?null:s.hr[TI].w.q);
  const tideA=s=>{const a=s.hr[TI].tide,b=s.hr[Math.min(TI+1,s.hr.length-1)].tide;return a==null?"–":`${a.toFixed(1)} ft ${b==null||Math.abs(b-a)<0.005?"":b>a?"↑":"↓"}`};
  const seg=s=>[[5,10],[10,14],[14,19]].map(([a,b])=>{const ks=day.idx.filter(k=>hourOf(k)>=a&&hourOf(k)<b);if(!ks.length)return`<i style="background:var(--line)"></i>`;const f=ks.reduce((t,k)=>t+s.hr[k].face,0)/ks.length,r=ks.reduce((t,k)=>t+s.hr[k].rate,0)/ks.length;return`<i style="background:${rtCol(clsOf(f,r))}"></i>`}).join("");
  const row=(lab,fn)=>`<tr><td>${lab}</td>${cols.map((s,i)=>`<td>${fn(s,i)}</td>`).join("")}</tr>`;
  const left=ok.filter(s=>!CMP.includes(s.n));
  return`<div style="display:flex;flex-direction:column;gap:10px"><p class="lab">Spots (pick up to 3)</p>
  <div class="csel">${cols.map(s=>`<button class="cchip" data-cmprm="${s.idx}" aria-label="Remove ${esc(s.n)}">${esc(s.n)} ✕</button>`).join("")}${cols.length<3?`<select id="cmpadd" class="cadd" aria-label="Add a spot"><option value="">+ Add spot</option>${left.map(s=>`<option value="${s.idx}">${esc(s.n)}</option>`).join("")}</select>`:""}</div>
  <p class="lab">Time: <b style="color:var(--ink);font-weight:600">${fmt(TI)}</b></p>
  ${cols.length?`<table class="cmp"><thead><tr><th></th>${cols.map(s=>`<th><button data-spot="${s.idx}">${esc(s.n)}</button>${cols.length>1&&rates.indexOf(Math.max(...rates))===cols.indexOf(s)?'<span class="gstar" aria-label="Best of these">\u2605</span>':""}</th>`).join("")}</tr></thead><tbody>
  ${row("Score",(s,i)=>{const h=s.hr[TI];return`<div class="sc"><i style="background:${rtCol(h.cls)}"></i>${shown(h.rate).toFixed(1)}</div><small>${RT[h.cls].n}</small>`})}
  ${row("Size",(s,i)=>`<span class="v">${faceText(s.hr[TI].face)}</span>`)}
  ${row("Swell",s=>{const d=s.hr[TI].dom;return d?`${d.h.toFixed(1)} ft · ${Math.round(d.p)} s<small>${comp(d.d)}</small>`:"–"})}
  ${row("Wind",(s,i)=>{const h=s.hr[TI],ws=s.wx.ws[TI];return h.w.d==null||ws==null?"–":`<span class="v">${Math.round(ws)} kt</span><small>${h.w.word}</small>`})}
  ${row("Tide",s=>tideA(s))}
  ${row("Day",s=>`<div class="mini">${seg(s)}</div>`)}</tbody></table>`:`<p class="note">Pick two or three spots to compare them hour by hour.</p>`}</div>${foot()}`}

/* ---------- Swellbox: change the swell, wind and tide for a spot and see what it would score ---------- */
const SB={spot:null,hr:null,real:null,ov:null,others:[],vec:[],dirty:true};
const SBP=[{k:"h",n:"Height",min:0,max:12,st:0.1,g:"Swell",f:v=>v.toFixed(1)+" ft"},{k:"p",n:"Period",min:5,max:22,st:1,f:v=>Math.round(v)+" s"},{k:"d",n:"Direction",min:140,max:320,st:5,f:v=>comp(v)+" "+Math.round(v)+"°"},
  {k:"ws",n:"Speed",min:0,max:30,st:1,g:"Wind",f:v=>Math.round(v)+" kt"},{k:"wd",n:"From",min:0,max:355,st:5,f:(v,o,s)=>`${comp(v)} · ${windScore(s,o.ws,v).word.replace("Cross-","x-")}`},
  {k:"tide",n:"Height",min:-1.5,max:7,st:0.1,g:"Tide",f:v=>v.toFixed(1)+" ft"}];
const rnd=(v,st)=>Math.round(v/st)*st;
function sbRate(s,o){const cs=SB.others.slice();if(o.h>=0.15){const df=dirFactor(s,o.d);cs.unshift({k:"Primary swell",h:o.h,p:o.p,d:o.d,df,face:breaker(o.h,o.p)*df*s.g})}return rateCore(s,cs,o.ws,o.wd,s.tide?o.tide:null)}
function sbLoad(){const s=DATA.spots[SB.spot];if(SB.hr==null){let b=TI;if(!(b>=NOWI&&s.wx.day[b])){b=NOWI;for(let k=NOWI;k<DATA.times.length;k++)if(s.wx.day[k]){b=k;break}}SB.hr=b}
  const i=SB.hr,all=comps(s,i),pr=all.find(c=>c.k==="Primary swell");SB.others=all.filter(c=>c.k!=="Primary swell");
  const q=(v,st,d)=>v==null?d:rnd(v,st),tv=s.tide&&s.tide[i]!=null?s.tide[i]:2.5;
  SB.real={h:q(pr&&pr.h,0.1,0),p:q(pr&&pr.p,1,12),d:q(pr&&pr.d,5,200),ws:q(s.wx.ws[i],1,0),wd:q(s.wx.wd[i],5,0),tide:rnd(tv,0.1)};SB.ov={...SB.real};
  SB.vec=[];for(let k=NOWI;k<DATA.times.length;k++){if(!s.wx.day[k])continue;const p=comps(s,k).find(c=>c.k==="Primary swell");SB.vec.push({k,h:p?p.h:0,p:p?p.p:0,d:p?p.d:0,ws:s.wx.ws[k]||0,wd:s.wx.wd[k]||0,tide:s.tide&&s.tide[k]!=null?s.tide[k]:2.5})}}
function sbEnsure(){if(SB.spot==null||!DATA.spots[SB.spot]||!DATA.spots[SB.spot].ok){const ok=DATA.spots.filter(x=>x.ok),pick=S.last!=null&&DATA.spots[S.last]&&DATA.spots[S.last].ok?DATA.spots[S.last]:ok.find(x=>FAVS.has(x.n))||[...ok].sort((x,y)=>y.hr[TI].rate-x.hr[TI].rate)[0];SB.spot=pick.idx;SB.hr=null;SB.ov=null}
  if(!SB.ov)sbLoad()}
function sbSegs(s,p){const o=SB.ov,n=60,span=p.max-p.min,ok=[];for(let i=0;i<=n;i++){const v=p.min+span*i/n,r=sbRate(s,{...o,[p.k]:v});ok.push(r.cls>=5)}
  let out="",i=0;while(i<=n){if(!ok[i]){i++;continue}let j=i;while(j+1<=n&&ok[j+1])j++;const f1=Math.max(0,(i-0.5)/n),f2=Math.min(1,(j+0.5)/n);out+=`<span style="left:calc(${f1} * (100% - 18px) + 9px);width:calc(${f2-f1} * (100% - 18px))"></span>`;i=j+1}return out}
const sbPos=(p,v)=>`calc(${clamp((v-p.min)/(p.max-p.min),0,1).toFixed(4)} * (100% - 18px) + 9px)`;
function sbHero(s){const real=s.hr[SB.hr],r=SBP.every(q=>SB.ov[q.k]===SB.real[q.k])?real:sbRate(s,SB.ov),sh=shown(r.rate),sr=shown(real.rate);
  return`<div class="bring" style="--rc:${rtCol(r.cls)};--p:${Math.round(sh*10)}"><b>${sh.toFixed(1)}</b></div><div class="sbh"><span class="sbpill" style="background:${rtCol(r.cls)}">${r.face<1?"Flat":RT[r.cls].n}</span><b>${r.face<1?"Flat":faceText(r.face)}</b><small>Forecast for ${fmt(SB.hr)}: ${sr.toFixed(1)} · ${real.face<1?"Flat":RT[real.cls].n}</small></div>`}
function sbHeat(s){const o=SB.ov,per=[9,10,11,12,13,14,15,16,17,18];let dirs=[];for(let d=150;d<=315;d+=5)if(dirFactor(s,d)>=0.3)dirs.push(d);
  if(dirs.length>7){const t=[];for(let i=0;i<7;i++)t.push(dirs[Math.round(i*(dirs.length-1)/6)]);dirs=[...new Set(t)]}
  const nd=dirs.reduce((b,d)=>Math.abs(d-o.d)<Math.abs(b-o.d)?d:b,dirs[0]),np=per.reduce((b,p)=>Math.abs(p-o.p)<Math.abs(b-o.p)?b:p,per[0]);
  let h=`<div class="sbheat" style="grid-template-columns:58px repeat(${per.length},1fr)"><em></em>${per.map(p=>`<em>${p}${p===per[0]?" s":""}</em>`).join("")}`;
  for(const d of dirs){h+=`<em>${comp(d)} ${d}</em>`;for(const p of per){const r=sbRate(s,{...o,d,p});h+=`<button data-hd="${d}" data-hp="${p}" class="${d===nd&&p===np?"cur":""}" style="background:${r.face<1?"var(--line)":rtCol(r.cls)}" aria-label="${comp(d)} ${d} degrees, ${p} seconds: ${r.face<1?"Flat":RT[r.cls].n}"></button>`}}
  return h+"</div>"}
function sbMatch(s){const o=SB.ov,V=SB.vec;if(!V.length)return"";
  const dist=v=>{const a=[Math.abs(v.h-o.h)/1.5,Math.abs(v.p-o.p)/3,angDiff(v.d,o.d)/20],b=[Math.abs(v.ws-o.ws)/5,angDiff(v.wd,o.wd)/45],c=[s.tide?Math.abs(v.tide-o.tide)/1.5:0];
    const g=x=>Math.sqrt(x.reduce((t,y)=>t+y*y,0));return{t:g([...a,...b,...c]),sw:Math.max(...a),wi:Math.max(...b),ti:c[0],a,b}};
  const sc=V.map(v=>({v,d:dist(v)})).sort((x,y)=>x.d.t-y.d.t),picks=[];
  for(const c of sc){if(picks.length>=3)break;if(picks.some(p=>Math.abs(p.v.k-c.v.k)<6))continue;picks.push(c)}
  const byK=new Map(V.map(v=>[v.k,dist(v)]));
  return picks.map(c=>{const lim=Math.max(1.2,c.d.t*1.5);let a=c.v.k,z=c.v.k;const same=k=>DATA.times[k]&&DATA.times[k].slice(0,10)===DATA.times[c.v.k].slice(0,10);
    while(byK.has(a-1)&&same(a-1)&&byK.get(a-1).t<=lim)a--;while(byK.has(z+1)&&same(z+1)&&byK.get(z+1).t<=lim)z++;
    const r=s.hr[c.v.k],sh=shown(r.rate),vv=c.v,d=c.d,bits=[];
    const swOk=d.sw<=1,wiOk=d.wi<=1,tiOk=d.ti<=1;
    if(swOk&&wiOk&&tiOk)bits.push("Close on everything");else{if(swOk)bits.push("Swell lines up");if(wiOk)bits.push("wind fits");if(tiOk&&s.tide)bits.push("tide fits");
      if(!swOk){const m=d.a.indexOf(d.sw);bits.push(m===0?(vv.h<o.h?"swell is smaller":"swell is bigger"):m===1?(vv.p<o.p?"period is shorter":"period is longer"):`swell from ${comp(vv.d)}`)}
      if(!wiOk){bits.push(d.b[0]>=d.b[1]?(vv.ws>o.ws?"wind is stronger":"wind is lighter"):`wind from ${comp(vv.wd)}`)}
      if(!tiOk&&s.tide)bits.push(vv.tide>o.tide?"tide is higher":"tide is lower")}
    const txt=bits.join(", ").replace(/^./,x=>x.toUpperCase());const p=tparts(DATA.times[a]),today=laNow().date;
    return`<button class="sbm" data-best="${s.idx}:${c.v.k}"><span><b>${DATA.times[a].slice(0,10)===today?"Today":DOW[p.dow]} ${spanText(hourOf(a),hourOf(z)+1)}</b><small>${txt}</small></span><span class="sbn" style="color:${rtCol(r.cls)}">${sh.toFixed(1)}</span></button>`}).join("")}
function sbPatch(){const s=DATA.spots[SB.spot],o=SB.ov;
  $("sbhero").style.cssText="";$("sbhero").innerHTML=sbHero(s);
  for(const p of SBP){const v=$("v-"+p.k);if(v)v.textContent=p.f(o[p.k],o,s);const g=$("g-"+p.k);if(g)g.innerHTML=sbSegs(s,p)}
  $("sbheat").innerHTML=sbHeat(s);$("sbmatch").innerHTML=sbMatch(s)}
function sbSync(){for(const p of SBP){const e=$("sb-"+p.k);if(e)e.value=SB.ov[p.k]}sbPatch()}
function sbView(){sbEnsure();const s=DATA.spots[SB.spot],o=SB.ov,ok=DATA.spots.filter(x=>x.ok);
  const hrs=[];for(let k=NOWI;k<Math.min(DATA.times.length,NOWI+96);k++)if(s.wx.day[k])hrs.push(k);if(!hrs.includes(SB.hr))hrs.push(SB.hr);hrs.sort((x,y)=>x-y);
  let rows="",grp="";
  for(const p of SBP){if(p.k==="tide"&&!s.tide)continue;if(p.g){rows+=`<p class="sbg3">${p.g}</p>`}
    rows+=`<div class="sbrow"><span>${p.n}</span><div class="sbs"><span class="sbgs" id="g-${p.k}">${sbSegs(s,p)}</span><i class="sbt" style="left:${sbPos(p,SB.real[p.k])}"></i><input type="range" id="sb-${p.k}" min="${p.min}" max="${p.max}" step="${p.st}" value="${o[p.k]}" aria-label="${p.g?p.g+" ":""}${p.n}"></div><b id="v-${p.k}">${p.f(o[p.k],o,s)}</b></div>`}
  return`<div id="sbox" style="display:flex;flex-direction:column;gap:14px">
  <div class="sbsel"><select id="sbspot" aria-label="Spot">${ok.map(x=>`<option value="${x.idx}"${x.idx===SB.spot?" selected":""}>${esc(x.n)}</option>`).join("")}</select><label>Start from <select id="sbhr" aria-label="Start from">${hrs.map(k=>`<option value="${k}"${k===SB.hr?" selected":""}>${fmt(k)}</option>`).join("")}</select></label></div>
  <div class="sbhero" id="sbhero">${sbHero(s)}</div>
  <div class="sbctl">${rows}<button class="sbreset" data-sbreset="1">↺ Reset to forecast</button></div>
  <p class="lab" style="margin-top:-4px">Gold tick: the forecast. Green stretch: where this spot scores Good or better with your other settings.${SB.others.length?" Secondary swell and wind chop from the forecast are included.":""}</p>
  <p class="lab" style="margin-top:2px">Where it works: swell direction by period, wind and tide held. Tap a square to set it.</p>
  <div id="sbheat">${sbHeat(s)}</div>
  <p class="lab" style="margin-top:2px">When this setup shows up in the forecast</p>
  <div id="sbmatch" class="sbms">${sbMatch(s)}</div></div>${foot()}`}
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
  return`<div class="fc" id="fc" data-x0="${x0/W}" data-x1="${(W-4)/W}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Seven-day surf height, rating and tide for ${esc(s.n)}">${g}</svg></div><p class="note" style="font-size:12px;margin-top:6px">Bars: surf height (ft), coloured by rating. Line: tide.</p>`}
function dayIdx(){const T=DATA.times,out=[];let i=0;while(i<T.length){const d=T[i].slice(0,10),idx=[];for(;i<T.length&&T[i].slice(0,10)===d;i++)idx.push(i);out.push({d,idx})}return out}
const hourOf=k=>+DATA.times[k].slice(11,13);
function rangeText(fs){const mn=Math.min(...fs),mx=Math.max(...fs);if(mx<1)return"Flat";const lo=Math.max(1,Math.round(mn*0.9)),hi=Math.max(lo+1,Math.round(mx*1.1));return`${lo}\u2013${hi} ft`}
function dayCards(s){const T=DATA.times,cur=T[TI].slice(0,10),today=laNow().date,hNow=hourOf(TI);
  return`<div class="dcards" role="group" aria-label="Forecast day">${dayIdx().map(({d,idx})=>{const p=tparts(T[idx[0]]),lit=idx.filter(k=>s.wx.day[k]),use=lit.length?lit:idx;
    const seg=[[5,10,"Morning"],[10,14,"Midday"],[14,19,"Afternoon"]].map(([a,b,nm])=>{const ks=idx.filter(k=>hourOf(k)>=a&&hourOf(k)<b);if(!ks.length)return`<i style="background:var(--line)"></i>`;
      const f=ks.reduce((t,k)=>t+s.hr[k].face,0)/ks.length,r=ks.reduce((t,k)=>t+s.hr[k].rate,0)/ks.length,c=clsOf(f,r);return`<i style="background:${rtCol(c)}" title="${nm}: ${RT[c].n}"></i>`}).join("");
    const go=idx.find(k=>hourOf(k)===hNow)??idx[Math.min(idx.length-1,12)];
    return`<button class="dcard" data-time="${go}" aria-pressed="${d===cur}"><span class="dn">${d===today?"Today":DOW[p.dow]+" "+p.d}</span><span class="dh">${faceText(use.reduce((a,k)=>a+s.hr[k].face,0)/use.length)}</span><span class="dseg">${seg}</span></button>`}).join("")}</div>`}
function hourly(s){const T=DATA.times,cur=T[TI].slice(0,10),day=dayIdx().find(x=>x.d===cur),step=S.step,ks=day.idx.filter(k=>hourOf(k)>=5&&hourOf(k)<=20&&(step===1||((hourOf(k)-5)%3===0&&hourOf(k)<20)));
  const head=`<div class="hrow hhead${step===3?" w3":""}"><span>Time</span><span>Surf</span><span>Swell</span><span>Wind</span><span class="num">Tide</span><span class="num">Score</span></div>`;
  return`<div class="hours">${head}${ks.map(k=>{const grp=step===1?[k]:day.idx.filter(j=>j>=k&&j<k+3&&hourOf(j)<=20),n=grp.length,mid=grp[Math.min(1,n-1)],hm=s.hr[mid];
    const face=grp.reduce((t,j)=>t+s.hr[j].face,0)/n,rate=grp.reduce((t,j)=>t+s.hr[j].rate,0)/n,cls=clsOf(face,rate),wsv=grp.map(j=>s.wx.ws[j]).filter(v=>v!=null),ws=wsv.length?wsv.reduce((t,v)=>t+v,0)/wsv.length:null,wd=s.wx.wd[mid];
    const h0=hourOf(k),h1=h0+n,label=step===1?h12(h0):`${h0%12||12}–${h1%12||12} ${h1<12?"AM":"PM"}`;
    const tide=step===1?(hm.tide==null?"\u2013":hm.tide.toFixed(1)):(s.hr[k].tide==null?"\u2013":`${s.hr[k].tide.toFixed(1)}\u2192${s.hr[grp[n-1]].tide.toFixed(1)}`);
    return`<button class="hrow${step===3?" w3":""}${grp.includes(TI)?" on":""}${grp.some(j=>s.wx.day[j])?"":" night"}" data-time="${grp.includes(TI)?TI:mid}" title="${RT[cls].n}"><span>${label}</span><span class="hs"><i class="dot" style="background:${rtCol(cls)}"></i>${faceText(face)}</span>
    <span>${hm.dom?`${hm.dom.h.toFixed(1)} ft ${Math.round(hm.dom.p)} s ${comp(hm.dom.d)}`:"\u2013"}</span><span>${ws==null?"\u2013":`${Math.round(ws)} kt ${arrow(wd)}<small>${hm.w.word}</small>`}</span><span class="num">${tide}</span><span class="num"><b>${shown(rate).toFixed(1)}</b></span></button>`}).join("")}</div>`}
function dayChart(s){const T=DATA.times,cur=T[TI].slice(0,10),ks=dayIdx().find(x=>x.d===cur).idx,n=ks.length,W=372,H=306,x0=4,bw=(W-8)/n,x=h=>x0+h*bw,xc=h=>x0+(h+0.5)*bw;
  const kj=ks.map(k=>spotKJ(s.hr[k])),mx=Math.max(20,...kj),top=10,base=74;let g="";
  ks.forEach((k,i)=>{if(s.wx.day[k]===0)g+=`<rect x="${x(i).toFixed(1)}" y="2" width="${(bw+.05).toFixed(2)}" height="${H-22}" fill="var(--night)"/>`});
  ks.forEach((k,i)=>{const bh=Math.max(2,kj[i]/mx*(base-top));g+=`<rect x="${(x(i)+1).toFixed(1)}" y="${(base-bh).toFixed(1)}" width="${(bw-2).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${rtCol(s.hr[k].cls)}" opacity="${k===TI?1:.62}"/>`;
    g+=`<rect x="${x(i).toFixed(1)}" y="${base+22}" width="${(bw+.05).toFixed(2)}" height="4" fill="${rtCol(s.hr[k].cls)}"/>`});
  g+=`<text x="${x0+8}" y="${base+14}" font-size="9.5" fill="var(--muted)">kJ</text>`;
  for(let i=3;i<n;i+=3){const k=ks[i];g+=`<text x="${xc(i)}" y="${base+14}" font-size="10" text-anchor="middle" fill="var(--ink)">${Math.round(kj[i])}</text>`;
    const ws=s.wx.ws[k],wd=s.wx.wd[k];if(ws!=null)g+=`<g transform="translate(${xc(i)},146) rotate(${Math.round(wd+180)})"><path d="M0 -5.5 L3.8 4 L0 2 L-3.8 4 Z" fill="var(--ink)"/></g><text x="${xc(i)}" y="168" font-size="12" font-weight="600" text-anchor="middle" fill="var(--ink)">${Math.round(ws)}</text><text x="${xc(i)}" y="183" font-size="10" text-anchor="middle" fill="var(--muted)">${Math.round(s.wx.wg[k]||ws)}</text>`;
    g+=`<text x="${xc(i)}" y="${H-6}" font-size="10" text-anchor="middle" fill="var(--muted)">${h12(hourOf(k)).replace(" ","").toLowerCase()}</text>`}
  const wm=Math.max(15,...ks.map(k=>s.wx.wg[k]||0));let wa=`M${x(0)} 194`;ks.forEach((k,i)=>{wa+=`L${xc(i).toFixed(1)} ${(194-(s.wx.ws[k]||0)/wm*46).toFixed(1)}`});wa+=`L${x(n)} 194Z`;
  g=`<path d="${wa}" fill="var(--map-ink)" opacity=".13"/>`+g+`<text x="${x0+8}" y="128" font-size="9.5" fill="var(--muted)">Wind/Gust (kt)</text>`;
  if(s.tide){const vals=ks.map(k=>s.tide[k]).filter(v=>v!=null),ex=s.hilo.filter(e=>e.t.slice(0,10)===cur),lo=Math.min(...vals,...ex.map(e=>e.v)),hi=Math.max(...vals,...ex.map(e=>e.v)),t0=244,t1=284,ty=v=>t1-(v-lo)/(hi-lo||1)*(t1-t0);
    let d="",pen=false;ks.forEach((k,i)=>{const v=s.tide[k];if(v==null){pen=false;return}d+=(pen?"L":"M")+x(i).toFixed(1)+" "+ty(v).toFixed(1);pen=true});
    g+=`<text x="${x0+8}" y="222" font-size="9.5" fill="var(--muted)">Tide (ft)</text><path d="${d}" fill="none" stroke="var(--map-ink)" stroke-width="1.6"/>`;
    for(const e of ex){const hh=+e.t.slice(11,13)+(+e.t.slice(14,16))/60,px=clamp(x(hh),26,W-26),py=ty(e.v);
      g+=`<line x1="${x(hh).toFixed(1)}" x2="${x(hh).toFixed(1)}" y1="${py.toFixed(1)}" y2="${t1+6}" stroke="var(--map-ink)" stroke-width=".8" opacity=".6"/><text x="${px.toFixed(1)}" y="${(py-15).toFixed(1)}" font-size="10" font-weight="600" text-anchor="middle" fill="var(--ink)">${e.t.slice(11,16)}</text><text x="${px.toFixed(1)}" y="${(py-4).toFixed(1)}" font-size="10" text-anchor="middle" fill="var(--muted)">${e.v.toFixed(1)} ft</text>`}}
  const ci=ks.indexOf(TI);if(ci>=0)g=`<rect x="${x(ci).toFixed(1)}" y="2" width="${bw.toFixed(1)}" height="${H-22}" rx="3" fill="var(--ink)" opacity=".09"/>`+g;
  return`<div class="fc" data-chart="1" data-i0="${ks[0]}" data-n="${n}" data-x0="${x0/W}" data-x1="${(W-4)/W}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Hourly wave energy, rating, wind and tide for the selected day">${g}</svg></div>
  <p class="note" style="font-size:12px;margin-top:6px">Bars: wave energy, coloured by rating.</p>`}
function spectra(s){const h=s.hr[TI],cs=h.cs.map((c,i)=>Object.assign({i,kj:waveKJ(c.h,c.p)},c));if(!cs.length)return`<p class="note">No swell reaching this point.</p>`;
  const R=58,C=75,mx=Math.max(...cs.map(c=>c.kj),1),pt=(deg,r)=>[C+r*Math.sin(deg*Math.PI/180),C-r*Math.cos(deg*Math.PI/180)];let g="";
  for(const [a,b] of s.w){const span=(b-a+360)%360,[x1,y1]=pt(a,R),[x2,y2]=pt(b,R);g+=`<path d="M${C} ${C}L${x1.toFixed(1)} ${y1.toFixed(1)}A${R} ${R} 0 ${span>180?1:0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}Z" fill="var(--map-ink)" opacity=".13"/>`}
  g+=`<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="var(--muted)" stroke-width="1"/><circle cx="${C}" cy="${C}" r="${R*0.6}" fill="none" stroke="var(--line)" stroke-dasharray="2 3"/><circle cx="${C}" cy="${C}" r="${R*0.3}" fill="none" stroke="var(--line)" stroke-dasharray="2 3"/>`;
  for(const [d,l] of [[0,"N"],[90,"E"],[180,"S"],[270,"W"]]){const [tx,ty]=pt(d,R+12);g+=`<text x="${tx.toFixed(1)}" y="${(ty+3.5).toFixed(1)}" font-size="10" text-anchor="middle" fill="var(--muted)">${l}</text>`}
  for(const c of cs.slice().sort((a,b)=>b.kj-a.kj)){const r=Math.max(10,Math.sqrt(c.kj/mx)*R*0.95),[xa,ya]=pt(c.d-9,r),[xb,yb]=pt(c.d+9,r);g+=`<path d="M${C} ${C}L${xa.toFixed(1)} ${ya.toFixed(1)}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${xb.toFixed(1)} ${yb.toFixed(1)}Z" fill="${CCOL[c.i%3]}" opacity="${c.df<0.5?.45:.95}"/>`}
  const ws=s.wx.ws[TI],wd=s.wx.wd[TI];if(ws!=null){const [wx1,wy1]=pt(wd,R+1);g+=`<g transform="translate(${wx1.toFixed(1)},${wy1.toFixed(1)}) rotate(${Math.round(wd+180)}) scale(1.25)"><path d="M0 -7 L4.5 5 L0 2.5 L-4.5 5 Z" fill="#8fd19e" stroke="var(--panel)" stroke-width="1.6" stroke-linejoin="round" paint-order="stroke"/></g>`}
  return`<div class="spec"><div class="slist">${cs.map(c=>`<div class="srow"><svg class="arr" viewBox="-6 -6 12 12" aria-hidden="true"><g transform="rotate(${Math.round(c.d+180)})"><path d="M0 -5 L3.4 3.6 L0 1.8 L-3.4 3.6 Z" fill="${CCOL[c.i%3]}"/></g></svg><b>${c.h.toFixed(1)} ft</b><span>${Math.round(c.p)} s</span><span>${comp(c.d)} ${Math.round(c.d)}°</span><span class="num">${Math.round(c.kj)} kJ</span>
    <small>${c.k} · ${c.face<0.5?(c.p<5?"too short to surf":c.df<0.5?"blocked here":"under 1 ft here"):c.face.toFixed(1)+" ft faces here"}</small></div>`).join("")}</div>
  <svg class="rose" viewBox="0 0 150 150" role="img" aria-label="Compass showing where each swell comes from, the spot's swell window, and the wind">${g}</svg></div>
  <p class="note" style="font-size:12px;margin-top:6px">Wedges show where each swell comes from. Shaded: the spot's swell window. Arrow: wind, pointing the way it blows.</p>`}
function windows(s){const T=DATA.times,out=[];let i=0;
  while(i<T.length){const day=T[i].slice(0,10);let best=null;let j=i;for(;j<T.length&&T[j].slice(0,10)===day;j++){if(j<NOWI||j+2>=T.length||T[j+2].slice(0,10)!==day)continue;if(!(s.wx.day[j]&&s.wx.day[j+2]))continue;
      const r=(s.hr[j].rate+s.hr[j+1].rate+s.hr[j+2].rate)/3;if(!best||r>best.r)best={r,j}}
    if(best)out.push(best);i=j}
  return out.map(b=>{const h=s.hr[b.j+1],p=tparts(T[b.j]);return`<button class="win" data-time="${b.j+1}"><span>${DOW[p.dow]} <span class="m">${h12(p.h)}–${h12(p.h+3)}</span></span>${rlab(h.cls)}<span>${faceText(h.face)}</span></button>`}).join("")}
const svgI=d=>`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON={wind:svgI('<path d="M3 8h9a2.5 2.5 0 1 0-2.5-2.5M3 12h13a2.5 2.5 0 1 1-2.5 2.5M3 16h6"/>'),tide:svgI('<path d="M2 14c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3M2 19c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3M12 3v5m0-5-2 2m2-2 2 2"/>'),sun:svgI('<circle cx="12" cy="12" r="4"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>'),temp:svgI('<path d="M12 4a2 2 0 0 0-2 2v8.3a4 4 0 1 0 4 0V6a2 2 0 0 0-2-2z"/>'),buoy:svgI('<path d="M12 3v4m-4 0h8l2 9H6zM3 20c2 0 2-1.5 4.5-1.5S10 20 12 20s2-1.5 4.5-1.5S19 20 21 20"/>')};
const DIRW={N:"north",NNE:"north",NE:"northeast",ENE:"east",E:"east",ESE:"east",SE:"southeast",SSE:"south",S:"south",SSW:"south",SW:"southwest",WSW:"west",W:"west",WNW:"west",NW:"northwest",NNW:"north"};
/* Rule-of-thumb wetsuit by water temperature in degrees F (the usual surf-shop charts). */
const SUITS=["Boardshorts","Spring suit \u00b7 2 mm","3/2 mm fullsuit","4/3 mm fullsuit","4/3 mm + booties","5/4 mm + booties, hood","6/5 mm hooded, gloves"],SUIT_AT=[75,70,65,60,55,50];
/* Feels-like air temperature (Steadman apparent temperature, the Australian BoM version): air, humidity and wind. */
function feelsF(tF,rh,ktw){if(tF==null||ktw==null)return null;const c=(tF-32)*5/9,e=(rh==null?50:rh)/100*6.105*Math.exp(17.27*c/(237.7+c)),a=c+0.33*e-0.70*(ktw*0.5144)-4;return a*9/5+32}
/* Suit tier from water temperature, nudged one step thicker when the air feels cold, two when it feels very cold, one thinner when it feels hot. */
function suitIdx(f){let i=SUIT_AT.findIndex(t=>f>=t);return i<0?SUITS.length-1:i}
function suitFor(f,fl){let i=suitIdx(f),n=0;if(fl!=null){if(fl<45)n=2;else if(fl<55)n=1;else if(fl>=80&&i>0)n=-1}
  i=Math.max(0,Math.min(SUITS.length-1,i+n));return{t:SUITS[i],n,base:SUITS[suitIdx(f)]}}
/* Sideways drift along the beach: the longshore current from breaking waves (Komar and Inman, 1970): V = 1.17 * sqrt(g*Hb) * sin(ab) * cos(ab).
   Hb is the breaker height and ab the angle the waves hit the beach at breaking. The angle at breaking is the swell's angle to the shore, bent toward the beach
   by shallow water (Snell's law, using wave speeds c = gT/2pi in deep water and sqrt(g*depth) at the break, depth taken as Hb/0.78).
   Sandbar beaches get the full value. Jetties and piers block the along-shore flow and reefs and points focus it differently, so those are scaled down (a judgment call).
   Rips are fed by this drift, but this is not a direct rip measurement. */
function driftOf(s,h){if(!h||h.face<1||!h.dom)return null;const g=9.81,Hb=h.face*0.3048,T=h.dom.p,a0=Math.min(89,angDiff(h.dom.d,s.f))*Math.PI/180;
  const c0=g*T/(2*Math.PI),cb=Math.sqrt(g*Hb/0.78),sb=Math.min(0.999,Math.sin(a0)*cb/c0);
  const tf=/jetty|pier|breakwater|wedge|river/i.test(s.t)?0.6:/reef|point|cobble/i.test(s.t)?0.7:1;
  const v=1.17*Math.sqrt(g*Hb)*sb*Math.sqrt(1-sb*sb)*tf;
  return{v,lvl:v<0.25?0:v<0.5?1:2,txt:v<0.25?"light drift":v<0.5?"moderate drift":"strong drift, watch for rips"}}
const DR_NM=["Light","Moderate","Strong"],DR_MAX=0.8;
/* "Current" section: estimated sideways drift for each daylight hour of the selected day (see driftOf). */
function driftSection(s){if(!s.ok)return"";const cd=DATA.times[TI].slice(0,10),day=dayIdx().find(x=>x.d===cd);if(!day)return"";
  const ks=day.idx.filter(k=>s.wx.day[k]===1&&s.hr[k]);if(!ks.length)return"";
  const dr=ks.map(k=>({k,d:driftOf(s,s.hr[k])})),some=dr.filter(x=>x.d);
  const hl=k=>`${h12s(hourOf(k))}${ampm(hourOf(k))[0]}`,H=7;
  const now=driftOf(s,s.hr[TI]);
  if(!some.length)return`<div><p class="lab" style="margin-bottom:8px">Current</p><div class="wx"><p class="note" style="margin:0">Too small to push much sideways today.</p></div></div>`;
  const top=some.reduce((a,b)=>b.d.v>a.d.v?b:a),mx=top.d.lvl,hrs=some.filter(x=>x.d.lvl===mx);
  const take=mx===0?"Light drift all day.":`${DR_NM[mx]} drift${hrs.length===some.length?" all day":`, peaking around ${h12s(hourOf(top.k))} ${ampm(hourOf(top.k)).toUpperCase()}`}.`+(mx>=1?" Rips more likely near sandbars and channels.":"");
  const y=v=>Math.max(3,v/DR_MAX*106),tick=(v,n)=>`<div class="dl" style="bottom:${v/DR_MAX*106}px"><i>${n}</i></div>`;
  const bars=dr.map(x=>`<div class="db ${x.d?["L","M","S"][x.d.lvl]:""}${x.k===TI?" now":""}" style="height:${x.d?y(x.d.v):3}px" title="${hl(x.k)}: ${x.d?DR_NM[x.d.lvl].toLowerCase()+" ("+x.d.v.toFixed(2)+" m/s)":"flat"}"></div>`).join("");
  const ax=dr.map(x=>`<span>${hourOf(x.k)%3===0?hl(x.k):""}</span>`).join("");
  return`<div><p class="lab" style="margin-bottom:8px">Current</p><div class="wx"><div class="dh"><b>${now?DR_NM[now.lvl]+" drift":"Flat, no drift"}</b><span>${fmt(TI)}</span></div>
   <p class="note" style="margin:2px 0 10px">${take}</p>
   <div class="dbars">${tick(0.25,"Moderate")}${tick(0.5,"Strong")}${bars}</div><div class="dax">${ax}</div>
   <div class="dleg"><span><i class="L"></i>Light</span><span><i class="M"></i>Moderate</span><span><i class="S"></i>Strong</span><span style="margin-left:auto">Outlined: selected</span></div>
   <p class="note" style="margin:8px 0 0">Estimated from wave height and the angle the swell meets the beach. Not a direct rip measurement.</p></div></div>`}
function summary(s,h,tide,trend,sst){const out=[],ws=s.wx.ws[TI],wd=s.wx.wd[TI];
  if(ws!=null)out.push(ws<4?`Light ${DIRW[comp(wd)]} wind`:`${Math.round(ws)} kt ${h.w.word.toLowerCase()} wind`);
  if(tide!=null)out.push(`${tide<1.5?"low":tide<4?"mid":"high"} tide ${trend}`.trim());
  if(sst!=null)out.push(`${Math.round(sst*9/5+32)}° water`);
  const t=out.join(", ");return t?t[0].toUpperCase()+t.slice(1)+".":""}

/* Best windows: 2-3 daylight hour runs inside one day, every hour Poor-to-fair or better, ranked by mean rate. */
function bestWindows(s,count,dayIdxs){
  if(!s||!s.ok)return[];const T=DATA.times,cands=[];
  for(const {idx} of dayIdx()){if(dayIdxs&&!dayIdxs.includes(idx[0]))continue;
    for(let a=0;a<idx.length;a++)for(const len of[2,3]){const b=a+len-1;if(b>=idx.length)continue;
      const ks=idx.slice(a,b+1);if(ks[ks.length-1]<NOWI)continue;
      if(ks.some(k=>!s.wx.day[k]))continue;
      const hs=ks.map(k=>s.hr[k]);if(hs.some(h=>!h||h.cls==null))continue;
      const score=hs.reduce((t,h)=>t+h.rate,0)/len,face=hs.reduce((t,h)=>t+h.face,0)/len,
        peakIdx=ks.reduce((m,k)=>s.hr[k].rate>s.hr[m].rate?k:m,ks[0]);
      cands.push({startIdx:ks[0],endIdx:ks[ks.length-1],score,face,peakIdx,ok:hs.every(h=>h.cls>=2)})}}
  const rank=(x,y)=>y.score-x.score||y.face-x.face;
  let pool=cands.filter(c=>c.ok).sort(rank),weak=false;
  if(!pool.length){pool=cands.sort(rank).slice(0,1);weak=true}
  const out=[];for(const c of pool){if(out.length>=count)break;
    if(out.some(o=>c.startIdx<=o.endIdx+1&&o.startIdx<=c.endIdx+1))continue;out.push(Object.assign(c,{weak}))}
  return out}
const h12s=h=>h===0?12:h>12?h-12:h,ampm=h=>h<12?"am":"pm";
function winRange(w){const a=hourOf(w.startIdx),b=hourOf(w.endIdx)+1,ea=b%24;
  return ampm(a)===ampm(ea)?`${h12s(a)}–${h12s(ea)}${ampm(ea)}`:`${h12s(a)}${ampm(a)}–${h12s(ea)}${ampm(ea)}`}
const sessionName=h=>h<8?"Dawn patrol":h<11?"Morning":h<14?"Midday":h<17?"Afternoon":"Evening";
function winCard(s,w){const k=w.peakIdx,h=s.hr[k],p=tparts(DATA.times[w.startIdx]),ws=s.wx.ws[k];
  const tide=h.tide,nx=s.tide&&s.tide[Math.min(k+1,s.tide.length-1)],trend=tide==null||nx==null?"":nx>tide+0.05?"rising":nx<tide-0.05?"falling":"slack";
  const r=TIDE_RANGE[s.td],zone=tide!=null&&r&&tide>=r[0]&&tide<=r[1];
  const l1=[h.dom?`${h.dom.h.toFixed(1)} ft @ ${Math.round(h.dom.p)} s ${comp(h.dom.d)}`:"",ws==null||h.w.d==null?"":`${h.w.word} ${Math.round(ws)} kt`].filter(Boolean).join(" · ");
  const l2=tide==null?"":`${tide.toFixed(1)} ft${trend?", "+trend:""}${zone?` <span class="z">· in the zone</span>`:""}`;
  return`<button class="bwc" data-time="${w.startIdx}" style="--rc:${rtCol(h.cls)}"><i></i><div class="t">${DOW[p.dow]} ${MON[p.m-1]} ${p.d} · ${winRange(w)}<small>${sessionName(hourOf(w.startIdx))}</small></div><div class="f">${faceText(h.face)}</div><div class="p"><span class="pill${RT[h.cls].dk?" dk":""}">${RT[h.cls].n}</span></div><div class="c">${l1}${l1&&l2?"<br>":""}${l2}</div></button>`}
function bestWindowsView(s){
  const top=bestWindows(s,3);if(!top.length)return"";
  const days=dayIdx().filter(({idx})=>idx[idx.length-1]>=NOWI),rows=[];
  for(const {d,idx} of days){if(top.some(w=>DATA.times[w.startIdx].slice(0,10)===d))continue;
    const w=bestWindows(s,1,[idx[0]])[0];if(!w||w.weak||s.hr[w.peakIdx].cls<2)continue;const p=tparts(DATA.times[w.startIdx]),c=s.hr[w.peakIdx].cls;
    rows.push(`<button class="bwr" data-time="${w.startIdx}"><b>${DOW[p.dow]}</b><span>${winRange(w)}</span><span class="r"><i class="dot" style="background:${rtCol(c)}"></i>${RT[c].n}</span></button>`)}
  return`<div><p class="lab" style="margin-bottom:8px">${top[0].weak?"Best Windows (flat week)":"Best Windows"}</p><div class="bw">${top.map(w=>winCard(s,w)).join("")}</div></div>`+
    (rows.length?`<div><p class="lab" style="margin-bottom:4px">Other days</p><div class="bwd">${rows.join("")}</div></div>`:"")}
/* Weather card: temperature, sky, rain, 3-hour strip, sunrise/sunset and UV for the selected day. */
const wxI=(p,c)=>`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const SKY={sun:wxI('<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',"#e7c14a"),
  part:wxI('<circle cx="8.5" cy="8" r="3" stroke="#e7c14a"/><path d="M8 19h9a3.6 3.6 0 0 0 .5-7.2A5 5 0 0 0 8.2 11 4 4 0 0 0 8 19z"/>',"#c8c3a0"),
  cloud:wxI('<path d="M7 18h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 9.5 4.3 4.3 0 0 0 7 18z"/>',"#9fb0b8"),
  rain:wxI('<path d="M7 15h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 6.5 4.3 4.3 0 0 0 7 15z"/><path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5"/>',"#6fb3e0"),
  moon:wxI('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',"#aab6c8")};
function skyOf(wx,k){const cc=wx.cc[k],pp=wx.pp[k]||0,day=wx.day[k];if(pp>=50)return{i:SKY.rain,t:"Rain likely"};
  if(cc==null)return{i:SKY.cloud,t:""};if(cc<15)return day?{i:SKY.sun,t:"Sunny"}:{i:SKY.moon,t:"Clear"};
  if(cc<50)return day?{i:SKY.part,t:"Mostly sunny"}:{i:SKY.cloud,t:"Mostly clear"};if(cc<80)return{i:SKY.part,t:"Partly cloudy"};return{i:SKY.cloud,t:cc>=92?"Overcast":"Mostly cloudy"}}
const clk=iso=>{if(!iso)return"\u2013";const h=+iso.slice(11,13),m=iso.slice(14,16);return`${h12s(h)}:${m} ${ampm(h).toUpperCase()}`};
function weatherCard(s){const w=s.wx;if(!w||!w.tp||w.tp[TI]==null)return"";
  const cur=tparts(DATA.times[TI]),cd=DATA.times[TI].slice(0,10),day=dayIdx().find(x=>x.d===cd);if(!day)return"";
  const sk=skyOf(w,TI),pp=w.pp[TI];
  // Marine layer guess: a cloudy, humid early morning that burns off later the same day.
  const am=day.idx.filter(k=>hourOf(k)>=5&&hourOf(k)<=9),aw=am.length?am.reduce((t,k)=>t+(w.cc[k]||0),0)/am.length:0,ah=am.length?am.reduce((t,k)=>t+(w.rh[k]||0),0)/am.length:0;
  let ml="";if(aw>=80&&ah>=78){const clr=day.idx.find(k=>hourOf(k)>9&&(w.cc[k]||0)<60);ml=clr!=null?`Marine layer likely until about ${h12s(hourOf(clr))} ${ampm(hourOf(clr)).toUpperCase()}`:"Marine layer likely most of the day"}
  const cols=[6,9,12,15,18,21].map(h=>day.idx.find(k=>hourOf(k)===h)).filter(k=>k!=null),on=cols.reduce((m,k)=>Math.abs(k-TI)<Math.abs(m-TI)?k:m,cols[0]);
  const sd=w.sun&&w.sun.d?w.sun.d.indexOf(cd):-1,rise=sd>=0?w.sun.r[sd]:null,set=sd>=0?w.sun.s[sd]:null,uvm=Math.max(0,...day.idx.map(k=>w.uv[k]||0)),uvn=uvm<3?"Low":uvm<6?"Moderate":uvm<8?"High":uvm<11?"Very high":"Extreme";
  return`<div><p class="lab" style="margin-bottom:8px">Weather \u00b7 ${fmt(TI)}</p><div class="wx"><div class="hd"><span class="big">${Math.round(w.tp[TI])}\u00b0F<small>${sk.t}</small></span></div>
   <div class="sub">${[ml,pp!=null?`Rain ${pp}%`:""].filter(Boolean).join(" \u00b7 ")}</div>
   <div class="row">${cols.map(k=>{const q=skyOf(w,k),h=hourOf(k),r=w.pp[k]||0;return`<button data-time="${k}" class="${k===on?"on":""}"><span>${h12s(h)}${ampm(h)}</span>${q.i}<b>${Math.round(w.tp[k])}\u00b0</b><em>${r>=20?r+"%":""}</em></button>`}).join("")}</div>
   <div class="mini"><div><span>Sunrise</span><b>${clk(rise)}</b></div><div><span>Sunset</span><b>${clk(set)}</b></div><div><span>UV</span><b>${Math.round(uvm)} \u00b7 ${uvn}</b></div></div></div></div>`}
/* "Score Calculation": splits the 10 - score gap between the factors in rateHour. The factors multiply, so each one's share of the loss
   is its log-share of the total (rows add up exactly and order does not matter). "Without" = score if that one factor were perfect. */
const WHY=new Set();
function whyScore(s){if(!s.ok)return"";const i=TI,h=s.hr[i],hd=`<p class="lab" style="margin-bottom:8px">Score Calculation · ${fmt(TI)}</p>`;
  if(h.face<1)return`<div>${hd}<p class="note">Under 1 ft at the face, so it rates as Flat and there is no score to explain.</p></div>`;
  const w=h.w,ws=s.wx.ws[i],wd=s.wx.wd[i],tide=h.tide,dom=h.dom,lo=s.sz[0],hi=s.sz[1];
  const per=dom?clamp((dom.p-6)/8,0,1)*0.8+0.2:0.2,fs=sizeScore(h.face,lo,hi),fw=0.25+0.75*w.q,fp=0.55+0.45*per,ft=tideScore(s.td,tide);
  const raw=10*fs*fw*fp*ft,cap=windCap(ws,w.d),rate=Math.min(cap,raw),fc=Math.min(1,cap/raw),sh=shown(rate),loss=10-rate;
  const F=[{k:"size",f:fs},{k:"period",f:fp},{k:"wind",f:fw},{k:"tide",f:ft},{k:"cap",f:fc}],L=F.map(x=>-Math.log(Math.max(x.f,0.001))),sum=L.reduce((a,b)=>a+b,0);
  F.forEach((x,j)=>{x.loss=sum>0?loss*L[j]/sum:0;x.wo=x.k==="cap"?raw:Math.min(cap,raw/Math.max(x.f,0.001))});
  const FR=F.filter(x=>x.k!=="cap"||x.f<0.995),tl=FR.reduce((a,x)=>a+x.loss,0);FR.forEach(x=>{x.cr=(tl>0.0001?rate*(tl-x.loss)/((FR.length-1)*tl):rate/FR.length)*(rate>0?sh/rate:1)});
  const big=F.reduce((a,b)=>b.loss>a.loss?b:a),NM={size:"Size",period:"Period",wind:"Wind",tide:"Tide",cap:"Cap"};
  const e=ws==null||w.d==null?0:ws*clamp((w.d-70)/50,0,1),tr=TIDE_RANGE[s.td],off=tide==null||!tr?0:tide<tr[0]?tr[0]-tide:tide>tr[1]?tide-tr[1]:0;
  const D={
   size:{inp:`${h.face.toFixed(1)} ft face · ideal ${lo}–${hi} ft`,src:"forecast model",
     fm:h.face<lo?`Below the ideal range, so 0.2 + ${SZ.a} × (${h.face.toFixed(1)} − 1) ÷ (${lo} − 1)`:h.face<=hi?`Inside the ideal range, so ${SZ.b} + ${+(1-SZ.b).toFixed(2)} × (${h.face.toFixed(1)} − ${lo}) ÷ (${hi} − ${lo})`:`Above the ideal range, so 1 − ${SZ.d} × (${h.face.toFixed(1)} − ${hi}) ÷ ${hi}, never below ${SZ.m}`},
   period:{inp:dom?`${Math.round(dom.p)} s peak period`:"no swell",src:"forecast model",fm:`0.55 + 0.45 × period score ${per.toFixed(2)}. Period score is (period − 6) ÷ 8 kept between 0 and 1, times 0.8, plus 0.2.`},
   wind:{inp:ws==null?"no wind data":`${Math.round(ws)} kt ${w.word.toLowerCase()}`,src:"4 wind models: highest on daytime onshore, else median",fm:ws==null?"No wind data, so wind is not applied.":`0.25 + 0.75 × wind quality ${w.q.toFixed(2)}. Quality drops from 1 as wind passes 4 kt, faster when it is onshore.`},
   tide:{inp:tide==null?"no tide data":`${tide.toFixed(1)} ft · likes ${s.td}`,src:"NOAA tide predictions",fm:tide==null||!tr?"No tide data, so tide is not applied.":off===0?`Inside this spot's best band (${tr[0]} to ${tr[1]} ft), so no penalty.`:`${off.toFixed(1)} ft outside the best band (${tr[0]} to ${tr[1]} ft), so 1 − 0.1 × ${off.toFixed(1)}, never below 0.7.`},
   cap:{inp:cap>=10?"No cap, not blown out":`Capped at ${shown(cap).toFixed(1)}`,src:"4 wind models: highest on daytime onshore, else median",fm:ws==null?"No wind data.":`Effective onshore wind is ${e.toFixed(1)} kt (speed × how onshore). ${CUR?`Up to 3 kt there is no cap. The ceiling then slopes down in a straight line to ${shown(4.9).toFixed(1)} at 6 kt. ${[[8,3.8],[10,2.9],[12,2.3],[15,1.8]].map(([k,c])=>`At ${k} kt it cannot pass ${shown(c).toFixed(1)}`).join(". ")}. Above that it keeps falling toward 1.`:`Up to 4 kt there is no cap; at 6 kt the score cannot pass 4; at 8 kt, 2.8; at 10 kt, 1.9; above that, 1.`}`}};
  const fmtF=x=>Math.round(x.f*100)+"%";
  const rows=FR.map(x=>{const d=D[x.k],on=WHY.has(x.k),bad=x.loss>=0.3,drag=x===big&&x.loss>=0.3;
    return`<details class="wy${bad?" bad":""}${drag?" drag":""}" data-why="${x.k}"${on?" open":""}><summary><span class="nm">${NM[x.k]}</span><span class="f">${fmtF(x)}</span><span class="in">${d.inp}</span><span class="bar"><i style="width:${Math.round(clamp(x.f,0,1)*100)}%"></i></span></summary>
    <div class="wx"><b>${x.k==="cap"?"Ceiling":NM[x.k]+" factor"} ${x.f>=0.995&&x.k==="cap"?"none":x.f.toFixed(2)}</b><br>${d.fm}<br><b>Share of the score:</b> +${x.cr.toFixed(1)} of ${sh.toFixed(1)}<br><b>Without this:</b> ${shown(x.wo).toFixed(1)} instead of ${sh.toFixed(1)}${shown(x.wo)-sh<0.05?" (no change)":" (+"+(shown(x.wo)-sh).toFixed(1)+")"}<br><span class="tag">${d.src}</span></div></details>`}).join("");
  const nb=BUOYS.map((b,k)=>({b,d:DATA.buoys[k]})).filter(o=>o.d.ok).sort((a,c)=>dist2(a.b,s)-dist2(c.b,s))[0];
  return`<div>${hd}<div class="why"><div class="wtop"><span class="wsc">${sh.toFixed(1)}<small> / 10</small></span><span class="wbg">${big.loss>=0.3?`Held back by <b>${big.k==="cap"?"wind cap":NM[big.k].toLowerCase()}</b>`:"Nothing is holding it back"}</span></div>
  ${rows}
</div></div>`}
/* ---------- Wind check: live station observations vs each forecast model ---------- */
const WMODELS=[["ncep_hrrr_conus","HRRR"],["ncep_nbm_conus","NBM"],["icon_seamless","ICON"],["gem_seamless","GEM"]];
const OBS={};   // by forecast-point index: {at, st:[{id,n,mi,kn,dir,gust,age}], err}
const KT=v=>v==null?null:v/1.852;
async function loadObs(s){const k=s.fp,c=OBS[k];if(c&&Date.now()-c.at<6e5)return c;
  if(c&&c.busy)return c.busy;
  const job=(async()=>{const o={at:Date.now(),st:[]};
    try{const p=await getJSON(`https://api.weather.gov/points/${s.la.toFixed(4)},${s.lo.toFixed(4)}`);
      const l=await getJSON(p.properties.observationStations+"?limit=5");
      const ids=(l.features||[]).slice(0,5).map(f=>({id:f.properties.stationIdentifier,n:f.properties.name,la:f.geometry.coordinates[1],lo:f.geometry.coordinates[0]}));
      const rs=await Promise.all(ids.map(async t=>{try{const j=(await getJSON(`https://api.weather.gov/stations/${t.id}/observations/latest`)).properties;
        const sp=j.windSpeed&&j.windSpeed.value!=null?j.windSpeed.value:null;if(sp==null)return null;
        const age=Math.max(0,(Date.now()-new Date(j.timestamp).getTime())/6e4);if(!(age<180))return null;
        const dx=(t.lo-s.lo)*0.84*69,dy=(t.la-s.la)*69;
        return{id:t.id,n:t.n,mi:Math.sqrt(dx*dx+dy*dy),kn:KT(sp),dir:j.windDirection&&j.windDirection.value!=null?j.windDirection.value:null,gust:j.windGust&&j.windGust.value!=null?KT(j.windGust.value):null,age}}catch(e){return null}}));
      o.st=rs.filter(Boolean).sort((a,b)=>a.mi-b.mi).slice(0,3);
      if(!o.st.length)o.err="No station nearby reported wind in the last 3 hours."}
    catch(e){o.err="Could not reach weather.gov ("+(e.message||e)+")."}
    OBS[k]=o;return o})();
  OBS[k]=Object.assign({st:[]},c||{at:0},{busy:job});const o=await job;return o}
/* Compares the nearest station with the wind the app uses right now. Returns a short note, or "" when they agree or there is no data. */
function windFlag(s){const o=OBS[s.fp];if(!o||!o.st||!o.st.length||Math.abs(TI-NOWI)>1)return"";
  const ob=o.st[0],used=s.wx.ws[NOWI];if(used==null)return"";const d=ob.kn-used;
  if(d>=3)return`Station ${ob.id} reads ${Math.round(ob.kn)} kt, ${Math.round(d)} kt above the ${Math.round(used)} kt used here. The forecast may be low.`;
  if(d<=-3)return`Station ${ob.id} reads ${Math.round(ob.kn)} kt, ${Math.round(-d)} kt below the ${Math.round(used)} kt used here. The forecast may be high.`;return""}
function windCheckBody(s){const i=TI,w=s.wx,o=OBS[s.fp],now=Math.abs(TI-NOWI)<=1;
  const rows=WMODELS.map(([m,l])=>{const v=w.wm&&w.wm[m]&&w.wm[m][i];return v?`<div class="wcr"><span>${l}</span><span>${Math.round(v[0])} kt</span><span>${arrow(v[1])} ${comp(v[1])}</span></div>`:""}).join("");
  const used=w.ws[i],med=w.wmed&&w.wmed[i];
  let obRows="",note="";
  if(!now)note="Move the timeline to Now to compare with live station readings.";
  else if(!o||(o.busy&&!o.st.length))note="Checking nearby stations…";
  else if(o.err)note=o.err;
  else{obRows=o.st.map(t=>`<div class="wcr obs"><span>${esc(t.id)}<i>${t.mi.toFixed(1)} mi</i></span><span>${Math.round(t.kn)} kt${t.gust!=null&&t.gust>t.kn+1?` g${Math.round(t.gust)}`:""}</span><span>${t.dir==null?"–":arrow(t.dir)+" "+comp(t.dir)}</span></div>`).join("");
    note=`Observed ${Math.round(o.st[0].age)} min ago, from weather.gov. Airport stations sit a little inland, so the beach itself is often a bit windier.`}
  const fl=now?windFlag(s):"";
  return`${fl?`<p class="wflag">${esc(fl)}</p>`:""}<div class="wcr hd"><span>Source</span><span>Speed</span><span>From</span></div>${obRows}${rows}
  <div class="wcr used"><span>Median of 4</span><span>${med==null?"–":Math.round(med)+" kt"}</span><span></span></div>
  <div class="wcr used"><span><b>Used by the app</b></span><span><b>${used==null?"–":Math.round(used)+" kt"}</b></span><span>${used!=null&&med!=null&&used>med+0.4?"highest":"median"}</span></div>
  <p class="wcn">${esc(note)}</p>`}
function windCheck(s){if(!s.ok||!s.wx.wm)return"";
  const el=`<div class="wx wck" id="wxchk"><p class="lab" style="margin:0 0 8px">Wind check · ${fmt(TI)}</p><div id="wxchkb">${windCheckBody(s)}</div></div>`;
  if(Math.abs(TI-NOWI)<=1&&(!OBS[s.fp]||Date.now()-OBS[s.fp].at>=6e5&&!OBS[s.fp].busy))loadObs(s).then(()=>{const b=document.getElementById("wxchkb");if(b&&TI!=null)b.innerHTML=windCheckBody(s)});
  return`<div>${el}</div>`}
/* ---------- Tile pop-ups: wind (by hour / check), tide (by hour), weather ---------- */
const POP={k:null,flip:false};let popEl=null;
function popEnsure(){if(popEl)return popEl;popEl=document.createElement("div");popEl.id="pop";popEl.hidden=true;
  popEl.innerHTML='<div class="popc" role="dialog" aria-modal="true"><div class="poph"><b id="popt"></b><button class="popx" aria-label="Close" data-popx="1">×</button></div><div id="popseg"></div><div class="popb" id="popb"></div></div>';
  document.body.appendChild(popEl);
  popEl.addEventListener("click",e=>{if(e.target===popEl||e.target.closest("[data-popx]"))return popClose();
    const c=e.target.closest("[data-pchart]");if(c){const r=c.getBoundingClientRect();return setTime(clamp(Math.floor((e.clientX-r.left)/PW),0,DATA.times.length-1))}
    const t=e.target.closest("[data-time],[data-flip]");if(!t)return;
    if(t.dataset.flip!=null){POP.flip=t.dataset.flip==="1";popRender(true)}else setTime(+t.dataset.time)});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&POP.k)popClose()});return popEl}
function popOpen(k){POP.k=k;POP.flip=false;popEnsure().hidden=false;popRender(true)}
function popClose(){POP.k=null;if(popEl)popEl.hidden=true}
/* Scrollable week charts for the Wind and Tide pop-ups. One column per hour, PW px wide, so the two line up. */
const PW=34;
const msOf=t=>Date.UTC(+t.slice(0,4),+t.slice(5,7)-1,+t.slice(8,10),+t.slice(11,13),+t.slice(14,16)||0);
function popBack(s,n,H){let g="";for(let k=0;k<n;k++)if(s.wx.day[k]===0)g+=`<rect x="${k*PW}" y="2" width="${PW}" height="${H-22}" fill="var(--night)"/>`;
  g+=`<rect x="${TI*PW}" y="2" width="${PW}" height="${H-22}" rx="3" fill="var(--ink)" opacity=".1"/>`;
  g+=`<line x1="${(NOWI+.5)*PW}" x2="${(NOWI+.5)*PW}" y1="2" y2="${H-20}" stroke="var(--accent)" stroke-width="1" stroke-dasharray="2 3"/>`;return g}
function popAxis(n,H){const T=DATA.times;let g="";
  for(let k=0;k<n;k++){const hr=hourOf(k);
    if(hr===0||k===0){const p=tparts(T[k]);g+=`<line x1="${k*PW}" x2="${k*PW}" y1="2" y2="${H-20}" stroke="var(--line)"/><text x="${k*PW+6}" y="14" font-size="11" font-weight="600" fill="var(--ink)">${DOW[p.dow]} ${MON[p.m-1]} ${p.d}</text>`}
    g+=`<text x="${(k+.5)*PW}" y="${H-5}" font-size="10" text-anchor="middle" fill="var(--muted)">${h12(hr).replace(" ","").toLowerCase()}</text>`}
  return g}
function windChartSvg(s){const n=DATA.times.length,W=n*PW,H=222,base=192,ah=88,wm=Math.max(15,...s.wx.wg.map(v=>v||0),...s.wx.ws.map(v=>v||0));
  let ar="",a=`M0 ${base}`,gl="";
  for(let k=0;k<n;k++){const ws=s.wx.ws[k];if(ws==null)continue;const xc=(k+.5)*PW,wd=s.wx.wd[k],wg=Math.max(s.wx.wg[k]||ws,ws),bad=s.hr[k].w.q<0.6;
    a+=`L${xc.toFixed(1)} ${(base-ws/wm*ah).toFixed(1)}`;gl+=`${gl?"L":"M"}${xc.toFixed(1)} ${(base-wg/wm*ah).toFixed(1)}`;
    ar+=`<g transform="translate(${xc.toFixed(1)},42) rotate(${Math.round(wd+180)})"><path d="M0 -5.5 L3.8 4 L0 2 L-3.8 4 Z" fill="${bad?"var(--warn)":"var(--ink)"}"/></g><text x="${xc.toFixed(1)}" y="68" font-size="12" font-weight="600" text-anchor="middle" fill="${bad?"var(--warn)":"var(--ink)"}">${Math.round(ws)}</text><text x="${xc.toFixed(1)}" y="83" font-size="10" text-anchor="middle" fill="var(--muted)">${Math.round(wg)}</text>`}
  a+=`L${W} ${base}Z`;
  return`<svg id="pchart" data-pchart="1" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Hourly wind and gusts for the week">${popBack(s,n,H)}<path d="${a}" fill="var(--map-ink)" opacity=".13"/><path d="${gl}" fill="none" stroke="var(--map-ink)" stroke-width="1.2" stroke-dasharray="3 3" opacity=".55"/>${popAxis(n,H)}${ar}</svg>`}
function tideChartSvg(s){const T=DATA.times,n=T.length,W=n*PW,H=214,t0=72,t1=164,vals=s.tide.filter(v=>v!=null),ex=s.hilo;
  const lo=Math.min(...vals,...ex.map(e=>e.v)),hi=Math.max(...vals,...ex.map(e=>e.v)),ty=v=>t1-(v-lo)/(hi-lo||1)*(t1-t0);let g=popBack(s,n,H),d="",pen=false;
  const tr=TIDE_RANGE[s.td];if(tr){const y1=ty(clamp(tr[1],lo,hi)),y2=ty(clamp(tr[0],lo,hi));if(y2>y1)g+=`<rect x="0" y="${y1.toFixed(1)}" width="${W}" height="${(y2-y1).toFixed(1)}" fill="var(--accent)" opacity=".09"/>`}
  g+=popAxis(n,H);
  for(let k=0;k<n;k++){const v=s.tide[k];if(v==null){pen=false;continue}d+=`${pen?"L":"M"}${((k+.5)*PW).toFixed(1)} ${ty(v).toFixed(1)}`;pen=true}
  g+=`<path d="${d}" fill="none" stroke="var(--map-ink)" stroke-width="1.8"/>`;
  const m0=msOf(T[0]);
  for(const e of ex){const f=(msOf(e.t)-m0)/36e5;if(f<0||f>n)continue;const px=(f+.5)*PW,py=ty(e.v),tx=clamp(px,26,W-26);
    g+=`<line x1="${px.toFixed(1)}" x2="${px.toFixed(1)}" y1="${py.toFixed(1)}" y2="${t1+10}" stroke="var(--map-ink)" stroke-width=".8" opacity=".6"/><text x="${tx.toFixed(1)}" y="${(py-15).toFixed(1)}" font-size="10.5" font-weight="600" text-anchor="middle" fill="var(--ink)">${e.t.slice(11,16)}</text><text x="${tx.toFixed(1)}" y="${(py-4).toFixed(1)}" font-size="10" text-anchor="middle" fill="var(--muted)">${e.v.toFixed(1)} ft</text>`}
  const tv=s.tide[TI];if(tv!=null)g+=`<circle cx="${((TI+.5)*PW).toFixed(1)}" cy="${ty(tv).toFixed(1)}" r="4.5" fill="var(--accent)" stroke="var(--panel)" stroke-width="1.5"/>`;
  return`<svg id="pchart" data-pchart="1" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tide for the week">${g}</svg>`}
function popRender(center){const s=S.sel!=null&&DATA?DATA.spots[S.sel]:null;if(!s||!s.ok||!POP.k)return popClose();
  const b=$("popb"),sc=b.scrollTop,old=b.querySelector(".pscroll"),sx=old?old.scrollLeft:0,cd=DATA.times[TI].slice(0,10);
  const p=tparts(DATA.times[TI]),dl=`${DOW[p.dow]} ${MON[p.m-1]} ${p.d}`;let html="",tt="",seg="";
  if(POP.k==="wind"){tt="Wind";
    seg=`<div class="seg2 pseg" role="group" aria-label="Wind view"><button data-flip="0" aria-pressed="${!POP.flip}">By hour</button><button data-flip="1" aria-pressed="${POP.flip}">Check</button></div>`;
    const ws=s.wx.ws[TI],wd=s.wx.wd[TI],h=s.hr[TI];
    html=POP.flip?windCheck(s):`<div class="prd"><span>${fmt(TI)}</span>${ws==null?"<b>n/a</b>":`<b>${Math.round(ws)} kt</b> ${arrow(wd)} ${comp(wd)}<span>gusts ${Math.round(s.wx.wg[TI]||ws)}</span><span>${h.w.word}</span>`}</div>
      <div class="pscroll">${windChartSvg(s)}</div><p class="pnote">Wind in knots over gusts. Orange means the wind is hurting the surface. Swipe sideways for the week, tap an hour to jump to it.</p>`}
  else if(POP.k==="tide"){tt="Tide";
    if(!s.tide)html=`<p class="pnote">No tide data for this spot.</p>`;
    else{const t=s.tide[TI],nx=s.tide[Math.min(TI+1,s.tide.length-1)],tr=t==null||nx==null?"":nx>t+0.05?"rising":nx<t-0.05?"falling":"slack",m=msOf(DATA.times[TI]),nxe=s.hilo.find(e=>msOf(e.t)>m);
      html=`<div class="prd"><span>${fmt(TI)}</span>${t==null?"<b>n/a</b>":`<b>${t.toFixed(1)} ft</b><span>${tr}</span>`}${nxe?`<span>next ${nxe.hi?"high":"low"} ${clk(nxe.t.replace(" ","T"))} · ${nxe.v.toFixed(1)} ft</span>`:""}</div>
      <div class="pscroll">${tideChartSvg(s)}</div><p class="pnote">${esc(s.tideSt)} predictions. The shaded band is the tide this spot likes${TIDE_RANGE[s.td]?` (${TIDE_RANGE[s.td][0]} to ${TIDE_RANGE[s.td][1]} ft)`:""}. Swipe sideways for the week, tap an hour to jump to it.</p>`}}
  else if(POP.k==="wx"){tt=`Weather · ${dl}`;html=weatherCard(s)}
  $("popt").textContent=tt;$("popseg").innerHTML=seg;b.innerHTML=html;b.classList.remove("flip");if(center){void b.offsetWidth;b.classList.add("flip")}
  const ps=b.querySelector(".pscroll");if(ps)ps.scrollLeft=center?Math.max(0,(TI+.5)*PW-ps.clientWidth/2):sx;
  b.scrollTop=center?0:sc}
function detail(s){const h=s.hr[TI];
  if(!s.ok)return`<div class="det"><button class="back" data-back="1">← All spots</button><h2>${esc(s.n)}</h2><p class="note">No wave data close enough to rate this spot.</p></div>`;
  const tide=h.tide,nx=s.tide&&s.tide[Math.min(TI+1,s.tide.length-1)],trend=tide==null||nx==null?"":nx>tide+0.05?"rising":nx<tide-0.05?"falling":"slack";
  const nb=BUOYS.map((b,k)=>({b,d:DATA.buoys[k]})).filter(o=>o.d.ok).sort((a,c)=>dist2(a.b,s)-dist2(c.b,s))[0];
  const sst=s.m.sst[TI],dom=h.dom;
  return`<div class="det"><button class="back" data-back="1">← All spots</button>
  <div class="hcard" style="--rc:${rtCol(h.cls)}"><button class="hstar" data-fav="${s.idx}" aria-pressed="${FAVS.has(s.n)}" aria-label="${FAVS.has(s.n)?"Remove from favorites":"Save to favorites"}">${FAVS.has(s.n)?"★":"☆"}</button>
   <div class="hctop"><div class="hring" style="--p:${h.face<1?0:Math.round(shown(h.rate)*10)}"><b>${h.face<1?"\u2013":shown(h.rate).toFixed(1)}</b></div><div><h2>${esc(s.n)}</h2><p class="hsub">${REG[s.r]} · ${esc(s.t)} · ${fmt(TI)}</p></div></div>
   <div class="hchips"><span class="hpill${RT[h.cls].dk?" dk":""}"><i></i>${RT[h.cls].n}</span>${h.face<1?"":`<span class="hchip"><b>${faceText(h.face)}</b></span>${dom?`<span class="hchip">${Math.round(dom.p)} s</span><span class="hchip">${comp(dom.d)} ${Math.round(dom.d)}\u00b0</span>`:""}`}</div>
   ${(()=>{const t=pctText(s,h);return t?`<p class="hpct">${t}</p>`:""})()}
   <p class="hline">${summary(s,h,tide,trend,sst)}</p>${nb?`<p class="hbuoy">${esc(nb.b.n)} · ${nb.d.hs[nb.d.hs.length-1].toFixed(1)} ft · ${Math.round(nb.d.tp[nb.d.tp.length-1])} s · ${ageText(nb.d)}</p>`:""}</div>
  <div class="tiles">
   <button class="tile" data-pop="wind"><span class="tk">${ICON.wind}Wind<i class="chev">›</i></span><b>${h.w.d==null?"n/a":`${Math.round(s.wx.ws[TI])} kt ${arrow(s.wx.wd[TI])} ${comp(s.wx.wd[TI])}`}</b><small class="wg">${h.w.d==null?"":`${Math.round(s.wx.wg[TI]||s.wx.ws[TI]||0)} kt · ${h.w.word}`}</small></button>
   <button class="tile" data-pop="tide"${s.tide?"":" disabled"}><span class="tk">${ICON.tide}Tide<i class="chev">›</i></span><b>${tide==null?"n/a":`${tide.toFixed(1)} ft ${trend==="rising"?"↑":trend==="falling"?"↓":""}`}</b><small>${tide==null?"":`${trend[0].toUpperCase()+trend.slice(1)} · likes ${s.td}`}</small></button>
   <div class="tile"><span class="tk">${ICON.temp}Water</span><b>${sst==null?"n/a":`${Math.round(sst*9/5+32)}°F`}</b><small>${sst==null?"":(()=>{const w=s.wx,ok=w&&w.tp&&w.tp[TI]!=null,fl=ok?feelsF(w.tp[TI],w.rh&&w.rh[TI],w.ws&&w.ws[TI]):null,r=suitFor(sst*9/5+32,fl);return r.t+(r.n&&fl!=null?`<br><span style="font-size:clamp(10.5px,3.15vw,12.5px);opacity:.8">Air feels ${Math.round(fl)}°F, ${r.n>0?"go thicker":"go thinner"}</span>`:"")})()}</small></div>
   <button class="tile" data-pop="wx"${s.wx&&s.wx.tp&&s.wx.tp[TI]!=null?"":" disabled"}><span class="tk">${ICON.sun}Weather<i class="chev">›</i></span><b>${s.wx&&s.wx.tp&&s.wx.tp[TI]!=null?Math.round(s.wx.tp[TI])+"°F":"n/a"}</b><small>${s.wx&&s.wx.tp&&s.wx.tp[TI]!=null?skyOf(s.wx,TI).t:""}</small></button>
  </div>
  ${alertBanner(s.r)}
  <div><p class="lab" style="margin-bottom:8px">Forecast</p>${dayCards(s)}</div>
  <div><p class="lab" style="margin-bottom:8px">Outlook · ${fmt(TI).split(" ")[0]}</p>${dayChart(s)}${modelSeg()}<div class="steprow"><div class="seg2" role="group" aria-label="Table interval"><button data-step="3" aria-pressed="${S.step===3}">3-hour</button><button data-step="1" aria-pressed="${S.step===1}">Hourly</button></div></div>${hourly(s)}</div>
  <div><p class="lab" style="margin-bottom:8px">Swell Breakdown · ${fmt(TI)}</p>${spectra(s)}</div>
  ${driftSection(s)}
  <div><p class="lab" style="margin-bottom:8px">7 Day Forecast</p>${fcChart(s)}</div>
  ${bestWindowsView(s)}
  ${whyScore(s)}
  <p class="note">${esc(s.note)} Faces ${comp(s.f)}. Accepts swell from ${s.w.map(([a,b])=>`${comp(a)} to ${comp(b)}`).join(" and ")}; ideal faces ${s.sz[0]}–${s.sz[1]} ft.</p></div>`}
const buoyAge=d=>(Date.now()/1000-d.t[d.t.length-1])/60;
function ageText(d){const m=Math.max(0,Math.round(buoyAge(d)));return m<90?`${m} min ago`:`${Math.round(m/60)} h ago`}
function buoyView(){return`<p class="note">Live buoys, north to south. Harvest and San Nicolas see new swell first.</p><div class="rows">${BUOYS.map((b,k)=>{const d=DATA.buoys[k];
  if(!d.ok)return`<button class="brow" data-buoy="${k}"><span class="nm">${esc(b.n)}</span><span class="v">Offline</span><span class="sub">No recent data</span></button>`;
  const n=d.hs.length-1,mx=Math.max(...d.hs,1),pts=d.hs.map((v,i)=>`${(i/n*368+2).toFixed(1)},${(24-v/mx*20).toFixed(1)}`).join(" ");
  return`<button class="brow" data-buoy="${k}"><span class="nm">${esc(b.n)}</span><span class="v">${d.hs[n].toFixed(1)} ft @ ${Math.round(d.tp[n])} s</span>
  <span class="sub">Peak direction ${arrow(d.dp[n])} ${comp(d.dp[n])} ${Math.round(d.dp[n])}° · ${d.sst==null?"":`water ${Math.round(d.sst)}°F · `}${ageText(d)}</span>
  <svg viewBox="0 0 372 26" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--muted)" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg></button>`}).join("")}</div>
  <p class="note" style="font-size:12px">Significant wave height, last 24 hours.</p>`}
function modelSeg(){return`<div class="steprow"><span class="lab" style="margin:0">Intraday Forecast</span><div class="seg2" role="group" aria-label="Scoring version"><button data-model="current" aria-pressed="${CUR}">Current</button><button data-model="original" aria-pressed="${!CUR}">Original</button></div></div>`}
function howView(){return`<div class="det"><h2>How spots are rated</h2>
  <p class="note" style="color:var(--ink)">Every hour, each spot is scored on four things. They multiply, so flat water never rates well.</p>
  <dl class="kv" style="grid-template-columns:1fr">
  <div><dt>Size</dt><dd><small>Breaking height from each swell's height and period. Short chop under 9 s is marked down, swell outside the spot's window is cut, and a local gain adjusts for spots that focus or shelter swell.</small></dd></div>
  <div><dt>Wind</dt><dd><small>Under 4 kt is glassy. Offshore costs little, onshore costs a lot. Onshore also caps the rating: ${CUR?"about 6 kt limits a spot to Fair, 10 kt to Poor to fair, 15 kt to Poor.":"about 6 kt limits a spot to Fair, 10 kt to Poor."}</small></dd></div>
  <div><dt>Period</dt><dd><small>Longer is better, from 6 s (weak) to 14 s and up (full marks).</small></dd></div>
  <div><dt>Tide</dt><dd><small>A small penalty outside the tide the spot likes.</small></dd></div></dl>
  <div class="wins">${RT.map((r,c)=>`<div class="win" style="grid-template-columns:130px 1fr">${rlab(c)}<span class="m">${["Faces under 1 ft","Score below 2","2 to 4","4 to 5.5","5.5 to 7","7 to 8.8","Above 8.8"][c]}</span></div>`).join("")}</div>
  <p class="lab" style="margin:14px 0 4px">"Better than X% of sessions"</p>
  <p class="note">On a spot's page, this line says what share of past sessions in the same month at that spot scored lower than the current hour. The "averages" figure is the mean score for that month; if more than half of that month's sessions are flat, it says "typically flat" instead. A "session" here is any daylight hour (6 AM to 7 PM), pooled across the whole month, not just the same time of day. It uses about five years of hourly history from Open-Meteo's archive (October 2021 to 2025; the archive has no swell data earlier), scored with the same formula and the same Original or Current model you are viewing. A high number means unusually good for the time of year; around 50 means a typical day; a low number means a poor one. Limits: the archive's wind is smoother than the live forecast (it misses sea breezes), tide is left out, and five years is a short record, so treat it as a guide. The tables are rebuilt in GitHub Actions and the line is hidden if they cannot be loaded.</p>
  <p class="lab" style="margin:14px 0 4px">Drift and rip currents</p>
  <p class="note">The "Current" section on a spot's page (under Swell Breakdown) estimates, hour by hour, how hard the water pushes you sideways along the beach: light, moderate or strong. It uses the standard longshore-current formula (Komar and Inman, 1970) from the breaker height and the angle the swell meets the shore, so bigger waves hitting at a steeper angle give more drift. Rips are fed by that sideways flow, but this does not measure rips directly. Jetties and piers block the flow, so those spots are scaled down by 40 percent and reefs and points by 30 percent, which is a judgment call. The Light, Moderate and Strong cutoffs (0.25 and 0.5 m/s) are rules of thumb too. Sandbars, channels and tide, which decide where a rip actually forms, are not modeled. Always check the lifeguards' and NWS rip current statements.</p>
  <p class="note">Model estimates, not cam reports. Sandbars, kelp and local shadowing are invisible to it. Spot windows and gains are starting values to tune.</p>
  <p class="note">Data: Open-Meteo, Scripps CDIP, NOAA CO-OPS, NWS. Map: OpenFreeMap, © OpenMapTiles, data from OpenStreetMap; terrain from Mapzen, USGS and NOAA; satellite imagery © Esri, Maxar, Earthstar Geographics.</p></div>`}
let lastRender=0;
function render(fromPlay){if(!DATA)return;const b=$("body"),keep=b.scrollTop,vh=b.clientHeight;
  for(const t of ["spots","best","cmp","sbox","buoys","how"])$("tab-"+t).setAttribute("aria-selected",S.tab===t);
  if(S.tab==="sbox"&&S.sel==null&&!SB.dirty&&b.querySelector("#sbox")){peekRender();if(POP.k)popRender();return}
  /* Swapping the whole body briefly makes it shorter, which on some phones throws the scroll position back to the top (it showed when playing the timeline while scrolled down). A spacer keeps it tall enough for one frame so the position holds. */
  b.innerHTML=(S.tab==="buoys"?buoyView():S.tab==="how"?howView():S.sel!=null?detail(DATA.spots[S.sel]):S.tab==="best"?bestView():S.tab==="cmp"?cmpView():S.tab==="sbox"?sbView():listView())+(keep>0?`<div id="slock" style="height:${keep+vh}px" aria-hidden="true"></div>`:"");
  if(S.tab==="sbox")SB.dirty=false;b.scrollTop=keep;if(keep>0)requestAnimationFrame(()=>{const l=document.getElementById("slock");if(l)l.remove()});lastRender=Date.now();peekRender();if(POP.k)popRender();
  const ch=b.querySelector(".chips"),on=ch&&ch.querySelector('[aria-pressed="true"]');if(on)ch.scrollLeft=Math.max(0,on.offsetLeft-ch.offsetLeft-(ch.clientWidth-on.offsetWidth)/2)}
$("body").addEventListener("input",e=>{const id=e.target.id;if(!DATA||!SB.ov||!id||!id.startsWith("sb-"))return;SB.ov[id.slice(3)]=+e.target.value;sbPatch()});
$("body").addEventListener("change",e=>{if(e.target.id==="sbspot"){SB.spot=+e.target.value;SB.hr=null;sbLoad();SB.dirty=true;render();return}if(e.target.id==="sbhr"){SB.hr=+e.target.value;sbLoad();SB.dirty=true;render();return}
  if(e.target.id==="cmpadd"&&e.target.value!==""&&DATA){const n=DATA.spots[+e.target.value].n;if(!CMP.includes(n)&&CMP.length<3){CMP.push(n);saveCmp()}render()}});
$("body").addEventListener("toggle",e=>{const k=e.target&&e.target.dataset&&e.target.dataset.why;if(!k)return;if(e.target.open)WHY.add(k);else WHY.delete(k)},true);
$("body").addEventListener("click",e=>{const t=e.target.closest("[data-pop],[data-spot],[data-best],[data-sbreset],[data-hd],[data-bscope],[data-brange],[data-cmprm],[data-fav],[data-sort],[data-reg],[data-back],[data-time],[data-buoy],[data-step],[data-model],#refresh,#fc,[data-chart]");if(!t||!DATA)return;
  if(t.dataset.pop){popOpen(t.dataset.pop)}
  else if(t.dataset.spot!=null){const k=+t.dataset.spot,s=DATA.spots[k];select(k);goTo(s.lo,s.la,11.5)}
  else if(t.dataset.best){const [a,k]=t.dataset.best.split(":").map(Number),s=DATA.spots[a];setTime(k);select(a);goTo(s.lo,s.la,11.5)}
  else if(t.dataset.sbreset!=null){sbLoad();SB.dirty=true;render()}
  else if(t.dataset.hd!=null){SB.ov.d=+t.dataset.hd;SB.ov.p=+t.dataset.hp;sbSync()}
  else if(t.dataset.bscope){bestScope(t.dataset.bscope)}
  else if(t.dataset.brange){BEST.range=t.dataset.brange;saveBest();render()}
  else if(t.dataset.cmprm!=null){CMP=CMP.filter(n=>n!==DATA.spots[+t.dataset.cmprm].n);saveCmp();render()}
  else if(t.dataset.model){try{localStorage.setItem("swellchart.model2",t.dataset.model)}catch(e){}location.reload()}
  else if(t.dataset.step){S.step=+t.dataset.step;try{localStorage.setItem("swellchart.step",String(S.step))}catch(e){}render()}
  else if(t.dataset.reg){setRegion(t.dataset.reg)}
  else if(t.dataset.fav!=null){const n=DATA.spots[+t.dataset.fav].n;if(FAVS.has(n))FAVS.delete(n);else FAVS.add(n);saveFavs();render();placeMarks()}
  else if(t.dataset.back){select(null)}
  else if(t.dataset.time){setTime(+t.dataset.time)}
  else if(t.dataset.buoy){const b=BUOYS[+t.dataset.buoy];goTo(b.lo,b.la,9.5)}
  else if(t.id==="refresh"){load(true)}
  else if(t.dataset.chart){const r=t.querySelector("svg").getBoundingClientRect(),f=((e.clientX-r.left)/r.width-+t.dataset.x0)/(+t.dataset.x1-+t.dataset.x0);setTime(+t.dataset.i0+Math.floor(clamp(f,0,0.9999)*+t.dataset.n))}
  else if(t.id==="fc"){const r=t.querySelector("svg").getBoundingClientRect(),f=((e.clientX-r.left)/r.width-+t.dataset.x0)/(+t.dataset.x1-+t.dataset.x0);setTime(Math.floor(clamp(f,0,0.9999)*DATA.times.length))}});
/* Press and drag across the Outlook chart or the 7 day forecast to scrub through time. The listener sits on the
   panel body, which is never rebuilt, so the drag survives the re-render that each time change triggers. */
let DRAG=null;
function scrub(e){const t=$("body").querySelector(DRAG==="fc"?"#fc":"[data-chart]");if(!t)return;
  const r=t.querySelector("svg").getBoundingClientRect(),f=clamp(((e.clientX-r.left)/r.width-+t.dataset.x0)/(+t.dataset.x1-+t.dataset.x0),0,0.9999);
  const i=DRAG==="fc"?Math.floor(f*DATA.times.length):+t.dataset.i0+Math.floor(f*+t.dataset.n);if(i!==TI)setTime(i)}
$("body").addEventListener("pointerdown",e=>{if(!DATA||e.button>0)return;const t=e.target.closest("[data-chart],#fc");if(!t)return;
  DRAG=t.id==="fc"?"fc":"chart";try{$("body").setPointerCapture(e.pointerId)}catch(_){}scrub(e)});
$("body").addEventListener("pointermove",e=>{if(DRAG&&DATA)scrub(e)});
for(const n of["pointerup","pointercancel"])$("body").addEventListener(n,()=>{DRAG=null});
syncTheme();legend();placeSheet();if(initMap()){if(!REDUCED)tick();load(false)}
