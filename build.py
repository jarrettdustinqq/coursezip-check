from pathlib import Path
import base64,hashlib,json,re
ROOT=Path(__file__).resolve().parent
samples=[{'name':'good-stored.zip','data':base64.b64encode((ROOT/'fixtures/good-stored.zip').read_bytes()).decode()}]
html=(ROOT/'src/index.template.html').read_text().replace('__CORE__',(ROOT/'src/core.js').read_text()).replace('__UI__',(ROOT/'src/ui.js').read_text().replace('__SAMPLES__',json.dumps(samples)))
script=re.search(r'<script>([\s\S]*?)</script>',html).group(1)
html=html.replace('__SCRIPT_HASH__','sha256-'+base64.b64encode(hashlib.sha256(script.encode()).digest()).decode())
(ROOT/'CourseZip-Check-Free.html').write_text(html)
print(f'Built free preview: {len(html.encode()):,} bytes.')
