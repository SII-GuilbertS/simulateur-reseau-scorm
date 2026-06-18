#!/usr/bin/env python3
"""
build.py — Pipeline de build et vérification
=============================================

ARCHITECTURE (depuis la restructuration point 1) :
  src/sim-engine.js       moteur partagé builder+template (114 fonctions)
  src/template-extra.js   surcharges spécifiques au template élève (17 fonctions + init)
  src/template-skeleton.html  squelette HTML du template (sans JS)

  scorm-builder.html (généré) contient :
    ① le JS builder :
       - stubs SCORM + saveToSession/loadFromSession (spécifiques builder)
       - bloc SIM-ENGINE-START/END → contenu de sim-engine.js
       - surcharges builder (checkAllObjectives/EvalModule, showProps builder, etc.)
       - undo/redo/snapHistory réels, copier/coller, etc.
    ② var STUDENT_TEMPLATE = base64(skeleton.html + sim-engine.js + template-extra.js)
    ③ SimModule + EvalModule + GenModule (builder)

Usage :
    python3 build.py              — vérifie uniquement (dry-run)
    python3 build.py --fix        — répare les checks KO
    python3 build.py --rebuild    — régénère depuis sim-engine.js + template-extra.js
    python3 build.py --rebuild --fix  — régénère + répare si nécessaire
"""
import sys, base64, re, os

DIR = os.path.dirname(os.path.abspath(__file__))
SRC       = os.path.join(DIR, "scorm-builder.html")
ENGINE_JS = os.path.join(DIR, "sim-engine.js")
EXTRA_JS  = os.path.join(DIR, "template-extra.js")
SKEL_HTML = os.path.join(DIR, "template-skeleton.html")

FIX_MODE     = "--fix" in sys.argv
REBUILD_MODE = "--rebuild" in sys.argv

# ─────────────────────────────────────────────────────────────────────────────
# Chargement
# ─────────────────────────────────────────────────────────────────────────────
with open(SRC, encoding='utf-8') as f:
    html = f.read()

b64_match = re.search(
    r'var STUDENT_TEMPLATE\s*=\s*\(function\(\)\{\s*var b64\s*=\s*"([A-Za-z0-9+/=]+)"',
    html
)
if not b64_match:
    print("FATAL: STUDENT_TEMPLATE b64 pattern non trouvé"); sys.exit(1)

tpl = base64.b64decode(b64_match.group(1)).decode('utf-8')

# ─────────────────────────────────────────────────────────────────────────────
# Mode REBUILD : régénérer le STUDENT_TEMPLATE et le bloc SIM-ENGINE du builder
# ─────────────────────────────────────────────────────────────────────────────
if REBUILD_MODE:
    print("── Mode REBUILD ──────────────────────────────────────────────────────")
    for path in [ENGINE_JS, EXTRA_JS, SKEL_HTML]:
        if not os.path.exists(path):
            print(f"FATAL: fichier source manquant: {path}"); sys.exit(1)

    engine = open(ENGINE_JS, encoding='utf-8').read()
    extra  = open(EXTRA_JS,  encoding='utf-8').read()
    skel   = open(SKEL_HTML, encoding='utf-8').read()

    # ── Générer le STUDENT_TEMPLATE
    combined_js = engine + '\n\n' + extra
    # Le squelette a un placeholder /* __JS__ */ dans son <script>
    if '/* __JS__ */' in skel:
        tpl_html = skel.replace('/* __JS__ */', combined_js)
    else:
        # Fallback : injecter entre <script> et </script>
        idx_s = skel.index('<script>') + len('<script>')
        idx_e = skel.rindex('</script>')
        tpl_html = skel[:idx_s] + '\n' + combined_js + '\n' + skel[idx_e:]

    new_b64 = base64.b64encode(tpl_html.encode('utf-8')).decode('ascii')
    assert '\n' not in new_b64
    html_out = html[:b64_match.start(1)] + new_b64 + html[b64_match.end(1):]

    # ── Mettre à jour le bloc SIM-ENGINE du builder
    SIM_START = '/* ════════════════════════════════════════════════════════════\n   SIM-ENGINE-START'
    SIM_END   = 'SIM-ENGINE-END\n════════════════════════════════════════════════════════════ */'
    idx_s = html_out.find(SIM_START)
    idx_e = html_out.find(SIM_END)
    if idx_s != -1 and idx_e != -1:
        idx_s_end = html_out.index('\n', idx_s + len(SIM_START)) + 1
        # Remplacer le contenu entre les marqueurs
        new_engine_block = SIM_START + ' — généré par build.py — NE PAS MODIFIER\n════════════════════════════════════════════════════════════ */\n' + engine + '\n/* '
        html_out = html_out[:idx_s] + new_engine_block + SIM_END + html_out[idx_e + len(SIM_END):]
        print(f"  ✓  Bloc SIM-ENGINE builder mis à jour ({len(engine)} chars)")
    else:
        print("  ⚠  Marqueurs SIM-ENGINE non trouvés dans le builder — bloc builder non mis à jour")

    with open(SRC, 'w', encoding='utf-8') as f:
        f.write(html_out)
    print(f"  ✓  scorm-builder.html régénéré ({len(html_out)} chars)")

    # Recharger pour les vérifications
    html = html_out
    tpl = tpl_html
    print()

