/* ---------- Save Session: draws a tall (iPhone-size) report card for a chosen window of one day and saves/shares it as a PNG ---------- */
const SS={s:null,a:0,b:0,blob:null,t:0};
const ssCss=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function ssHours(s){const cur=DATA.times[TI].slice(0,10),day=dayIdx().find(x=>x.d===cur);return{day,dl:day.idx.filter(k=>s.wx.day[k]===1&&s.hr[k])}}
function ssLabel(a,b){const ha=hourOf(a),hb=hourOf(b),ap=h=>h<12?"AM":"PM",n=h=>h%12||12;
  return a===b?`${n(ha)} ${ap(ha)}`:ap(ha)===ap(hb)?`${n(ha)}–${n(hb)} ${ap(hb)}`:`${n(ha)} ${ap(ha)}–${n(hb)} ${ap(hb)}`}
function ssOpts(list,sel){return list.map(k=>`<option value="${k}"${k===sel?" selected":""}>${h12(hourOf(k))}</option>`).join("")}
function ssOpen(){const s=DATA.spots[S.sel];if(!s||!s.ok)return;const {dl}=ssHours(s);if(!dl.length)return;
  SS.s=s;SS.a=dl.includes(TI)?TI:dl[0];SS.b=dl.filter(k=>k>=SS.a)[Math.min(2,dl.filter(k=>k>=SS.a).length-1)];
  let el=document.getElementById("ss");if(!el){el=document.createElement("div");el.id="ss";document.body.appendChild(el)}
  el.hidden=false;el.innerHTML=`<div class="ssbox"><div class="sssel"><label>From <select id="ssa" aria-label="Session start"></select></label><label>To <select id="ssb" aria-label="Session end"></select></label></div>
   <canvas id="ssc" aria-label="Session report preview"></canvas>
   <div class="ssbtn"><button id="ssx" class="ssg">Close</button><button id="sssave" class="ssp">Save image</button></div></div>`;
  ssFill();ssDraw();
  el.onclick=e=>{if(e.target===el)ssClose()};
  document.getElementById("ssx").onclick=ssClose;
  document.getElementById("ssa").onchange=e=>{SS.a=+e.target.value;if(SS.b<SS.a)SS.b=SS.a;ssFill();ssDraw()};
  document.getElementById("ssb").onchange=e=>{SS.b=+e.target.value;ssDraw()};
  document.getElementById("sssave").onclick=ssSave}
