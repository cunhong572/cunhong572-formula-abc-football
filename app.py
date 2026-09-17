
import io, json, os, re, zipfile
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import List, Literal

import httpx
import xlsxwriter
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel, Field

BASE = os.path.dirname(__file__)
ET = ZoneInfo("America/New_York")
with open(os.path.join(BASE, "rules_config.json"), "r", encoding="utf-8") as f:
    RULES = json.load(f)

app = FastAPI(title="Formula A+B+C Football Analyst — Formal")

class MatchInput(BaseModel):
    home: str = Field(min_length=1)
    away: str = Field(min_length=1)
    formula: Literal["A","B","C"]

class GenerateRequest(BaseModel):
    matches: List[MatchInput] = Field(min_length=1, max_length=20)

def now_et():
    return datetime.now(ET).strftime("%Y-%m-%d %H:%M:%S ET")

def clean_json_text(s: str) -> str:
    s = s.strip()
    s = re.sub(r"^```json\s*", "", s, flags=re.I)
    s = re.sub(r"\s*```$", "", s)
    start = s.find("{")
    end = s.rfind("}")
    return s[start:end+1] if start >= 0 and end > start else s

def extract_output_text(data: dict) -> str:
    if isinstance(data.get("output_text"), str):
        return data["output_text"]
    parts=[]
    for item in data.get("output",[]):
        if not isinstance(item,dict):
            continue
        for c in item.get("content",[]) or []:
            if isinstance(c,dict) and c.get("type") in ("output_text","text") and c.get("text"):
                parts.append(c["text"])
    return "\n".join(parts)

def data_schema(formula: str, home: str, away: str):
    common = {
        "formula": formula, "home": home, "away": away,
        "competition": "", "kickoff_et": "",
        "home_league": "", "away_league": "",
        "home_rank": None, "away_rank": None,
        "home_points": None, "away_points": None,
        "home_prev2": [], "away_prev2": [],
        "home_fatigue": "", "away_fatigue": "",
        "home_density": "", "away_density": "",
        "home_next3": [], "away_next3": [],
        "sources": [], "warnings": []
    }
    if formula=="A":
        common.update({
            "home_standing_window": [], "away_standing_window": [],
            "home_sequence6": [], "away_sequence6": [],
            "home_avg_scored": None, "home_avg_conceded": None,
            "away_avg_scored": None, "away_avg_conceded": None,
            "home_form": "", "away_form": "",
            "home_form_label": "", "away_form_label": "",
            "home_style": "", "away_style": ""
        })
    elif formula=="B":
        common.update({
            "home_ucl_points": None, "away_ucl_points": None,
            "home_ucl8": [], "away_ucl8": [], "ucl_table": []
        })
    else:
        common.update({
            "home_intent": "---", "away_intent": "---",
            "home_intent_reason": "", "away_intent_reason": "",
            "home_strength_tier": "", "away_strength_tier": "",
            "home_europe_fixtures": [], "away_europe_fixtures": [],
            "europe_table": [], "europe_table_name": ""
        })
    return common

SYSTEM = """You are a meticulous football data researcher for a locked Excel system.
You MUST use fresh web search and distinguish official facts from uncertain secondary information.
Request-time cutoff matters: include matches completed before request time; exclude matches still live.
All schedule times used for ordering must be converted to America/New_York.
For standings, use the official competition table/order when available. Never create your own tiebreak order that contradicts official published order.
All fixtures described as 'all competitions' mean FIRST TEAM only and include league, domestic cups, UCL/UEL/UECL and confirmed club friendlies. Exclude youth/reserves.
Return ONLY one valid JSON object matching the requested schema. Use null/blank plus warnings when a fact cannot be verified. Never invent values.
Sources must be direct URLs, preferably official competition/club pages for standings and schedules.
"""