# ─────────────────────────────────────────────────────────────────────────────
# Définition des checks
# ─────────────────────────────────────────────────────────────────────────────
CHECKS = [

    # ── WiFi router : fonctionnalités de base ────────────────────────────────
    (
        "isRouter() reconnaît wifi_router",
        "d.type==='wifi_router'",
        None, None
    ),
    (
        "DT contient l'entrée wifi_router",
        "wifi_router:{label:'Box WiFi'",
        None, None
    ),
    (
        "mkDev initialise ssid pour wifi_router",
        "=='wifi_router'&&!d.ssid)d.ssid='MonWiFi'",
        None, None
    ),
    (
        "renderDevs affiche les interfaces du wifi_router",
        "d.type==='router'||d.type==='wifi_router'",
        None, None
    ),
    (
        "renderLinks : liaisons WiFi en pointillés",
        "stroke-dasharray",
        None, None
    ),

    # ── simDHCP : DHCP sur wifi_router ───────────────────────────────────────
    (
        "simDHCP reconnaît wifi_router comme serveur DHCP",
        "(d.type==='server'||d.type==='wifi_router')&&d.dhcp&&d.dhcp.on",
        "if(d&&d.type==='server'&&d.dhcp&&d.dhcp.on)dhcpSrv=d;",
        "if(d&&(d.type==='server'||d.type==='wifi_router')&&d.dhcp&&d.dhcp.on)dhcpSrv=d;"
    ),

    # ── simPing : pont WiFi ──────────────────────────────────────────────────
    (
        "simPing : pont WiFi entre deux clients du même wifi_router",
        "var sharedWifi=null;",
        None, None
    ),

    # ── simPing : chemin internet utilise des IDs ─────────────────────────────
    (
        "simPing internet : path contient des IDs (pas des noms)",
        "path:[src.id,_ir.router.id,_ir.inet.id]",
        "path:[src.name,_ir.router.name,_ir.inet.name],lat:32,internet:true}",
        "path:[src.id,_ir.router.id,_ir.inet.id],lat:32,internet:true}"
    ),

    # ── animPath : toujours déclenché sur ping réussi (bug #2 fix) ───────────
    (
        "animPath déclenché pour tout ping réussi (LAN direct, WiFi, router)",
        "animPath(res.path);\n    checkDynamicObjective('ping_success'",
        "if(res.router||res.wifi)\nanimPath(res.path);",
        "animPath(res.path);"
    ),

    # ── doPing : chemin affiché avec noms ────────────────────────────────────
    (
        "doPing : pathNames resolves IDs → noms d'appareils",
        "res.path.map(function(id){return S.devs[id]?S.devs[id].name:id;})",
        None, None
    ),

    # ── doPing : dns_success ─────────────────────────────────────────────────
    (
        "doPing : checkDynamicObjective dns_success appelé",
        "checkDynamicObjective('dns_success'",
        None, None
    ),

    # ── doTrace : IDs ────────────────────────────────────────────────────────
    (
        "doTrace : résout les IDs en noms d'appareils",
        "var dv=S.devs[id];",
        None, None
    ),

    # ── loadTopology : migration format v2 ───────────────────────────────────
    (
        "loadTopology : détecte et migre le format v2 exporté par le builder",
        "data.version===2&&data.network",
        "var data=JSON.parse(e.target.result);\n"
        "      if(!data.devs||!data.links)throw new Error('Format invalide — fichier JSON incompatible');",
        "var data=JSON.parse(e.target.result);\n"
        "      // Migration format v2 (builder) → v1 (template)\n"
        "      if(data.version===2&&data.network){data=data.network;}\n"
        "      if(!data.devs||!data.links)throw new Error('Format invalide — fichier JSON incompatible');"
    ),

    # ── devByName : normalisation ─────────────────────────────────────────────
    (
        "devByName : comparaison normalisée (toLowerCase + trim)",
        "name.trim().toLowerCase()",
        "function devByName(name){\n"
        "  return Object.values(S.devs).find(function(d){return d.name===name;});\n"
        "}",
        "function devByName(name){\n"
        "  if(!name)return null;\n"
        "  var n=name.trim().toLowerCase();\n"
        "  return Object.values(S.devs).find(function(d){return d.name&&d.name.trim().toLowerCase()===n;})||null;\n"
        "}"
    ),

    # ── dns_configured : logique correcte ────────────────────────────────────
    (
        "checkObjectiveStatic dns_configured : logique correcte (non-strict)",
        "if(!fi.dns)return false;\n      if(p.dns&&fi.dns!==p.dns)return false;",
        "case 'dns_configured':\n"
        "      d=devByName(p.dev);if(!d)return false;\n"
        "      fi=mainIface(d);if(!fi)return false;\n"
        "      return fi.dns===p.dns;",
        "case 'dns_configured':\n"
        "      d=devByName(p.dev);if(!d)return false;\n"
        "      fi=mainIface(d);if(!fi)return false;\n"
        "      if(!fi.dns)return false;\n"
        "      if(p.dns&&fi.dns!==p.dns)return false;\n"
        "      return true;"
    ),

    # ── cwDrop : checkAllObjectives ───────────────────────────────────────────
    (
        "cwDrop : checkAllObjectives() déclenché après dépôt d'un appareil",
        "checkAllObjectives();},50);",
        "  var id=mkDev(type,Math.max(4,x-DW/2),Math.max(4,y-DH/2));\n"
        "  S.sel=id;render();showProps(id);\n"
        "}",
        "  var id=mkDev(type,Math.max(4,x-DW/2),Math.max(4,y-DH/2));\n"
        "  S.sel=id;render();showProps(id);\n"
        "  setTimeout(function(){checkAllObjectives();},50);\n"
        "}"
    ),

    # ── toggleDHCPMode : checkAllObjectives ──────────────────────────────────
    (
        "toggleDHCPMode : checkAllObjectives() déclenché après changement DHCP",
        "render();showProps(devId);\n  setTimeout(function(){checkAllObjectives();",
        "function toggleDHCPMode(devId, enabled){\n"
        "  var d=S.devs[devId];if(!d||!d.ifaces[0])return;\n"
        "  d.ifaces[0].dhcpMode=enabled;\n"
        "  if(enabled){d.ifaces[0].ip='';d.ifaces[0].mask='';d.ifaces[0].gateway='';d.ifaces[0].dns='';}\n"
        "  render();showProps(devId);\n"
        "}",
        "function toggleDHCPMode(devId, enabled){\n"
        "  var d=S.devs[devId];if(!d||!d.ifaces[0])return;\n"
        "  d.ifaces[0].dhcpMode=enabled;\n"
        "  if(enabled){d.ifaces[0].ip='';d.ifaces[0].mask='';d.ifaces[0].gateway='';d.ifaces[0].dns='';}\n"
        "  render();showProps(devId);\n"
        "  setTimeout(function(){checkAllObjectives();},50);\n"
        "}"
    ),

    # ── setMode : wifi_router désactivé en simulation ─────────────────────────
    (
        "setMode : wifi_router désactivé dans la palette en mode simulation",
        "'wifi_router','internet','frame','anntext'",
        "['pc','server','switch','router','internet','frame','anntext'].forEach(function(t){",
        "['pc','server','switch','router','wifi_router','internet','frame','anntext'].forEach(function(t){"
    ),

    # ── Bug1 : pas de double-quote dans showProps HTTP ────────────────────────
    (
        "showProps HTTP : pas de double-quote dans les handlers onchange",
        "+'\\'].http.title",
        None, None
    ),
]

