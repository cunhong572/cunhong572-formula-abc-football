export function classifyStyle(gf,ga,played){
  if(!played)return "";
  const gfp=gf/played,gap=ga/played;
  if(gfp>=1.85 || (gfp>=1.55&&gfp-gap>=0.55)) return "进攻";
  if(gfp>=1.35 || (gfp-gap>=0.20&&gfp>=1.15)) return "微攻";
  if(gap<=1.00&&gfp<1.35) return "防守";
  return "微守";
}