FORMULA_A_PROMPT = """FORMULA A — LOCKED FORMAL RULES
1) Official current table at exact request time. Team row is surrounded by up to 3 teams above and 3 below. Preserve official order.
2) Build sequence6 for EACH team: previous 3 actual first-team matches + THIS match + next 2 confirmed first-team matches, in true chronological order. Include all competitions and confirmed club friendlies.
3) Every sequence item: date_et, competition, home, away, score/status, rest_days_from_previous. Rest days = later calendar date - earlier calendar date - 1 in ET.
4) Avg Goal Scored, Avg Goal Conceded and Form MUST be from the analyzed match's competition only for this season. Never mix other competitions. If no completed sample, leave null/blank.
5) Form string uses W/D/L; form label can be V Good/Good/Avg/Poor/V Poor.
6) Coach style ONLY one of: 进攻, 微攻, 微守, 防守.
7) Do not invent odds/intention/advantage/squad strength.
"""

FORMULA_B_PROMPT = """FORMULA B — UCL FORMAL TEMPLATE
1) UEFA Champions League only. Use current official UCL total table and UCL points.
2) Fatigue from previous actual first-team matches across ALL competitions:
current→last rest >=4 => Not Tired; <=3 => Tired;
if current→last <=3 AND last→second-last <=3 => Very Tired.
3) Future density: current→next1 >=4 => ❌; <=3 => ☑️; if next1→next2 <=3 => ☑️×2, else ☑️.
4) Next 3 = next 3 confirmed first-team matches AFTER current across ALL competitions, ET.
5) Include complete 8 UCL league-phase fixtures for each team; played include score.
6) Include complete current UCL total table.
7) Intent blank.
"""

FORMULA_C_PROMPT = """FORMULA C — LOCKED FORMAL INTENT SYSTEM
Allowed intent labels ONLY: Must Win, Want Win, Hope Win, Don't Lose, ---.
Do NOT use Equalize in Formula C.

Ranking: current analyzed competition official table if it has its own table; otherwise current domestic official table.
Fatigue: >=4 rest days => Not Tired; <=3 => Tired; two consecutive <=3 intervals => Very Tired.
Density: current→next1 >=4 => ❌; <=3 => ☑️; if next1→next2 <=3 => ☑️×2, else ☑️.
Next 3: confirmed first-team matches after current across all competitions including confirmed friendlies.

Intent rules:
- Must Win only when actual mathematics/knockout/title/relegation/qualification situation makes winning effectively necessary.
- Want Win requires clear motivation AND realistic strength/conditions to beat opponent. Strength tier alone is never enough. If motivation exists but ability/conditions are not clear enough, use Hope Win.
- Same/close strength with no clear basis => ---.
- Don't Lose is not allowed just because current opponent is strong. After all old factors lean Don't Lose, gate must pass: next opponent is 优 OR both next two opponents are each two strength tiers above this team.
- Consider format, points/GD/remaining fixtures, qualification math, H/A, last-5 H2H, squad value, coach style, players, lineup/rotation, injuries, market odds, form, future priority, coach comments, fatigue and next-two opponent strength.
- Confirmed lineup/injury/coach info overrides generic market assumptions.

UEL/UECL:
- UEL: UEL total rank; complete current 36-team table; each team's full 8 league-phase fixtures.
- UECL: UECL total rank; complete current 36-team table; each team's full 6 league-phase fixtures.
- Full European schedule is auxiliary intent evidence (opponent tiers, H/A distribution, consecutive strong/away games, current point opportunity, opportunity cost, current table).
"""

