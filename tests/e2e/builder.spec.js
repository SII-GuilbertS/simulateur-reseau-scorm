/* Parcours réels dans Chrome : ce que tests/sim-tests.js ne peut pas vérifier
   (interface du builder, fichiers exportés, dialogue avec un LMS depuis une iframe).

   Lancement : npm --prefix tests/e2e test */
const { test: base, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const JSZip = require('jszip');

const ROOT = path.resolve(__dirname, '..', '..');
const BUILDER_URL = pathToFileURL(path.join(ROOT, 'scorm-builder.html')).href;
const JSZIP_FILE = require.resolve('jszip/dist/jszip.min.js');
const LMS = 'http://lms.test';

const scenarioPath = (name) => path.join(ROOT, 'scenarios', name + '.json');
const readScenario = (name) => JSON.parse(fs.readFileSync(scenarioPath(name), 'utf8'));

/* Score affiché à l'élève à l'ouverture de l'export, pannes appliquées et rien de corrigé. */
const SCENARIOS = [
  { name: 'reseau-maison', startScore: 55, mastery: 60 },
  { name: 'reseau-entreprise', startScore: 51, mastery: 60 },
  { name: 'reseau-lycee', startScore: 43, mastery: 65 },
  { name: 'reseau-college', startScore: 0, mastery: 60 },
];

/* Sous file://, l'export élève tente de relire son propre index.html : Chrome le refuse
   et le code l'attend (.catch). C'est la seule erreur console tolérée. */
const isExpectedConsoleError = (msg) => {
  const url = msg.location().url || '';
  const text = msg.text();
  return (text.startsWith("Access to fetch at 'file:") && text.includes("/index.html' from origin 'null'"))
    || (text.startsWith('Failed to load resource') && url.startsWith('file:') && url.endsWith('/index.html'));
};

/* Chaque page est surveillée : toute erreur JavaScript fait échouer le test qui l'a provoquée.
   Les dialogues sont notés et acceptés (Playwright les refuserait sinon, ce qui annulerait
   les exports). Un test peut changer ce choix avec page.dialogAction = 'dismiss'. */
function watch(page, problems) {
  page.dialogs = [];
  page.dialogAction = 'accept';
  page.on('pageerror', (err) => problems.push('pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isExpectedConsoleError(msg)) {
      problems.push('console: ' + msg.text());
    }
  });
  page.on('dialog', async (dialog) => {
    page.dialogs.push(dialog.message());
    await (page.dialogAction === 'accept' ? dialog.accept() : dialog.dismiss());
  });
  // JSZip vient d'un CDN : on sert la même version en local pour que les tests marchent hors ligne.
  return page.route('https://cdnjs.cloudflare.com/ajax/libs/jszip/**', (route) =>
    route.fulfill({ path: JSZIP_FILE, contentType: 'text/javascript' }));
}

const test = base.extend({
  problems: async ({}, use) => {
    const problems = [];
    await use(problems);
    expect(problems, 'erreurs JavaScript pendant le test').toEqual([]);
  },
  page: async ({ page, problems }, use) => {
    await watch(page, problems);
    await use(page);
  },
});

/* ── Builder ─────────────────────────────────────────────────────────── */

async function openBuilderWith(page, scenario) {
  await page.goto(BUILDER_URL);
  await page.locator('#gen-import-file').setInputFiles(scenarioPath(scenario));
  await expect(page.locator('.bld-tab[data-tab="1"]')).toHaveClass(/active/);
}

const builderScore = (page) => page.locator('#hdr-score');

async function download(page, action, file) {
  const pending = page.waitForEvent('download');
  await action();
  const dl = await pending;
  await dl.saveAs(file);
  return file;
}

async function exportFile(page, kind, file) {
  await page.locator('.bld-tab[data-tab="3"]').click();
  const fn = { html: 'generateHtml', scorm: 'generate', scenario: 'exportScenario' }[kind];
  return download(page, () => page.locator(`button[onclick="GenModule.${fn}()"]`).click(), file);
}

