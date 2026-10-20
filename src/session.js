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
  // outlook
  const card=(y,h,lab)=>{rr(24,y,W-48,h,18);ctx.fillStyle=CARD;ctx.fill();ctx.strokeStyle=LINE;ctx.lineWidth=1;ctx.stroke();try{ctx.letterSpacing="0.8px"}catch(e){}tx(lab,40,y+26,font(600,11.5),MUT);try{ctx.letterSpacing="0px"}catch(e){}};
  ctx.save();
  card(246,206,"OUTLOOK");
  const dk=day.idx.filter(k=>s.hr[k]),cw=(W-80)/dk.length,x0=40,top=294,base=414,mxf=Math.max(6,...dk.map(k=>s.hr[k].face));
  dk.forEach((k,i)=>{if(s.wx.day[k]===0){ctx.fillStyle="rgba(0,0,0,.30)";ctx.fillRect(x0+i*cw,top-8,cw+.3,base-top+16)}});
  dk.forEach((k,i)=>{const h=s.hr[k],bh=Math.max(3,h.face/mxf*(base-top)),on=k>=SS.a&&k<=SS.b;ctx.globalAlpha=on?1:.5;ctx.fillStyle=ssCss("--r-"+RT[h.cls].k)||"#888";rr(x0+i*cw+1,base-bh,cw-2,bh,2.5);ctx.fill()});ctx.globalAlpha=1;
  const i0=dk.indexOf(ks[0]),i1=dk.indexOf(ks[n-1]);if(i0>=0){rr(x0+i0*cw-1,top-8,(i1-i0+1)*cw+2,base-top+16,6);ctx.strokeStyle="rgba(255,255,255,.75)";ctx.lineWidth=1.5;ctx.stroke()}
  dk.forEach((k,i)=>{const hh=hourOf(k);if(hh%6===0)tx(h12s(hh)+ampm(hh)[0],x0+i*cw+cw/2,436,font(400,11),MUT,"center")});
  // conditions
  card(468,152,"CONDITIONS");
  const ws=ks.reduce((t,k)=>t+(s.wx.ws[k]||0),0)/n,d=hm.dom,tide=hm.tide,nx=s.tide&&s.tide[Math.min(mid+1,s.tide.length-1)],tr=tide==null||nx==null?"":nx>tide+0.05?"↓".replace("↓","↑"):nx<tide-0.05?"↓":"";
  const trw=tide==null||nx==null?"":nx>tide+0.05?"rising":nx<tide-0.05?"falling":"slack";
  const sst=s.m.sst[mid],wxo=s.wx,fl=wxo&&wxo.tp&&wxo.tp[mid]!=null?feelsF(wxo.tp[mid],wxo.rh&&wxo.rh[mid],wxo.ws&&wxo.ws[mid]):null,suit=sst==null?null:suitFor(sst*9/5+32,fl);
  const cell=(x,y,k,v,sub)=>{tx(k,x,y,font(400,12),MUT);ctx.font=font(600,17);tx(v,x,y+22,font(600,17));if(sub){const w=ctx.measureText(v).width;tx(sub,x+w+6,y+22,font(400,12.5),MUT)}};
  cell(40,524,"Swell",d?`${d.h.toFixed(1)} ft`:"n/a",d?`${Math.round(d.p)} s ${comp(d.d)}`:"");
  cell(210,524,"Wind",hm.w.d==null?"n/a":`${Math.round(ws)} kt`,hm.w.d==null?"":hm.w.word.toLowerCase());
  cell(40,582,"Tide",tide==null?"n/a":`${tide.toFixed(1)} ft`,trw);
  cell(210,582,"Water",sst==null?"n/a":`${Math.round(sst*9/5+32)}°`,suit?suit.t:"");
  // rip
  card(636,120,"RIP");
  const dr=dl.map(k=>({k,v:driftOf(s,s.hr[k])})),pv=ks.map(k=>driftOf(s,s.hr[k])).filter(Boolean),top2=pv.length?pv.reduce((a,b)=>b.v>a.v?b:a):null;
  tx(top2?`${DR_NM[top2.lvl]}`:"Flat",40,684,font(600,17));if(top2){ctx.font=font(600,17);tx(`${drv(top2.v)} m/s`,40+ctx.measureText(DR_NM[top2.lvl]).width+8,684,font(400,12.5),MUT)}
  const sw=(W-80-(dr.length-1)*3)/dr.length,rc=["#35c4c9",ssCss("--warn")||"#e8a05a",ssCss("--r-poor")||"#c9553f"];
  dr.forEach((o,i)=>{ctx.fillStyle=o.v?rc[o.v.lvl]:"#2d2f32";rr(40+i*(sw+3),700,sw,14,4);ctx.fill();if(ks.includes(o.k)){ctx.strokeStyle="rgba(255,255,255,.8)";ctx.lineWidth=1.5;rr(40+i*(sw+3)-1,699,sw+2,16,5);ctx.stroke()}});
  dr.forEach((o,i)=>{const hh=hourOf(o.k);if(hh%3===1||i===0)tx(h12s(hh)+ampm(hh)[0],40+i*(sw+3)+sw/2,734,font(400,11),MUT,"center")});
  // footer
  tx("Swell",24,822,font(700,14));tx(`Forecast · Generated ${new Date().toLocaleString("en-US",{timeZone:TZ,month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}`,W-24,822,font(400,12),MUT,"right");
  ctx.restore();
  clearTimeout(SS.t);SS.blob=null;SS.t=setTimeout(()=>c.toBlob(b=>{SS.blob=b},"image/png"),150)}
document.body.addEventListener("click",e=>{if(e.target.closest("[data-ss]"))ssOpen()});
