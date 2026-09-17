import io, json, os, re, zipfile
from datetime import datetime
from typing import List, Literal, Optional

import httpx
import xlsxwriter
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel, Field

BASE = os.path.dirname(__file__)
with open(os.path.join(BASE, "rules_config.json"), "r", encoding="utf-8") as f:
    RULES = json.load(f)

app = FastAPI(title="Formula A+B+C Football Excel Generator")

class MatchInput(BaseModel):
    home: str = Field(min_length=1)
    away: str = Field(min_length=1)
    formula: Literal["A", "B", "C"]

class GenerateRequest(BaseModel):
    matches: List[MatchInput] = Field(min_length=1, max_length=20)
    bundle: bool = True

SYSTEM_PROMPT = """You are a football data researcher and rules engine. Use current web sources. Return ONLY valid JSON.
For every match, resolve the exact competition and kickoff. Use official competition standings where available. Convert displayed schedule times to America/New_York.
Follow the provided Formula A/B/C rules exactly. Do not mix formulas. Do not invent unavailable facts; use null and add a warning.
For Formula C, intent labels are only Must Win, Want Win, Hope Win, Don't Lose, ---.
Want Win requires clear ability AND conditions to beat the opponent. Strength tiers are auxiliary only.
Europa League and Conference League: include the current complete 36-team table, and full 8/6 league-phase fixtures; use those full schedules as an intent factor.
"""

def extract_output_text(data: dict) -> str:
    if isinstance(data.get("output_text"), str):
        return data["output_text"]
    parts = []
    for item in data.get("output", []):
        for c in item.get("content", []) if isinstance(item, dict) else []:
            if isinstance(c, dict) and c.get("type") in ("output_text", "text") and c.get("text"):
                parts.append(c["text"])
    return "\n".join(parts)

async def research_match(match: MatchInput) -> dict:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return {
            "home": match.home, "away": match.away, "formula": match.formula,
            "warning": "OPENAI_API_KEY not set. Live automatic research is disabled.",
            "competition": None, "home_rank": None, "away_rank": None,
            "home_fatigue": None, "away_fatigue": None,
            "home_density": None, "away_density": None,
            "home_intent": None, "away_intent": None,
            "home_next3": [], "away_next3": [], "home_europe": [], "away_europe": [],
            "standings": [], "sources": []
        }
    rule = RULES[f"formula_{match.formula.lower()}"]
    schema_hint = {
        "home": match.home, "away": match.away, "formula": match.formula,
        "competition": "", "kickoff_et": "", "home_rank": None, "away_rank": None,
        "home_fatigue": "", "away_fatigue": "", "home_density": "", "away_density": "",
        "home_intent": "", "away_intent": "", "home_next3": [], "away_next3": [],
        "home_europe": [], "away_europe": [], "standings": [], "sources": [], "warnings": []
    }
    prompt = f"""Analyze this match for Formula {match.formula}: {match.home} vs {match.away}.
Rules: {json.dumps(rule, ensure_ascii=False)}
Return one JSON object matching this shape: {json.dumps(schema_hint, ensure_ascii=False)}
For standings, each row should be an object with pos, team, p, w, d, l, gf, ga, gd, pts, form when available.
For next3/europe fixture arrays, each item should include date_et, home, away, competition, status, score if completed.
Sources must be direct URLs used for the current facts.
"""
    payload = {
        "model": os.getenv("OPENAI_MODEL", "gpt-5.6"),
        "tools": [{"type": "web_search"}],
        "input": SYSTEM_PROMPT + "\n" + prompt
    }
    async with httpx.AsyncClient(timeout=180) as client:
        r = await client.post("https://api.openai.com/v1/responses", headers={"Authorization": f"Bearer {key}", "Content-Type":"application/json"}, json=payload)
        if r.status_code >= 300:
            raise HTTPException(502, f"Research API error: {r.text[:500]}")
        text = extract_output_text(r.json()).strip()
    text = re.sub(r"^```json\s*|\s*```$", "", text, flags=re.S)
    try:
        return json.loads(text)
    except Exception as e:
        raise HTTPException(502, f"Could not parse research JSON: {e}; output={text[:800]}")