async function runInTerminal(page, deviceName, command) {
  const id = await deviceId(page, deviceName);
  await page.locator(`#gd${id}`).click();
  await expect(page.locator('#tprompt')).toContainText(deviceName.toLowerCase());
  await page.locator('#tinput').fill(command);
  await page.locator('#tinput').press('Enter');
}

/* ── Vue élève ───────────────────────────────────────────────────────── */

/* scope : la page, ou l'iframe du LMS (un FrameLocator n'a pas de evaluate). */
const deviceId = (scope, name) => scope.locator('body').evaluate(
  (_, n) => Object.keys(S.devs).find((k) => S.devs[k].name === n), name);

async function setGateway(scope, deviceName, value) {
  const id = await deviceId(scope, deviceName);
  await scope.locator(`#gd${id}`).click();
  const input = scope.locator('.pr', { hasText: 'Passerelle' }).locator('input').first();
  await input.fill(value);
  await input.press('Tab');
}

/* Pas de contrôle de l'icône : elle change au premier recalcul du score. */
const studentScore = (scope, score) =>
  expect(scope.locator('#hdr-score')).toHaveText(new RegExp(`Score : ${score} / 100$`));

const finish = (scope) => scope.locator('.fbtn', { hasText: 'Terminer' }).click();

/* ── LMS simulé : la page parente expose l'API SCORM 1.2, le package tourne dans une iframe ── */