async def research_match(m: MatchInput) -> dict:
    key = os.getenv("OPENAI_API_KEY","").strip()
    if not key:
        raise HTTPException(503, "正式版需要实时研究数据源。Railway 尚未设置 OPENAI_API_KEY，因此系统不会生成空白/假 Excel。")
    model = os.getenv("OPENAI_MODEL","gpt-5.6-sol")
    schema = data_schema(m.formula, m.home.strip(), m.away.strip())
    rules_text = {"A":FORMULA_A_PROMPT,"B":FORMULA_B_PROMPT,"C":FORMULA_C_PROMPT}[m.formula]
    prompt = f"""
REQUEST TIME: {now_et()}
MATCH: {m.home} vs {m.away}
FORMULA: {m.formula}

{rules_text}

JSON SCHEMA TO FILL:
{json.dumps(schema, ensure_ascii=False)}

Formula A standing_window rows: team,pos,pts,gd,p,remaining,max_points.
Fixtures: date_et,competition,home,away,status,score,rest_days_from_previous when relevant.
Standings table rows: pos,team,p,w,d,l,gf,ga,gd,pts,form.
Formula C intent_reason: concise and specific, with decisive evidence only.
"""
    payload = {
        "model": model,
        "reasoning": {"effort":"high"},
        "tools": [{"type":"web_search"}],
        "input": SYSTEM + "\n" + prompt
    }
    async with httpx.AsyncClient(timeout=240) as client:
        r = await client.post(
            "https://api.openai.com/v1/responses",
            headers={"Authorization":f"Bearer {key}","Content-Type":"application/json"},
            json=payload
        )
    if r.status_code >= 300:
        raise HTTPException(502, "实时研究接口错误: " + r.text[:800])
    text = clean_json_text(extract_output_text(r.json()))
    try:
        out = json.loads(text)
    except Exception as e:
        raise HTTPException(502, f"研究结果无法解析: {e}; {text[:700]}")
    out["formula"] = m.formula
    out["home"] = m.home
    out["away"] = m.away
    return out

async def research_all(matches):
    results=[]
    for m in matches:
        results.append(await research_match(m))
    return results

def formats(wb):
    return {
        "title": wb.add_format({"bold":True,"font_size":15,"align":"center","valign":"vcenter","border":1,"bg_color":"#D9EAF7"}),
        "blue": wb.add_format({"bold":True,"font_color":"#FFFFFF","bg_color":"#4F81BD","align":"center","valign":"vcenter","border":1}),
        "head": wb.add_format({"bold":True,"align":"center","valign":"vcenter","border":1,"bg_color":"#D9EAF7"}),
        "cell": wb.add_format({"align":"center","valign":"vcenter","border":1}),
        "wrap": wb.add_format({"align":"center","valign":"vcenter","border":1,"text_wrap":True}),
        "yellow": wb.add_format({"bold":True,"align":"center","valign":"vcenter","border":1,"bg_color":"#FFF2CC"}),
        "black": wb.add_format({"bg_color":"#000000"}),
        "green": wb.add_format({"bold":True,"align":"center","valign":"vcenter","border":1,"bg_color":"#C6E0B4"}),
        "pink": wb.add_format({"bold":True,"align":"center","valign":"vcenter","border":1,"bg_color":"#F4CCCC"}),
        "lightblue": wb.add_format({"bold":True,"align":"center","valign":"vcenter","border":1,"bg_color":"#DDEBF7"}),
        "gray": wb.add_format({"bold":True,"align":"center","valign":"vcenter","border":1,"bg_color":"#E7E6E6"}),
        "warn": wb.add_format({"align":"left","valign":"top","border":1,"text_wrap":True,"bg_color":"#FFF2CC"}),
        "source": wb.add_format({"font_size":9,"font_color":"#666666","text_wrap":True,"border":1})
    }

def text_fixture(x):
    if not x:
        return ""
    rest=x.get("rest_days_from_previous")
    rest_t="" if rest is None else f" | Days {rest}"
    score=x.get("score") or ""
    status=x.get("status") or ""
    end=f" | {score}" if score else (f" | {status}" if status else "")
    return f'{x.get("date_et","")} | {x.get("competition","")} | {x.get("home","")} vs {x.get("away","")}{end}{rest_t}'

def standing_row(ws,f,excel_row,entry,highlight=False):
    fmt=f["yellow"] if highlight else f["cell"]
    vals=[entry.get("team",""),entry.get("pos",""),entry.get("pts",""),entry.get("gd",""),entry.get("p",""),entry.get("remaining",""),entry.get("max_points","")]
    for c,v in enumerate(vals):
        ws.write(excel_row-1,c,"" if v is None else v,fmt)