async def research_all(matches: List[MatchInput]) -> List[dict]:
    results = []
    # Sequential by design: more stable for web research and easier to audit.
    for m in matches:
        results.append(await research_match(m))
    return results

def fmt_workbook_base(wb):
    return {
        "title": wb.add_format({"bold":True,"font_size":15,"align":"center","valign":"vcenter","bg_color":"#D9EAF7","border":1}),
        "center": wb.add_format({"align":"center","valign":"vcenter","border":1}),
        "section": wb.add_format({"bold":True,"font_color":"#FFFFFF","bg_color":"#5B9BD5","align":"center","border":1}),
        "black": wb.add_format({"bg_color":"#000000"}),
        "wrap": wb.add_format({"align":"center","valign":"vcenter","text_wrap":True,"border":1}),
        "warn": wb.add_format({"bg_color":"#FFF2CC","text_wrap":True,"border":1}),
        "intent_want": wb.add_format({"bold":True,"align":"center","bg_color":"#C6E0B4","border":1}),
        "intent_hope": wb.add_format({"bold":True,"align":"center","bg_color":"#FFF2CC","border":1}),
        "intent_must": wb.add_format({"bold":True,"align":"center","bg_color":"#F4CCCC","border":1}),
        "intent_dl": wb.add_format({"bold":True,"align":"center","bg_color":"#DDEBF7","border":1}),
        "intent_none": wb.add_format({"bold":True,"align":"center","bg_color":"#E7E6E6","border":1})
    }

def intent_fmt(f, value):
    return {"Want Win":f["intent_want"],"Hope Win":f["intent_hope"],"Must Win":f["intent_must"],"Don't Lose":f["intent_dl"]}.get(value, f["intent_none"])

def write_formula_c(ws, wb, data: dict):
    f=fmt_workbook_base(wb)
    ws.set_column("A:D", 14); ws.set_column("E:E", 14); ws.set_column("F:I",14); ws.set_column("J:J",14)
    ws.merge_range("A1:D1", f'{data.get("home")}「{data.get("home_rank") or ""}」', f["title"])
    ws.write("E1", data.get("competition") or "", f["center"])
    ws.merge_range("F1:I1", f'{data.get("away")}「{data.get("away_rank") or ""}」', f["title"])
    ws.write("J1", data.get("competition") or "", f["center"])
    ws.merge_range("A2:E2", data.get("home_fatigue") or "", f["center"]); ws.merge_range("F2:J2", data.get("away_fatigue") or "", f["center"])
    ws.merge_range("A3:E3", data.get("home_density") or "", f["center"]); ws.merge_range("F3:J3", data.get("away_density") or "", f["center"])
    ws.merge_range("A4:E4", data.get("home_intent") or "---", intent_fmt(f,data.get("home_intent"))); ws.merge_range("F4:J4", data.get("away_intent") or "---", intent_fmt(f,data.get("away_intent")))
    ws.merge_range("A5:E5","Next 3 Matches — All Competitions — ET",f["section"]); ws.merge_range("F5:J5","Next 3 Matches — All Competitions — ET",f["section"])
    for i in range(3):
        h=(data.get("home_next3") or [])
        a=(data.get("away_next3") or [])
        def ft(x):
            if not x: return ""
            return f'{x.get("date_et","")}  {x.get("home","")} vs {x.get("away","")}' + (f'  {x.get("score")}' if x.get("score") else "")
        ws.merge_range(5+i,0,5+i,4,ft(h[i]) if i<len(h) else "",f["wrap"])
        ws.merge_range(5+i,5,5+i,9,ft(a[i]) if i<len(a) else "",f["wrap"])
    row=8
    if data.get("home_europe") or data.get("away_europe"):
        count=max(len(data.get("home_europe") or []),len(data.get("away_europe") or []))
        ws.merge_range(row,0,row,4,"UEFA League Phase Fixtures",f["section"]); ws.merge_range(row,5,row,9,"UEFA League Phase Fixtures",f["section"]); row+=1
        for i in range(count):
            h=(data.get("home_europe") or []); a=(data.get("away_europe") or [])
            def ft2(x):
                if not x:return ""
                return f'{x.get("date_et","")}  {x.get("home","")} vs {x.get("away","")}' + (f'  {x.get("score")}' if x.get("score") else "")
            ws.merge_range(row,0,row,4,ft2(h[i]) if i<len(h) else "",f["wrap"])
            ws.merge_range(row,5,row,9,ft2(a[i]) if i<len(a) else "",f["wrap"]); row+=1
    if data.get("standings"):
        ws.set_column("L:L",6); ws.set_column("M:M",24); ws.set_column("N:U",7)
        ws.merge_range("L1:U1",f'{data.get("competition") or "Competition"} — Current Total Standings',f["section"])
        hdr=["Pos","Team","P","W","D","L","GF","GA","GD","Pts"]
        for c,v in enumerate(hdr): ws.write(1,11+c,v,f["center"])
        for r,s in enumerate(data["standings"], start=2):
            vals=[s.get("pos"),s.get("team"),s.get("p"),s.get("w"),s.get("d"),s.get("l"),s.get("gf"),s.get("ga"),s.get("gd"),s.get("pts")]
            for c,v in enumerate(vals): ws.write(r,11+c,v,f["center"])
    if data.get("warnings") or data.get("warning"):
        warnings=data.get("warnings") or [data.get("warning")]
        ws.merge_range(row+1,0,row+2,9,"Warnings: "+" | ".join([str(x) for x in warnings if x]),f["warn"])


