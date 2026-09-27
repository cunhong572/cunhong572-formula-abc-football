import { ai } from "hatchable";
import { requireAuth } from "lib/auth.js";

export const access = "public";
export const methods = ["POST"];

function cleanJsonText(s){
  return String(s||"").trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"").trim();
}
function normalizeFixture(x){
  const home=String(x?.home||"").trim();
  const away=String(x?.away||"").trim();
  if(!home||!away)return null;
  return {home,away,confidence:Number.isFinite(Number(x?.confidence))?Math.max(0,Math.min(1,Number(x.confidence))):null};
}

export default async function(req,res){
  const user=await requireAuth(req,res);if(!user)return;
  try{
    const dataUrl=String(req.body?.imageDataUrl||"");
    if(!/^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(dataUrl)){
      return res.status(400).json({error:"请上传 PNG/JPG/WEBP 图片。"});
    }
    if(dataUrl.length>9_000_000)return res.status(413).json({error:"图片过大，请选择较小截图。"});

    const prompt=[
      "You are reading a football/soccer fixtures worksheet screenshot with repeated horizontal match blocks.",
      "IMPORTANT: Read ONLY the LEFTMOST FIRST COLUMN of each match block. Ignore every other column completely.",
      "In that first column, each match block contains exactly two team-name lines: the upper team is HOME and the lower team is AWAY.",
      "Extract those two team names only, in top-to-bottom block order.",
      "Do NOT read or use times, odds, odds movement, Update text, Last 1 hr, Last 5 min, league names, scores, rankings, notes, labels, separators, or any text outside the first/leftmost team-name column.",
      "If the first column also contains labels such as Odds or Odds movement below the two team names, ignore those labels; they are not teams.",
      "Preserve the team identity, but normalize common club-name variants to concise FotMob-friendly names when obvious: AFC Bournemouth -> Bournemouth; Atletico de Madrid -> Atletico Madrid; Bayer 04 Leverkusen -> Bayer Leverkusen; Villarreal CF -> Villarreal; Levante UD -> Levante; TSG 1899 Hoffenheim -> TSG Hoffenheim; Olympique de Marseille -> Olympique Marseille; Paris Saint Germain -> Paris Saint-Germain.",
      "Return at most 20 fixtures.",
      "Return STRICT JSON only in this exact shape:",
      '{"fixtures":[{"home":"Team A","away":"Team B","confidence":0.98}]}',
      "If no reliable two-team block is visible in the first column, return {\"fixtures\":[]}."
    ].join("\n");

    const r=await ai.fetch({
      provider:"openai",
      path:"/v1/chat/completions",
      body:{
        model:"gpt-4o-mini",
        temperature:0,
        max_tokens:1200,
        messages:[{role:"user",content:[
          {type:"text",text:prompt},
          {type:"image_url",image_url:{url:dataUrl}}
        ]}]
      },
      purpose:"formula-team-image-read",
      timeoutMs:50000
    });

    if(!r.ok){
      let detail="";
      try{detail=await r.text()}catch(e){}
      if(r.status===412)return res.status(412).json({error:"图片识别 AI 尚未配置或额度不可用。",setupRequired:true,detail});
      return res.status(502).json({error:"图片识别暂时失败，请重试。",detail});
    }
    const out=await r.json();
    const raw=out?.choices?.[0]?.message?.content||"";
    let parsed=null;
    try{parsed=JSON.parse(cleanJsonText(raw));}catch(e){
      const m=String(raw).match(/\{[\s\S]*\}/);
      if(m)try{parsed=JSON.parse(m[0])}catch(_){}
    }
    const fixtures=(Array.isArray(parsed?.fixtures)?parsed.fixtures:[]).map(normalizeFixture).filter(Boolean).slice(0,20);
    return res.json({fixtures,count:fixtures.length});
  }catch(e){
    const msg=String(e?.message||e||"");
    console.error("read-team-image",String(e?.stack||e));
    if(/412|No openai key configured|setup_required|AI credit/i.test(msg)){
      return res.status(412).json({
        error:"图片识别 AI 尚未配置。请先在 Hatchable 项目的 Setup 页面配置 OpenAI API Key（或可用的 Builder + AI 额度），然后再上传图片。",
        setupRequired:true
      });
    }
    return res.status(500).json({error:"图片识别发生错误："+msg.slice(0,180)});
  }
}