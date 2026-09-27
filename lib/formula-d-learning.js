import { db } from "hatchable";

function n(v){const x=Number(v);return Number.isFinite(x)?x:null}
function rowFor(match,sideName,oppName,side,analysis,goalsFor,goalsAgainst,gti,teamId){
  const m=analysis?.metrics||{},fm=analysis?.formulaDMetrics||analysis?.metricsFormulaD||analysis?.metrics||{};
  return {
    matchId:String(match?.matchId||""),competition:String(match?.competition||""),teamId:teamId==null?null:String(teamId),
    teamName:String(sideName||""),side,opponentName:String(oppName||""),minute:Number(match?.minute||0),
    scoreFor:Number(goalsFor||0),scoreAgainst:Number(goalsAgainst||0),intent:String(analysis?.intent||"---"),
    confidence:n(analysis?.confidence),ss:n(fm?.SS),as:n(fm?.AS),ss5:n(fm?.window5SS),as5:n(fm?.window5AS),
    ss10:n(fm?.window10SS),as10:n(fm?.window10AS),gti:n(gti?.GTI),
    recent5Shots:n(m?.recent5ShotsFor),recent5Xg:n(m?.recent5XgFor),recent10Shots:n(m?.recent10ShotsFor),recent10Xg:n(m?.recent10XgFor),
    totalShots:n(m?.totalShots),totalXg:n(m?.xg),possession:n(m?.possession),redCards:n(m?.redCards),substitutions:n(m?.substitutions),
    preMatchIntent:String(m?.preMatchIntent||""),strengthTier:n(m?.strengthTier),opponentStrengthTier:n(m?.opponentStrengthTier),
    dataMode:String(fm?.mode||"proxy")
  };
}
export async function saveFormulaDSnapshot(match,home,away,gti,ids={}){
  if(!match?.matchId||!match?.minute||match?.finished)return;
  const rows=[
    rowFor(match,match.home,match.away,"home",home,match.homeGoals,match.awayGoals,gti,ids.homeId),
    rowFor(match,match.away,match.home,"away",away,match.awayGoals,match.homeGoals,gti,ids.awayId)
  ];
  for(const x of rows){
    await db.query(`
      INSERT INTO formula_d_snapshots
      (match_id,competition,team_id,team_name,side,opponent_name,minute,score_for,score_against,intent,confidence,ss,attack_score,ss5,as5,ss10,as10,gti,recent5_shots,recent5_xg,recent10_shots,recent10_xg,total_shots,total_xg,possession,red_cards,substitutions,prematch_intent,strength_tier,opponent_strength_tier,data_mode,observed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,NOW())
      ON CONFLICT (match_id,team_name,minute) DO UPDATE SET
        score_for=EXCLUDED.score_for,score_against=EXCLUDED.score_against,intent=EXCLUDED.intent,confidence=EXCLUDED.confidence,
        ss=EXCLUDED.ss,attack_score=EXCLUDED.attack_score,ss5=EXCLUDED.ss5,as5=EXCLUDED.as5,ss10=EXCLUDED.ss10,as10=EXCLUDED.as10,gti=EXCLUDED.gti,
        recent5_shots=EXCLUDED.recent5_shots,recent5_xg=EXCLUDED.recent5_xg,recent10_shots=EXCLUDED.recent10_shots,recent10_xg=EXCLUDED.recent10_xg,
        total_shots=EXCLUDED.total_shots,total_xg=EXCLUDED.total_xg,possession=EXCLUDED.possession,red_cards=EXCLUDED.red_cards,substitutions=EXCLUDED.substitutions,
        prematch_intent=EXCLUDED.prematch_intent,strength_tier=EXCLUDED.strength_tier,opponent_strength_tier=EXCLUDED.opponent_strength_tier,data_mode=EXCLUDED.data_mode,observed_at=NOW()
      WHERE
        formula_d_snapshots.score_for IS DISTINCT FROM EXCLUDED.score_for OR
        formula_d_snapshots.score_against IS DISTINCT FROM EXCLUDED.score_against OR
        formula_d_snapshots.intent IS DISTINCT FROM EXCLUDED.intent OR
        formula_d_snapshots.confidence IS DISTINCT FROM EXCLUDED.confidence OR
        formula_d_snapshots.ss IS DISTINCT FROM EXCLUDED.ss OR
        formula_d_snapshots.attack_score IS DISTINCT FROM EXCLUDED.attack_score OR
        formula_d_snapshots.ss5 IS DISTINCT FROM EXCLUDED.ss5 OR
        formula_d_snapshots.as5 IS DISTINCT FROM EXCLUDED.as5 OR
        formula_d_snapshots.ss10 IS DISTINCT FROM EXCLUDED.ss10 OR
        formula_d_snapshots.as10 IS DISTINCT FROM EXCLUDED.as10 OR
        formula_d_snapshots.gti IS DISTINCT FROM EXCLUDED.gti OR
        formula_d_snapshots.recent5_shots IS DISTINCT FROM EXCLUDED.recent5_shots OR
        formula_d_snapshots.recent5_xg IS DISTINCT FROM EXCLUDED.recent5_xg OR
        formula_d_snapshots.recent10_shots IS DISTINCT FROM EXCLUDED.recent10_shots OR
        formula_d_snapshots.recent10_xg IS DISTINCT FROM EXCLUDED.recent10_xg OR
        formula_d_snapshots.total_shots IS DISTINCT FROM EXCLUDED.total_shots OR
        formula_d_snapshots.total_xg IS DISTINCT FROM EXCLUDED.total_xg OR
        formula_d_snapshots.possession IS DISTINCT FROM EXCLUDED.possession OR
        formula_d_snapshots.red_cards IS DISTINCT FROM EXCLUDED.red_cards OR
        formula_d_snapshots.substitutions IS DISTINCT FROM EXCLUDED.substitutions OR
        formula_d_snapshots.prematch_intent IS DISTINCT FROM EXCLUDED.prematch_intent OR
        formula_d_snapshots.strength_tier IS DISTINCT FROM EXCLUDED.strength_tier OR
        formula_d_snapshots.opponent_strength_tier IS DISTINCT FROM EXCLUDED.opponent_strength_tier OR
        formula_d_snapshots.data_mode IS DISTINCT FROM EXCLUDED.data_mode
    `,[x.matchId,x.competition,x.teamId,x.teamName,x.side,x.opponentName,x.minute,x.scoreFor,x.scoreAgainst,x.intent,x.confidence,x.ss,x.as,x.ss5,x.as5,x.ss10,x.as10,x.gti,x.recent5Shots,x.recent5Xg,x.recent10Shots,x.recent10Xg,x.totalShots,x.totalXg,x.possession,x.redCards,x.substitutions,x.preMatchIntent,x.strengthTier,x.opponentStrengthTier,x.dataMode]);
  }
}
function supportScore(intent,s,f){
  const shotDelta=Math.max(0,(Number(f.total_shots)||0)-(Number(s.total_shots)||0));
  const xgDelta=Math.max(0,(Number(f.total_xg)||0)-(Number(s.total_xg)||0));
  const goalDelta=(Number(f.score_for)||0)-(Number(s.score_for)||0);
  const concededDelta=(Number(f.score_against)||0)-(Number(s.score_against)||0);
  const fas=Number(f.attack_score)||0,fss=Number(f.ss)||0;
  let score=50;
  if(["Must Win","Want Win","Hope Win","Equalize","Win Big"].includes(intent)){
    score=20+Math.min(30,shotDelta*9)+Math.min(30,xgDelta*85)+Math.min(15,Math.max(0,fas-45)*.6)+Math.min(10,goalDelta*10);
    if(intent==="Equalize"&&goalDelta>0)score+=10;
    if(intent==="Win Big"&&goalDelta>0)score+=8;
  }else if(intent==="Don't Lose"){
    score=45+Math.max(0,55-fas)*.7+Math.max(0,55-fss)*.25+(concededDelta===0?15:-25);
  }else if(intent==="Give Up"){
    score=45+Math.max(0,42-fas)*1.1+Math.max(0,45-fss)*.4+(shotDelta===0?12:0);
  }else{
    score=50;
  }
  return Math.max(0,Math.min(100,Math.round(score)));
}
export async function backtestMatch(matchId){
  const r=await db.query("SELECT * FROM formula_d_snapshots WHERE match_id=$1 ORDER BY team_name,minute",[String(matchId)]);
  const rows=r.rows||[];
  const horizons=[5,10,15];
  for(const s of rows){
    const teamRows=rows.filter(x=>x.team_name===s.team_name&&Number(x.minute)>Number(s.minute));
    for(const h of horizons){
      const target=Number(s.minute)+h;
      const f=teamRows.find(x=>Number(x.minute)>=target-1&&Number(x.minute)<=target+2);
      if(!f)continue;
      const score=supportScore(s.intent,s,f);
      await db.query(`
        INSERT INTO formula_d_backtests
        (snapshot_id,match_id,team_name,minute,intent,horizon_minutes,future_minute,future_ss,future_as,future_recent5_shots,future_recent5_xg,goal_delta,conceded_delta,behavior_score,supported,calculated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
        ON CONFLICT (snapshot_id,horizon_minutes) DO UPDATE SET
          future_minute=EXCLUDED.future_minute,future_ss=EXCLUDED.future_ss,future_as=EXCLUDED.future_as,future_recent5_shots=EXCLUDED.future_recent5_shots,
          future_recent5_xg=EXCLUDED.future_recent5_xg,goal_delta=EXCLUDED.goal_delta,conceded_delta=EXCLUDED.conceded_delta,
          behavior_score=EXCLUDED.behavior_score,supported=EXCLUDED.supported,calculated_at=NOW()
      `,[s.id,s.match_id,s.team_name,s.minute,s.intent,h,f.minute,f.ss,f.attack_score,f.recent5_shots,f.recent5_xg,
          Number(f.score_for)-Number(s.score_for),Number(f.score_against)-Number(s.score_against),score,score>=60]);
    }
  }
}
export async function learningSummary(){
  const a=await db.query(`
    SELECT intent,horizon_minutes,COUNT(*)::int AS samples,
      ROUND(AVG(behavior_score)::numeric,1) AS avg_behavior_score,
      ROUND(100.0*AVG(CASE WHEN supported THEN 1 ELSE 0 END)::numeric,1) AS support_rate
    FROM formula_d_backtests
    GROUP BY intent,horizon_minutes ORDER BY intent,horizon_minutes
  `);
  const b=await db.query("SELECT COUNT(DISTINCT match_id)::int AS matches,COUNT(*)::int AS snapshots FROM formula_d_snapshots");
  return {totals:b.rows?.[0]||{matches:0,snapshots:0},byIntent:a.rows||[]};
}