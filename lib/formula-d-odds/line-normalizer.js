// Self-contained factory shared by server code and the serialized DOM scanner.
export function createLineNormalizer(){
    const lineValue=value=>{
      const raw=String(value||"").trim();
      if(!raw)return NaN;
      const parts=raw.split("/").map(Number);
      if(parts.some(x=>!Number.isFinite(x)))return NaN;
      return parts.reduce((a,b)=>a+b,0)/parts.length;
    };
    const canonicalLine=value=>{
      const n=lineValue(value);
      if(!Number.isFinite(n))return String(value||"").trim();
      const q=Math.round(n*4)/4;
      const whole=Math.floor(q);
      const frac=Math.round((q-whole)*100)/100;
      if(Math.abs(frac-0.25)<1e-9)return `${whole}/${whole+0.5}`;
      if(Math.abs(frac-0.75)<1e-9)return `${whole+0.5}/${whole+1}`;
      if(Math.abs(frac-0.5)<1e-9)return String(whole+0.5);
      return String(whole);
    };
    const sameLine=(a,b)=>{
      const av=lineValue(a),bv=lineValue(b);
      if(Number.isFinite(av)&&Number.isFinite(bv))return Math.abs(av-bv)<1e-9;
      return String(a||"").trim()===String(b||"").trim();
    };
    return {lineValue,canonicalLine,sameLine};
}
export const {lineValue:lineNumber,sameLine:sameTrackedLine}=createLineNormalizer();
