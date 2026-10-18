# Gera ufvjm/index.html e ufvjm/manifest.webmanifest a partir dos arquivos da raiz.
# Rode depois de mudar index.html ou manifest.webmanifest:  python3 tools/make-variants.py
import json, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text()
html = html.replace('data-variant="uff"', 'data-variant="ufvjm"').replace('Estudos UFF', 'Estudos UFVJM')
html = re.sub(r'(href|src)="(?!https?:|#|/)([^"]+)"', lambda m: f'{m[1]}="../{m[2]}"', html)
html = html.replace('../icons/uff/', 'icons/').replace('../manifest.webmanifest', 'manifest.webmanifest')
(root / 'ufvjm').mkdir(exist_ok=True)
(root / 'ufvjm' / 'index.html').write_text(html)
m = json.loads((root / 'manifest.webmanifest').read_text())
m['name'] = m['short_name'] = 'Estudos UFVJM'
for i in m['icons']:
    i['src'] = i['src'].replace('icons/uff/', 'icons/')
(root / 'ufvjm' / 'manifest.webmanifest').write_text(json.dumps(m, ensure_ascii=False, indent=2) + '\n')
print('ufvjm/ atualizado')
