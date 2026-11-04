#!/usr/bin/env python3
"""
build_site.py — Met à jour le dossier site/, prêt à envoyer chez l'hébergeur.

Usage : python3 tools/build_site.py

site/index.html et site/assets/ sont maintenus à la main. Tout le reste est
recopié ou généré depuis les sources du projet, à ne pas modifier dans site/.
Les démos appliquent à STUDENT_TEMPLATE les mêmes substitutions que le bouton
« Exporter en HTML » du builder (generateHtml dans scorm-builder.html).
"""
import base64, json, pathlib, re, shutil, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / 'site'
DEMOS = ['reseau-maison', 'reseau-college', 'reseau-entreprise', 'reseau-lycee']
# Chemins sources ; le site les publie à plat, sous leur seul nom de fichier.
COPIES = ['scorm-builder.html', 'docs/doc-prof.pdf', 'docs/doc-eleve.pdf']


def student_template():
    html = (ROOT / 'scorm-builder.html').read_text(encoding='utf-8')
    m = re.search(r'var b64 = "([A-Za-z0-9+/=\n]+)";', html)
    if not m:
        sys.exit('STUDENT_TEMPLATE introuvable dans scorm-builder.html')
    return base64.b64decode(m.group(1).replace('\n', '')).decode('utf-8')


def substitute(text, pattern, replacement):
    """Remplace une seule occurrence ; une absence signale un template modifié."""
    new, count = re.subn(pattern, lambda _: replacement, text, count=1)
    if count != 1:
        sys.exit(f'Motif absent du template : {pattern}')
    return new


def js_literal(value):
    # « </ » échappé pour qu'une chaîne ne puisse pas fermer le <script>.
    return json.dumps(value, ensure_ascii=False).replace('</', '<\\/')


def normalize(activity):
    """Même normalisation qu'EvalModule.setConfig à l'import d'un scénario."""
    def fault(f):
        params = f.get('params') or {k: v for k, v in f.items()
                                     if k not in ('id', 'type', 'label')}
        return {'id': str(f['id']), 'type': f.get('type', ''),
                'label': f.get('label', ''), 'params': params}
    return {**activity,
            'objectives': [{**o, 'id': str(o['id'])} for o in activity.get('objectives', [])],
            'faults': [fault(f) for f in activity.get('faults', [])]}


def build_demo(template, name):
    data = json.loads((ROOT / 'scenarios' / f'{name}.json').read_text(encoding='utf-8'))
    net = data['network']
    starter = js_literal({'devs': net['devs'], 'links': net['links'], 'nid': net['nid'],
                          'frames': net.get('frames', {}), 'texts': net.get('texts', {})})
    activity = js_literal(normalize(data['activity']))
    pwd = data.get('teacherPwd', 'prof').replace("'", "\\'")
    key = f'sim_reseau_demo_{name}'

    html = substitute(template, r'var STARTER_NETWORK = null; /\* __STARTER__ \*/',
                      f'var STARTER_NETWORK = {starter}; /* __STARTER__ */')
    html = substitute(html, r'var ACTIVITY_CONFIG = null; /\* __ACTIVITY__ \*/',
                      f'var ACTIVITY_CONFIG = {activity}; /* __ACTIVITY__ */')
    html = substitute(html, r"var TEACHER_PWD = '[^']*'; /\* __TEACHER_PWD__ \*/",
                      f"var TEACHER_PWD = '{pwd}'; /* __TEACHER_PWD__ */")
    html = substitute(html, r"SESSION_KEY='sim_reseau_v2'", f"SESSION_KEY='{key}'")

    inject = ('\n<script id="sim-builder-inject">\n'
              f'STARTER_NETWORK = {starter};\n'
              f'ACTIVITY_CONFIG = {activity};\n'
              f"TEACHER_PWD = '{pwd}';\n"
              f"SESSION_KEY = '{key}';\n"
              '</script>\n')
    return substitute(html, r'</body>', inject + '</body>')


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    for required in ('index.html', 'assets'):
        if not (SITE / required).exists():
            sys.exit(f'Manquant : site/{required}')

    template = student_template()

    # Repart de zéro : un scénario retiré ne doit pas rester en ligne.
    for generated in ('demo', 'scenarios'):
        shutil.rmtree(SITE / generated, ignore_errors=True)

    for source in COPIES:
        name = pathlib.PurePosixPath(source).name
        shutil.copy2(ROOT / source, SITE / name)
        print(f'OK  site/{name}')

    (SITE / 'scenarios').mkdir()
    for name in DEMOS:
        shutil.copy2(ROOT / 'scenarios' / f'{name}.json', SITE / 'scenarios' / f'{name}.json')
        # Un dossier par démo : le mode enseignant relit ./index.html pour
        # générer le SCORM, comme dans un package exporté.
        out = SITE / 'demo' / name / 'index.html'
        out.parent.mkdir(parents=True)
        out.write_text(build_demo(template, name), encoding='utf-8', newline='\n')
        print(f'OK  site/demo/{name}/index.html + site/scenarios/{name}.json')

    print('\nDossier site/ à jour : envoyez son contenu chez votre hébergeur.')


if __name__ == '__main__':
    main()
