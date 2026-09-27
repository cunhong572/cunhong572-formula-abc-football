(()=>{
const KEY="formula_site_lang";
let lang=localStorage.getItem(KEY)||"zh";
const originals=new WeakMap();

const namesZh={
"Premier League":"英格兰超级联赛","La Liga":"西班牙甲级联赛","LaLiga":"西班牙甲级联赛","Serie A":"意大利甲级联赛","Bundesliga":"德国甲级联赛","Ligue 1":"法国甲级联赛",
"UEFA Champions League":"欧洲冠军联赛","Champions League":"欧洲冠军联赛","UEFA Europa League":"欧洲联赛","Europa League":"欧洲联赛","UEFA Conference League":"欧洲协会联赛","Conference League":"欧洲协会联赛",
"Arsenal":"阿森纳","Manchester City":"曼彻斯特城","Manchester United":"曼彻斯特联","Liverpool":"利物浦","Chelsea":"切尔西","Tottenham Hotspur":"托特纳姆热刺","Tottenham":"托特纳姆热刺","Newcastle United":"纽卡斯尔联","Aston Villa":"阿斯顿维拉","Brighton & Hove Albion":"布莱顿","Brighton":"布莱顿","Brentford":"布伦特福德","Everton":"埃弗顿","Fulham":"富勒姆","Crystal Palace":"水晶宫","Bournemouth":"伯恩茅斯","Nottingham Forest":"诺丁汉森林","Leeds United":"利兹联","Sunderland":"桑德兰","Ipswich Town":"伊普斯维奇","Hull City":"赫尔城","Coventry City":"考文垂",
"Real Madrid":"皇家马德里","Barcelona":"巴塞罗那","Atletico Madrid":"马德里竞技","Atlético Madrid":"马德里竞技","Villarreal":"比利亚雷亚尔","Real Betis":"皇家贝蒂斯","Athletic Club":"毕尔巴鄂竞技","Athletic Bilbao":"毕尔巴鄂竞技","Real Sociedad":"皇家社会","Celta Vigo":"塞尔塔","Valencia":"瓦伦西亚","Rayo Vallecano":"巴列卡诺","Alaves":"阿拉维斯","Alavés":"阿拉维斯","Getafe":"赫塔费","Osasuna":"奥萨苏纳","Levante":"莱万特","Sevilla":"塞维利亚","Elche":"埃尔切","Espanyol":"西班牙人","Deportivo La Coruna":"拉科鲁尼亚","Deportivo La Coruña":"拉科鲁尼亚","Racing Santander":"桑坦德竞技","Malaga":"马拉加","Málaga":"马拉加",
"Bayern Munich":"拜仁慕尼黑","Bayern München":"拜仁慕尼黑","Borussia Dortmund":"多特蒙德","Bayer Leverkusen":"勒沃库森","Bayer 04 Leverkusen":"勒沃库森","RB Leipzig":"RB莱比锡","VfB Stuttgart":"斯图加特","Hoffenheim":"霍芬海姆","TSG Hoffenheim":"霍芬海姆","Freiburg":"弗赖堡","SC Freiburg":"弗赖堡","Mainz":"美因茨","Mainz 05":"美因茨","FSV Mainz 05":"美因茨","Eintracht Frankfurt":"法兰克福","Augsburg":"奥格斯堡","FC Augsburg":"奥格斯堡","Borussia Mönchengladbach":"门兴格拉德巴赫","Borussia Monchengladbach":"门兴格拉德巴赫","Union Berlin":"柏林联合","Werder Bremen":"云达不莱梅","FC Köln":"科隆","1. FC Cologne":"科隆","Hamburger SV":"汉堡","Schalke 04":"沙尔克04","SC Paderborn 07":"帕德博恩","SV Elversberg":"埃尔弗斯贝格",
"Paris Saint-Germain":"巴黎圣日耳曼","PSG":"巴黎圣日耳曼","Marseille":"马赛","Olympique Marseille":"马赛","Lyon":"里昂","Olympique Lyonnais":"里昂","Monaco":"摩纳哥","AS Monaco":"摩纳哥","Lille":"里尔","Lens":"朗斯","RC Lens":"朗斯","Strasbourg":"斯特拉斯堡","RC Strasbourg":"斯特拉斯堡","Paris FC":"巴黎FC","Rennes":"雷恩","Stade Rennais":"雷恩","Brest":"布雷斯特","Nice":"尼斯",
"Juventus":"尤文图斯","Inter":"国际米兰","Inter Milan":"国际米兰","AC Milan":"AC米兰","Napoli":"那不勒斯","Roma":"罗马","AS Roma":"罗马","Lazio":"拉齐奥","Atalanta":"亚特兰大","Fiorentina":"佛罗伦萨","Bologna":"博洛尼亚","Torino":"都灵","Parma":"帕尔马","Monza":"蒙扎","Sassuolo":"萨索洛","Venezia":"威尼斯","Frosinone":"弗罗西诺内",
"Sporting CP":"葡萄牙体育","Benfica":"本菲卡","Porto":"波尔图","PSV Eindhoven":"埃因霍温","Feyenoord":"费耶诺德","Ajax":"阿贾克斯","Galatasaray":"加拉塔萨雷","Fenerbahce":"费内巴切","Fenerbahçe":"费内巴切","Shakhtar Donetsk":"顿涅茨克矿工","Celtic":"凯尔特人","Rangers":"格拉斯哥流浪者","Slavia Prague":"布拉格斯拉维亚","Slavia Praha":"布拉格斯拉维亚","Bodo/Glimt":"博德闪耀","Bodø/Glimt":"博德闪耀","Club Brugge":"布鲁日","Anderlecht":"安德莱赫特","Red Bull Salzburg":"萨尔茨堡红牛","Salzburg":"萨尔茨堡","Olympiacos":"奥林匹亚科斯","Panathinaikos":"帕纳辛奈科斯","Dinamo Zagreb":"萨格勒布迪纳摩","Red Star Belgrade":"贝尔格莱德红星","Young Boys":"伯尔尼年轻人","Copenhagen":"哥本哈根","FC Copenhagen":"哥本哈根"
};
const namesEn=Object.fromEntries(Object.entries(namesZh).map(([k,v])=>[v,k]));
const statusZh={"DANGEROUS":"危险","PRESSING":"压迫","WASTEFUL":"低效进攻","BALANCED":"均衡","PASSIVE":"被动","SLOW":"放缓"};
const statusEn=Object.fromEntries(Object.entries(statusZh).map(([k,v])=>[v,k]));
const nameKeysZh=Object.keys(namesZh).sort((a,b)=>b.length-a.length);
const nameKeysEn=Object.keys(namesEn).sort((a,b)=>b.length-a.length);

/* UI language pairs. Longest phrases are applied first so dynamic Formula B/C/D
   output follows the same language switch as the static page. Technical metric
   abbreviations (xG/SS/AS/GTI/W-D-L) intentionally stay unchanged. */
const uiEnZh={
  "FOOTBALL WORKSHEET SYSTEM":"足球工作表系统",
  "BATCH EXCEL · MAX 20":"批量 EXCEL · 最多20场",
  "INTENT ENGINE":"意图分析引擎",
  "LIVE BOARD · ALL ACTIVE MATCHES":"实时比赛面板 · 全部进行中比赛",
  "LEARNING / BACKTEST ENGINE":"学习 / 回测引擎",
  "Player Intelligence Registry":"球员智能知识库",
  "Historical Backtest Scanner":"历史回测扫描器",
  "Complete Current 36-Team Table":"当前完整36队积分榜",
  "Current 36-Team Table":"当前36队积分榜",
  "League-Phase Matches":"联赛阶段比赛",
  "Next 3 Matches — All Competitions — ET":"后3场比赛 — 所有赛事 — 美东时间",
  "Next 3 Matches":"后3场比赛",
  "All Competitions":"所有赛事",
  "Competition Rank":"赛事排名",
  "Match Information":"比赛信息",
  "Official Ranking":"官方排名",
  "Previous 3 + Current + Next 2":"前3场 + 本场 + 后2场",
  "Up to 5 Most Recent Matches in This Competition":"本赛事最近最多5场",
  "Auto Generate Excel":"一键自动生成 Excel",
  "Recalculate":"重新计算",
  "Export Excel":"导出 Excel",
  "Clear":"清空",
  "Locked Rules Loaded":"已载入锁定规则",
  "UCL Only":"仅欧冠",
  "Generate Formula B":"生成公式 B",
  "Export B Excel":"导出 B Excel",
  "Generate Formula C":"生成公式 C",
  "Export C Excel":"导出 C Excel",
  "Auto Monitor All Live Matches Today":"自动监控今日全部已开赛比赛",
  "Unlimited Matches · Auto Check Every 10s":"不限场数 · 每10秒自动检查",
  "Refresh All Matches Now":"立即刷新全部比赛",
  "Initializing today's matches…":"正在初始化今日比赛…",
  "Loading today's live matches…":"正在读取今天已开始的比赛…",
  "LIVE NOW":"正在直播",
  "LIVE":"直播",
  "Live Intent":"实时意图",
  "Confidence":"置信度",
  "Status":"状态",
  "Speed Score":"速度评分",
  "Attack Score":"攻击评分",
  "Momentum":"动量",
  "Indicator Mode":"指标模式",
  "Shots / Shots on Target":"射门 / 射正",
  "Red Cards / Subs":"红牌 / 换人",
  "Latest Substitution":"最近换人",
  "Live Evidence":"实时依据",
  "Back to match list":"返回比赛列表",
  "Team":"球队",
  "Competition":"赛事",
  "Fatigue":"疲劳",
  "Density":"赛程密度",
  "Next 3":"后3场",
  "Home":"主队",
  "Away":"客队",
  "Match Date":"比赛日期",
  "Coach Style":"教练风格",
  "Avg GF":"场均进球",
  "Avg GA":"场均失球",
  "Form":"状态",
  "Days":"间隔天数",
  "Formula D Learning & Backtest":"公式 D 学习与回测",
  "Formula D":"公式 D",
  "Formula C":"公式 C",
  "Formula B":"公式 B",
  "Formula A":"公式 A",
  "Type unknown":"类型未知",
  "Attacking Sub":"进攻型换人",
  "Defensive Sub":"防守型换人",
  "Balanced/Role Change":"平衡/角色变化",
  "Attacking-for-Attacking":"进攻球员换进攻球员",
  "Defensive-for-Defensive":"防守球员换防守球员",
  "Midfield-for-Midfield":"中场换中场",
  "Attacking":"进攻型",
  "Balanced":"平衡型",
  "Defensive":"防守型",
  "Goalkeeper":"门将",
  "DANGEROUS":"危险",
  "FAST":"快速",
  "PASSIVE":"被动",
  "BALANCED":"均衡",
  "Dominant":"主导",
  "Dangerous":"危险",
  "Passive":"被动",
  "Wasteful":"低效",
  "Insufficient data":"数据不足",
  "Stable":"稳定",
  "Momentum Up":"动量上升",
  "Momentum Down":"动量下降",
  "Must Win":"必须赢",
  "Want Win":"想赢",
  "Hope Win":"希望赢",
  "Don't Lose":"不想输",
  "Don’t Lose":"不想输",
  "Equalize":"追平",
  "Win Big":"扩大比分",
  "Give Up":"放弃",
  "Not Tired":"不累",
  "Very Tired":"很累",
  "Tired":"累",
  "Processing":"处理中",
  "Username":"账号",
  "Password":"密码",
  "Log in":"登录",
  "Log out":"退出登录",
  "Verifying…":"正在验证…",
  "Login failed":"登录失败",
  "Language":"语言",
  "English":"英文",
  "Chinese":"中文",
  "Formula A · Batch Generate Excel":"公式 A · 批量生成 Excel",
  "Max 20 matches · Home/Away only":"最多20场 · 只填主客队",
  "Match List (one per line: Home vs Away)":"比赛列表（每行一场：Home vs Away）",
  "Match List (one per line: Home vs Away, max 20)":"比赛列表（每行一场：Home vs Away，最多20场）",
  "Upload image to recognize teams":"上传图片识别球队",
  "Batch Generate A Excel":"批量生成 A Excel",
  "Batch Generate B Excel":"批量生成 B Excel",
  "Enter 1–20 matches.":"输入1–20场比赛即可。",
  "Formula B · UCL Only":"公式 B · 欧冠专用",
  "Formula C · Pre-match Intent":"公式 C · 赛前意图",
  "Formula D · Auto Monitor All Live Matches Today":"公式 D · 今日全部已开赛比赛自动监控",
  "Formula D Learning & Backtest":"Formula D 学习与回测",
  "Learning only · Never auto-change production formula":"只学习 · 不自动改正式公式",
  "Scan a batch of historical matches now":"立即扫描一批历史比赛",
  "Historical scanner preparing…":"历史扫描器准备中…",
  "Building player names, positions, roles and market-value registry…":"正在建立球员姓名、位置、角色与市场价值知识库…",
  "UCL standings/rank · fatigue · next-two-match density · next 3 matches across all competitions · full 8-match UCL league phase · full table + last 5 W/D/L. Formula B does not judge intent.":"欧冠积分/排名 · 疲劳 · 后两场密度标记 · 本场后最近3场所有赛事 · 完整8场欧冠联赛阶段 · 总积分榜 + 最近5场 W/D/L。公式B不做意图判断。",
  "The system identifies Home/Away teams, match, standings, schedule, Form, Days, average goals for/against and coach style for every match; every file still uses the locked Formula A template. When complete, one ZIP contains a separate Excel file for each match.":"系统逐场自动识别主客队、比赛、排名、赛程、Form、Days、场均进失球和教练风格；每场仍严格使用已锁定的公式 A 模板。生成完成后一次下载 ZIP，内含每场独立 Excel。",
  "Use the latest official standings at task time; include matches already finished today. Schedules must include all first-team competitions, including league, cups, Europe and friendlies.":"排名请按任务当时官方最新榜单填写；当天已结束比赛先计入。赛程必须统计一线队所有赛事，包括联赛、杯赛、欧战与友谊赛。",
  "Enter both teams to generate Formula B.":"输入两队后生成公式 B。",
  "Enter matches to generate Formula C.":"输入比赛列表后生成公式 C。",
  "The system automatically loads today's senior men's first-team matches in the Big Five leagues, UCL, UEL and UECL using the New York date. Every match that has started and not finished is automatically monitored by Formula D with no match limit; U21/U19, youth, reserve, B teams and women's matches are excluded.":"系统自动读取纽约日期下今天的五大联赛、欧冠、欧联、欧协联全部成年男子一线队比赛。所有已经开赛且尚未结束的一线队比赛都会自动进入 Formula D 监控，不设场数上限；U21/U19、青年队、预备队、B队、女足不纳入。",
  "5-minute data has 60% weight and 10-minute data 40%; score and time are context only. While trailing, the maximum intent is Equalize. Insufficient or conflicting 5/10-minute evidence returns ---.":"5分钟权重60%，10分钟权重40%；比分与时间只作为背景。落后未追平时最高只能 Equalize；证据不足或5/10分钟趋势明显冲突时显示 ---。",
  "Master Rules V32 LOCKED":"Master Rules V32 已锁定",
  "All single intent rules are auxiliary considerations; final intent follows higher-priority combined evidence.":"所有单条意图规则只作为辅助考量，最终以更高优先级的综合证据为准。",
  "Same-league next 3 only count future matches in the same domestic league as the current match; cross-competition matches are only auxiliary context for next-match importance/rotation.":"同联赛下3场只统计与本场所属国内联赛相同联赛的后续比赛；跨赛事仅作为下一场重要性/轮换等辅助因素。",
  "Equalize is not part of Formula C.":"Equalize不属于公式C。",
  "Competition Rank":"赛事排名",
  "Rank":"排名",
  "Role classification":"角色分类",
  "Attacking ":"进攻 ",
  "Balanced ":"平衡 ",
  "Defensive ":"防守 ",
  "Player registry":"球员知识库",
  "teams covered":"支球队",
  "players":"名球员",
  "market values available":"人已有身价",
  "Scanning range":"扫描范围",
  "Current date progress":"当前日期进度",
  "days scanned":"已扫描天数",
  "processed":"已处理",
  "historical snapshots":"历史快照",
  "Data quality":"数据质量",
  "Historical scan complete":"历史扫描已完成",
  "Controlled acceleration":"受控加速",
  "errors":"错误",
  "Recorded":"已记录",
  "matches":"场比赛",
  "minute snapshots":"个分钟快照",
  "samples":"样本",
  "support rate":"支持率",
  "After matches finish, 5/10/15-minute backtests run automatically.":"比赛结束后会自动进行5/10/15分钟回测。",
  "Fetching live data…":"正在抓取实时数据…",
  "Loading all target competitions today…":"正在读取今天全部目标赛事…",
  "No target matches are currently live.":"目前没有已经开赛且尚未结束的目标赛事。",
  "matches monitored":"场正在监控",
  "matches temporarily unavailable; retrying in 10 seconds.":"场实时数据暂不可用，10秒后自动重试。",
  "retrying in 10 seconds":"10秒后自动重试",
  "Analyzing each match with locked Formula C…":"正在按锁定公式 C 逐场分析…",
  "Enter matches":"请输入比赛",
  "Format error":"格式错误",
  "Generate Formula C first":"请先生成公式 C",
  "Excel component not loaded":"Excel 组件未加载",
  "Formula C Excel exported with locked layout":"公式 C Excel 已按固定规格导出",
  "Image recognition is not configured":"图片识别尚未配置 AI",
  "Reading image and recognizing teams…":"正在读取图片并识别球队…",
  "Image recognition failed":"图片识别失败",
  "No reliable match teams found in the image":"图片里没有识别到可靠的比赛球队",
  "Please verify team names":"请核对球队名称",
  "Please verify and generate Excel":"请核对后直接生成 Excel",
  "No image selected":"没有选择图片",
  "Please select an image file":"请选择图片文件",
  "Image read failed":"图片读取失败",
  "Image is too large or unsupported; take a screenshot and upload again.":"图片过大或格式暂不支持，请截图后再上传",
  "Max 20 matches per batch; remove extra matches.":"最多只能一次生成20场，请删除多出的比赛。",
  "Enter at least 1 match":"请输入至少1场比赛",
  "Format error: use Home vs Away on every line":"格式错误：请每行使用 Home vs Away",
  "Formula A processing":"公式A处理中",
  "Formula B processing":"公式B处理中",
  "Completeness check failed":"完整性检查未通过",
  "No match passed the completeness check; verify team names.":"没有比赛通过完整性检查，请检查球队名称。",
  "No match was generated; verify team names.":"没有比赛成功生成，请检查球队名称。",
  "Generated and downloaded":"已生成并下载"
};
const uiZhEn=Object.fromEntries(Object.entries(uiEnZh).map(([en,zh])=>[zh,en]));
const uiEnKeys=Object.keys(uiEnZh).sort((a,b)=>b.length-a.length);
const uiZhKeys=Object.keys(uiZhEn).sort((a,b)=>b.length-a.length);

function applyMap(s,map,keys){
  let out=s;
  for(const k of keys)out=out.split(k).join(map[k]);
  return out;
}
function applyNameMap(s,map,keys){
  let out=s;
  for(const k of keys)out=out.split(k).join(map[k]);
  return out;
}
const shortEnZh={"P":"赛","GD":"净胜","Pts":"积分"};
const shortZhEn=Object.fromEntries(Object.entries(shortEnZh).map(([en,zh])=>[zh,en]));
function toChinese(s){
  const t=s.trim();
  if(shortEnZh[t])return s.replace(t,shortEnZh[t]);
  let out=applyNameMap(s,namesZh,nameKeysZh);
  out=applyMap(out,uiEnZh,uiEnKeys);
  for(const [en,zh] of Object.entries(statusZh))out=out.split(en).join(zh);
  return out;
}

const exact={
"固定模板 · 单场比赛 · 主客队赛程与状态":"Fixed template · Single match · Home/Away schedule & form",
"比赛信息":"Match Information",
"排名请按任务当时官方最新榜单填写；当天已结束比赛先计入。赛程必须统计一线队所有赛事，包括联赛、杯赛、欧战与友谊赛。":"Use the latest official standings at task time; include matches already finished today. Schedules must include all first-team competitions, including league, cups, Europe and friendlies.",
"官方排名（上3 + 本队 + 下3）":"Official Ranking (3 above + team + 3 below)",
"前3场实际比赛 + 本场 + 后2场":"Previous 3 + Current + Next 2",
"本赛事最近最多5场 Form":"Up to 5 Most Recent Matches in This Competition",
"状态":"Status",
"一键自动生成 Excel":"Auto Generate Excel",
"重新计算":"Recalculate",
"导出 Excel":"Export Excel",
"清空":"Clear",
"已载入锁定规则":"Locked Rules Loaded",
"欧冠专用":"UCL Only",
"生成公式 B":"Generate Formula B",
"导出 B Excel":"Export B Excel",
"输入两队后生成公式 B。":"Enter both teams to generate Formula B.",
"赛前意图":"Pre-match Intent",
"比赛列表（每行一场，格式：Home vs Away）":"Match List (one per line: Home vs Away)",
"生成公式 C":"Generate Formula C",
"导出 C Excel":"Export C Excel",
"输入比赛列表后生成公式 C。":"Enter matches to generate Formula C.",
"今日全部已开赛比赛自动监控":"Auto Monitor All Live Matches Today",
"不限场数 · 10秒自动检查":"Unlimited Matches · Auto Check Every 10s",
"立即刷新全部比赛":"Refresh All Matches Now",
"正在初始化今日比赛…":"Initializing today's matches…",
"正在读取今天已开始的比赛…":"Loading today's live matches…",
"实时意图":"Live Intent",
"置信度":"Confidence",
"实时依据":"Live Evidence",
"最近5分钟 xG":"Last 5 min xG",
"前5分钟 xG":"Previous 5 min xG",
"最近10分钟 xG":"Last 10 min xG",
"前10分钟 xG":"Previous 10 min xG",
"射门 / 射正":"Shots / Shots on Target",
"最近5分钟射门":"Last 5 min Shots",
"前5分钟射门":"Previous 5 min Shots",
"最近10分钟射门":"Last 10 min Shots",
"前10分钟射门":"Previous 10 min Shots",
"控球":"Possession",
"角球":"Corners",
"红牌 / 换人":"Red Cards / Subs",
"最近换人":"Latest Substitution",
"疲劳":"Fatigue",
"意图":"Intent",
"不累":"Not Tired",
"累":"Tired",
"很累":"Very Tired",
"进攻":"Attacking",
"微攻":"Slightly Attacking",
"微守":"Slightly Defensive",
"防守":"Defensive",
"正在抓取实时数据…":"Fetching live data…",
"正在读取今天全部目标赛事…":"Loading all target competitions today…",
"目前没有已经开赛且尚未结束的目标赛事。":"No target matches are currently live.",
"场正在监控":" matches monitored",
"场实时数据暂不可用，10秒后自动重试。":" matches temporarily unavailable; retrying in 10 seconds.",
"已停止":"Stopped",
"比赛已结束":"Match finished",
"实时数据获取失败":"Live data unavailable",
"实时数据覆盖不足，暂不强判":"Insufficient live data; no forced intent",
"当前5分钟与10分钟实时数据未形成足够明确的意图信号":"Current 5- and 10-minute data do not show a clear enough intent signal",
"5分钟与10分钟趋势明显冲突，暂不强判":"5- and 10-minute trends conflict; no forced intent",
"进攻增强与节奏下滑信号同时存在，证据冲突":"Attacking increase and slowdown signals conflict",
"出现进攻型换人":"Attacking substitution detected",
"出现防守型换人":"Defensive substitution detected",
"本队有红牌，进攻能力受限":"Red card limits attacking capacity",
"控球率较高":"High possession",
"禁区触球较多":"Many touches in opposition box",
"没有射门":"no shots",
"比赛已结束，自动停止":"Match finished; auto-monitoring stopped",
"正在按锁定公式 C 逐场分析…":"Analyzing each match with locked Formula C…",
"正在按公式 D 分析…":"Analyzing with Formula D…",
"请输入比赛":"Enter matches",
"处理中":"Processing",
"请先生成公式 C":"Generate Formula C first",
"Excel 组件未加载":"Excel component not loaded",
"公式 C Excel 已按固定规格导出":"Formula C Excel exported with locked layout",
"退出登录":"Log out",
"请输入共享账号和密码":"Enter shared username and password",
"账号":"Username",
"密码":"Password",
"登录":"Log in",
"正在验证…":"Verifying…",
"登录失败":"Login failed","赢多":"Win Big","想追平":"Equalize","想赢":"Want Win","希望赢":"Hope Win","不想输":"Don't Lose","放弃":"Give Up","必须赢":"Must Win","危险":"DANGEROUS","压迫":"PRESSING","低效进攻":"WASTEFUL","均衡":"BALANCED","被动":"PASSIVE","放缓":"SLOW"
};
const repl=[
[/系统自动读取纽约日期下今天的五大联赛、欧冠、欧联、欧协联全部成年男子一线队比赛。所有已经开赛且尚未结束的一线队比赛都会自动进入 Formula D 监控，不设场数上限；U21\/U19、青年队、预备队、B队、女足不纳入。/g,"The system automatically loads today's senior men's first-team matches in the Big Five leagues, UCL, UEL and UECL using the New York date. Every match that has started and not finished is automatically monitored by Formula D with no match limit; U21/U19, youth, reserve, B teams and women's matches are excluded."],
[/5分钟权重60%，10分钟权重40%；比分与时间只作为背景。落后未追平时最高只能 Equalize；证据不足或5\/10分钟趋势明显冲突时显示 ---。/g,"5-minute data has 60% weight and 10-minute data 40%; score and time are context only. While trailing, the maximum intent is Equalize. Insufficient or conflicting 5/10-minute evidence returns ---."],
[/最近5分钟/g,"Last 5 min"],[/前5分钟/g,"Previous 5 min"],[/最近10分钟/g,"Last 10 min"],[/前10分钟/g,"Previous 10 min"],
[/xG 节奏较上一窗口明显上升/g,"xG tempo clearly increased vs previous window"],
[/xG 较上一窗口下降≥50%/g,"xG down ≥50% vs previous window"],
[/射门节奏较上一窗口上升/g,"shot tempo increased vs previous window"],
[/射门节奏较上一窗口下降≥50%/g,"shot tempo down ≥50% vs previous window"],
[/ xG 很高/g," xG very high"],[/ xG 较高/g," xG high"],[/有一定 xG/g," some xG"],[/ xG 很低/g," xG very low"],
[/射门 (\d+) 次/g,"$1 shots"],
[/发现 (\d+) 场 LIVE，正在运行 Formula D…/g,"Found $1 LIVE matches; running Formula D…"],
[/今日目标赛事 (\d+) 场 · 当前 LIVE (\d+) 场 · 每10秒自动检查/g,"Today's target matches: $1 · LIVE: $2 · Auto-check every 10s"],
[/Formula D · 正在监控 (\d+)\/(\d+) 场 LIVE/g,"Formula D · Monitoring $1/$2 LIVE matches"]
];

function toEnglish(s){
  const t=s.trim();
  if(shortZhEn[t])return s.replace(t,shortZhEn[t]);
  let out=exact[t]?s.replace(t,exact[t]):s;
  for(const [rx,v] of repl)out=out.replace(rx,v);
  out=applyMap(out,uiZhEn,uiZhKeys);
  return out;
}
function translateText(n){
  if(!n||n.nodeType!==3)return;
  const s=n.nodeValue;
  if(!s||!s.trim())return;
  if(!originals.has(n)) originals.set(n,s);
  let out;
  if(lang==="en"){
    out=applyNameMap(toEnglish(originals.get(n)),namesEn,nameKeysEn);
    for(const [zh,en] of Object.entries(statusEn))out=out.split(zh).join(en);
  }else out=toChinese(originals.get(n));
  if(n.nodeValue!==out)n.nodeValue=out;
}
function translateAttrs(el){
  if(!(el instanceof Element))return;
  for(const a of ["placeholder","title","aria-label"]){
    if(!el.hasAttribute(a))continue;
    const key="i18nOrig"+a.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()).replace(/^./,c=>c.toUpperCase());
    if(!el.dataset[key])el.dataset[key]=el.getAttribute(a)||"";
    const out=lang==="en"?applyNameMap(toEnglish(el.dataset[key]),namesEn,nameKeysEn):toChinese(el.dataset[key]);
    if(el.getAttribute(a)!==out)el.setAttribute(a,out);
  }
}
function walk(root=document.body){
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let n;while(n=w.nextNode())translateText(n);
  if(root instanceof Element)translateAttrs(root);
  root.querySelectorAll?.("[placeholder],[title],[aria-label]").forEach(translateAttrs);
}

/* Automatic fallback translator for any NEW UI text not covered by the language pack.
   Known strings translate instantly locally; unknown leftovers are translated in small
   batches through /api/i18n-translate and cached in localStorage. */
const AUTO_CACHE_KEY="formula_i18n_auto_v1";
let autoCache={};
try{autoCache=JSON.parse(localStorage.getItem(AUTO_CACHE_KEY)||"{}")||{};}catch(e){autoCache={};}
let autoQueue=[],autoTimer=null,autoBusy=false;
const autoSeen=new WeakMap();
function cacheKey(target,text){return target+"|"+text;}
function saveAutoCache(){
  try{
    const keys=Object.keys(autoCache);
    if(keys.length>1200){
      const trimmed={};keys.slice(-900).forEach(k=>trimmed[k]=autoCache[k]);autoCache=trimmed;
    }
    localStorage.setItem(AUTO_CACHE_KEY,JSON.stringify(autoCache));
  }catch(e){}
}
function preserveSpace(raw,out){
  const pre=(String(raw).match(/^\s*/)||[""])[0],post=(String(raw).match(/\s*$/)||[""])[0];
  return pre+String(out||"").trim()+post;
}
function autoEligibleText(text,target){
  const s=String(text||"").trim();
  if(!s||s.length<2||s.length>700)return false;
  if(/^(SCRIPT|STYLE|NOSCRIPT)$/i.test(s))return false;
  if(/^[\d\s%+/:.,'’()\-—–×☑✕↑↓#]+$/.test(s))return false;
  if(/^(xG|SS|AS|GTI|W\/D\/L|ET|UCL|UEL|UECL|LIVE|FORMULA [ABCD])$/i.test(s))return false;
  return target==="en"?/[\u3400-\u9fff]/.test(s):/[A-Za-z]{3,}/.test(s);
}
function autoQueueTextNode(node){
  if(!node||node.nodeType!==3||!node.parentElement)return;
  const tag=node.parentElement.tagName;
  if(/^(SCRIPT|STYLE|TEXTAREA|OPTION|CODE|PRE)$/i.test(tag))return;
  const raw=node.nodeValue||"",source=raw.trim();
  if(!autoEligibleText(source,lang))return;
  const key=cacheKey(lang,source);
  if(autoCache[key]){
    const out=preserveSpace(raw,autoCache[key]);
    if(node.nodeValue!==out)node.nodeValue=out;
    return;
  }
  if(autoSeen.get(node)===key)return;
  autoSeen.set(node,key);
  autoQueue.push({kind:"text",node,raw,source,target:lang,key});
  scheduleAuto();
}
function autoQueueAttr(el,attr){
  if(!(el instanceof Element)||!el.hasAttribute(attr))return;
  const raw=el.getAttribute(attr)||"",source=raw.trim();
  if(!autoEligibleText(source,lang))return;
  const key=cacheKey(lang,source);
  if(autoCache[key]){
    const out=preserveSpace(raw,autoCache[key]);
    if(el.getAttribute(attr)!==out)el.setAttribute(attr,out);
    return;
  }
  autoQueue.push({kind:"attr",el,attr,raw,source,target:lang,key});
  scheduleAuto();
}
function autoScan(root=document.body){
  if(!root)return;
  if(root.nodeType===3){autoQueueTextNode(root);return;}
  if(!(root instanceof Element)&&root!==document.body)return;
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let n;while(n=w.nextNode())autoQueueTextNode(n);
  if(root instanceof Element)for(const a of ["placeholder","title","aria-label"])autoQueueAttr(root,a);
  root.querySelectorAll?.("[placeholder],[title],[aria-label]").forEach(el=>{
    for(const a of ["placeholder","title","aria-label"])autoQueueAttr(el,a);
  });
}
function scheduleAuto(){
  clearTimeout(autoTimer);
  autoTimer=setTimeout(flushAuto,180);
}
async function flushAuto(){
  if(autoBusy||!autoQueue.length)return;
  autoBusy=true;
  const target=lang;
  const batch=autoQueue.filter(x=>x.target===target).splice(0,40);
  autoQueue=autoQueue.filter(x=>!batch.includes(x));
  const unique=[...new Set(batch.map(x=>x.source))];
  try{
    const r=await fetch("/api/i18n-translate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({target,texts:unique})});
    const j=await r.json().catch(()=>({}));
    if(r.ok&&Array.isArray(j.translations)&&j.translations.length===unique.length){
      const map=new Map(unique.map((x,i)=>[x,j.translations[i]]));
      for(const item of batch){
        if(item.target!==lang)continue;
        const tr=map.get(item.source);if(!tr)continue;
        autoCache[item.key]=tr;
        if(item.kind==="text"&&item.node?.isConnected)item.node.nodeValue=preserveSpace(item.raw,tr);
        if(item.kind==="attr"&&item.el?.isConnected)item.el.setAttribute(item.attr,preserveSpace(item.raw,tr));
      }
      saveAutoCache();
    }
  }catch(e){}
  finally{
    autoBusy=false;
    if(autoQueue.length)scheduleAuto();
  }
}
function setLang(next){
  lang=next;localStorage.setItem(KEY,lang);
  document.documentElement.lang=lang==="en"?"en":"zh-CN";
  document.querySelectorAll(".lang-switch button").forEach(b=>b.classList.toggle("active",b.dataset.lang===lang));
  walk();
  autoScan(document.body);
  window.dispatchEvent(new CustomEvent("formula-language-change",{detail:{lang}}));
}
function mount(){
  if(!document.querySelector(".lang-switch")){
    const box=document.createElement("div");box.className="lang-switch";box.setAttribute("aria-label","Language");
    box.innerHTML='<button type="button" data-lang="zh">中文</button><button type="button" data-lang="en">English</button>';
    document.body.appendChild(box);
    box.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>setLang(b.dataset.lang)));
  }
  setLang(lang);
  const obs=new MutationObserver(ms=>{
    for(const m of ms){
      for(const n of m.addedNodes){
        if(n.nodeType===3){translateText(n);autoQueueTextNode(n);}
        else if(n.nodeType===1){walk(n);autoScan(n);}
      }
    }
  });
  /* Observe newly inserted/replaced UI only. Do NOT observe characterData:
     translation itself changes text nodes, which can create a feedback loop. */
  obs.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount);else mount();
window.FormulaLang={get:()=>lang,set:setLang,refresh:()=>{walk();autoScan(document.body);}};
})();