def team_a_block(ws,f,start,target_row,team,window,seq,avg_s,avg_c,form_label,form,style):
    ws.merge_range(start-1,0,start-1,6,"Current Standing",f["blue"])
    headers=["Team（球队）","Placement（排名）","Points（分）","GD","GP","Balance matches（剩余场数）","Max Point（最大得分）"]
    for c,h in enumerate(headers):
        ws.write(start,c,h,f["head"])
    table_start=target_row-4
    for r in range(table_start,table_start+7):
        for c in range(7):
            ws.write(r-1,c,"",f["cell"])
    window=window or []
    idx=next((i for i,x in enumerate(window) if str(x.get("team","")).strip().lower()==str(team).strip().lower()),None)
    if idx is not None:
        above=window[max(0,idx-3):idx]; below=window[idx+1:idx+4]
        for j,x in enumerate(above,start=target_row-len(above)): standing_row(ws,f,j,x,False)
        standing_row(ws,f,target_row,window[idx],True)
        for j,x in enumerate(below,start=target_row+1): standing_row(ws,f,j,x,False)
    elif window:
        for j,x in enumerate(window[:7],start=table_start): standing_row(ws,f,j,x,False)

    sched=start+10
    ws.merge_range(sched-1,0,sched-1,6,"Next 6 fixture（前3场 + 本场 + 后2场，所有赛事，ET）",f["blue"])
    seq=seq or []
    for i in range(6):
        ws.merge_range(sched+i,0,sched+i,6,text_fixture(seq[i]) if i<len(seq) else "",f["wrap"])
    sr=sched+8
    rows=[
        ("Avg goal Scored（场均进球）",avg_s),
        ("Avg goal Concede（场均失球）",avg_c),
        ("Advantage（优势）",""),
        ("Squad strength（阵容实力）",""),
        ("Form（状态）",f"{form_label or ''} {form or ''}".strip()),
        ("Style（风格）",style or "")
    ]
    for i,(k,v) in enumerate(rows):
        ws.write(sr+i,0,k,f["head"]); ws.merge_range(sr+i,1,sr+i,6,"" if v is None else str(v),f["cell"])

def write_formula_a(ws,wb,d):
    f=formats(wb)
    ws.set_landscape(); ws.fit_to_pages(1,1); ws.set_margins(.2,.2,.3,.3)
    ws.set_column("A:A",25); ws.set_column("B:G",14); ws.set_column("H:H",3); ws.set_column("I:L",18)
    ws.merge_range("A1:B1",f'{d.get("home","")} ({d.get("home_rank") or ""})',f["title"])
    ws.merge_range("C1:D1",f'{d.get("away","")} ({d.get("away_rank") or ""})',f["title"])
    ws.merge_range("E1:G1",d.get("competition") or "",f["head"])
    for r,k in enumerate(["Odds（大小球）","Odds movement（赔率）","Intention（动机）","Notes"],start=4):
        ws.write(r-1,0,k,f["head"]); ws.merge_range(r-1,1,r-1,6,"",f["cell"])

    team_a_block(ws,f,10,16,d.get("home",""),d.get("home_standing_window"),d.get("home_sequence6"),d.get("home_avg_scored"),d.get("home_avg_conceded"),d.get("home_form_label"),d.get("home_form"),d.get("home_style"))
    ws.set_row(34,7)
    for c in range(8): ws.write(34,c,"",f["black"])
    team_a_block(ws,f,44,50,d.get("away",""),d.get("away_standing_window"),d.get("away_sequence6"),d.get("away_avg_scored"),d.get("away_avg_conceded"),d.get("away_form_label"),d.get("away_form"),d.get("away_style"))

    ws.merge_range("I1:L1","Research Audit",f["blue"])
    audit=[("Request cutoff",now_et()),("Competition",d.get("competition","")),("Kickoff ET",d.get("kickoff_et","")),("Home rank",d.get("home_rank")),("Away rank",d.get("away_rank"))]
    rr=2
    for k,v in audit:
        ws.write(rr-1,8,k,f["head"]); ws.merge_range(rr-1,9,rr-1,11,"" if v is None else str(v),f["cell"]); rr+=1
    for s in (d.get("sources") or [])[:14]:
        ws.merge_range(rr-1,8,rr-1,11,str(s),f["source"]); rr+=1
    for w in (d.get("warnings") or [])[:8]:
        ws.merge_range(rr-1,8,rr-1,11,"WARNING: "+str(w),f["warn"]); rr+=1