def write_generic(ws, wb, data:dict, formula:str):
    f=fmt_workbook_base(wb)
    ws.set_column("A:J",15)
    ws.merge_range("A1:J1",f'Formula {formula}: {data.get("home")} vs {data.get("away")}',f["title"])
    rows=[
        ["Competition",data.get("competition")],
        ["Kickoff ET",data.get("kickoff_et")],
        ["Home rank",data.get("home_rank")],
        ["Away rank",data.get("away_rank")],
        ["Home fatigue",data.get("home_fatigue")],
        ["Away fatigue",data.get("away_fatigue")],
    ]
    for i,(k,v) in enumerate(rows,start=2):
        ws.write(i-1,0,k,f["section"]); ws.merge_range(i-1,1,i-1,9,"" if v is None else str(v),f["wrap"])
    r=8
    ws.merge_range(r,0,r,9,"Raw researched data (v1 engine; template-specific renderer can be expanded)",f["section"]); r+=1
    raw=json.dumps(data,ensure_ascii=False,indent=2)
    ws.merge_range(r,0,r+20,9,raw,f["warn"])


def build_xlsx(data:dict)->bytes:
    buf=io.BytesIO(); wb=xlsxwriter.Workbook(buf, {"in_memory":True})
    ws=wb.add_worksheet((f'{data.get("home","")[:12]}-{data.get("away","")[:12]}')[:31])
    formula=data.get("formula")
    if formula=="C": write_formula_c(ws,wb,data)
    else: write_generic(ws,wb,data,formula)
    wb.close(); return buf.getvalue()

