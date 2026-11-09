/* Test tab: can the app read CDIP's nearshore forecast (MOP) straight from the browser, and how does it compare with the model the ratings use today?
   Diagnostic only. Nothing here feeds the ratings. */
const MOPB="https://thredds.cdip.ucsd.edu/thredds/";
const MOP={busy:false,log:[],rows:null,head:""};
const mlog=(ok,t)=>{MOP.log.push({ok,t});mopRefresh()};
function mopRefresh(){const e=document.getElementById("mopb");if(e)e.innerHTML=mopBody();const b=document.getElementById("mopgo");if(b)b.textContent=MOP.busy?"Running…":MOP.log.length?"Run again":"Run test"}
function laKey(ms){const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date(ms)).map(x=>[x.type,x.value]));
  return{key:`${p.year}-${p.month}-${p.day}T${p.hour==="24"?"00":p.hour}:00`,min:+p.minute}}
async function mopGet(u){const r=await fetch(u);if(!r.ok)throw new Error(r.status+" "+decodeURIComponent(new URL(u).pathname).split("/").slice(-1)[0]);return r.text()}
function mopNum(tx,name){const a=dods(tx,name);if(a.length&&!Number.isNaN(a[0]))return a[0];const m=new RegExp(name+"[^\\n]*\\n\\s*(-?[0-9.]+(?:[eE][-+]?\\d+)?)").exec(tx);return m?+m[1]:null}
async function mopPool(items,fn,n){const out=[];let i=0;await Promise.all(Array.from({length:n},async()=>{while(i<items.length){const k=i++;out[k]=await fn(items[k])}}));return out}
async function mopRun(){
  if(MOP.busy||!DATA)return;MOP.busy=true;MOP.log=[];MOP.rows=null;MOP.head="";mopRefresh();
  try{
    const spot=DATA.spots.find(s=>s.n==="Seal Beach Jetty")||DATA.spots[0];
    const xml=async p=>new DOMParser().parseFromString(await mopGet(MOPB+p),"text/xml");
    let x;
    try{x=await xml("catalog/cdip/model/MOP_grids/catalog.xml");mlog(true,"Reached CDIP's MOP catalog from this browser.")}
    catch(e){mlog(false,"Could not read the MOP catalog ("+(e.message||e)+"). If the browser is blocking it, MOP cannot be read directly from the app.");
      try{const y=await xml("catalog/cdip/model/catalog.xml");mlog(true,"The model folder does load. It lists: "+[...y.querySelectorAll("catalogRef,dataset")].map(n=>n.getAttribute("name")).slice(0,12).join(", "))}
      catch(e2){mlog(false,"The model folder is not reachable either ("+(e2.message||e2)+").")}
      throw 0}
    const ds=[...x.querySelectorAll("dataset")].filter(d=>d.getAttribute("urlPath")).map(d=>({n:d.getAttribute("name"),u:d.getAttribute("urlPath")}));
    const refs=[...x.querySelectorAll("catalogRef")].map(d=>d.getAttribute("name"));
    if(!ds.length){mlog(false,"The catalog has no files directly in it. Sub-folders: "+(refs.slice(0,15).join(", ")||"none")+". The layout needs a closer look.");throw 0}
    mlog(true,ds.length+" files found. Examples: "+ds.slice(0,6).map(d=>d.n).join(", "));
    /* The files turned out to be regional grids, not per-beach sites, so this step only reports how the grid files are laid out. */
    const fcs=ds.filter(d=>/forecast/i.test(d.n));
    mlog(true,"Forecast files: "+fcs.map(d=>d.n).join(", "));
    const g=fcs.find(d=>/^OC/i.test(d.n))||fcs[0];
    mlog(true,"Layout of "+g.n+": "+(await mopGet(`${MOPB}dodsC/${g.u}.dds`)).replace(/\s+/g," ").slice(0,1800));
    const das=await mopGet(`${MOPB}dodsC/${g.u}.das`).catch(()=>"");
    const gl=/NC_GLOBAL\s*\{([\s\S]*?)\n\s*\}/.exec(das);
    mlog(true,"About it: "+((gl?gl[1]:das).replace(/\s+/g," ").slice(0,1500)||"nothing returned"));
    throw 0;
    let c=ds.filter(d=>/forecast/i.test(d.n));if(!c.length)c=ds;
    const pre=c.filter(d=>/^(OC|LA)/i.test(d.n));if(pre.length>=10)c=pre;
    c.sort((a,b)=>a.n<b.n?-1:a.n>b.n?1:0);
    const meta=async d=>{try{const t=await mopGet(`${MOPB}dodsC/${d.u}.ascii?metaLatitude,metaLongitude`);const la=mopNum(t,"metaLatitude"),lo=mopNum(t,"metaLongitude");return la!=null&&lo!=null?{...d,la,lo}:null}catch(e){return null}};
    const dist=p=>Math.hypot(p.la-spot.la,(p.lo-spot.lo)*0.83)*111;
    const step=Math.max(1,Math.ceil(c.length/20)),coarse=(await mopPool(c.filter((_,i)=>i%step===0),meta,6)).filter(Boolean);
    if(!coarse.length){mlog(false,"Could not read site positions (latitude/longitude) from these files.");throw 0}
    const k0=c.findIndex(d=>d.u===coarse.reduce((a,b)=>dist(b)<dist(a)?b:a).u);
    const fine=(await mopPool(c.slice(Math.max(0,k0-step),k0+step+1),meta,6)).filter(Boolean);
    const best=fine.reduce((a,b)=>dist(b)<dist(a)?b:a);
    mlog(true,`Closest site to ${spot.n}: ${best.n}, ${dist(best).toFixed(1)} km away (${best.la.toFixed(3)}, ${best.lo.toFixed(3)}).`);
    const base=`${MOPB}dodsC/${best.u}`,dd=await mopGet(base+".dds"),n=+(/waveTime\s*=\s*(\d+)/.exec(dd)||[])[1];
    if(!n){mlog(false,"The forecast file has no wave time axis. Variables: "+[...dd.matchAll(/\s(\w+)\[/g)].map(m=>m[1]).slice(0,14).join(", "));throw 0}
    const a=Math.max(0,n-240),r=`[${a}:1:${n-1}]`,tx=await mopGet(`${base}.ascii?waveTime${r},waveHs${r},waveTp${r},waveDp${r}`),
      t=dods(tx,"waveTime"),hs=dods(tx,"waveHs"),tp=dods(tx,"waveTp"),dp=dods(tx,"waveDp");
    if(!t.length||!hs.length){mlog(false,"The file answered, but the wave values did not parse.");throw 0}
    const last=laKey(t[t.length-1]*1e3).key;
    mlog(true,`Forecast read: ${t.length} points, running to ${last.replace("T"," ")}.`);
    const nowMs=Date.now(),rows=[];let skip=0;
    for(let i=0;i<t.length;i++){const ms=t[i]*1e3;if(ms<nowMs-36e5||ms>nowMs+40*36e5)continue;const lk=laKey(ms);if(lk.min!==0)continue;if(skip++%3)continue;
      const j=DATA.times.indexOf(lk.key),m=j>=0?spot.m:null,fh=hs[i]*3.28084;
      rows.push({key:lk.key,mh:fh,mp:tp[i],md:dp[i],mf:breaker(fh,tp[i]),ah:m?m.sh[j]:null,ap:m?m.sp[j]:null,ad:m?m.sd[j]:null,af:j>=0?spot.hr[j].face:null})}
    MOP.rows=rows;
    const bi=BUOYS.findIndex(b=>b.id==="215"),bd=bi>=0?DATA.buoys[bi]:null;
    MOP.head=bd&&bd.ok?`Long Beach Channel buoy right now: ${bd.hs[bd.hs.length-1].toFixed(1)} ft, ${Math.round(bd.tp[bd.tp.length-1])} s, ${Math.round(bd.dp[bd.dp.length-1])}°.`:"";
    mlog(true,"Done. Compare the columns below.");
  }catch(e){if(e!==0)mlog(false,"Stopped: "+(e&&e.message||e))}
  MOP.busy=false;mopRefresh()}
function mopBody(){
  const L=MOP.log.map(l=>`<div class="ml ${l.ok?"ok":"no"}"><b>${l.ok?"✓":"✗"}</b> ${esc(l.t)}</div>`).join("");
  const f=(v,d)=>v==null||Number.isNaN(v)?"–":v.toFixed(d);
  const T=MOP.rows&&MOP.rows.length?`${MOP.head?`<p class="note">${esc(MOP.head)}</p>`:""}
    <table class="mopt"><thead><tr><th>Time</th><th colspan="3">Nearshore (MOP)</th><th colspan="3">Offshore model</th><th>App face</th></tr>
    <tr><th></th><th>ft</th><th>s</th><th>°</th><th>ft</th><th>s</th><th>°</th><th>ft</th></tr></thead><tbody>${MOP.rows.map(o=>{const q=tparts(o.key);
      return`<tr><td>${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][q.dow]} ${h12(q.h)}</td><td>${f(o.mh,1)}</td><td>${f(o.mp,0)}</td><td>${f(o.md,0)}</td><td>${f(o.ah,1)}</td><td>${f(o.ap,0)}</td><td>${f(o.ad,0)}</td><td>${f(o.af,1)}</td></tr>`}).join("")}</tbody></table>
    <p class="note">MOP is the nearshore forecast for the closest site. "Offshore model" is the swell the ratings use today, and "App face" is the surf height the app turns that into for Seal Beach Jetty.</p>`:"";
  return`<div class="mopl">${L}</div>${T}${MOP.log.length&&!MOP.busy?`<button class="savess" data-mop="copy">Copy results</button>`:""}`}