# ─────────────────────────────────────────────────────────────────────────────
# Exécution des checks
# ─────────────────────────────────────────────────────────────────────────────
print(f"{'─'*70}")
print(f"  build.py — Audit du STUDENT_TEMPLATE")
print(f"  Mode : {'RÉPARATION (--fix)' if FIX_MODE else 'VÉRIFICATION (dry-run)'}")
print(f"{'─'*70}")

results = []
tpl_modified = tpl

for desc, verify_pat, old_pat, new_pat in CHECKS:
    present = verify_pat in tpl_modified
    if present:
        results.append(("OK", desc))
        print(f"  ✓  {desc}")
    else:
        if FIX_MODE and old_pat and new_pat:
            count_old = tpl_modified.count(old_pat)
            if count_old == 1:
                tpl_modified = tpl_modified.replace(old_pat, new_pat, 1)
                if verify_pat in tpl_modified:
                    results.append(("FIXED", desc))
                    print(f"  🔧  {desc}  [RÉPARÉ]")
                else:
                    results.append(("ERR", desc))
                    print(f"  ✗  {desc}  [RÉPARATION ÉCHOUÉE]")
            elif count_old == 0:
                results.append(("ERR", desc))
                print(f"  ✗  {desc}  [NI old NI new trouvé — intervention manuelle requise]")
            else:
                results.append(("ERR", desc))
                print(f"  ✗  {desc}  [old_pat ambigu ({count_old} occurrences)]")
        else:
            results.append(("KO", desc))
            if FIX_MODE and not old_pat:
                print(f"  ✗  {desc}  [MANQUANT — pas de réparation automatique]")
            else:
                print(f"  ✗  {desc}  [MANQUANT]")