async function openInLms(page, zipFile, cmi = {}) {
  const zip = await JSZip.loadAsync(fs.readFileSync(zipFile));
  const indexHtml = await zip.file('index.html').async('string');
  await page.route(LMS + '/**', (route) => {
    if (route.request().url().endsWith('/sco/index.html')) {
      return route.fulfill({ body: indexHtml, contentType: 'text/html; charset=utf-8' });
    }
    return route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><script>
        window.cmi = ${JSON.stringify(cmi).replace(/</g, '\\u003c')};
        window.lmsCalls = [];
        window.API = {
          LMSInitialize() { lmsCalls.push('Initialize'); return 'true'; },
          LMSFinish() { lmsCalls.push('Finish'); return 'true'; },
          LMSGetValue(k) { return cmi[k] === undefined ? '' : cmi[k]; },
          LMSSetValue(k, v) { cmi[k] = String(v); return 'true'; },
          LMSCommit() { lmsCalls.push('Commit'); return 'true'; },
          LMSGetLastError() { return '0'; },
          LMSGetErrorString() { return ''; },
          LMSGetDiagnostic() { return ''; },
        };
      </script><iframe id="sco" src="/sco/index.html" style="width:1380px;height:880px;border:0"></iframe>`,
    });
  });
  await page.goto(LMS + '/player.html');
  return page.frameLocator('#sco');
}

const readCmi = (page) => page.evaluate(() => window.cmi);

/* Quitter l'activité : l'iframe est déchargée, comme quand l'élève revient au cours sur Moodle. */
async function leaveActivity(page) {
  await page.evaluate(() => new Promise((resolve) => {
    const frame = document.getElementById('sco');
    frame.addEventListener('load', resolve, { once: true });
    frame.src = 'about:blank';
  }));
}

/* ═══════════════════════════════════════════════════════════════════════ */

test.describe('Import et export de chaque scénario', () => {
  for (const { name, startScore, mastery } of SCENARIOS) {
    test(`${name} : import, export HTML, score de départ ${startScore} (seuil ${mastery})`, async ({ page }, info) => {
      const data = readScenario(name);
      await openBuilderWith(page, name);

      await page.locator('.bld-tab[data-tab="3"]').click();
      await expect(page.locator('#gen-s-devs')).toHaveText(`${Object.keys(data.network.devs).length} appareil(s)`);
      await expect(page.locator('#gen-s-objs')).toHaveText(`${data.activity.objectives.length} objectif(s)`);
      await expect(page.locator('#gen-s-pts')).toHaveText(`100 pt — seuil ${mastery}%`);

      const file = await exportFile(page, 'html', info.outputPath(name + '.html'));
      expect(page.dialogs, 'aucun avertissement : l\'élève ne réussit pas d\'office').toEqual([]);
      await page.goto(pathToFileURL(file).href);

      await studentScore(page, startScore);
      await expect(page.locator('#btn-activ-tab')).toBeVisible();
      await expect(page.locator('.activ-obj')).toHaveCount(data.activity.objectives.length);
      await expect(page.locator('#activ-pane')).toContainText('Mode Panne');

      // Sans rien réparer, le bilan ne doit jamais annoncer une réussite.
      await finish(page);
      await expect.poll(() => page.dialogs.at(-1)).toContain('À améliorer');
      expect(page.dialogs.at(-1)).not.toContain('RÉUSSI');
      expect(page.dialogs.at(-1)).not.toContain('NaN');
    });
  }

  test('les encadrés et textes du scénario du collège survivent à l\'export', async ({ page }, info) => {
    const { network } = readScenario('reseau-college');
    await openBuilderWith(page, 'reseau-college');
    const file = await exportFile(page, 'html', info.outputPath('college.html'));
    await page.goto(pathToFileURL(file).href);
    await studentScore(page, 0);
    const counts = await page.evaluate(() => ({
      frames: Object.keys(S.frames || {}).length,
      texts: Object.keys(S.texts || {}).length,
    }));
    expect(counts).toEqual({
      frames: Object.keys(network.frames || {}).length,
      texts: Object.keys(network.texts || {}).length,
    });
    expect(counts.frames).toBeGreaterThan(0);
  });
});

test.describe('Vue élève (export HTML)', () => {
  test('réparer la panne de reseau-maison donne 100, conservé après rechargement', async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-maison');
    const file = await exportFile(page, 'html', info.outputPath('maison.html'));
    await page.goto(pathToFileURL(file).href);
    await studentScore(page, 55);

    await setGateway(page, 'PC-Bureau', '192.168.1.1');
    await studentScore(page, 100);

    await page.reload();
    await studentScore(page, 100);
    const gateway = await page.evaluate(() =>
      Object.values(S.devs).find((d) => d.name === 'PC-Bureau').ifaces[0].gateway);
    expect(gateway).toBe('192.168.1.1');

    await finish(page);
    await expect.poll(() => page.dialogs.at(-1)).toContain('RÉUSSI');
  });
});

test.describe('Builder', () => {
  test('nslookup en majuscules ne valide l\'objectif que depuis le bon appareil', async ({ page }) => {
    await openBuilderWith(page, 'reseau-lycee');
    await expect(builderScore(page)).toHaveText('📊 Score : 77 / 100 pts');
    await page.locator('#btn-sim').click();

    await runInTerminal(page, 'PC-Salle2', 'nslookup LYCEE.LOCAL');
    await expect(page.locator('#tout')).toContainText('192.168.1.100');
    await expect(builderScore(page)).toHaveText('📊 Score : 77 / 100 pts');

    await runInTerminal(page, 'PC-Salle1', 'nslookup LYCEE.LOCAL');
    await expect(builderScore(page)).toHaveText('📊 Score : 80 / 100 pts');
  });

  /* Variantes de reseau-lycee où l'élève réussirait sans rien faire. Les objectifs statiques valent
     83 points, dont 6 pour la route de Routeur-Principal, et la panne de PC-Salle1 en retire 3.
     Ces scores exigent donc les pannes, les routes et le respect de la case « routage automatique ». */
  const MINOR_FAULT = { id: 1, type: 'bad_gateway', dev: 'PC-Salle1', badValue: '10.0.0.9' };
  const TOO_EASY = [
    { label: 'sans panne', faults: [], score: 83 },
    { label: 'avec une panne mineure', faults: [MINOR_FAULT], score: 80 },
    { label: 'routage automatique décoché, sans panne', faults: [], manualRouter: true, score: 77 },
    { label: 'routage automatique décoché, avec panne', faults: [MINOR_FAULT], manualRouter: true, score: 74 },
  ];

  for (const { label, faults, manualRouter, score } of TOO_EASY) {
    test(`avertissement à l'export si l'élève réussit d'office (${label}) : même score que l'activité`, async ({ page }, info) => {
      const data = readScenario('reseau-lycee');
      data.activity.faults = faults;
      if (manualRouter) {
        Object.values(data.network.devs).find((d) => d.name === 'Routeur-Principal').autoRouteEnabled = false;
      }
      const scenario = info.outputPath('trop-facile.json');
      fs.writeFileSync(scenario, JSON.stringify(data));

      await page.goto(BUILDER_URL);
      await page.locator('#gen-import-file').setInputFiles(scenario);
      const file = await exportFile(page, 'html', info.outputPath('trop-facile.html'));

      expect(page.dialogs.length).toBe(1);
      expect(page.dialogs[0]).toContain('il réussirait sans rien corriger');
      expect(page.dialogs[0]).toContain(`aurait déjà ${score} / 100 pour un seuil de 65 %`);

      // Le score annoncé au professeur est bien celui que l'élève verra.
      await page.goto(pathToFileURL(file).href);
      await studentScore(page, score);

      // « Recommencer » doit redonner exactement le même état de départ.
      await page.locator('#t-clear').click();
      await expect.poll(() => page.dialogs.at(-1)).toContain('Recommencer');
      await studentScore(page, score);
    });
  }

  test('annuler l\'avertissement n\'exporte rien', async ({ page }, info) => {
    const data = readScenario('reseau-lycee');
    data.activity.faults = [];
    const scenario = info.outputPath('trop-facile.json');
    fs.writeFileSync(scenario, JSON.stringify(data));
    await page.goto(BUILDER_URL);
    await page.locator('#gen-import-file').setInputFiles(scenario);
    await page.locator('.bld-tab[data-tab="3"]').click();

    page.dialogAction = 'dismiss';
    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    for (const fn of ['generateHtml', 'generate']) {
      await page.locator(`button[onclick="GenModule.${fn}()"]`).click();
    }
    await expect.poll(() => page.dialogs.length).toBe(2);
    await page.waitForTimeout(500);
    expect(downloaded).toBe(false);
  });

  test('le contrôle à l\'export ne modifie ni le réseau ni l\'écran du builder', async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-lycee');
    const snapshot = () => page.locator('body').evaluate(() => JSON.stringify({
      devs: S.devs, links: S.links, nid: S.nid, frames: S.frames, texts: S.texts,
      results: ACTIVITY_RESULTS, score: S.score, log: document.getElementById('lout').textContent,
    }));
    const before = await snapshot();
    await exportFile(page, 'html', info.outputPath('lycee.html'));
    expect(await snapshot()).toBe(before);
    await expect(page.locator('body')).not.toContainText('RIP :');
  });

  test('adresse en plage : contrainte générée, rédigée à la main, puis affichée à l\'élève', async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-college');
    await page.locator('.bld-tab[data-tab="2"]').click();
    const card = page.locator('[data-objid="5"]');
    await card.locator('.obj-card-hdr').click();
    const chk = card.locator('.obj-cons input[type="checkbox"]');
    const text = card.locator('.obj-cons textarea');

    // Adresse exacte : la contrainte donnerait la réponse, elle est masquée par défaut.
    await expect(chk).not.toBeChecked();

    await card.locator('.ipf select').selectOption('range');
    await card.locator('#ipr-e-5-ip').fill('20');
    await card.locator('#ipr-e-5-ip').press('Tab');
    await expect(chk).toBeChecked();
    await expect(text).toHaveValue('B210-P3 : adresse IP au choix entre 10.2.210.3 et 10.2.210.20 (adresse libre)');
    await expect(card.locator('.obj-cons-meta')).toContainText('généré à partir des paramètres');

    const mine = 'Prenez une adresse libre de la salle 210, entre .3 et .20.';
    await text.fill(mine);
    await text.press('Tab');
    await expect(card.locator('.obj-cons-meta')).toContainText('rédigé à la main');

    // Paramètres modifiés après coup : le texte manuel est gardé, mais signalé.
    await card.locator('#ipr-e-5-ip').fill('30');
    await card.locator('#ipr-e-5-ip').press('Tab');
    await expect(text).toHaveValue(mine);
    await expect(card.locator('.obj-cons-warn')).toContainText('10.2.210.30');

    await card.locator('.obj-cons-meta a').click();
    await expect(text).toHaveValue('B210-P3 : adresse IP au choix entre 10.2.210.3 et 10.2.210.30 (adresse libre)');
    await expect(card.locator('.obj-cons-warn')).toHaveCount(0);

    await text.fill(mine);
    await text.press('Tab');
    const file = await exportFile(page, 'html', info.outputPath('college-contrainte.html'));
    await page.goto(pathToFileURL(file).href);
    await expect(page.locator('.ao-constraint')).toHaveCount(1);
    await expect(page.locator('.ao-constraint')).toContainText(mine);
  });

  test('ping vers une adresse au choix : alerte, puis cible désignée par l\'appareil', async ({ page }) => {
    await openBuilderWith(page, 'reseau-college');
    await page.locator('.bld-tab[data-tab="2"]').click();
    const ipCard = page.locator('[data-objid="5"]');
    await ipCard.locator('.obj-card-hdr').click();
    await ipCard.locator('.ipf select').selectOption('range');
    await ipCard.locator('#ipr-e-5-ip').fill('20');
    await ipCard.locator('#ipr-e-5-ip').press('Tab');

    await page.locator('button[onclick="EvalModule.addObjective()"]').click();
    const card = page.locator('#ev-list .obj-card[data-objid]').last();
    await expect(card.locator('.obj-card-body')).toHaveClass(/open/);
    const target = card.locator('.bld-row', { hasText: 'Cible du ping' });
    await target.locator('.ipf > select').selectOption('exact');
    await target.locator('.ipf input').fill('10.2.210.5');
    await target.locator('.ipf input').press('Tab');
    await expect(card.locator('.obj-preview')).toContainText('au choix de l\'élève');

    await target.locator('.ipf > select').first().selectOption('ref');
    await expect(target.locator('.ipf-err')).toContainText('Choisissez un appareil');
    await target.locator('.ipf select').nth(1).selectOption('B210-P1');
    await expect(target.locator('.ipf-help')).toContainText('adresse actuelle de cet appareil');
    await expect(card.locator('.obj-preview')).not.toContainText('au choix de l\'élève');
    const to = await page.evaluate(() => EvalModule.getConfig().objectives.at(-1).params.to);
    expect(to).toBe('{B210-P1}');

    // Passerelle : le niveau « Routeur du réseau » est proposé et enregistré.
    await card.locator('.bld-row', { hasText: 'Type de vérification' }).locator('select').selectOption('gateway_configured');
    const gw = card.locator('.bld-row', { hasText: 'Passerelle' });
    await gw.locator('.ipf > select').selectOption('coherent');
    await expect(gw.locator('.ipf-help')).toContainText('routeur');
    const gateway = await page.evaluate(() => EvalModule.getConfig().objectives.at(-1).params.gateway);
    expect(gateway).toBe('@routeur');
  });

  test('plan d\'adressage : à compléter dans l\'énoncé, rempli dans le corrigé, désactivable', async ({ page, context }, info) => {
    await openBuilderWith(page, 'reseau-college');
    await page.locator('.bld-tab[data-tab="2"]').click();
    const card = page.locator('[data-objid="5"]');
    await card.locator('.obj-card-hdr').click();
    await card.locator('.ipf select').selectOption('range');
    await card.locator('#ipr-e-5-ip').fill('20');
    await card.locator('#ipr-e-5-ip').press('Tab');
    await page.locator('.bld-tab[data-tab="3"]').click();

    const open = async (selector) => {
      const pending = context.waitForEvent('page');
      await page.locator(selector).click();
      const doc = await pending;
      await doc.waitForLoadState();
      return doc;
    };
    const rows = (doc) => doc.locator('table.plan tbody tr');

    const enonce = await open('button[onclick="GenModule.generateEnonce()"]');
    await expect(enonce.locator('h2', { hasText: 'Plan d\'adressage' })).toBeVisible();
    await expect(rows(enonce)).toHaveCount(2);
    const added = rows(enonce).filter({ hasText: 'B210-P3' });
    await expect(added).toContainText('à ajouter');
    await expect(added).toContainText('Salle 210');
    await expect(added).toContainText('entre 10.2.210.3 et .20');
    // Valeur exacte : la réponse n'est pas donnée à l'élève.
    await expect(rows(enonce).filter({ hasText: 'B105-P2' })).not.toContainText('10.2.105.2');
    await enonce.screenshot({ path: info.outputPath('enonce.png'), fullPage: true });
    await enonce.close();

    const corrige = await open('.gen-btn-corrige');
    await expect(corrige.locator('.teacher-banner')).toContainText('Document enseignant');
    await expect(corrige.locator('.student-grid')).toHaveCount(0);
    await expect(rows(corrige).filter({ hasText: 'B105-P2' })).toContainText('10.2.105.2');
    await expect(rows(corrige).filter({ hasText: 'B210-P3' })).toContainText('pas de solution dans le réseau actuel');
    await corrige.screenshot({ path: info.outputPath('corrige.png'), fullPage: true });
    await corrige.close();

    await page.locator('#gen-plan').uncheck();
    const sansPlan = await open('button[onclick="GenModule.generateEnonce()"]');
    await expect(sansPlan.locator('h2', { hasText: 'Objectifs' })).toBeVisible();
    await expect(sansPlan.locator('table.plan')).toHaveCount(0);
    await sansPlan.close();
  });

  test('objectifs et pannes dans une seule liste : ordre libre, conservé à l\'export et chez l\'élève', async ({ page }, info) => {
    const { activity } = readScenario('reseau-lycee');
    await openBuilderWith(page, 'reseau-lycee');
    await page.locator('.bld-tab[data-tab="2"]').click();
    const cards = page.locator('#ev-list .obj-card');
    const keys = () => cards.evaluateAll((els) => els.map((e) => e.dataset.key));
    await expect(cards).toHaveCount(activity.objectives.length + activity.faults.length);
    await expect(page.locator('#ev-obj-count')).toHaveText(String(activity.objectives.length));
    await expect(page.locator('#ev-fault-count')).toHaveText(String(activity.faults.length));

    // Sans ordre enregistré : les objectifs, puis les pannes (pastilles rouges P1, P2…)
    const p1 = page.locator('[data-fltid="1"]');
    await expect(p1.locator('.obj-num.fault')).toHaveText('P1');
    expect((await keys()).indexOf('f:1')).toBe(activity.objectives.length);

    // Flèches : la panne remonte entre deux objectifs
    await p1.locator('.ev-move button[title="Monter"]').click();
    await p1.locator('.ev-move button[title="Monter"]').click();
    expect((await keys()).indexOf('f:1')).toBe(activity.objectives.length - 2);

    // Glisser-déposer : le 2e objectif passe au-dessus du 1er et devient le n° 1
    const last = activity.objectives[1];
    await page.locator(`[data-objid="${last.id}"] .ev-handle`)
      .dragTo(page.locator('[data-objid="1"]'), { targetPosition: { x: 60, y: 4 } });
    expect((await keys())[0]).toBe(`o:${last.id}`);
    await expect(page.locator(`[data-objid="${last.id}"] .obj-num`)).toHaveText('1');
    await page.locator('#ev-list').screenshot({ path: info.outputPath('liste.png') });

    // Ajout : nouvelle panne en fin de liste, ouverte
    await page.locator('button[onclick="EvalModule.addFault()"]').click();
    await expect(cards.last().locator('.obj-num.fault')).toHaveText(`P${activity.faults.length + 1}`);
    await expect(cards.last().locator('.obj-card-body')).toHaveClass(/open/);
    await cards.last().locator('.obj-card-del').click();

    // Export puis réimport du scénario : même ordre
    const order = await keys();
    const file = await exportFile(page, 'scenario', info.outputPath('lycee-ordre.json'));
    const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(exported.activity.evalOrder).toEqual(order);
    expect(String(exported.activity.objectives[0].id)).toBe(String(last.id));
    await page.goto(BUILDER_URL);
    await page.locator('#gen-import-file').setInputFiles(file);
    await page.locator('.bld-tab[data-tab="2"]').click();
    expect(await keys()).toEqual(order);

    // L'élève voit les objectifs dans cet ordre
    const html = await exportFile(page, 'html', info.outputPath('lycee-ordre.html'));
    await page.goto(pathToFileURL(html).href);
    await expect(page.locator('.activ-obj').first()).toContainText(last.label);
  });

  test('ping depuis un poste à ajouter : proposé dans la liste, alerte si placé avant, validé chez l\'élève', async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-college');
    await page.locator('.bld-tab[data-tab="2"]').click();
    await page.locator('button[onclick="EvalModule.addObjective()"]').click();
    const card = page.locator('#ev-list .obj-card[data-objid]').last();
    const id = await card.getAttribute('data-objid');
    await card.locator('.bld-row', { hasText: 'Label' }).locator('input').fill('Ping depuis le nouveau poste');
    await card.locator('.bld-row', { hasText: 'Label' }).locator('input').press('Tab');

    // Le poste demandé par l'objectif « Poste ajouté » (placé au-dessus) est proposé.
    const from = card.locator('select[onchange*="param_from"]');
    await expect(from.locator('optgroup[label="À ajouter par l\'élève"] option')).toHaveText(['B210-P3 (à ajouter par l\'élève)']);
    await from.selectOption('B210-P3');
    const target = card.locator('.bld-row', { hasText: 'Cible du ping' });
    await target.locator('.ipf > select').selectOption('ref');
    await target.locator('.ipf select').nth(1).selectOption('B210-P1');
    await expect(card.locator('.obj-preview')).not.toContainText('n\'existe pas');

    // Placé au-dessus du « Poste ajouté » : nom gardé, signalé introuvable, alerte.
    const up = () => page.locator(`[data-objid="${id}"] .ev-move button[title="Monter"]`).click();
    const keys = () => page.locator('#ev-list .obj-card').evaluateAll((els) => els.map((e) => e.dataset.key));
    while ((await keys()).indexOf(`o:${id}`) > (await keys()).indexOf('o:3')) await up();
    const moved = page.locator(`[data-objid="${id}"]`);
    await moved.locator('.obj-card-hdr').click();
    await expect(moved.locator('select[onchange*="param_from"] option:checked')).toHaveText('B210-P3 (introuvable)');
    await expect(moved.locator('.obj-preview')).toContainText('B210-P3 n\'existe pas dans le réseau');

    // Remis en dessous : plus d'alerte.
    await moved.locator('.ev-move button[title="Descendre"]').click();
    await expect(moved.locator('.obj-preview')).not.toContainText('n\'existe pas');

    // Chez l'élève : poste ajouté, nommé en minuscules, configuré, ping réussi.
    const file = await exportFile(page, 'html', info.outputPath('college-ping.html'));
    await page.goto(pathToFileURL(file).href);
    await page.evaluate(() => {
      const sw = Object.keys(S.devs).find((k) => S.devs[k].name === 'SW-B210');
      const pc = mkDev('pc', 900, 500);
      S.devs[pc].name = 'b210-p3';
      Object.assign(S.devs[pc].ifaces[0], { ip: '10.2.210.3', mask: '255.255.255.0' });
      addLink(pc, sw);
      render();
    });
    // Côté élève, l'appareil du terminal se choisit dans la liste du terminal.
    await page.locator('.bt', { hasText: 'Terminal' }).click();
    await page.locator('#td-sel').selectOption({ label: 'b210-p3' });
    await page.locator('#tinput').fill('ping 10.2.210.1');
    await page.locator('#tinput').press('Enter');
    await page.locator('#btn-activ-tab').click();
    await expect(page.locator('.activ-obj', { hasText: 'Ping depuis le nouveau poste' })).toHaveClass(/done/);
  });

  test('un scénario exporté puis réimporté reste identique', async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-lycee');
    const file = await exportFile(page, 'scenario', info.outputPath('lycee-export.json'));

    const original = readScenario('reseau-lycee');
    const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
    const names = (s) => Object.values(s.network.devs).map((d) => d.name).sort();
    expect(names(exported)).toEqual(names(original));
    expect(Object.keys(exported.network.links).length).toBe(Object.keys(original.network.links).length);
    expect(exported.activity.masteryscore).toBe(original.activity.masteryscore);
    const summary = (s) => s.activity.objectives.map((o) => [String(o.id), o.points, o.check]);
    expect(summary(exported)).toEqual(summary(original));
    expect(exported.activity.faults.length).toBe(original.activity.faults.length);

    await page.goto(BUILDER_URL);
    await page.locator('#gen-import-file').setInputFiles(file);
    await expect(builderScore(page)).toHaveText('📊 Score : 77 / 100 pts');
  });
});

test.describe('Package SCORM dans un LMS simulé', () => {
  test.beforeEach(async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-maison');
    page.zipFile = await exportFile(page, 'scorm', info.outputPath('maison.zip'));
  });

  test('le ZIP contient le manifeste SCORM 1.2 et le seuil du scénario', async ({ page }) => {
    const zip = await JSZip.loadAsync(fs.readFileSync(page.zipFile));
    expect(Object.keys(zip.files).sort()).toEqual(['imsmanifest.xml', 'index.html']);
    const manifest = await zip.file('imsmanifest.xml').async('string');
    expect(manifest).toContain('<schemaversion>1.2</schemaversion>');
    expect(manifest).toContain('<adlcp:masteryscore>60</adlcp:masteryscore>');
    expect(manifest).toContain('href="index.html"');
  });

  test('sans réparation : statut failed et note de 55 transmis au LMS', async ({ page }) => {
    const sco = await openInLms(page, page.zipFile);
    await studentScore(sco, 55);
    expect((await readCmi(page))['cmi.core.lesson_status']).toBe('incomplete');

    await finish(sco);
    await expect.poll(() => page.dialogs.at(-1)).toContain('À améliorer');
    const cmi = await readCmi(page);
    expect(cmi['cmi.core.lesson_status']).toBe('failed');
    expect(cmi['cmi.core.score.raw']).toBe('55');
    expect(await page.evaluate(() => window.lmsCalls)).toContain('Finish');
  });

  test('reprise : quitter, revenir sur un autre poste, terminer avec passed et 100', async ({ page, browser, problems }, info) => {
    const sco = await openInLms(page, page.zipFile);
    await studentScore(sco, 55);
    await setGateway(sco, 'PC-Bureau', '192.168.1.1');
    await studentScore(sco, 100);
    await leaveActivity(page);

    const saved = await readCmi(page);
    expect(saved['cmi.core.score.raw']).toBe('100');
    expect(saved['cmi.suspend_data'], 'progression envoyée au LMS en quittant').toBeTruthy();
    await info.attach('taille de suspend_data', { body: String(saved['cmi.suspend_data'].length) });

    // Nouveau contexte = localStorage vide : la reprise ne peut venir que du LMS.
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page2 = await context.newPage();
    await watch(page2, problems);
    const sco2 = await openInLms(page2, page.zipFile, saved);
    await studentScore(sco2, 100);

    await finish(sco2);
    await expect.poll(() => page2.dialogs.at(-1)).toContain('RÉUSSI');
    const cmi = await readCmi(page2);
    expect(cmi['cmi.core.lesson_status']).toBe('passed');
    expect(cmi['cmi.core.score.raw']).toBe('100');
    await context.close();
  });
});
