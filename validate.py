#!/usr/bin/env python3
"""
validate.py — Vérifie scorm-builder.html avant tout commit.
Usage: python3 validate.py
"""
import re, sys, base64, subprocess, tempfile, os

TARGET = 'scorm-builder.html'
errors = []

with open(TARGET, 'r', encoding='utf-8') as f:
    html = f.read()

# ── 1. b64 sur une seule ligne ────────────────────────────────────
b64_lines = [l for l in html.split('\n') if 'var b64 = "' in l]
if len(b64_lines) != 1:
    errors.append(f"b64 sur {len(b64_lines)} lignes (doit être 1)")
else:
    print(f"OK  b64 ligne unique ({len(b64_lines[0])} chars)")

# ── 2. Décode le template ─────────────────────────────────────────
m = re.search(r'var b64 = "([A-Za-z0-9+/=\n]+)";', html)
tmpl = ''
if m:
    try:
        tmpl = base64.b64decode(m.group(1).replace('\n','')).decode('utf-8')
        print(f"OK  template décodable ({len(tmpl)} chars)")
    except Exception as e:
        errors.append(f"Décodage b64: {e}")
else:
    errors.append("var b64 introuvable")

# ── 3. Extraction JS du builder ───────────────────────────────────
# Le script builder va de <script> (ligne ~670) jusqu'à var STUDENT_TEMPLATE
script_start = html.find('\n<script>\n')
student_start = html.find('\nvar STUDENT_TEMPLATE')
if script_start < 0 or student_start < 0:
    errors.append("Impossible d'isoler le JS builder")
    builder_js = ''
else:
    builder_js = html[script_start + len('\n<script>\n') : student_start]
    print(f"OK  JS builder extrait ({len(builder_js)} chars)")

# ── 4. Syntaxe JS via node --check ────────────────────────────────
def js_syntax_check(js_src, label):
    with tempfile.NamedTemporaryFile(suffix='.js', mode='w', encoding='utf-8',
                                     delete=False) as tmp:
        tmp.write(js_src)
        tmp_path = tmp.name
    try:
        r = subprocess.run(['node', '--check', tmp_path],
                           capture_output=True, text=True)
        if r.returncode != 0:
            msg = (r.stderr or r.stdout).strip().split('\n')[0]
            # Translate temp file line number back
            errors.append(f"SyntaxError ({label}): {msg}")
            return False
        print(f"OK  syntaxe JS ({label})")
        return True
    finally:
        os.unlink(tmp_path)

if builder_js:
    js_syntax_check(builder_js, 'builder')

if tmpl:
    tmpl_scripts = re.findall(r'<script[^>]*>([\s\S]*?)</script>', tmpl)
    tmpl_js = '\n'.join(tmpl_scripts)
    if tmpl_js.strip():
        js_syntax_check(tmpl_js, 'template')
    else:
        errors.append("Aucun JS extrait du template")

# ── 5. Résidus de badges ──────────────────────────────────────────
for kw in ['var BADGES=', 'S.badges', 'renderBadges(', 'checkBadges(', "unlock('b"]:
    cnt = builder_js.count(kw) + tmpl.count(kw)
    if cnt:
        errors.append(f"Résidu badge '{kw}' ({cnt} occurrence(s))")
    else:
        print(f"OK  pas de résidu '{kw}'")

# ── 6. Fonctions critiques présentes ─────────────────────────────
required = {
    'builder': ['function cvMM(', 'function cwDrop(', 'function palDS(',
                'function checkAllObjectives(', 'var ACTIVITY_RESULTS'],
    'template': ['function ipMatchesPattern(', 'function checkObjectiveStatic(',
                 'ACTIVITY_CONFIG.objectives', '_ptoDev'],
}
for where, fns in required.items():
    src = builder_js if where == 'builder' else tmpl
    for fn in fns:
        if fn in src:
            print(f"OK  {where}: {fn}")
        else:
            errors.append(f"MANQUANT dans {where}: {fn}")

# ── Résumé ────────────────────────────────────────────────────────
print()
if errors:
    print('='*52)
    print(f"  {len(errors)} ERREUR(S) :")
    for e in errors: print(f"  ✗ {e}")
    print('='*52)
    sys.exit(1)
else:
    print("✅ Validation OK")