function ssClose(){const el=document.getElementById("ss");if(el)el.hidden=true}
function ssFill(){const {dl}=ssHours(SS.s);document.getElementById("ssa").innerHTML=ssOpts(dl,SS.a);document.getElementById("ssb").innerHTML=ssOpts(dl.filter(k=>k>=SS.a),SS.b)}
function ssName(){const p=tparts(DATA.times[SS.a]);return`swell-${SS.s.n.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}-${DOW[p.dow].toLowerCase()}-${String(p.h).padStart(2,"0")}00.png`}
async function ssSave(){const c=document.getElementById("ssc");
  const blob=SS.blob||await new Promise(r=>c.toBlob(r,"image/png"));if(!blob)return;
  const f=new File([blob],ssName(),{type:"image/png"});
  try{if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:SS.s.n});return}}catch(e){if(e&&e.name==="AbortError")return}
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=f.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000)}
function ssDraw(){const s=SS.s,c=document.getElementById("ssc");if(!c)return;const W=393,H=852,K=3;c.width=W*K;c.height=H*K;
  const ctx=c.getContext("2d");ctx.scale(K,K);
  const F=ssCss("--f-ui")||"system-ui,sans-serif",font=(w,sz)=>`${w} ${sz}px ${F}`,INK="#ecedef",MUT="#9a9da3",LINE="#2d2f32",CARD="#141516";
  const rr=(x,y,w,h,r)=>{ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()};
  const tx=(t,x,y,f,col,al)=>{ctx.font=f;ctx.fillStyle=col||INK;ctx.textAlign=al||"left";ctx.textBaseline="alphabetic";ctx.fillText(t,x,y)};
  const {day,dl}=ssHours(s),ks=day.idx.filter(k=>k>=SS.a&&k<=SS.b&&s.hr[k]),n=ks.length,mid=ks[Math.floor(n/2)],hm=s.hr[mid];
  const rate=ks.reduce((t,k)=>t+s.hr[k].rate,0)/n,face=ks.reduce((t,k)=>t+s.hr[k].face,0)/n,cls=clsOf(face,rate),col=ssCss("--r-"+RT[cls].k)||"#2c9c6c",sc=shown(rate);
  const pk=ks.reduce((a,k)=>s.hr[k].rate>s.hr[a].rate?k:a,ks[0]),p0=tparts(DATA.times[SS.a]);
  // background
  ctx.fillStyle="#0d0e0f";ctx.fillRect(0,0,W,H);
  const gr=ctx.createLinearGradient(0,0,0,300);gr.addColorStop(0,col+"44");gr.addColorStop(1,"#0d0e0f00");ctx.fillStyle=gr;ctx.fillRect(0,0,W,300);
  // title
  tx(s.n,24,68,font(700,26));tx(`${DOW[p0.dow]} ${MON[p0.m-1]} ${p0.d} · ${ssLabel(SS.a,SS.b)}${n>1?" session":""}`,24,92,font(400,13.5),MUT);
  ctx.font=font(600,12);const rw=ctx.measureText(REG[s.r]).width+20;rr(W-24-rw,42,rw,24,12);ctx.strokeStyle=LINE;ctx.lineWidth=1;ctx.stroke();tx(REG[s.r],W-24-rw/2,58,font(600,12),MUT,"center");
  // hero
  const cx=76,cy=172,R=47;ctx.lineWidth=10;ctx.strokeStyle="#26282a";ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.stroke();
  if(face>=1){ctx.strokeStyle=col;ctx.lineCap="round";ctx.beginPath();ctx.arc(cx,cy,R,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,sc/10));ctx.stroke();ctx.lineCap="butt"}
  tx(face<1?"–":sc.toFixed(1),cx,cy+12,font(600,34),INK,"center");
  ctx.font=font(700,13);const nm=RT[cls].n,pw=ctx.measureText(nm).width+24;rr(146,138,pw,24,12);ctx.fillStyle=col;ctx.fill();tx(nm,146+pw/2,155,font(700,13),RT[cls].dk?"#fff":"#10130f","center");
  tx(face<1?"Flat":faceText(face),146,196,font(700,32));
  if(n>1&&face>=1){const mn=Math.min(...ks.map(k=>shown(s.hr[k].rate))),mx=Math.max(...ks.map(k=>shown(s.hr[k].rate)));if(mn.toFixed(1)!==mx.toFixed(1))tx(`Best at ${h12(hourOf(pk))} · ${mn.toFixed(1)} to ${mx.toFixed(1)}`,146,218,font(400,13),MUT)}
  // outlook: same layout as the spot page chart (wave energy bars + rating strip, wind with arrows and gusts, tide with high/low labels)
  const INKC="#ecedef",card=(y,h,lab)=>{rr(24,y,W-48,h,20);ctx.fillStyle=CARD;ctx.fill();ctx.strokeStyle=LINE;ctx.lineWidth=1;ctx.stroke();try{ctx.letterSpacing="0.8px"}catch(e){}tx(lab,42,y+28,font(600,11.5),MUT);try{ctx.letterSpacing="0px"}catch(e){}};
  const hasT=!!s.tide,OH=hasT?398:270,OY=244;card(OY,OH,"OUTLOOK");
  const dk=day.idx.filter(k=>s.hr[k]),n2=dk.length,X0=42,CW=(W-84)/n2,xi=i=>X0+i*CW,xc=i=>X0+(i+.5)*CW,i0=dk.indexOf(ks[0]),i1=dk.indexOf(ks[n-1]);
  const top=OY+52,bot=OY+OH-34,kj=dk.map(k=>spotKJ(s.hr[k])),mxk=Math.max(20,...kj),base=OY+112;
  dk.forEach((k,i)=>{if(s.wx.day[k]===0){ctx.fillStyle="rgba(0,0,0,.30)";ctx.fillRect(xi(i),top-6,CW+.3,bot-top+12)}});
  if(i0>=0){rr(xi(i0)-1,top-6,(i1-i0+1)*CW+2,bot-top+12,6);ctx.fillStyle="rgba(255,255,255,.07)";ctx.fill();ctx.strokeStyle="rgba(255,255,255,.7)";ctx.lineWidth=1.3;ctx.stroke()}
  dk.forEach((k,i)=>{const on=k>=SS.a&&k<=SS.b,bh=Math.max(2,kj[i]/mxk*(base-top-4)),rc=ssCss("--r-"+RT[s.hr[k].cls].k)||"#888";ctx.globalAlpha=on?1:.62;ctx.fillStyle=rc;rr(xi(i)+1,base-bh,CW-2,bh,2);ctx.fill();ctx.globalAlpha=1;ctx.fillStyle=rc;ctx.fillRect(xi(i),base+22,CW+.3,4)});
  tx("kJ",X0+2,base+14,font(400,10),MUT);
  for(let i=3;i<n2;i+=3){const k=dk[i],hh=hourOf(k);tx(String(Math.round(kj[i])),xc(i),base+14,font(400,10.5),INKC,"center");
    tx(`${h12s(hh)}${ampm(hh)}`,xc(i),OY+OH-14,font(400,10.5),MUT,"center")}
  // wind
  const wy=base+50;tx("Wind/Gust (kt)",X0+2,wy,font(400,10),MUT);
  const wm=Math.max(15,...dk.map(k=>s.wx.wg[k]||0)),wb=wy+78;ctx.beginPath();ctx.moveTo(xi(0),wb);dk.forEach((k,i)=>ctx.lineTo(xc(i),wb-(s.wx.ws[k]||0)/wm*38));ctx.lineTo(xi(n2),wb);ctx.closePath();ctx.fillStyle="rgba(176,180,185,.14)";ctx.fill();
  for(let i=3;i<n2;i+=3){const k=dk[i],w=s.wx.ws[k],wd=s.wx.wd[k];if(w==null)continue;
    ctx.save();ctx.translate(xc(i),wy+18);ctx.rotate((Math.round(wd+180))*Math.PI/180);ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(4,4.3);ctx.lineTo(0,2.2);ctx.lineTo(-4,4.3);ctx.closePath();ctx.fillStyle=INKC;ctx.fill();ctx.restore();
    tx(String(Math.round(w)),xc(i),wy+42,font(600,12.5),INKC,"center");tx(String(Math.round(s.wx.wg[k]||w)),xc(i),wy+57,font(400,10.5),MUT,"center")}
  // tide
  if(hasT){const ty0=wb+24;tx("Tide (ft)",X0+2,ty0,font(400,10),MUT);
    const cur=DATA.times[SS.a].slice(0,10),ex=(s.hilo||[]).filter(e=>e.t.slice(0,10)===cur),vals=dk.map(k=>s.tide[k]).filter(v=>v!=null);
    if(vals.length){const lo=Math.min(...vals,...ex.map(e=>e.v)),hi=Math.max(...vals,...ex.map(e=>e.v)),t0=ty0+36,t1=ty0+72,yy=v=>t1-(v-lo)/(hi-lo||1)*(t1-t0);
      ctx.beginPath();let pen=false;dk.forEach((k,i)=>{const v=s.tide[k];if(v==null){pen=false;return}pen?ctx.lineTo(xc(i),yy(v)):ctx.moveTo(xc(i),yy(v));pen=true});ctx.strokeStyle="rgba(176,180,185,.95)";ctx.lineWidth=1.6;ctx.stroke();
      for(const e of ex){const hh=+e.t.slice(11,13)+(+e.t.slice(14,16))/60,xx=X0+hh*CW+CW/2,px=Math.max(X0+22,Math.min(W-42-22,xx)),py=yy(e.v),hiT=e.v>(lo+hi)/2;
        if(hiT){ctx.strokeStyle="rgba(176,180,185,.55)";ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(xx,py);ctx.lineTo(xx,t1+6);ctx.stroke();
          tx(e.t.slice(11,16),px,py-16,font(600,10.5),INKC,"center");tx(`${e.v.toFixed(1)} ft`,px,py-4,font(400,10.5),MUT,"center")}
        else{ctx.strokeStyle="rgba(176,180,185,.55)";ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(xx,py);ctx.lineTo(xx,py+5);ctx.stroke();
          tx(e.t.slice(11,16),px,py+17,font(600,10.5),INKC,"center");tx(`${e.v.toFixed(1)} ft`,px,py+29,font(400,10.5),MUT,"center")}}}}
  // conditions
  const CY=OY+OH+18;card(CY,140,"CONDITIONS");
  const ws=ks.reduce((t,k)=>t+(s.wx.ws[k]||0),0)/n,d=hm.dom,tide=hm.tide,nx=s.tide&&s.tide[Math.min(mid+1,s.tide.length-1)];
  const trw=tide==null||nx==null?"":nx>tide+0.05?"rising":nx<tide-0.05?"falling":"slack";
  const sst=s.m.sst[mid],wxo=s.wx,fl=wxo&&wxo.tp&&wxo.tp[mid]!=null?feelsF(wxo.tp[mid],wxo.rh&&wxo.rh[mid],wxo.ws&&wxo.ws[mid]):null,suit=sst==null?null:suitFor(sst*9/5+32,fl);
  const cell=(x,y,k,v,sub)=>{tx(k,x,y,font(400,12),MUT);tx(v,x,y+23,font(600,17));if(sub){ctx.font=font(600,17);const w=ctx.measureText(v).width;tx(sub,x+w+6,y+23,font(400,12.5),MUT)}};
  cell(42,CY+54,"Swell",d?`${d.h.toFixed(1)} ft`:"n/a",d?`${Math.round(d.p)} s ${comp(d.d)}`:"");
  cell(212,CY+54,"Wind",hm.w.d==null?"n/a":`${Math.round(ws)} kt`,hm.w.d==null?"":`${comp(s.wx.wd[mid])} ${hm.w.word.toLowerCase()}`);
  cell(42,CY+100,"Tide",tide==null?"n/a":`${tide.toFixed(1)} ft`,trw);
  cell(212,CY+100,"Water",sst==null?"n/a":`${Math.round(sst*9/5+32)}\u00b0`,suit?suit.t:"");
  // footer
  tx("Swell",24,828,font(700,14));tx(`Forecast · Generated ${new Date().toLocaleString("en-US",{timeZone:TZ,month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}`,W-24,828,font(400,12),MUT,"right");
  clearTimeout(SS.t);SS.blob=null;SS.t=setTimeout(()=>c.toBlob(b=>{SS.blob=b},"image/png"),150)}
document.body.addEventListener("click",e=>{if(e.target.closest("[data-ss]"))ssOpen()});

/* Installed (home screen) copies can keep an old page for days. When the app comes back to the foreground, check whether a newer build is published and reload if so. */
let UPD=0;document.addEventListener("visibilitychange",async()=>{if(document.visibilityState!=="visible"||Date.now()-UPD<3e5)return;UPD=Date.now();
  try{const r=await fetch(location.pathname+"?v="+Date.now(),{cache:"no-store"}),m=/const BUILD="(\d+)"/.exec(await r.text());if(m&&m[1]!==BUILD)location.reload()}catch(e){}});