def write_table_right(ws,f,start_row,start_col,title,rows):
    ws.merge_range(start_row,start_col,start_row,start_col+9,title,f["blue"])
    hdr=["Pos","Team","P","W","D","L","GF","GA","GD","Pts"]
    for c,h in enumerate(hdr): ws.write(start_row+1,start_col+c,h,f["head"])
    for r,x in enumerate(rows or [],start=start_row+2):
        vals=[x.get("pos"),x.get("team"),x.get("p"),x.get("w"),x.get("d"),x.get("l"),x.get("gf"),x.get("ga"),x.get("gd"),x.get("pts")]
        for c,v in enumerate(vals): ws.write(r,start_col+c,"" if v is None else v,f["cell"])

def write_formula_b(ws,wb,d):
    f=formats(wb)
    ws.set_landscape(); ws.fit_to_pages(1,1)
    ws.set_column("A:E",16); ws.set_column("F:J",16); ws.set_column("L:U",10); ws.set_column("M:M",24)
    ws.merge_range("A1:E1",f'UCL Pts: {d.get("home_ucl_points") or ""}   {d.get("home","")}   | {d.get("home_league","")}',f["title"])
    ws.merge_range("F1:J1",f'UCL Pts: {d.get("away_ucl_points") or ""}   {d.get("away","")}   | {d.get("away_league","")}',f["title"])
    ws.merge_range("A2:E2",d.get("home_fatigue",""),f["cell"]); ws.merge_range("F2:J2",d.get("away_fatigue",""),f["cell"])
    ws.merge_range("A3:E3",d.get("home_density",""),f["cell"]); ws.merge_range("F3:J3",d.get("away_density",""),f["cell"])
    ws.merge_range("A4:E4","",f["cell"]); ws.merge_range("F4:J4","",f["cell"])
    ws.merge_range("A5:E5","Next 3 Matches — All Competitions — ET",f["blue"]); ws.merge_range("F5:J5","Next 3 Matches — All Competitions — ET",f["blue"])
    for i in range(3):
        h=d.get("home_next3") or []; a=d.get("away_next3") or []
        ws.merge_range(5+i,0,5+i,4,text_fixture(h[i]) if i<len(h) else "",f["wrap"])
        ws.merge_range(5+i,5,5+i,9,text_fixture(a[i]) if i<len(a) else "",f["wrap"])
    row=9
    ws.merge_range(row,0,row,4,f'{d.get("home","")} — 8 UCL Matches',f["blue"]); ws.merge_range(row,5,row,9,f'{d.get("away","")} — 8 UCL Matches',f["blue"])
    for i in range(8):
        h=d.get("home_ucl8") or []; a=d.get("away_ucl8") or []
        ws.merge_range(row+1+i,0,row+1+i,4,text_fixture(h[i]) if i<len(h) else "",f["wrap"])
        ws.merge_range(row+1+i,5,row+1+i,9,text_fixture(a[i]) if i<len(a) else "",f["wrap"])
    write_table_right(ws,f,0,11,"UCL Standings — Current Official Total Table",d.get("ucl_table") or [])

def intent_format(f,v):
    return {"Must Win":f["pink"],"Want Win":f["green"],"Hope Win":f["yellow"],"Don't Lose":f["lightblue"],"---":f["gray"]}.get(v,f["gray"])

