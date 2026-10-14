// Backward wave-ray tracing from each surf spot to deep water over real bathymetry.
const fs=require('fs');
const buf=fs.readFileSync('t.npy');const hl=buf.readUInt16LE(8);const data=new Int16Array(buf.buffer.slice(buf.byteOffset+10+hl,buf.byteOffset+buf.length));
const W=3584,H=2560,Z=10,X0=167,Y0=406,N=2**Z;
// smooth 3x3
const D=new Float32Array(W*H);for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){let s=0;for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)s+=data[(y+j)*W+x+i];D[y*W+x]=s/9}
for(let i=0;i<W;i++){D[i]=data[i];D[(H-1)*W+i]=data[(H-1)*W+i]}for(let j=0;j<H;j++){D[j*W]=data[j*W];D[j*W+W-1]=data[j*W+W-1]}
const pxLon=px=>((px+X0*256)/(N*256))*360-180;
const lonPx=lo=>((lo+180)/360*N*256)-X0*256;
const latPx=la=>((1-Math.asinh(Math.tan(la*Math.PI/180))/Math.PI)/2*N*256)-Y0*256;
const pxLat=py=>Math.atan(Math.sinh(Math.PI*(1-2*(py+Y0*256)/(N*256))))*180/Math.PI;
function elev(lo,la){const x=lonPx(lo),y=latPx(la);if(x<1||y<1||x>=W-2||y>=H-2)return null;const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi;
  return D[yi*W+xi]*(1-fx)*(1-fy)+D[yi*W+xi+1]*fx*(1-fy)+D[(yi+1)*W+xi]*(1-fx)*fy+D[(yi+1)*W+xi+1]*fx*fy}
const G=9.81;
const CT={};function cOf(d,T){const tb=CT[T]||(CT[T]=new Float32Array(2002).map((_,i)=>cRaw(Math.max(.25,i/2),T)));const f=Math.min(2000,Math.max(0,d*2)),i=Math.floor(f);return tb[i]+(tb[i+1]-tb[i])*(f-i)}
function cRaw(d,T){const w=2*Math.PI/T;let k=w*w/G;for(let i=0;i<30;i++){const t=Math.tanh(k*d);const f=w*w-G*k*t,df=-G*t-G*k*d*(1-t*t);k-=f/df;if(k<=0)k=1e-4}return w/k}
// structures (breakwaters etc.) as local segments
const SEG=[];{const S=JSON.parse(fs.readFileSync('struct.json'));for(const e of S.elements){const t=e.tags||{},g=e.geometry||[];const k=t.man_made||t['seamark:type'];if(g.length<2||!['breakwater','groyne','training_wall','jetty'].includes(k))continue;let L=0;for(let i=1;i<g.length;i++)L+=Math.hypot((g[i].lat-g[i-1].lat)*110.57,(g[i].lon-g[i-1].lon)*93);if(L<0.4)continue;for(let i=1;i<g.length;i++)SEG.push([g[i-1].lon,g[i-1].lat,g[i].lon,g[i].lat])}}
const eng=fs.readFileSync('/home/claude/socal-swell-chart/src/spots.js','utf8').split('const TIDES')[0].replace(/^const /gm,'var ');eval(eng);
let LOCF=new Float64Array(0);
const crosses=(ax,ay,bx,by)=>{const mnx=Math.min(ax,bx)-1e-3,mxx=Math.max(ax,bx)+1e-3,mny=Math.min(ay,by)-1e-3,mxy=Math.max(ay,by)+1e-3,F=LOCF;
  for(let i=0;i<F.length;i+=4){const x1=F[i],y1=F[i+1],x2=F[i+2],y2=F[i+3];if((x1>mxx&&x2>mxx)||(x1<mnx&&x2<mnx)||(y1>mxy&&y2>mxy)||(y1<mny&&y2<mny))continue;
    const d=(bx-ax)*(y2-y1)-(by-ay)*(x2-x1);if(Math.abs(d)<1e-14)continue;const t=((x1-ax)*(y2-y1)-(y1-ay)*(x2-x1))/d,u=((x1-ax)*(by-ay)-(y1-ay)*(bx-ax))/d;if(t>=0&&t<=1&&u>=0&&u<=1)return true}return false};