INDEX_HTML = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Formula A+B+C</title><style>\n:root{--bg:#0b1220;--card:#121b2e;--muted:#91a0ba;--text:#eef4ff;--accent:#67a6ff;--line:#23314d;--good:#52c788}*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:linear-gradient(180deg,#0a1020,#0f1728);color:var(--text)}.wrap{max-width:1160px;margin:auto;padding:24px}.hero{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:20px}.hero h1{font-size:30px;margin:0}.hero p{margin:7px 0 0;color:var(--muted)}.pill{background:#17233c;border:1px solid var(--line);border-radius:999px;padding:8px 12px;color:#cfe1ff}.card{background:rgba(18,27,46,.94);border:1px solid var(--line);border-radius:16px;padding:18px;box-shadow:0 16px 50px rgba(0,0,0,.2)}.grid{display:grid;grid-template-columns:54px 1fr 70px 1fr 110px 44px;gap:10px;align-items:center}.head{color:var(--muted);font-size:13px;padding:0 4px 10px}.row{display:contents}.num{text-align:center;color:var(--muted)}input,select{width:100%;background:#0e1729;color:var(--text);border:1px solid #2a3a5b;border-radius:10px;padding:11px 12px;font-size:15px;outline:none}input:focus,select:focus{border-color:var(--accent)}.vs{text-align:center;color:#7890b8;font-weight:700}.remove{border:1px solid #3d4b68;background:#111b2d;color:#aebbd0;border-radius:10px;height:40px;cursor:pointer}.toolbar{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}button.primary,button.secondary{border:0;border-radius:11px;padding:11px 16px;font-weight:700;cursor:pointer}.primary{background:var(--accent);color:#071120}.secondary{background:#1a2945;color:#dce8fb;border:1px solid #2a3a5b}.status{margin-top:18px;border-top:1px solid var(--line);padding-top:16px;color:var(--muted);white-space:pre-wrap}.results{margin-top:18px;display:grid;gap:10px}.result{background:#0d1626;border:1px solid var(--line);border-radius:12px;padding:12px}.result strong{color:#fff}.ok{color:var(--good)}@media(max-width:780px){.grid{grid-template-columns:34px 1fr 44px 1fr 88px 34px;gap:6px}.hero{align-items:start;flex-direction:column}.wrap{padding:14px}input,select{padding:10px 8px;font-size:13px}}\n</style></head><body><div class="wrap"><div class="hero"><div><h1>Formula A + B + C</h1><p>最多40支球队 / 20场。每场独立选择公式，不混用规则。</p></div><div class="pill">America/New_York · Live research</div></div><div class="card"><div class="grid head"><div>#</div><div>Home</div><div></div><div>Away</div><div>Formula</div><div></div></div><div id="rows" class="grid"></div><div class="toolbar"><button class="secondary" onclick="addRow()">+ 添加比赛</button><button class="secondary" onclick="fillDemo()">示例</button><button class="primary" onclick="analyze()">分析预览</button><button class="primary" onclick="generate()">生成Excel ZIP</button></div><div id="status" class="status">请输入球队名称。首次部署需要在服务器设置 OPENAI_API_KEY 才能自动联网研究。</div><div id="results" class="results"></div></div></div><script>\nconst rows=document.getElementById(\'rows\'), statusEl=document.getElementById(\'status\'), results=document.getElementById(\'results\');\nfunction addRow(h=\'\',a=\'\',f=\'C\'){if(rows.children.length/6>=20){alert(\'最多20场（40支球队）\');return}const n=rows.children.length/6+1;rows.insertAdjacentHTML(\'beforeend\',`<div class=num>${n}</div><input class=home value="${h}"><div class=vs>VS</div><input class=away value="${a}"><select class=formula><option ${f===\'A\'?\'selected\':\'\'}>A</option><option ${f===\'B\'?\'selected\':\'\'}>B</option><option ${f===\'C\'?\'selected\':\'\'}>C</option></select><button class=remove onclick="removeRow(this)">×</button>`)}\nfunction removeRow(b){for(let i=0;i<6;i++) b.previousElementSibling?.remove(); b.remove(); renumber()}function renumber(){[...rows.querySelectorAll(\'.num\')].forEach((x,i)=>x.textContent=i+1)}\nfunction payload(){const hs=[...rows.querySelectorAll(\'.home\')],as=[...rows.querySelectorAll(\'.away\')],fs=[...rows.querySelectorAll(\'.formula\')];const matches=[];for(let i=0;i<hs.length;i++)if(hs[i].value.trim()&&as[i].value.trim())matches.push({home:hs[i].value.trim(),away:as[i].value.trim(),formula:fs[i].value});return {matches,bundle:true}}\nfunction fillDemo(){rows.innerHTML=\'\';addRow(\'Manchester City\',\'Norwich City\',\'A\');addRow(\'Barcelona\',\'Racing Santander\',\'B\');addRow(\'Juventus\',\'NEC Nijmegen\',\'C\')}\nasync function analyze(){const p=payload();if(!p.matches.length)return alert(\'请至少输入1场\');statusEl.textContent=`正在分析 ${p.matches.length} 场…`;results.innerHTML=\'\';try{const r=await fetch(\'/api/analyze\',{method:\'POST\',headers:{\'Content-Type\':\'application/json\'},body:JSON.stringify(p)});const j=await r.json();if(!r.ok)throw new Error(j.detail||\'分析失败\');statusEl.innerHTML=\'<span class=ok>分析完成</span>\';results.innerHTML=j.results.map((x,i)=>`<div class=result><strong>${i+1}. ${x.home} vs ${x.away} · Formula ${x.formula}</strong><br>赛事：${x.competition||\'-\'}\u3000排名：${x.home_rank??\'-\'} / ${x.away_rank??\'-\'}<br>疲劳：${x.home_fatigue||\'-\'} / ${x.away_fatigue||\'-\'}<br>意图：${x.home_intent||\'-\'} / ${x.away_intent||\'-\'}${x.warning?\'<br>⚠ \'+x.warning:\'\'}</div>`).join(\'\')}catch(e){statusEl.textContent=\'错误：\'+e.message}}\nasync function generate(){const p=payload();if(!p.matches.length)return alert(\'请至少输入1场\');statusEl.textContent=`正在研究并生成 ${p.matches.length} 场 Excel…`;try{const r=await fetch(\'/api/generate\',{method:\'POST\',headers:{\'Content-Type\':\'application/json\'},body:JSON.stringify(p)});if(!r.ok){const j=await r.json();throw new Error(j.detail||\'生成失败\')}const b=await r.blob(),u=URL.createObjectURL(b),a=document.createElement(\'a\');a.href=u;a.download=\'formula_results.zip\';a.click();URL.revokeObjectURL(u);statusEl.innerHTML=\'<span class=ok>Excel 已生成。</span>\'}catch(e){statusEl.textContent=\'错误：\'+e.message}}\nfor(let i=0;i<5;i++)addRow();\n</script></body></html>\n'

@app.get("/", response_class=HTMLResponse)
async def root():
    return INDEX_HTML

@app.get("/api/rules")
async def rules():
    return RULES

@app.post("/api/analyze")
async def analyze(req: GenerateRequest):
    return {"results": await research_all(req.matches)}

@app.post("/api/generate")
async def generate(req: GenerateRequest):
    results=await research_all(req.matches)
    if len(results)==1 and not req.bundle:
        content=build_xlsx(results[0])
        name=f'Formula_{results[0].get("formula")}_{results[0].get("home")}_vs_{results[0].get("away")}.xlsx'.replace("/","-")
        return StreamingResponse(io.BytesIO(content),media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",headers={"Content-Disposition":f'attachment; filename="{name}"'})
    zbuf=io.BytesIO()
    with zipfile.ZipFile(zbuf,"w",zipfile.ZIP_DEFLATED) as z:
        for i,d in enumerate(results,1):
            name=f'{i:02d}_Formula_{d.get("formula")}_{d.get("home")}_vs_{d.get("away")}.xlsx'.replace("/","-")
            z.writestr(name,build_xlsx(d))
        z.writestr("analysis.json",json.dumps(results,ensure_ascii=False,indent=2))
    zbuf.seek(0)
    return StreamingResponse(zbuf,media_type="application/zip",headers={"Content-Disposition":'attachment; filename="formula_results.zip"'})