# ─────────────────────────────────────────────────────────────────────────────
# Résumé
# ─────────────────────────────────────────────────────────────────────────────
ok_count    = sum(1 for s,_ in results if s == "OK")
fixed_count = sum(1 for s,_ in results if s == "FIXED")
ko_count    = sum(1 for s,_ in results if s in ("KO","ERR"))
total       = len(results)

print(f"{'─'*70}")
print(f"  Résultat : {ok_count} OK  |  {fixed_count} réparés  |  {ko_count} KO  |  {total} checks total")

if ko_count > 0:
    print(f"\n  ⚠  {ko_count} check(s) KO.")
    if not FIX_MODE:
        print("     Relancez avec --fix pour tenter une réparation automatique.")
        print("     Ou relancez avec --rebuild pour régénérer depuis les sources.")
    print()

# ─────────────────────────────────────────────────────────────────────────────
# Sauvegarde si des réparations ont été appliquées
# ─────────────────────────────────────────────────────────────────────────────
if fixed_count > 0:
    new_b64 = base64.b64encode(tpl_modified.encode('utf-8')).decode('ascii')
    assert '\n' not in new_b64
    html_out = html[:b64_match.start(1)] + new_b64 + html[b64_match.end(1):]
    with open(SRC, 'w', encoding='utf-8') as f:
        f.write(html_out)
    print(f"  💾  Fichier mis à jour : {len(html_out)} chars")
elif FIX_MODE and fixed_count == 0 and ko_count == 0:
    print("  ✓  Rien à réparer.")

sys.exit(0 if ko_count == 0 else 1)