def write_formula_c(ws,wb,d):
    f=formats(wb)
    ws.set_landscape(); ws.fit_to_pages(1,1)
    ws.set_column("A:E",16); ws.set_column("F:J",16); ws.set_column("L:U",10); ws.set_column("M:M",24)
    ws.merge_range("A1:D1",f'{d.get("home","")}「{d.get("home_rank") or ""}」',f["title"]); ws.write("E1",d.get("home_league") or d.get("competition") or "",f["head"])
    ws.merge_range("F1:I1",f'{d.get("away","")}「{d.get("away_rank") or ""}」',f["title"]); ws.write("J1",d.get("away_league") or d.get("competition") or "",f["head"])
    ws.merge_range("A2:E2",d.get("home_fatigue",""),f["cell"]); ws.merge_range("F2:J2",d.get("away_fatigue",""),f["cell"])
    ws.merge_range("A3:E3",d.get("home_density",""),f["cell"]); ws.merge_range("F3:J3",d.get("away_density",""),f["cell"])
    hi=d.get("home_intent") or "---"; ai=d.get("away_intent") or "---"
    ws.merge_range("A4:E4",hi,intent_format(f,hi)); ws.merge_range("F4:J4",ai,intent_format(f,ai))
    ws.merge_range("A5:E5",d.get("home_intent_reason",""),f["wrap"]); ws.merge_range("F5:J5",d.get("away_intent_reason",""),f["wrap"])
    ws.merge_range("A6:E6","Next 3 Matches — All Competitions — ET",f["blue"]); ws.merge_range("F6:J6","Next 3 Matches — All Competitions — ET",f["blue"])
    for i in range(3):
        h=d.get("home_next3") or []; a=d.get("away_next3") or []
        ws.merge_range(6+i,0,6+i,4,text_fixture(h[i]) if i<len(h) else "",f["wrap"])
        ws.merge_range(6+i,5,6+i,9,text_fixture(a[i]) if i<len(a) else "",f["wrap"])
    row=10
    hef=d.get("home_europe_fixtures") or []; aef=d.get("away_europe_fixtures") or []
    if hef or aef:
        n=max(len(hef),len(aef))
        ws.merge_range(row,0,row,4,"European League-Phase Fixtures",f["blue"]); ws.merge_range(row,5,row,9,"European League-Phase Fixtures",f["blue"]); row+=1
        for i in range(n):
            ws.merge_range(row,0,row,4,text_fixture(hef[i]) if i<len(hef) else "",f["wrap"])
            ws.merge_range(row,5,row,9,text_fixture(aef[i]) if i<len(aef) else "",f["wrap"]); row+=1
    if d.get("europe_table"):
        write_table_right(ws,f,0,11,(d.get("europe_table_name") or "UEFA")+" — Current Official Total Table",d.get("europe_table"))

def build_xlsx(d):
    buf=io.BytesIO()
    wb=xlsxwriter.Workbook(buf,{"in_memory":True})
    ws=wb.add_worksheet((f'{d.get("home","")}-{d.get("away","")}')[:31] or "Match")
    if d.get("formula")=="A": write_formula_a(ws,wb,d)
    elif d.get("formula")=="B": write_formula_b(ws,wb,d)
    else: write_formula_c(ws,wb,d)
    wb.close()
    return buf.getvalue()

