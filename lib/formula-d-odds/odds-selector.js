export function validOdds(v){ const n=Number(v); return Number.isFinite(n)&&n>1&&n<20?n:null; }

// Preserve visual-order ties and the existing floating-point tolerance.
export function createOddsSelector(){
  function nearestOver(candidates){
    let selected=candidates[0];
    for(const c of candidates)if(Math.abs(c.odds-1.88)<Math.abs(selected.odds-1.88)-1e-9)selected=c;
    return selected;
  }
  return {nearestOver};
}
