#!/usr/bin/env python3
"""
build.py — Pipeline de vérification et réparation du STUDENT_TEMPLATE
=======================================================================

Ce script est la source de vérité pour l'état attendu du STUDENT_TEMPLATE
encodé en base64 dans scorm-builder.html.

Usage :
    python3 build.py           — vérifie uniquement (mode dry-run)
    python3 build.py --fix     — vérifie et tente de réparer les checks KO

Chaque CHECK définit :
  - description  : ce que le check garantit
  - verify       : pattern qui DOIT être présent dans le template
  - old          : (optionnel) pattern à remplacer si verify est absent
  - new          : (optionnel) remplacement à appliquer

Historique des patches :
  patch_wifi.py          — wifi_router : isRouter, DT, mkDev, renderDevs, renderLinks, showProps, simPing, addLink
  patch_dhcp_wifi.py     — simDHCP : wifi_router reconnu comme serveur DHCP
  patch_wifi_bridge.py   — simPing : pont WiFi (deux clients sur même wifi_router)
  patch_coherence.py     — 7 bugs de cohérence builder↔template
  inline Python (session précédente) — animPath, doTrace, doPing, dns_success
  patch_format_v2.py     — loadTopology : migration format v2 (builder) → v1
"""
import sys, base64, re, textwrap

SRC = "/sessions/intelligent-dreamy-mccarthy/mnt/simulation réseau/scorm-builder.html"
FIX_MODE = "--fix" in sys.argv

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
# Définition des checks
# ─────────────────────────────────────────────────────────────────────────────
# Chaque check : (description, verify_pattern, old_pattern_or_None, new_pattern_or_None)
# Si old/new sont None, le check est read-only (aucune réparation automatique possible).
CHECKS = [

    # ── WiFi router : fonctionnalités de base (patch_wifi.py) ────────────────
    (
        "isRouter() reconnaît wifi_router",
        "d.type==='wifi_router'",
        None, None  # trop de contexte, correction manuelle si absent
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

    # ── simDHCP : DHCP sur wifi_router (patch_dhcp_wifi.py) ─────────────────
    (
        "simDHCP reconnaît wifi_router comme serveur DHCP",
        "(d.type==='server'||d.type==='wifi_router')&&d.dhcp&&d.dhcp.on",
        "if(d&&d.type==='server'&&d.dhcp&&d.dhcp.on)dhcpSrv=d;",
        "if(d&&(d.type==='server'||d.type==='wifi_router')&&d.dhcp&&d.dhcp.on)dhcpSrv=d;"
    ),

    # ── simPing : pont WiFi (patch_wifi_bridge.py) ───────────────────────────
    (
        "simPing : pont WiFi entre deux clients du même wifi_router",
        "var sharedWifi=null;",
        None, None
    ),

    # ── simPing : chemin internet utilise des IDs (patch_coherence Bug2) ─────
    (
        "simPing internet : path contient des IDs (pas des noms)",
        "path:[src.id,_ir.router.id,_ir.inet.id]",
        "path:[src.name,_ir.router.name,_ir.inet.name],lat:32,internet:true}",
        "path:[src.id,_ir.router.id,_ir.inet.id],lat:32,internet:true}"
    ),

    # ── animPath : déclenché aussi pour les pings WiFi ────────────────────────
    (
        "animPath déclenché pour res.wifi (ping WiFi) et res.router",
        "if(res.router||res.wifi)",
        "if(res.router)\nanimPath(res.path);",
        "if(res.router||res.wifi)\nanimPath(res.path);"
    ),

    # ── doPing : chemin affiché avec noms (pas IDs) ──────────────────────────
    (
        "doPing : pathNames resolves IDs → noms d'appareils",
        "res.path.map(function(id){return S.devs[id]?S.devs[id].name:id;})",
        None, None
    ),

    # ── doPing : dns_success déclenché après résolution DNS ─────────────────
    (
        "doPing : checkDynamicObjective dns_success appelé",
        "checkDynamicObjective('dns_success'",
        None, None
    ),

    # ── doTrace : utilise les IDs (pas les noms) ─────────────────────────────
    (
        "doTrace : résout les IDs en noms d'appareils",
        "var dv=S.devs[id];",
        None, None
    ),

    # ── loadTopology : migration format v2 builder → template ────────────────
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

    # ── devByName : normalisation casse/espaces (patch_coherence Bug3) ───────
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

    # ── dns_configured : logique correcte (patch_coherence Bug4 + complément) ──
    # Règle : si fi.dns vide → false ; si p.dns spécifié et différent → false
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

    # ── cwDrop : checkAllObjectives après dépôt (patch_coherence Bug5) ───────
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

    # ── toggleDHCPMode : checkAllObjectives (patch_coherence Bug6) ───────────
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

    # ── setMode : wifi_router désactivé en simulation (patch_coherence Bug7) ─
    (
        "setMode : wifi_router désactivé dans la palette en mode simulation",
        "'wifi_router','internet','frame','anntext'",
        "['pc','server','switch','router','internet','frame','anntext'].forEach(function(t){",
        "['pc','server','switch','router','wifi_router','internet','frame','anntext'].forEach(function(t){"
    ),

    # ── Bug1 : double-quote corrigée dans showProps HTTP ─────────────────────
    # Pattern attendu après fix (bytes 2b 27 5c 27 5d 2e 68 74 74 70 2e 74 69 74 6c 65)
    # = +'\''].http.title  (une seule \' avant ] — pas deux)
    (
        "showProps HTTP : pas de double-quote dans les handlers onchange",
        "+'\\'].http.title",
        None, None  # fix byte-level — voir patch_coherence.py Bug1a
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
        # Essayer de réparer
        if FIX_MODE and old_pat and new_pat:
            count_old = tpl_modified.count(old_pat)
            if count_old == 1:
                tpl_modified = tpl_modified.replace(old_pat, new_pat, 1)
                # Vérifier que le patch a bien introduit le pattern attendu
                if verify_pat in tpl_modified:
                    results.append(("FIXED", desc))
                    print(f"  🔧  {desc}  [RÉPARÉ]")
                else:
                    results.append(("ERR", desc))
                    print(f"  ✗  {desc}  [RÉPARATION ÉCHOUÉE : verify_pat absent après remplacement]")
            elif count_old == 0:
                results.append(("ERR", desc))
                print(f"  ✗  {desc}  [NI old NI new pattern trouvé — intervention manuelle requise]")
            else:
                results.append(("ERR", desc))
                print(f"  ✗  {desc}  [old_pat ambigu ({count_old} occurrences) — intervention manuelle requise]")
        else:
            results.append(("KO", desc))
            if FIX_MODE and not old_pat:
                print(f"  ✗  {desc}  [MANQUANT — pas de réparation automatique disponible]")
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
    print()

# ─────────────────────────────────────────────────────────────────────────────
# Sauvegarde si des réparations ont été appliquées
# ─────────────────────────────────────────────────────────────────────────────
if fixed_count > 0:
    new_b64 = base64.b64encode(tpl_modified.encode('utf-8')).decode('ascii')
    assert '\n' not in new_b64, "b64 re-encodé contient des newlines"
    html_out = html[:b64_match.start(1)] + new_b64 + html[b64_match.end(1):]
    with open(SRC, 'w', encoding='utf-8') as f:
        f.write(html_out)
    print(f"  💾  Fichier mis à jour : {len(html_out)} chars")
elif FIX_MODE and fixed_count == 0 and ko_count == 0:
    print("  ✓  Rien à réparer.")

sys.exit(0 if ko_count == 0 else 1)
