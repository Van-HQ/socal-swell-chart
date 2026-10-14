const fs=require('fs');const K=JSON.parse(fs.readFileSync('k_0.json'));
const eng=fs.readFileSync('/home/claude/socal-swell-chart/src/spots.js','utf8').split('const TIDES')[0].replace(/^const /gm,'var ');eval(eng);
const angDiff=(a,b)=>{const d=Math.abs(a-b)%360;return d>180?360-d:d};
const old=(s,dir)=>{let o=180;for(const [a,b] of s.w){const span=(b-a+360)%360,off=(dir-a+360)%360;if(off<=span)return 1;o=Math.min(o,angDiff(dir,a),angDiff(dir,b))}return o>=40?0.12:0.12+0.88*(0.5+0.5*Math.cos(Math.PI*o/40))};
const sc=[['S 190 / 16s',190,3],['SW 225 / 13s',225,2],['W 270 / 14s',270,2.5],['NW 295 / 16s',295,3]];
const k=(s,d,pi)=>K[s.n]&&K[s.n][pi]?K[s.n][pi][Math.round(d/5)%72]/100:NaN;
for(const [nm,d,pi] of sc){console.log('\n=== '+nm+'  (new = K, old = window*gain)');const rows=SPOTS.map(s=>({n:s.n,r:s.r,k:k(s,d,pi),o:old(s,d)*s.g})).filter(x=>!Number.isNaN(x.k));
 const big=rows.filter(x=>Math.abs(x.k-x.o)>0.35).sort((a,b)=>(b.k-b.o)-(a.k-a.o));
 console.log(rows.length,'spots; differ by >0.35:',big.length);
 console.log(big.slice(0,6).map(x=>x.n+' new '+x.k.toFixed(2)+' old '+x.o.toFixed(2)).join('\n')+'\n...\n'+big.slice(-6).map(x=>x.n+' new '+x.k.toFixed(2)+' old '+x.o.toFixed(2)).join('\n'))}
console.log('\ngain>1 or <0.8 spots:',SPOTS.filter(s=>s.g>1.0||s.g<0.8).map(s=>s.n+' '+s.g).join('; '))
