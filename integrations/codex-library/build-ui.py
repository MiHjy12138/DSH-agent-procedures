"""Rebundle local translations and SVG; runtime has no Python dependency."""
from pathlib import Path
import json,re
root=Path(__file__).resolve().parent/'codex-plugin'
page=root/'ui/app.html'
text=page.read_text(encoding='utf-8')
translations=json.loads((root/'ui/translations.json').read_text(encoding='utf-8'))
logo=(root/'assets/logo.svg').read_text(encoding='utf-8')
for name,value in [('TRANSLATIONS',translations),('LOGO',logo)]:
    text=re.sub(r'^const '+name+r'=.*;$',lambda _: 'const '+name+'='+json.dumps(value,ensure_ascii=False)+';',text,flags=re.M)
page.write_text(text,encoding='utf-8')
print('Bundled local assets')
