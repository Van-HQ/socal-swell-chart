const {traceSpot,SPOTS}=require('./trace.js');const fs=require('fs');
const part=+process.argv[2],parts=+process.argv[3];const out={};
SPOTS.forEach((s,i)=>{if(i%parts!==part)return;const r=traceSpot(s);out[s.n]=r;process.stderr.write(part+':'+s.n+(r?'':' (no water)')+'\n')});
fs.writeFileSync(`k_${part}.json`,JSON.stringify(out));
