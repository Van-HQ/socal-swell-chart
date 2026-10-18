// Loads the app's real rating code (src/app.js) so history is scored with exactly the same formula as the live app.
// The block between the two markers is pure maths (no page access), so it can run in Node.
import fs from "node:fs";import path from "node:path";import vm from "node:vm";
const here=path.dirname(new URL(import.meta.url).pathname);
const app=fs.readFileSync(path.join(here,"../../src/app.js"),"utf8");
const a=app.indexOf("const K_BREAK"),bMark="function rateHour(",b0=app.indexOf(bMark),b=app.indexOf("\n",b0);
if(a<0||b0<0)throw new Error("rating markers not found in src/app.js: has the rating code moved?");
const helpers="const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));const lerp=(a,b,t)=>a+(b-a)*t;const angDiff=(a,b)=>Math.abs(((a-b+540)%360)-180);";
export function loadRating(model){
  const code=helpers+app.slice(a,b)+";({comps,rateCore,shown,PEAK})";
  return vm.runInNewContext(code,{localStorage:{getItem:()=>model==="current"?"current":null},Math,Object,Array});
}
export function loadSpots(){
  return vm.runInNewContext(fs.readFileSync(path.join(here,"../../src/spots.js"),"utf8")+";({SPOTS,BUOYS})");
}
