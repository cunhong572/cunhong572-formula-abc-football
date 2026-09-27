import { canonicalTeam } from "lib/shared-data/team-resolver.js";
function norm(s){
  return String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
}
export const nationsTiers={
    4:["spain","england","france","portugal","belgium","norway","germany","netherlands"],
    3:["italy","croatia","switzerland","denmark","austria","serbia","turkiye","turkey","sweden","ukraine","czechia","czechrepublic","greece","wales","poland"],
    2:["scotland","hungary","romania","slovenia","northmacedonia","macedonia","georgia","republicofireland","ireland","kosovo","israel","bosniaherzegovina","bosniaandherzegovina","albania","finland","slovakia","iceland","montenegro","kazakhstan","bulgaria","northernireland"],
    1:["armenia","belarus","cyprus","latvia","faroeislands","moldova","estonia","luxembourg","azerbaijan","lithuania","malta","gibraltar","andorra","liechtenstein","sanmarino"]
  };
export const tiers={
    4:[
      "arsenal","manchestercity","mancity","liverpool",
      "barcelona","realmadrid",
      "bayernmunchen","bayernmunich",
      "inter","internazionale","asroma","roma","juventus","como",
      "parissaintgermain","psg"
    ],
    3:[
      "chelsea","manchesterunited","manunited","astonvilla","tottenham","tottenhamhotspur","brentford","brighton","brightonhovealbion","newcastle","newcastleunited",
      "atleticomadrid","villarreal","realbetis",
      "borussiadortmund","bayerleverkusen","rbleipzig","vfb stuttgart","vfb stuttgart","hoffenheim",
      "napoli","acmilan","milan","atalanta","lazio",
      "lens","rclens","lille","lyon","olympiquelyonnais","monaco","asmonaco","marseille","olympiquedemarseille","rennes","staderennais","strasbourg","rcstrasbourg"
    ],
    2:[
      "everton","leedsunited","leeds","sunderland","crystalpalace","fulham","bournemouth","nottinghamforest","nottmforest","nottingham","hull","hullcity",
      "athleticclub","realsociedad","celtavigo","valencia","rayovallecano","alaves","getafe","osasuna","levante",
      "freiburg","scfreiburg","mainz05","mainz","eintrachtfrankfurt","augsburg","borussiamonchengladbach","monchengladbach","unionberlin",
      "bologna","fiorentina","sassuolo","udinese","torino","cagliari","genoa","parma","lecce",
      "parisfc","brest","lorient","toulouse","nice"
    ],
    1:[
      "ipswichtown","ipswich","coventrycity","coventry",
      "sevilla","deportivolacoruna","racingsantander","malaga","elche","espanyol",
      "werderbremen","fckoln","koln","hamburgersv","schalke04","svelversberg","scpaderborn07","paderborn",
      "monza","frosinone","venezia",
      "angers","lemans","troyes","lehavre","auxerre"
    ]
  };

export function strengthTier(name){
  const n=norm(canonicalTeam(name));

  // Formula B · UEFA Nations League senior men's national-team strength table.
  // This is an auxiliary consideration only; it must NOT decide intent by itself.
  // Final intent still combines competition need, standings/qualification context,
  // home/away, form, fatigue, lineup/injuries, future schedule, market evidence,
  // coach intent and other verified factors.

  for(const [t,arr] of Object.entries(nationsTiers)){if(arr.some(x=>norm(x)===n))return Number(t);}


  for(const [t,arr] of Object.entries(tiers)){if(arr.some(x=>norm(x)===n))return Number(t);}
  return null;
}

export function tierLabel(t){return t===4?"优":t===3?"良":t===2?"中":t===1?"差":"—"}

export function strengthInputs(live={}){
  const number=v=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
  return {strength:number(live.strengthTier),oppStrength:number(live.opponentStrengthTier)};
}
export function fixtureStrength(fixture){return {home:strengthTier(fixture?.home?.name),away:strengthTier(fixture?.away?.name)};}