INDEX_HTML = r"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>公式 A+B+C 正式版</title>
<style>
body{margin:0;background:#0b1220;color:#eef4ff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.w{max-width:1100px;margin:auto;padding:20px}
h1{margin:0 0 6px}.sub{color:#9fb0cc;margin-bottom:18px}.card{background:#121b2e;border:1px solid #243553;border-radius:16px;padding:16px}
.grid{display:grid;grid-template-columns:42px 1fr 42px 1fr 90px 42px;gap:8px;align-items:center}.row{display:contents}
input,select{width:100%;box-sizing:border-box;background:#0d1729;color:#eef4ff;border:1px solid #2a3c60;border-radius:9px;padding:10px}
button{border:0;border-radius:10px;padding:11px 15px;font-weight:700}.p{background:#67a6ff;color:#071120}.s{background:#1a2945;color:#dce8fb}.x{background:#281722;color:#ffb9c5}
.bar{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.status{margin-top:14px;padding:12px;border-radius:10px;background:#0e1729;color:#aebbd0;white-space:pre-wrap}
.warn{margin-bottom:14px;padding:12px;border:1px solid #765d1d;background:#322a12;border-radius:10px;color:#ffe6a2}.ok{color:#73dda1}
@media(max-width:720px){.grid{grid-template-columns:32px 1fr 32px 1fr}.grid select{grid-column:2/4}.x{grid-column:4}.head{display:none}}
</style></head><body><div class="w">
<h1>公式 A + B + C 正式版</h1><div class="sub">最多20场 / 40队 · ET · 三套规则完全分离</div>
<div id="keywarn" class="warn">正在检查实时研究配置…</div>
<div class="card"><div class="grid" id="rows"></div>
<div class="bar"><button class="s" onclick="add()">＋ 添加比赛</button><button class="s" onclick="sample()">示例</button><button class="p" onclick="run()">研究并生成正式 Excel</button></div>
<div class="status" id="st">等待输入。</div></div></div>
<script>
let rows=[];
function add(h="",a="",f="A"){if(rows.length>=20)return;rows.push({h,a,f});render()}
function del(i){rows.splice(i,1);render()}
function render(){let e=document.getElementById("rows");e.innerHTML="";rows.forEach((r,i)=>{e.insertAdjacentHTML("beforeend",`<div class=row><div>${i+1}</div><input value="${r.h}" oninput="rows[${i}].h=this.value" placeholder="主队"><div>VS</div><input value="${r.a}" oninput="rows[${i}].a=this.value" placeholder="客队"><select onchange="rows[${i}].f=this.value"><option ${r.f=="A"?"selected":""}>A</option><option ${r.f=="B"?"selected":""}>B</option><option ${r.f=="C"?"selected":""}>C</option></select><button class=x onclick="del(${i})">×</button></div>`)})}
function sample(){rows=[{h:"Real Betis",a:"Getafe",f:"A"},{h:"Napoli",a:"Arsenal",f:"B"},{h:"Crystal Palace",a:"Lech Poznan",f:"C"}];render()}
async function health(){let r=await fetch("/health");let j=await r.json();let el=document.getElementById("keywarn");if(j.live_research){el.className="warn ok";el.textContent="✓ 实时研究已启用，可以生成正式版。"}else{el.textContent="实时研究尚未启用：请在 Railway Variables 设置 OPENAI_API_KEY。正式版不会生成空白假表格。"}}
async function run(){let m=rows.filter(x=>x.h.trim()&&x.a.trim()).map(x=>({home:x.h.trim(),away:x.a.trim(),formula:x.f}));if(!m.length)return alert("请输入比赛");let st=document.getElementById("st");st.textContent="正在查官方排名、赛程、疲劳和规则数据…每场可能需要几十秒。";let r=await fetch("/api/generate",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({matches:m})});if(!r.ok){st.textContent="错误："+await r.text();return}let b=await r.blob();let cd=r.headers.get("content-disposition")||"";let nm=(cd.match(/filename="?([^"]+)/)||[])[1]||"Formula_ABC_Formal.zip";let u=URL.createObjectURL(b);let a=document.createElement("a");a.href=u;a.download=nm;a.click();URL.revokeObjectURL(u);st.textContent="完成。已生成正式 Excel。"}
add();health();
</script></body></html>"""

@app.get("/",response_class=HTMLResponse)
async def index():
    return INDEX_HTML

@app.get("/health")
async def health():
    return {"ok":True,"version":RULES.get("version"),"live_research":bool(os.getenv("OPENAI_API_KEY","").strip()),"model":os.getenv("OPENAI_MODEL","gpt-5.6-sol")}

@app.post("/api/generate")
async def generate(req: GenerateRequest):
    results=await research_all(req.matches)
    if len(results)==1:
        d=results[0]
        payload=build_xlsx(d)
        fn=f'Formula_{d.get("formula")}_{re.sub(r"[^A-Za-z0-9_-]+","_",d.get("home",""))}_vs_{re.sub(r"[^A-Za-z0-9_-]+","_",d.get("away",""))}.xlsx'
        return StreamingResponse(io.BytesIO(payload),media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",headers={"Content-Disposition":f'attachment; filename="{fn}"'})
    z=io.BytesIO()
    with zipfile.ZipFile(z,"w",zipfile.ZIP_DEFLATED) as zz:
        for i,d in enumerate(results,1):
            fn=f'{i:02d}_Formula_{d.get("formula")}_{re.sub(r"[^A-Za-z0-9_-]+","_",d.get("home",""))}_vs_{re.sub(r"[^A-Za-z0-9_-]+","_",d.get("away",""))}.xlsx'
            zz.writestr(fn,build_xlsx(d))
    z.seek(0)
    return StreamingResponse(z,media_type="application/zip",headers={"Content-Disposition":'attachment; filename="Formula_ABC_Formal_Batch.zip"'})