const TP=process.env.TPS?process.env.TPS.split(",").map(Number):[7,10,13,16,20],SIG=12,NA=72;
function traceSpot(s){
  const kx=111.32*Math.cos(s.la*Math.PI/180),fr=s.f*Math.PI/180;
  // start point: first water cell out along the facing direction that is at least 8 m deep
  let st=null;for(let km=0;km<=15;km+=0.15){const lo=s.lo+km*Math.sin(fr)/kx,la=s.la+km*Math.cos(fr)/110.57,e=elev(lo,la);if(e!=null&&e<=-8){st=[lo,la,-e];break}}
  if(!st)return null;
  LOCF=Float64Array.from(SEG.filter(q=>Math.abs(q[0]-st[0])<0.7&&Math.abs(q[1]-st[1])<0.6).flat());
  LOCF=Float64Array.from(SEG.filter(q=>Math.abs(q[0]-st[0])<0.7&&Math.abs(q[1]-st[1])<0.6).flat());const out=[];
  for(const T of TP){const L0=G*T*T/(2*Math.PI),c0=cOf(1e4,T),dstop=0.5*L0,res=new Float32Array(360).fill(NaN),wt=new Float32Array(360);
    const cs=cOf(st[2],T);
    for(let a=0;a<360;a++){let lo=st[0],la=st[1],tx=Math.sin(a*Math.PI/180),ty=Math.cos(a*Math.PI/180),s_=0,hit=false,exitDir=null;
      const ds=Math.max(60,Math.min(400,dstop/15));
      for(let it=0;it<4000;it++){
        const e=elev(lo,la);if(e==null){exitDir=Math.atan2(tx,ty);break}
        if(e>-1){hit=true;break}
        const d=-e;if(d>=dstop){exitDir=Math.atan2(tx,ty);break}
        // gradient of c by finite difference (east, north), 100 m
        const h=0.1,ex=h/kx,ey=h/110.57;const e1=elev(lo+ex,la),e2=elev(lo-ex,la),n1=elev(lo,la+ey),n2=elev(lo,la-ey);
        if(e1==null||e2==null||n1==null||n2==null){exitDir=Math.atan2(tx,ty);break}
        const c=cOf(d,T),gx=(cOf(Math.max(.5,-e1),T)-cOf(Math.max(.5,-e2),T))/(2*h*1000),gy=(cOf(Math.max(.5,-n1),T)-cOf(Math.max(.5,-n2),T))/(2*h*1000);
        const dot=gx*tx+gy*ty,px=gx-dot*tx,py=gy-dot*ty;   // gradient normal to the ray
        const step=ds;tx+=-(px/c)*step;ty+=-(py/c)*step;const n=Math.hypot(tx,ty);tx/=n;ty/=n;
        const nlo=lo+tx*step/1000/kx,nla=la+ty*step/1000/110.57;
        if(!process.env.NOSEG&&SEG.length&&crosses(lo,la,nlo,nla)){hit=true;break}
        lo=nlo;la=nla;s_+=step;if(s_>400000){exitDir=Math.atan2(tx,ty);break}}
      if(!hit&&exitDir!=null){let wgt=1;const ex_=Math.sin(exitDir),ey_=Math.cos(exitDir);let lo2=lo,la2=la;
        for(let km=3;km<=150;km+=3){lo2=lo+km*ex_/kx;la2=la+km*ey_/110.57;const e2=elev(lo2,la2);if(e2==null)break;if(e2>-1){wgt=Math.pow(Math.max(0,Math.min(1,(km-3)/97)),1.5);break}}
        res[a]=((exitDir*180/Math.PI)%360+360)%360;wt[a]=wgt}}
    // energy transfer: Kr^2 = (c0/c) * sum_i g(theta0_i - theta*) * dalpha
    const row=[];
    for(let k=0;k<NA;k++){const th=k*360/NA;let sum=0;for(let a=0;a<360;a++){const t0=res[a];if(Number.isNaN(t0))continue;let dd=Math.abs(t0-th)%360;if(dd>180)dd=360-dd;sum+=wt[a]*Math.exp(-0.5*(dd/SIG)**2)/(SIG*Math.sqrt(2*Math.PI))}
      const kr=Math.sqrt(Math.max(0,(c0/cs)*sum));row.push(Math.round(Math.min(1.4,kr)*100))}
    out.push(row)}
  return out}
module.exports={traceSpot,SPOTS,TP};
if(require.main===module){const names=process.argv.slice(2);const bar=v=>' ▁▂▃▄▅▆▇█'[Math.min(8,Math.round(v/100*8))];
  for(const s of SPOTS){if(names.length&&!names.some(n=>s.n.includes(n)))continue;const r=traceSpot(s);if(!r){console.log(s.n,'no water start');continue}
    console.log(s.n.padEnd(22),'f',s.f);for(let i=0;i<TP.length;i++){let l='';for(let k=24;k<=68;k++)l+=bar(r[i][k]);console.log('  T'+String(TP[i]).padEnd(3),l)}}
  console.log(' '.repeat(29)+'120°'+' '.repeat(26)+'270°')}