function mopView(){return`<div class="det"><h2>Nearshore test</h2>
  <p class="note" style="color:var(--ink)">Checks whether this app can read CDIP's nearshore forecast for Seal Beach, and sets it beside the offshore model the ratings use today. Nothing here changes any score.</p>
  <button class="savess" id="mopgo" data-mop="run">${MOP.busy?"Running…":MOP.log.length?"Run again":"Run test"}</button><div id="mopb">${mopBody()}</div></div>`}
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest("[data-mop]");if(!b)return;
  if(b.dataset.mop==="run")mopRun();
  else{const t=MOP.log.map(l=>(l.ok?"OK  ":"FAIL ")+l.t).join("\n")+(MOP.head?"\n"+MOP.head:"")+(MOP.rows?"\n"+MOP.rows.map(o=>`${o.key} MOP ${o.mh.toFixed(1)}ft ${Math.round(o.mp)}s ${Math.round(o.md)}deg | model ${o.ah}ft ${o.ap}s ${o.ad}deg | app face ${o.af==null?"-":o.af.toFixed(1)}`).join("\n"):"");
    try{navigator.clipboard.writeText(t).then(()=>{b.textContent="Copied"},()=>{b.textContent="Copy not allowed here"})}catch(_){b.textContent="Copy not allowed here"}}});
