/* ---------- Settings: play speed, skip night hours, night shading on the time bar, scoring version ---------- */
const SPEEDS=[["Slow",1500],["Normal",900],["Fast",450],["Faster",200]];
const SET=(()=>{const d={speed:1,skip:false,shade:true};try{const j=JSON.parse(localStorage.getItem("swellchart.set")||"null");if(j&&typeof j==="object")Object.assign(d,j)}catch(e){}return d})();
const setSave=()=>{try{localStorage.setItem("swellchart.set",JSON.stringify(SET))}catch(e){}};
const playMs=()=>SPEEDS[clamp(SET.speed|0,0,SPEEDS.length-1)][1];
const refDay=()=>{const s=DATA&&DATA.spots.find(x=>x.ok&&x.wx&&x.wx.day);return s?s.wx.day:null};
function playStep(){const n=DATA.times.length,rd=refDay();let i=TI>=n-1?NOWI:TI+1;
  if(SET.skip&&rd){let g=0;while(rd[i]===0&&g++<n){i++;if(i>=n)i=NOWI}}
  setTime(i,true)}
/* Time bar: lighter where it is daylight, darker at night, with clean edges. Stops are placed with the slider thumb's inset so they line up with the thumb. */
function shadeBar(){const el=$("t");if(!el)return;const rd=refDay();
  if(!SET.shade||!rd){el.style.removeProperty("--trk");return}
  const n=DATA.times.length,D="color-mix(in srgb,var(--ink) 52%,transparent)",N="color-mix(in srgb,var(--ink) 10%,transparent)",px=f=>`calc(9px + (100% - 18px) * ${(f/(n-1)).toFixed(5)})`;
  const st=[];let i=0;while(i<n){const night=rd[i]===0;let j=i;while(j<n&&(rd[j]===0)===night)j++;const a=i===0?0:i-0.5,b=j>=n?n-1:j-0.5,c=night?N:D;
    st.push(`${c} ${i===0?"0":px(a)}`,`${c} ${j>=n?"100%":px(b)}`);i=j}
  el.style.setProperty("--trk",`linear-gradient(90deg,${st.join(",")})`)}
function setOpen(){let el=document.getElementById("set");if(!el){el=document.createElement("div");el.id="set";document.body.appendChild(el);el.onclick=e=>{if(e.target===el)setClose()}}
  const seg=(k,list,cur)=>`<div class="seg2" role="group">${list.map(([n,v])=>`<button data-sk="${k}" data-sv="${v}" aria-pressed="${String(cur)===String(v)}">${n}</button>`).join("")}</div>`;
  el.hidden=false;el.innerHTML=`<div class="setc" role="dialog" aria-label="Settings"><div class="seth"><b>Settings</b><button id="setx">Done</button></div>
   <div class="setr"><span>Play speed<small>How fast the time bar plays</small></span>${seg("speed",SPEEDS.map(([n],i)=>[n,i]),SET.speed)}</div>
   <div class="setr"><span>Skip night hours<small>Playing jumps from sunset to sunrise</small></span><button class="sw" data-sw="skip" aria-pressed="${SET.skip}" aria-label="Skip night hours"><i></i></button></div>
   <div class="setr"><span>Night shading on the time bar<small>Darker at night, lighter in daylight</small></span><button class="sw" data-sw="shade" aria-pressed="${SET.shade}" aria-label="Night shading on the time bar"><i></i></button></div>
   <div class="setr"><span>Scoring version<small>Original is the default; Current is the lighter tune</small></span>${seg("model",[["Original","original"],["Current","current"]],CUR?"current":"original")}</div></div>`;
  el.querySelector("#setx").onclick=setClose;
  el.querySelectorAll("[data-sw]").forEach(b=>b.onclick=()=>{const k=b.dataset.sw;SET[k]=!SET[k];b.setAttribute("aria-pressed",SET[k]);setSave();if(k==="shade")shadeBar()});
  el.querySelectorAll("[data-sk]").forEach(b=>b.onclick=()=>{const k=b.dataset.sk,v=b.dataset.sv;
    if(k==="model"){try{localStorage.setItem("swellchart.model2",v)}catch(e){}location.reload();return}
    SET.speed=+v;setSave();b.parentNode.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b));if(playT){clearInterval(playT);playT=setInterval(playStep,playMs())}})}
function setClose(){const el=document.getElementById("set");if(el)el.hidden=true}
document.getElementById("gear").onclick=setOpen;
