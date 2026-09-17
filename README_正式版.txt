公式 A+B+C 正式版 v2

覆盖 GitHub 仓库根目录的：
app.py
rules_config.json
requirements.txt
railway.toml
Procfile

正式版不会在没有实时研究数据源时生成空白/假Excel。
Railway -> Service -> Variables 需要设置：
OPENAI_API_KEY = 你的 OpenAI API key

可选：
OPENAI_MODEL = gpt-5.6-sol

Formula C 保持锁死分类：
Must Win / Want Win / Hope Win / Don't Lose / ---
Equalize 属于另外的实时比赛意图体系，不混入 Formula C。
