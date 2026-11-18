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

/* Score affiché à l'élève à l'ouverture de l'export, pannes appliquées et rien de corrigé :
   tout point se gagne en réparant, en construisant ou en le prouvant par une commande. */
const SCENARIOS = [
  { name: 'reseau-maison', startScore: 0, mastery: 60 },
  { name: 'reseau-entreprise', startScore: 0, mastery: 60 },
  { name: 'reseau-lycee', startScore: 0, mastery: 65 },
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

/* Importe un scénario et attend la fin réelle de l'import (lecture du fichier, puis réévaluation) :
   cliquer sur un autre onglet avant cette fin serait annulé par l'import. */
async function importScenarioFile(page, file) {
  await page.evaluate(() => document.querySelectorAll('.bld-notif').forEach((n) => n.remove()));
  await page.locator('#gen-import-file').setInputFiles(file);
  await expect(page.locator('.bld-notif', { hasText: 'importé' })).toBeVisible();
}

async function openBuilderWith(page, scenario) {
  await page.goto(BUILDER_URL);
  await importScenarioFile(page, scenarioPath(scenario));
  await expect(page.locator('#hdr-score')).toBeVisible();
}

/* Bandeau du bas, onglet « 🎯 Évaluation » (vue Corrigé) : objectifs, pannes, informations de l'activité. */
async function openEval(page) {
  if (!(await page.locator('#bt-eval').isVisible())) await page.locator('#btn-cfg').click();
  if (await page.locator('.bot.closed').count() || !(await page.locator('#bt-eval.active').count())) await page.locator('#bt-eval').click();
  await expect(page.locator('#tp-eval')).toBeVisible();
}
/* Replie le bandeau pour rendre tout le schéma (ce que faisait le retour à l'onglet Réseau). */
async function closeEval(page) {
  if (!(await page.locator('.bot.closed').count())) await page.locator('#bot-toggle').click();
  await expect(page.locator('.bot')).toHaveClass(/closed/);
}

const builderScore = (page) => page.locator('#hdr-score');
/* Vue Corrigé : pas de score, mais l'état du corrigé ; le départ de l'élève est dans le bandeau. */
const corrigeComplet = (page) => expect(builderScore(page)).toHaveText(/^✅ Corrigé complet/);
const departZero = (page) => expect(page.locator('#ctl-banner')).toContainText('Départ élève : 0 / 100');

async function download(page, action, file) {
  const pending = page.waitForEvent('download');
  await action();
  const dl = await pending;
  await dl.saveAs(file);
  return file;
}

/* Menu ☰ de la barre du haut : l'ouvre s'il est fermé, puis clique l'entrée demandée (id de l'entrée). */
async function menu(page, id) {
  if (!(await page.locator('#file-menu.open').count())) await page.locator('#menu-btn').click();
  await page.locator('#' + id).click();
}

async function exportFile(page, kind, file) {
  const id = { html: 'mi-html', scorm: 'mi-scorm', scenario: 'btn-save' }[kind];
  return download(page, () => menu(page, id), file);
}

const runInTerminal = (page, deviceName, command) => deskTerminal(page, deviceName, command);

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

/* Terminal et navigateur : ceux du bureau de l'appareil (le bandeau du bas n'en a plus). */
const studentTerminal = (scope, deviceName, command) => deskTerminal(scope, deviceName, command);
const studentBrowse = (scope, deviceName, url) => deskBrowse(scope, deviceName, url);

/* Bureau d'un appareil : double-clic, puis l'icône de l'application.
   Rend la fenêtre de l'appareil. */
async function openDeskApp(scope, deviceName, appLabel) {
  const id = await deviceId(scope, deviceName);
  // Les fenêtres ouvertes peuvent couvrir l'appareil : on les réduit d'abord dans le dock.
  for (const min of await scope.locator('.dwin .dw-min').all()) {
    if (await min.isVisible()) await min.click();
  }
  await scope.locator(`#gd${id}`).dblclick();
  const win = scope.locator(`#dwin-${id}`);
  await expect(win).toBeVisible();
  const home = win.locator('.dw-home');
  if (await home.isEnabled()) await home.click();
  await win.locator('.dico', { hasText: appLabel }).click();
  await expect(win.locator('.abar')).toContainText(appLabel);
  return win;
}

async function deskTerminal(scope, deviceName, command) {
  const win = await openDeskApp(scope, deviceName, 'Invite de commandes');
  await win.locator('.dterm-in').fill(command);
  await win.locator('.dterm-in').press('Enter');
  await expect(win.locator('.dterm-out')).toContainText('> ' + command);
  return win;
}

async function deskBrowse(scope, deviceName, url) {
  const win = await openDeskApp(scope, deviceName, 'Navigateur');
  await win.locator('.dbrow-url').fill(url);
  await win.locator('.dbrow-url').press('Enter');
  return win;
}

/* reseau-maison : l'élève corrige la passerelle puis prouve que tout fonctionne. */
async function solveMaison(scope) {
  await setGateway(scope, 'PC-Bureau', '192.168.1.1');
  await studentScore(scope, 35);
  await studentTerminal(scope, 'Laptop', 'dhcp');
  await studentTerminal(scope, 'Laptop', 'ping 8.8.8.8');
  await studentBrowse(scope, 'Laptop', 'www.exemple.fr');
  await studentTerminal(scope, 'PC-Bureau', 'ping 192.168.1.1');
  await studentTerminal(scope, 'PC-Bureau', 'ping 8.8.8.8');
  await studentBrowse(scope, 'PC-Bureau', 'www.exemple.fr');
  await studentScore(scope, 100);
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

      await menu(page, 'mi-options');
      await expect(page.locator('#gen-s-devs')).toHaveText(`${Object.keys(data.network.devs).length} appareil(s)`);
      await expect(page.locator('#gen-s-objs')).toHaveText(`${data.activity.objectives.length} objectif(s)`);
      await expect(page.locator('#gen-s-pts')).toHaveText(`100 pt — seuil ${mastery}%`);
      await page.keyboard.press('Escape');
      await expect(page.locator('#bld-overlay-gen')).not.toHaveClass(/open/);

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
  test('réparer la panne de reseau-maison et le prouver donne 100, conservé après rechargement', async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-maison');
    const file = await exportFile(page, 'html', info.outputPath('maison.html'));
    await page.goto(pathToFileURL(file).href);
    await studentScore(page, 0);

    await solveMaison(page);

    await page.reload();
    await studentScore(page, 100);
    const gateway = await page.evaluate(() =>
      Object.values(S.devs).find((d) => d.name === 'PC-Bureau').ifaces[0].gateway);
    expect(gateway).toBe('192.168.1.1');

    await finish(page);
    await expect.poll(() => page.dialogs.at(-1)).toContain('RÉUSSI');
  });

  test('l\'élève qui revient sur le même poste retrouve son réseau modifié (adresse, poste ajouté et câblé, service)', async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-entreprise');
    const file = await exportFile(page, 'html', info.outputPath('entreprise-reprise.html'));
    await page.goto(pathToFileURL(file).href);
    await studentScore(page, 0);

    // Modifications de l'élève : adresse d'un poste, poste ajouté et câblé, service du serveur (bureau)
    const charlie = await deviceId(page, 'PC-Charlie');
    const added = await page.evaluate((cid) => {
      setIface(cid, 0, 'ip', '192.168.1.77');
      const id = mkDev('pc', 420, 420, 'desktop');
      S.devs[id].name = 'PC-Ajoute';
      const sw = Object.values(S.devs).find((d) => d.name === 'Switch-LAN');
      addLink(id, sw.id);
      render();
      return id;
    }, charlie);
    const dns = await openDeskApp(page, 'Serveur', 'Serveur DNS');
    await dns.locator('[data-act="toggle"]').click();

    const snapshot = () => page.evaluate(() => ({
      ip: Object.values(S.devs).find((d) => d.name === 'PC-Charlie').ifaces[0].ip,
      added: Object.values(S.devs).some((d) => d.name === 'PC-Ajoute'),
      links: Object.keys(S.links).length,
      dns: Object.values(S.devs).find((d) => d.name === 'Serveur').dns.on,
      score: S.score,
    }));
    const before = await snapshot();
    expect(before).toMatchObject({ ip: '192.168.1.77', added: true, dns: true });   // le DNS était en panne : l'élève l'a démarré

    // Même navigateur, même poste : l'élève ferme puis revient
    await page.reload();
    const after = await snapshot();
    expect(after).toEqual(before);
    expect(added).toBeTruthy();

    // La reprise fonctionne encore après un deuxième aller-retour (rien n'est rejoué depuis le départ)
    await page.reload();
    expect(await snapshot()).toEqual(before);
  });

  test('panne « service arrêté » : l\'élève redémarre le DNS dans le bureau du serveur, conservé après rechargement', async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-entreprise');
    const file = await exportFile(page, 'html', info.outputPath('entreprise-dns.html'));
    await page.goto(pathToFileURL(file).href);
    await studentScore(page, 0);

    // La fiche du serveur ne règle pas les services : elle mène au bureau.
    const srv = await deviceId(page, 'Serveur');
    await page.locator(`#gd${srv}`).click();
    await expect(page.locator('#props-body')).not.toContainText('Activer le serveur DNS');
    await page.locator('#props-body button', { hasText: 'Ouvrir le bureau' }).click();
    await expect(page.locator(`#dwin-${srv}`)).toBeVisible();

    const dns = await openDeskApp(page, 'Serveur', 'Serveur DNS');
    await expect(dns.locator('.dpill')).toHaveText('arrêté');
    await dns.locator('[data-act="toggle"]').click();
    await expect(dns.locator('.dpill')).toHaveText('démarré');
    await studentScore(page, 20);

    await page.reload();
    await studentScore(page, 20);
    expect(await page.evaluate(() => Object.values(S.devs).find((d) => d.name === 'Serveur').dns.on)).toBe(true);
  });

  test('bureau des appareils : terminal et navigateur en fenêtre valident l\'activité, une session par appareil', async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-maison');
    const file = await exportFile(page, 'html', info.outputPath('maison-bureau.html'));
    await page.goto(pathToFileURL(file).href);
    await setGateway(page, 'PC-Bureau', '192.168.1.1');
    await studentScore(page, 35);

    await deskTerminal(page, 'Laptop', 'dhcp');
    await deskTerminal(page, 'Laptop', 'ping 8.8.8.8');
    const laptop = await deskBrowse(page, 'Laptop', 'www.exemple.fr');
    await expect(laptop.locator('.bpage h1')).toBeVisible();
    await deskTerminal(page, 'PC-Bureau', 'ping 192.168.1.1');
    const pc = await deskTerminal(page, 'PC-Bureau', 'ping 8.8.8.8');
    await deskBrowse(page, 'PC-Bureau', 'www.exemple.fr');
    await studentScore(page, 100);

    // Chaque appareil a sa propre sortie ; le bandeau du bas n'a rien reçu.
    await pc.locator('.aclose').click();
    await openDeskApp(page, 'PC-Bureau', 'Invite de commandes');
    await expect(pc.locator('.dterm-out')).toContainText('> ping 192.168.1.1');
    await expect(pc.locator('.dterm-out')).not.toContainText('> dhcp');

    // Fermer l'application garde la fenêtre ; × ferme le bureau.
    await pc.locator('.aclose').click();
    await expect(pc.locator('.dico')).toHaveCount(3);
    await pc.locator('.dw-x').click();
    await expect(pc).toHaveCount(0);
    await expect(page.locator('.dwin')).toHaveCount(1);

    // Plus de boutons de mode, plus de terminal ni de navigateur dans le bandeau du bas.
    await expect(page.locator('#btn-cfg, #btn-sim')).toHaveCount(0);
    await expect(page.locator('#tinput, #td-sel, #burl, #tout')).toHaveCount(0);
    await expect(page.locator('.bot .bt')).toHaveText(['📋 Journal', '🔍 Paquets', '📋 Activité']);

    // Le bandeau est ouvert sur l'activité ; il se replie sur ses onglets et se rouvre d'un clic sur un onglet.
    await expect(page.locator('#activ-pane')).toBeVisible();
    const canvasH = () => page.locator('#cw').evaluate((el) => el.getBoundingClientRect().height);
    const open = await canvasH();
    await page.locator('#bot-toggle').click();
    await expect(page.locator('.bot')).toHaveClass(/closed/);
    await expect(page.locator('#activ-pane')).toBeHidden();
    await expect(page.locator('.bot .bt').first()).toBeVisible();
    expect(await canvasH()).toBeGreaterThan(open + 100);                    // la place est rendue au schéma
    await expect(page.locator('.dwin')).toHaveCount(1);                     // les bureaux ouverts restent
    await page.locator('.bot .bt', { hasText: 'Journal' }).click();
    await expect(page.locator('.bot')).not.toHaveClass(/closed/);
    await expect(page.locator('#lout')).toContainText('PING');
    await page.locator('.bot .bt', { hasText: 'Paquets' }).click();
    await expect(page.locator('#pkt-body tr').first()).toBeVisible();
  });

  test('élève sans activité : bandeau replié à l\'ouverture ; le réseau se sauvegarde seul, quelques secondes après une modification', async ({ page }, info) => {
    await page.goto(BUILDER_URL);
    const file = await exportFile(page, 'html', info.outputPath('libre.html'));
    await page.goto(pathToFileURL(file).href);
    await expect(page.locator('.bot')).toHaveClass(/closed/);
    await expect(page.locator('#btn-activ-tab')).toBeHidden();
    await expect(page.locator('#lout')).toBeHidden();

    // Un poste déposé depuis la palette : sauvegardé sans rien demander
    const saved = () => page.evaluate(() => localStorage.getItem(SESSION_KEY) || '');
    const spot = await freeSpot(page);
    const pc = await dropFromPalette(page, 'pc-desktop', spot.x, spot.y);
    expect(pc).not.toBeNull();
    expect(await saved()).not.toContain(`"${pc}"`);                         // pas encore : la sauvegarde est temporisée
    await expect.poll(saved, { timeout: 9000 }).toContain(`"${pc}"`);

    // Une modification de la fiche aussi
    await page.locator(`#gd${pc}`).click();
    const ip = page.locator('#props-body .pr', { hasText: /^Adresse IP/ }).locator('input:not([type="checkbox"])').first();
    await ip.fill('192.168.50.7');
    await ip.press('Tab');
    await expect.poll(saved, { timeout: 9000 }).toContain('192.168.50.7');

    // Page fermée brutalement (sans l'enregistrement de fermeture) : le réseau est retrouvé
    await page.evaluate(() => { window.addEventListener('beforeunload', (e) => e.stopImmediatePropagation(), true); });
    await page.reload();
    expect(await page.evaluate((id) => S.devs[id] && S.devs[id].ifaces[0].ip, pc)).toBe('192.168.50.7');
  });
});

test.describe('Builder', () => {
  test('services réglés dans le bureau : Ctrl+Z annule, et l\'élève reçoit l\'état laissé par le professeur', async ({ page }, info) => {
    // Vue Corrigé : ce qui est réglé dans le bureau fait partie du corrigé exporté
    await openBuilderWith(page, 'reseau-maison');
    const box = await openDeskApp(page, 'Box-WiFi', 'Administration');
    const dhcp = box.locator('.dpill');
    await expect(dhcp).toHaveText('démarré');
    await box.locator('[data-act="toggle"]').click();
    await expect(dhcp).toHaveText('arrêté');
    await page.keyboard.press('Control+z');
    await expect(dhcp).toHaveText('démarré');
    await box.locator('[data-act="toggle"]').click();
    await expect(dhcp).toHaveText('arrêté');

    const file = await exportFile(page, 'html', info.outputPath('maison-dhcp-off.html'));
    await page.goto(pathToFileURL(file).href);
    const sbox = await openDeskApp(page, 'Box-WiFi', 'Administration');
    await expect(sbox.locator('.dpill')).toHaveText('arrêté');
    const laptop = await deskTerminal(page, 'Laptop', 'dhcp');
    const before = await page.evaluate(() => Object.values(S.devs).find((d) => d.name === 'Laptop').ifaces[0].ip);
    expect(before || '').toBe('');

    await openDeskApp(page, 'Box-WiFi', 'Administration');
    await sbox.locator('[data-act="toggle"]').click();
    await expect(sbox.locator('.dpill')).toHaveText('démarré');
    await deskTerminal(page, 'Laptop', 'dhcp');
    await expect.poll(() => page.evaluate(() => Object.values(S.devs).find((d) => d.name === 'Laptop').ifaces[0].ip))
      .toMatch(/^192\.168\.1\.\d+$/);
    await expect(laptop).toBeVisible();
  });

  test('bureau des appareils dans le builder : terminal en fenêtre, adresse dans le titre', async ({ page }) => {
    await openBuilderWith(page, 'reseau-maison');
    await page.locator('#btn-sim').click();
    const before = await builderScore(page).textContent();
    const win = await deskTerminal(page, 'PC-Bureau', 'ipconfig');
    await expect(win.locator('.dterm-out')).toContainText('192.168.1.');
    await expect(win.locator('.dwin-ip')).toHaveText(/^192\.168\.1\.\d+$/);
    await expect(win.locator('.dnote')).toHaveCount(0);                      // en Essai, tout compte
    await expect(builderScore(page)).toHaveText(before);
    // Le bandeau du bas n'a plus que le journal et les paquets hors du corrigé (l'évaluation ne se règle que dans le corrigé)
    await expect(page.locator('.bot .bt:visible')).toHaveText(['📋 Journal', '🔍 Paquets']);
    await expect(page.locator('#tinput, #td-sel, #burl, #tout')).toHaveCount(0);
  });

  test('vue Corrigé : terminal et navigateur pour vérifier le réseau, non comptabilisés ; les mêmes gestes comptent en Essai', async ({ page }) => {
    await openBuilderWith(page, 'reseau-maison');
    await corrigeComplet(page);

    // Le corrigé fonctionne : le professeur le constate sans quitter la vue
    const pc = await deskTerminal(page, 'PC-Bureau', 'ping 192.168.1.1');
    await expect(pc.locator('.dnote')).toContainText('non comptabilisé');
    await expect(pc.locator('.dterm-out')).toContainText('Réponse de 192.168.1.1');
    await deskTerminal(page, 'PC-Bureau', 'ping 8.8.8.8');
    const web = await deskBrowse(page, 'PC-Bureau', 'www.exemple.fr');
    await expect(web.locator('.bpage h1')).toBeVisible();
    await expect(web.locator('.dnote')).toContainText('non comptabilisé');
    await page.locator('.bot .bt', { hasText: 'Journal' }).click();
    await expect(page.locator('#lout')).toContainText('PING');
    await corrigeComplet(page);                                              // ni score ni point

    // Casser puis rétablir la passerelle dans le corrigé ne rapporte rien non plus
    await setGateway(page, 'PC-Bureau', '192.168.9.9');
    await setGateway(page, 'PC-Bureau', '192.168.1.1');
    await corrigeComplet(page);
    expect(await page.evaluate(() => Object.keys(ACTIVITY_PROOFS).length)).toBe(0);

    // En Essai, la réparation et les mêmes commandes marquent leurs points
    await page.locator('#btn-sim').click();
    await setGateway(page, 'PC-Bureau', '192.168.1.1');
    await expect(builderScore(page)).toHaveText(/Score : 35 \/ 100/);
    const before = await page.evaluate(() => S.score);
    await deskTerminal(page, 'PC-Bureau', 'ping 192.168.1.1');
    await expect.poll(() => page.evaluate(() => S.score)).toBeGreaterThan(before);
  });

  test('vue Corrigé : pas de score mais le contrôle du corrigé (pastille, tableau, commande rejouée, corrigé incomplet)', async ({ page }) => {
    await openBuilderWith(page, 'reseau-entreprise');
    await expect(builderScore(page)).toHaveText('✅ Corrigé complet');

    // Tableau : état dans le corrigé (commande rejouée sans terminal) et au départ de l'élève
    await builderScore(page).click();
    const panel = page.locator('#ctl-body');
    await expect(panel).toContainText('Contrôle du corrigé');
    await expect(panel).not.toContainText('Score');
    const nsl = panel.locator('tr', { hasText: 'nslookup' }).last();
    await expect(nsl.locator('td').nth(1)).toContainText('nslookup www.mon-entreprise.fr depuis PC-Alice : réussit');
    await expect(nsl.locator('td').nth(2)).toContainText('échoue tant que P1 n\'est pas réparée');
    const first = panel.locator('tbody tr').first();          // un ping sans rapport avec les pannes
    await expect(first.locator('td').nth(2)).toContainText('réussit déjà, sans rien réparer');

    // « Voir dans le terminal » rejoue la commande dans le bureau du poste, sans marquer de point
    await nsl.locator('.rv-go').click();
    await expect(panel).not.toHaveClass(/open/);
    const alice = page.locator(`#dwin-${await deviceId(page, 'PC-Alice')}`);
    await expect(alice.locator('.dterm-out')).toContainText('> nslookup www.mon-entreprise.fr');
    await expect(alice.locator('.dterm-out')).toContainText('192.168.1.100');
    expect(await page.evaluate(() => Object.keys(ACTIVITY_PROOFS).length)).toBe(0);
    await alice.locator('.dw-x').click();

    // Le professeur arrête le DNS dans le corrigé : la pastille le signale, le tableau dit pourquoi
    const dns = await openDeskApp(page, 'Serveur', 'Serveur DNS');
    await dns.locator('[data-act="toggle"]').click();
    await expect(builderScore(page)).toHaveText('⚠️ Corrigé : 4 objectifs non réalisés');
    await dns.locator('.dw-x').click();
    await builderScore(page).click();
    await expect(panel.locator('tr', { hasText: 'Le service DNS du Serveur est actif' }).locator('td').nth(1))
      .toContainText('non réalisé dans le corrigé');
    await expect(nsl.locator('td').nth(1)).toContainText('DNS');
    await expect(nsl.locator('td').nth(2)).toHaveText('—');
    await builderScore(page).click();

    // Annuler rétablit le corrigé ; le score ne revient qu'en Essai
    await page.keyboard.press('Control+z');
    await expect(builderScore(page)).toHaveText('✅ Corrigé complet');
    await page.locator('#btn-sim').click();
    await expect(builderScore(page)).toHaveText('📊 Score : 0 / 100 pts');
    await page.locator('#btn-cfg').click();
    await expect(builderScore(page)).toHaveText('✅ Corrigé complet');
  });

  test('nslookup en majuscules ne valide l\'objectif que depuis le bon appareil', async ({ page }) => {
    // Vue Essai : le professeur joue l'élève. Le DNS est en panne au départ : il le démarre, puis teste.
    await openBuilderWith(page, 'reseau-entreprise');
    await corrigeComplet(page); await departZero(page);
    await page.locator('#btn-sim').click();
    await expect(builderScore(page)).toHaveText('📊 Score : 0 / 100 pts');

    const dns = await openDeskApp(page, 'Serveur', 'Serveur DNS');
    await expect(dns.locator('.dpill')).toHaveText('arrêté');
    await dns.locator('[data-act="toggle"]').click();
    await expect(builderScore(page)).toHaveText('📊 Score : 20 / 100 pts');   // « DNS actif »

    const bob = await runInTerminal(page, 'PC-Bob', 'nslookup WWW.MON-ENTREPRISE.FR');
    await expect(bob.locator('.dterm-out')).toContainText('192.168.1.100');
    await expect(builderScore(page)).toHaveText('📊 Score : 20 / 100 pts');   // pas depuis le bon poste

    await runInTerminal(page, 'PC-Alice', 'nslookup WWW.MON-ENTREPRISE.FR');
    await expect(builderScore(page)).toHaveText('📊 Score : 30 / 100 pts');
  });

  /* Variantes de reseau-lycee où l'élève réussirait sans rien faire (seuil abaissé à 20).
     Sans panne, les objectifs statiques déjà vrais valent 30 points, dont 4 pour la route de
     Routeur-Principal ; la panne mineure (service HTTP arrêté) en retire 5. Ces scores exigent
     donc les pannes, les routes et le respect de la case « routage automatique ». */
  const MINOR_FAULT = { id: 1, type: 'service_down', dev: 'Serveur-Web', service: 'http' };
  const TOO_EASY = [
    { label: 'sans panne', faults: [], score: 30 },
    { label: 'avec une panne mineure', faults: [MINOR_FAULT], score: 25 },
    { label: 'routage automatique décoché, sans panne', faults: [], manualRouter: true, score: 26 },
    { label: 'routage automatique décoché, avec panne', faults: [MINOR_FAULT], manualRouter: true, score: 21 },
  ];

  for (const { label, faults, manualRouter, score } of TOO_EASY) {
    test(`avertissement à l'export si l'élève réussit d'office (${label}) : même score que l'activité`, async ({ page }, info) => {
      const data = readScenario('reseau-lycee');
      data.activity.faults = faults;
      delete data.activity.evalOrder;
      data.activity.masteryscore = 20;
      if (manualRouter) {
        Object.values(data.network.devs).find((d) => d.name === 'Routeur-Principal').autoRouteEnabled = false;
      }
      const scenario = info.outputPath('trop-facile.json');
      fs.writeFileSync(scenario, JSON.stringify(data));

      await page.goto(BUILDER_URL);
      await importScenarioFile(page, scenario);
      const file = await exportFile(page, 'html', info.outputPath('trop-facile.html'));

      expect(page.dialogs.length).toBe(1);
      expect(page.dialogs[0]).toContain('il réussirait sans rien corriger');
      expect(page.dialogs[0]).toContain(`aurait déjà ${score} / 100 pour un seuil de 20 %`);

      // Le score annoncé au professeur est bien celui que l'élève verra.
      await page.goto(pathToFileURL(file).href);
      await studentScore(page, score);

      // « Recommencer » doit redonner exactement le même état de départ.
      await page.locator('#stu-menu-btn').click();
      await page.locator('#t-clear').click();
      await expect.poll(() => page.dialogs.at(-1)).toContain('Recommencer');
      await studentScore(page, score);
    });
  }

  test('annuler l\'avertissement n\'exporte rien', async ({ page }, info) => {
    const data = readScenario('reseau-lycee');
    data.activity.faults = [];
    delete data.activity.evalOrder;
    data.activity.masteryscore = 20;
    const scenario = info.outputPath('trop-facile.json');
    fs.writeFileSync(scenario, JSON.stringify(data));
    await page.goto(BUILDER_URL);
    await importScenarioFile(page, scenario);

    page.dialogAction = 'dismiss';
    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    for (const id of ['mi-html', 'mi-scorm']) {
      await menu(page, id);
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
    await openEval(page);
    const card = page.locator('[data-objid="7"]');
    await card.locator('.obj-card-hdr').click();
    const chk = card.locator('.obj-cons input[type="checkbox"]');
    const text = card.locator('.obj-cons textarea');

    // Adresse exacte : la contrainte donnerait la réponse, elle est masquée par défaut.
    await expect(chk).not.toBeChecked();

    await card.locator('.ipf select').selectOption('range');
    await card.locator('#ipr-e-7-ip').fill('20');
    await card.locator('#ipr-e-7-ip').press('Tab');
    await expect(chk).toBeChecked();
    await expect(text).toHaveValue('B210-P3 : adresse IP au choix entre 10.2.210.3 et 10.2.210.20 (adresse libre)');
    await expect(card.locator('.obj-cons-meta')).toContainText('généré à partir des paramètres');

    const mine = 'Prenez une adresse libre de la salle 210, entre .3 et .20.';
    await text.fill(mine);
    await text.press('Tab');
    await expect(card.locator('.obj-cons-meta')).toContainText('rédigé à la main');

    // Paramètres modifiés après coup : le texte manuel est gardé, mais signalé.
    await card.locator('#ipr-e-7-ip').fill('30');
    await card.locator('#ipr-e-7-ip').press('Tab');
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
    await openEval(page);
    const ipCard = page.locator('[data-objid="7"]');
    await ipCard.locator('.obj-card-hdr').click();
    await ipCard.locator('.ipf select').selectOption('range');
    await ipCard.locator('#ipr-e-7-ip').fill('20');
    await ipCard.locator('#ipr-e-7-ip').press('Tab');

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
    await openEval(page);
    const card = page.locator('[data-objid="7"]');
    await card.locator('.obj-card-hdr').click();
    await card.locator('.ipf select').selectOption('range');
    await card.locator('#ipr-e-7-ip').fill('20');
    await card.locator('#ipr-e-7-ip').press('Tab');

    const open = async (menuId) => {
      const pending = context.waitForEvent('page');
      await menu(page, menuId);
      const doc = await pending;
      await doc.waitForLoadState();
      return doc;
    };
    const rows = (doc) => doc.locator('table.plan tbody tr');

    const enonce = await open('mi-enonce');
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

    const corrige = await open('mi-corrige');
    await expect(corrige.locator('.teacher-banner')).toContainText('Document enseignant');
    await expect(corrige.locator('.student-grid')).toHaveCount(0);
    await expect(rows(corrige).filter({ hasText: 'B105-P2' })).toContainText('10.2.105.2');
    await expect(rows(corrige).filter({ hasText: 'B210-P3' })).toContainText('pas de solution dans le réseau actuel');
    await corrige.screenshot({ path: info.outputPath('corrige.png'), fullPage: true });
    await corrige.close();

    await menu(page, 'mi-options');
    await page.locator('#gen-plan').uncheck();
    await page.keyboard.press('Escape');
    const sansPlan = await open('mi-enonce');
    await expect(sansPlan.locator('h2', { hasText: 'Objectifs' })).toBeVisible();
    await expect(sansPlan.locator('table.plan')).toHaveCount(0);
    await sansPlan.close();
  });

  test('objectifs et pannes dans une seule liste : ordre libre, conservé à l\'export et chez l\'élève', async ({ page }, info) => {
    const { activity } = readScenario('reseau-lycee');
    await openBuilderWith(page, 'reseau-lycee');
    await openEval(page);
    const cards = page.locator('#ev-list .obj-card');
    const keys = () => cards.evaluateAll((els) => els.map((e) => e.dataset.key));
    await expect(cards).toHaveCount(activity.objectives.length + activity.faults.length);
    await expect(page.locator('#ev-obj-count')).toHaveText(String(activity.objectives.length));
    await expect(page.locator('#ev-fault-count')).toHaveText(String(activity.faults.length));

    // L'ordre du scénario : chaque panne (pastille rouge) juste avant sa réparation
    expect(await keys()).toEqual(activity.evalOrder);
    const fault = page.locator('[data-fltid="1"]');
    await expect(fault.locator('.obj-num.fault')).toHaveText('P2');   // 2e panne de la liste

    // Flèches : la panne remonte de deux crans
    const start = (await keys()).indexOf('f:1');
    await fault.locator('.ev-move button[title="Monter"]').click();
    await fault.locator('.ev-move button[title="Monter"]').click();
    expect((await keys()).indexOf('f:1')).toBe(start - 2);

    // Glisser-déposer : le 2e objectif passe au-dessus du 1er et devient le n° 1
    const last = activity.objectives[1];
    await page.locator(`[data-objid="${last.id}"] .ev-handle`)
      .dragTo(page.locator('[data-objid="1"]'), { targetPosition: { x: 60, y: 4 } });
    const objOrder = (await keys()).filter((k) => k[0] === 'o');
    expect(objOrder[0]).toBe(`o:${last.id}`);
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
    await importScenarioFile(page, file);
    await openEval(page);
    expect(await keys()).toEqual(order);

    // L'élève voit les objectifs dans cet ordre
    const html = await exportFile(page, 'html', info.outputPath('lycee-ordre.html'));
    await page.goto(pathToFileURL(html).href);
    await expect(page.locator('.activ-obj').first()).toContainText(last.label);
  });

  test('ping depuis un poste à ajouter : proposé dans la liste, alerte si placé avant, validé chez l\'élève', async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-college');
    await openEval(page);
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
    while ((await keys()).indexOf(`o:${id}`) > (await keys()).indexOf('o:5')) await up();
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
    // Côté élève, la commande se tape dans le bureau du poste ajouté.
    await deskTerminal(page, 'b210-p3', 'ping 10.2.210.1');
    await page.locator('#btn-activ-tab').click();
    await expect(page.locator('.activ-obj', { hasText: 'Ping depuis le nouveau poste' })).toHaveClass(/done/);
  });

  test('outil Câble : pointeur câble ; Échap revient à la sélection ; Suppr efface (builder et élève)', async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-maison');
    const cw = page.locator('#cw');
    const canvasCursor = () => page.locator('#canvas').evaluate((el) => getComputedStyle(el).cursor);
    const devCursor = (id) => page.locator(`#gd${id}`).evaluate((el) => getComputedStyle(el).cursor);
    const laptop = await deviceId(page, 'Laptop');

    // Outil Câble (palette du builder) : pointeur câble sur le canevas et sur les appareils
    await page.locator('#pi-link').click();
    await expect(cw).toHaveClass(/tool-link/);
    expect(await canvasCursor()).toContain('url(');
    expect(await devCursor(laptop)).toContain('url(');

    // Câble commencé, puis Échap : outil Sélection, câble annulé
    await page.locator(`#gd${laptop}`).click();
    await page.keyboard.press('Escape');
    await expect(cw).not.toHaveClass(/tool-link/);
    await expect(page.locator('#pi-sel')).toHaveClass(/active/);
    expect(await page.evaluate(() => [S.tool, S.cableFrom])).toEqual(['select', null]);
    expect(await canvasCursor()).not.toContain('url(');

    // Outil Supprimer puis Échap : retour à la sélection
    await page.locator('#pi-del').click();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => S.tool)).toBe('select');

    // Suppr pendant une saisie : rien n'est effacé
    await page.locator(`#gd${laptop}`).click();
    const name = page.locator('#props-body input').first();
    await name.focus();
    await page.keyboard.press('Delete');
    expect(await page.evaluate((id) => !!S.devs[id], laptop)).toBe(true);

    // Suppr : appareil sélectionné effacé, Ctrl+Z le remet
    await page.locator(`#gd${laptop}`).click();
    await page.keyboard.press('Delete');
    expect(await page.evaluate((id) => !!S.devs[id], laptop)).toBe(false);
    await page.keyboard.press('Control+z');
    expect(await page.evaluate((id) => !!S.devs[id], laptop)).toBe(true);

    // Suppr sur un câble sélectionné
    const lid = await page.evaluate(() => Object.keys(S.links)[0]);
    await page.evaluate((id) => selLink(id), lid);
    await page.keyboard.press('Delete');
    expect(await page.evaluate((id) => !!S.links[id], lid)).toBe(false);

    // Côté élève : mêmes comportements
    const file = await exportFile(page, 'html', info.outputPath('maison-clavier.html'));
    await page.goto(pathToFileURL(file).href);
    await page.locator('#pi-link').click();
    expect(await canvasCursor()).toContain('url(');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => S.tool)).toBe('select');
    const pc = await deviceId(page, 'Smartphone');
    await page.locator(`#gd${pc}`).click();
    await page.keyboard.press('Delete');
    expect(await page.evaluate((id) => !!S.devs[id], pc)).toBe(false);
  });

  test('Connexion WiFi : SSID suivi dans le builder, mot de passe faux puis corrigé chez l\'élève', async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-maison');
    // Builder : renommer le réseau de la box, les terminaux connectés suivent
    // (le WiFi de la box se règle dans son application Administration, ici sur la copie d'essai)
    await page.locator('#btn-sim').click();
    const admin = await openDeskApp(page, 'Box-WiFi', 'Administration');
    await admin.locator('[data-f="ssid"]').fill('WiFi-Famille');
    await admin.locator('[data-act="wifi-save"]').click();
    const laptop = await deviceId(page, 'Laptop');
    await page.locator(`#gd${laptop}`).click();
    await expect(page.locator('#props-body')).toContainText('Connecté à « WiFi-Famille »');

    // Élève : on repart du scénario d'origine
    await openBuilderWith(page, 'reseau-maison');
    const file = await exportFile(page, 'html', info.outputPath('maison-wifi.html'));
    await page.goto(pathToFileURL(file).href);
    await studentScore(page, 0);
    const lap = await deviceId(page, 'Laptop');
    await page.locator(`#gd${lap}`).click();
    await expect(page.locator('#props-body')).toContainText('Connecté à « WiFi-Maison »');
    const pass = page.locator('#props-body .pr', { hasText: 'Mot de passe WiFi' }).locator('input');
    await pass.fill('maison000');
    await pass.press('Tab');
    await expect(page.locator('#props-body')).toContainText('Non connecté : mot de passe incorrect');
    await page.locator('#props-body button', { hasText: 'Demander une adresse (DHCP)' }).click();
    await studentScore(page, 0);
    await pass.fill('maison123');
    await pass.press('Tab');
    await expect(page.locator('#props-body')).toContainText('Connecté à « WiFi-Maison »');
    await page.locator('#props-body button', { hasText: 'Demander une adresse (DHCP)' }).click();
    await studentScore(page, 10);
  });

  test('DHCP depuis la fiche : recocher la case ou cliquer sur le bouton valide l\'objectif', async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-maison');
    const file = await exportFile(page, 'html', info.outputPath('maison-dhcp.html'));
    await page.goto(pathToFileURL(file).href);
    await studentScore(page, 0);

    // Case DHCP déjà cochée à l'ouverture : on la décoche puis la recoche
    const laptop = await deviceId(page, 'Laptop');
    await page.locator(`#gd${laptop}`).click();
    const box = page.locator('#dhcpmode');
    await expect(box).toBeChecked();
    await box.uncheck();
    await box.check();
    await studentScore(page, 10);
    await expect(page.locator('#props-body')).toContainText('Renouveler l\'adresse (DHCP)');

    // Bouton de la fiche, sur un autre poste en DHCP : même effet que la commande dhcp
    const phone = await deviceId(page, 'Smartphone');
    await page.locator(`#gd${phone}`).click();
    await page.locator('#props-body button', { hasText: 'Demander une adresse (DHCP)' }).click();
    expect(await page.evaluate((id) => S.devs[id].ifaces[0].ip, phone)).toMatch(/^192\.168\.1\./);
  });

  test('Nouvelle activité : modèle choisi, vérifié, créé, puis réussi à 100 par l\'élève', async ({ page }, info) => {
    await page.goto(BUILDER_URL);
    await menu(page, 'btn-wizard');
    const card = (group, id) => page.locator(`.wz-card[data-group="${group}"][data-id="${id}"]`);
    await card('type', 'decouverte').click();
    await card('theme', 'classe').click();
    await card('level', 'lycee').click();
    await expect(card('level', 'lycee')).toHaveClass(/on/);
    await expect(page.locator('.wz-prev-title')).toHaveText('Réseau de la salle de classe — Découverte');
    await expect(page.locator('.wz-audit')).toContainText('Vérifié');
    await expect(page.locator('#wz-reroll')).toHaveCount(0);   // rien à tirer sans panne
    await page.locator('#wz-create').click();
    await expect(page.locator('#wz-ovl')).not.toHaveClass(/open/);
    await expect(page.locator('#ev-title')).toHaveValue('Réseau de la salle de classe — Découverte');
    expect(await page.evaluate(() => Object.keys(S.devs).length)).toBe(9);   // dont l'ENT, sur Internet

    const file = await exportFile(page, 'html', info.outputPath('wizard-classe.html'));
    await page.goto(pathToFileURL(file).href);
    await studentScore(page, 0);
    await studentTerminal(page, 'Poste-Prof', 'ping 192.168.10.11');
    await studentTerminal(page, 'Poste-Prof', 'ping 192.168.10.1');
    await studentTerminal(page, 'Poste-Prof', 'ping 8.8.8.8');
    await studentBrowse(page, 'Poste-Prof', 'ent.etablissement.fr');
    await studentTerminal(page, 'Poste-1', 'nslookup ent.etablissement.fr');
    await studentTerminal(page, 'Poste-2', 'ping 192.168.10.100');
    await studentScore(page, 100);
  });

  test('contrôle du départ élève : bandeau, pastilles de panne sur le schéma, état des objectifs, réouverture', async ({ page }) => {
    await openBuilderWith(page, 'reseau-entreprise');
    const banner = page.locator('#ctl-banner');
    await expect(banner).toContainText('Départ élève : 0 / 100');
    await expect(banner).toContainText('Tout est atteignable');
    await expect(banner).toContainText('2 pannes');

    // Une pastille par panne, sur l'appareil touché, dans l'ordre de la liste
    const badges = page.locator('#layer-badges g');
    await expect(badges).toHaveCount(2);
    await expect(badges.nth(0)).toContainText('P1');
    await expect(badges.nth(0)).toContainText('Service désactivé · Serveur');
    await expect(badges.nth(1)).toContainText('P2');

    // Le détail du score explique pourquoi un objectif vrai dans le corrigé reste à zéro
    await page.locator('#hdr-score').click();
    await expect(page.locator('#ctl-body')).toContainText('Contrôle du corrigé');
    await expect(page.locator('#ctl-body')).toContainText('à faire (panne P1)');
    await expect(page.locator('#ctl-body')).toContainText('à faire (panne P2)');
    // Ici chaque panne est mesurée par un objectif de réparation : pas de section « pannes sans points »
    await expect(page.locator('#ctl-body')).not.toContainText('Pannes sans points');

    // Onglet Évaluation : état par rapport au corrigé et au départ élève
    await openEval(page);
    const dnsCard = page.locator('#ev-list .obj-card', { hasText: 'Le service DNS du Serveur est actif' });
    await expect(dnsCard.locator('.obj-preview')).toContainText('Vrai dans le corrigé');
    await expect(dnsCard.locator('.obj-preview')).toContainText('faux au départ élève (panne P1)');

    // Sans aucun objectif, les pannes restent visibles (score et bandeau) et le bandeau prévient qu'elles ne rapportent rien
    await page.evaluate(() => { window.__objs = EvalModule.getConfig().objectives.splice(0); });
    await closeEval(page);
    await expect(banner).toContainText('2 pannes sans points');
    await page.locator('#hdr-score').click();
    await expect(page.locator('#ctl-body')).toContainText('le score se calcule à partir des objectifs');
    await expect(page.locator('#ctl-body')).toContainText('P2 — Passerelle incorrecte · PC-Bob');
    await expect(page.locator('#ctl-body')).toContainText('ne rapporte aucun point');
    await page.locator('#hdr-score').click();
    await page.evaluate(() => { EvalModule.getConfig().objectives.push(...window.__objs); });
    await openEval(page);
    await closeEval(page);

    // Sans panne, l'élève aurait des points d'office : le bandeau prévient
    await page.evaluate(() => { EvalModule.getConfig().faults.length = 0; });
    await closeEval(page);
    await expect(banner).toContainText('⚠️ Départ élève : 40 / 100');
    await expect(page.locator('#layer-badges g')).toHaveCount(0);

    // Le titre de l'activité ouverte est affiché dans la barre orange
    await expect(page.locator('#ctl-act')).toContainText('Entreprise');
  });

  test('appareil « à ajouter par l\'élève » : case de la fiche, pastille, retiré du départ, de l\'essai et de l\'export ; plus de bouton Figer', async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-entreprise');
    // « Figer le départ » et « Réinitialiser » n'existent plus : le départ de l'élève se lit dans le corrigé
    await expect(page.locator('button[onclick="freezeStart()"], #btn-reset-start')).toHaveCount(0);
    const charlie = await deviceId(page, 'PC-Charlie');
    const banner = page.locator('#ctl-banner');
    const panel = page.locator('#ctl-body');
    const row = panel.locator('tr', { hasText: 'PC-Charlie est ajouté' });

    // Objectif « ajouter PC-Charlie » alors que le poste est dans le corrigé : acquis d'avance, le contrôle dit quoi cocher
    await page.evaluate(() => {
      const c = EvalModule.getConfig();
      c.objectives.push({ id: 'obj_add', label: 'PC-Charlie est ajouté', check: 'device_added', points: 5, params: { newdev: 'PC-Charlie' } });
      if (c.evalOrder) c.evalOrder.push('o:obj_add');
      render(); checkAllObjectives();
    });
    await expect(banner).toContainText('Départ élève : 5 / 105');
    await builderScore(page).click();
    await expect(row.locator('td').nth(2)).toContainText('cochez « À ajouter par l\'élève »');
    await builderScore(page).click();

    // La case de la fiche : pastille « + » sur le schéma, objectif à faire au départ
    await clickDev(page, charlie);
    await page.locator('#toadd').check();
    await expect(page.locator('#layer-badges g[data-toadd]')).toHaveCount(1);
    await expect(banner).toContainText('Départ élève : 0 / 105');
    await expect(builderScore(page)).toHaveText('✅ Corrigé complet');
    await builderScore(page).click();
    await expect(row.locator('td').nth(1)).toContainText('réalisé');
    await expect(row.locator('td').nth(2)).toContainText('à faire (PC-Charlie à ajouter)');
    await builderScore(page).click();

    // Ctrl+Z et Ctrl+Y sur la case
    await page.locator('body').press('Control+z');
    await expect(page.locator('#layer-badges g[data-toadd]')).toHaveCount(0);
    await page.locator('body').press('Control+y');
    await expect(page.locator('#layer-badges g[data-toadd]')).toHaveCount(1);

    // Départ élève et Essai : le poste et son câble n'y sont pas ; le corrigé les garde
    const links = (await linkList(page)).length;
    await page.locator('#btn-depart').click();
    await expect(page.locator(`#gd${charlie}`)).toHaveCount(0);
    expect((await linkList(page)).length).toBe(links - 1);
    await page.locator('#btn-sim').click();
    await expect(page.locator(`#gd${charlie}`)).toHaveCount(0);
    await expect(builderScore(page)).toHaveText('📊 Score : 0 / 105 pts');
    await page.locator('#btn-cfg').click();
    await expect(page.locator(`#gd${charlie}`)).toHaveCount(1);
    expect((await linkList(page)).length).toBe(links);
    await clickDev(page, charlie);
    await expect(page.locator('#toadd')).toBeChecked();

    // Export élève : le poste est absent, l'élève l'ajoute et gagne l'objectif
    const file = await exportFile(page, 'html', info.outputPath('a-ajouter.html'));
    await page.goto(pathToFileURL(file).href);
    await expect(page.locator(`#gd${charlie}`)).toHaveCount(0);
    expect(await page.evaluate(() => devByName('PC-Charlie'))).toBeNull();
    await page.evaluate(() => {
      const before = Object.keys(S.devs);
      mkDev('pc', 500, 420);
      const id = Object.keys(S.devs).find((k) => !before.includes(k));
      S.devs[id].name = 'PC-Charlie';
      render(); checkAllObjectives();
    });
    await expect.poll(() => page.evaluate(() => !!ACTIVITY_RESULTS.obj_add)).toBe(true);
  });

  test('vue Corrigé : panne sans effet signalée ; panne d\'adresse sur un poste en DHCP mesurée sur le réseau', async ({ page }) => {
    await openBuilderWith(page, 'reseau-entreprise');
    await expect(builderScore(page)).toHaveText('✅ Corrigé complet');

    // La valeur de panne est celle du corrigé : la panne ne casse rien
    await page.evaluate(() => {
      const f = EvalModule.getConfig().faults.find((x) => x.type === 'bad_gateway');
      (f.params || f).badValue = '192.168.1.1';
      render(); checkAllObjectives();
    });
    await expect(builderScore(page)).toHaveText('⚠️ Corrigé : 1 panne à revoir');
    await builderScore(page).click();
    const panel = page.locator('#ctl-body');
    await expect(panel).toContainText('Pannes à revoir (1)');
    await expect(panel.locator('[data-rvf]')).toContainText('P2 — sans effet : la valeur de panne est déjà la passerelle du corrigé');
    await expect(panel.locator('tr', { hasText: 'La passerelle de PC-Bob' }).locator('td').nth(2)).toContainText('déjà acquis');
    await builderScore(page).click();
    await page.evaluate(() => {
      const f = EvalModule.getConfig().faults.find((x) => x.type === 'bad_gateway');
      (f.params || f).badValue = '192.168.1.99';
      render(); checkAllObjectives();
    });
    await expect(builderScore(page)).toHaveText('✅ Corrigé complet');

    // Panne d'adresse notée : adresse exacte sur un poste fixe, réseau seulement sur un poste en DHCP
    const goalIp = () => page.evaluate(() => EvalModule.getConfig().faults.find((x) => x.id === 'flt_dhcp').goal.params.ip);
    await page.evaluate(() => {
      EvalModule.getConfig().faults.push({ id: 'flt_dhcp', type: 'bad_ip', label: '', points: 10,
        params: { dev: 'PC-Charlie', badValue: '10.9.9.9' } });
    });
    expect(await goalIp()).toBe('192.168.1.12');
    await page.evaluate(() => { Object.values(S.devs).find((d) => d.name === 'PC-Charlie').ifaces[0].dhcpMode = true; });
    expect(await goalIp()).toBe('192.168.1.*');
    expect(await page.evaluate(() => EvalModule.getConfig().faults.find((x) => x.id === 'flt_dhcp').goal.label))
      .toBe('L\'adresse IP de PC-Charlie est de nouveau dans son réseau (192.168.1.*)');
  });

  test('le builder s\'ouvre vierge ; fermer sans enregistrer prévient, enregistrer ou ouvrir un fichier lève l\'alerte', async ({ page }, info) => {
    // Une ancienne sauvegarde automatique du navigateur n'est plus reprise, et elle est effacée
    await page.goto(BUILDER_URL);
    await page.evaluate(() => localStorage.setItem('sim_reseau_v2_builder',
      JSON.stringify({ devs: { d1: { id: 'd1', type: 'pc', name: 'Ancien', x: 10, y: 10, ifaces: [] } }, links: {}, nid: 2 })));
    await page.reload();
    expect(await page.evaluate(() => Object.keys(S.devs).length)).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('sim_reseau_v2_builder'))).toBeNull();

    const warns = () => page.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(await warns()).toBe(false);                                       // vierge : rien à perdre

    // Ouvrir un scénario : le travail est celui du fichier, pas d'alerte
    await importScenarioFile(page, scenarioPath('reseau-entreprise'));
    await expect(page.locator('#ctl-act')).toContainText('Entreprise');
    await page.waitForTimeout(1200);
    expect(await warns()).toBe(false);

    // Changer de vue ou jouer un essai ne crée pas de travail à enregistrer
    await page.locator('#btn-sim').click();
    const dns = await openDeskApp(page, 'Serveur', 'Serveur DNS');
    await dns.locator('[data-act="toggle"]').click();
    expect(await warns()).toBe(false);
    await page.locator('#btn-cfg').click();
    expect(await warns()).toBe(false);

    // Une modification du corrigé : alerte
    await page.evaluate(() => { Object.values(S.devs).find((d) => d.name === 'PC-Charlie').ifaces[0].ip = '192.168.1.77'; render(); });
    expect(await warns()).toBe(true);
    // Même si l'on est dans une autre vue au moment de fermer
    await page.locator('#btn-sim').click();
    expect(await warns()).toBe(true);

    // Enregistrer le scénario lève l'alerte ; modifier l'activité (titre) la rétablit
    await exportFile(page, 'scenario', info.outputPath('enregistre.json'));
    await page.waitForTimeout(1200);
    expect(await warns()).toBe(false);
    await openEval(page);
    await page.locator('#ev-title').fill('Autre titre');
    expect(await warns()).toBe(true);

    // Une activité créée par l'assistant n'est pas enregistrée : alerte
    await closeEval(page);
    await expect(page.locator('#menu-btn')).toBeVisible();                   // Ouvrir, Enregistrer et l'assistant sont dans le menu ☰ de la barre du haut
    await menu(page, 'btn-wizard');
    await page.locator('.wz-card[data-group="type"][data-id="depannage"]').click();
    await page.locator('#wz-create').click();
    await expect(page.locator('#wz-ovl')).not.toHaveClass(/open/);
    await page.waitForTimeout(1200);
    expect(await warns()).toBe(true);
  });

  test('vues Corrigé / Départ élève / Essai : copie jetable, lecture seule, corrigé intact et exports inchangés', async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-entreprise');
    const dnsOn = () => page.evaluate(() => Object.values(S.devs).find((d) => d.name === 'Serveur').dns.on);
    expect(await dnsOn()).toBe(true);                                      // corrigé : DNS démarré

    // Corrigé : le bureau s'ouvre, avec le terminal (non comptabilisé : voir le test de la vue Corrigé)
    const srv = await deviceId(page, 'Serveur');
    await page.locator(`#gd${srv}`).dblclick();
    const win = page.locator(`#dwin-${srv}`);
    await expect(win).toBeVisible();
    await expect(win.locator('.dico', { hasText: 'Serveur DNS' })).toBeVisible();
    await expect(win.locator('.dico', { hasText: 'Invite de commandes' })).toHaveCount(1);
    await win.locator('.dw-x').click();

    // Départ élève : la panne est appliquée, lecture seule
    await page.locator('#btn-depart').click();
    await expect(page.locator('#view-bar')).toContainText('Départ élève');
    expect(await dnsOn()).toBe(false);
    await expect(page.locator('#layer-badges g')).toHaveCount(2);
    const dns = await openDeskApp(page, 'Serveur', 'Serveur DNS');
    await dns.locator('[data-act="toggle"]').click();
    expect(await dnsOn()).toBe(false);                                     // refusé : lecture seule
    await expect(page.locator('.dwin .dico', { hasText: 'Invite de commandes' })).toHaveCount(0);

    // Essai : on répare, le score monte ; sans pastilles de panne
    await page.locator('#btn-sim').click();
    await expect(page.locator('#view-bar')).toContainText('Test');
    await expect(page.locator('#layer-badges g')).toHaveCount(0);
    const dns2 = await openDeskApp(page, 'Serveur', 'Serveur DNS');
    await dns2.locator('[data-act="toggle"]').click();
    await expect(builderScore(page)).toHaveText('📊 Score : 20 / 100 pts');

    // Un export pendant l'essai donne le corrigé, pas la copie : DNS démarré, pannes seulement dans l'activité
    const file = await exportFile(page, 'scenario', info.outputPath('essai.json'));
    await expect(page.locator('#btn-cfg')).toHaveClass(/active/);          // l'export ramène au corrigé
    const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(Object.values(exported.network.devs).find((d) => d.name === 'Serveur').dns.on).toBe(true);
    expect(exported.activity.faults.length).toBe(2);

    // Retour au corrigé : rien n'a bougé, score de départ de nouveau 0
    await closeEval(page);
    expect(await dnsOn()).toBe(true);
    await corrigeComplet(page); await departZero(page);
    await expect(page.locator('#view-bar')).toBeHidden();
  });

  test('une panne se note comme un objectif : points saisis sur la panne, gagnés quand l\'élève la répare', async ({ page }, info) => {
    // Activité à deux pannes et aucun objectif (cas d'un professeur qui commence par les pannes)
    const data = readScenario('reseau-entreprise');
    data.activity.objectives = [];
    delete data.activity.evalOrder;
    const scenario = info.outputPath('pannes-seules.json');
    fs.writeFileSync(scenario, JSON.stringify(data));
    await page.goto(BUILDER_URL);
    await importScenarioFile(page, scenario);
    await expect(page.locator('#ctl-banner')).toContainText('2 pannes sans points');

    // Points saisis directement sur chaque panne
    await openEval(page);
    const cards = page.locator('#ev-list .obj-card.fault');
    await expect(cards).toHaveCount(2);
    await cards.nth(0).locator('.obj-card-hdr').click();
    await cards.nth(0).locator('.fault-repair input[type="number"]').fill('30');
    await cards.nth(0).locator('.fault-repair input[type="number"]').press('Tab');
    await cards.nth(1).locator('.obj-card-hdr').click();
    await cards.nth(1).locator('.fault-repair input[type="number"]').fill('20');
    await cards.nth(1).locator('.fault-repair input[type="number"]').press('Tab');

    // Aucun objectif n'est créé : la liste reste vide, c'est la panne qui porte ses points et la condition de sa réparation
    await expect(page.locator('#ev-list .obj-card:not(.fault)')).toHaveCount(0);
    const cfg = await page.evaluate(() => { const c = EvalModule.getConfig(); return { order: c.evalOrder, objs: c.objectives, faults: c.faults }; });
    expect(cfg.objs).toEqual([]);
    expect(cfg.order).toEqual(['f:1', 'f:2']);
    expect(cfg.faults.map((f) => [f.points, f.goal.check])).toEqual([[30, 'service_active'], [20, 'gateway_configured']]);
    expect(cfg.faults[1].goal.params).toMatchObject({ dev: 'PC-Bob', gateway: '192.168.1.1' });

    // Le bandeau ne signale plus rien ; l'élève part de 0 et gagne les points en réparant
    await closeEval(page);
    await expect(page.locator('#ctl-banner')).not.toContainText('sans points');
    await expect(page.locator('#ctl-banner')).toContainText('Départ élève : 0 / 50');
    await page.locator('#btn-sim').click();
    const dns = await openDeskApp(page, 'Serveur', 'Serveur DNS');
    await dns.locator('[data-act="toggle"]').click();
    await expect(builderScore(page)).toHaveText('📊 Score : 30 / 50 pts');
    await page.locator('#btn-cfg').click();

    // Enregistré puis rouvert : points et conditions conservés, toujours aucun objectif
    const saved = await exportFile(page, 'scenario', info.outputPath('pannes-notees.json'));
    await importScenarioFile(page, saved);
    const again = await page.evaluate(() => { const c = EvalModule.getConfig(); return { n: c.objectives.length, pts: c.faults.map((f) => f.points), goals: c.faults.map((f) => !!f.goal) }; });
    expect(again).toEqual({ n: 0, pts: [30, 20], goals: [true, true] });

    // Si un objectif de réparation existe déjà (scénarios fournis), il fait foi : pas de points sur la panne
    await importScenarioFile(page, scenarioPath('reseau-entreprise'));
    await openEval(page);
    await page.locator('#ev-list .obj-card.fault').nth(0).locator('.obj-card-hdr').click();
    await expect(page.locator('.fault-repair').nth(0)).toContainText('Réparation déjà mesurée par');
    await expect(page.locator('.fault-repair').nth(0).locator('input[type="number"]')).toHaveCount(0);
    expect(await page.evaluate(() => EvalModule.getConfig().faults.filter((f) => f.goal).length)).toBe(0);

    // Chez l'élève, les pannes notées sont listées comme des objectifs, score de départ 0
    await importScenarioFile(page, saved);
    const html = await exportFile(page, 'html', info.outputPath('pannes-notees.html'));
    await page.goto(pathToFileURL(html).href);
    await studentScore(page, 0);
    await expect(page.locator('.activ-obj')).toHaveCount(2);
  });

  test('carte de panne : « Service à activer », libellé proposé à l\'élève mis à jour dès le choix de l\'appareil', async ({ page }, info) => {
    // Réseau de l'entreprise sans objectif ni panne : aucun objectif de réparation écrit à la main ne mesure la nouvelle panne
    const data = readScenario('reseau-entreprise');
    data.activity.objectives = [];
    data.activity.faults = [];
    delete data.activity.evalOrder;
    const scenario = info.outputPath('sans-objectif.json');
    fs.writeFileSync(scenario, JSON.stringify(data));
    await page.goto(BUILDER_URL);
    await importScenarioFile(page, scenario);
    await openEval(page);
    await page.getByRole('button', { name: '+ Ajouter une panne' }).click();
    const card = page.locator('#ev-list .obj-card.fault').last();
    await card.locator('select').first().selectOption('service_down');
    await expect(card).toContainText('Service à activer');
    await expect(card).not.toContainText('Service à désactiver');

    const goal = card.locator('.fault-repair input').nth(1);                    // libellé affiché à l'élève
    await expect(goal).toHaveAttribute('placeholder', /choisissez d'abord l'appareil/);
    await card.locator('.bld-row', { hasText: 'Appareil concerné' }).locator('select').selectOption('Serveur');
    await card.locator('.bld-row', { hasText: 'Service à activer' }).locator('select').selectOption('http');
    await expect(goal).toHaveAttribute('placeholder', 'Le service web de Serveur est actif');
    await card.locator('.bld-row', { hasText: 'Service à activer' }).locator('select').selectOption('dns');
    await expect(goal).toHaveAttribute('placeholder', 'Le service DNS de Serveur est actif');
  });

  test('l\'essai est conservé quand on change de vue ; remis à zéro si l\'activité change ou sur demande', async ({ page }) => {
    await openBuilderWith(page, 'reseau-entreprise');
    const dnsOn = () => page.evaluate(() => Object.values(S.devs).find((d) => d.name === 'Serveur').dns.on);

    // Essai : on répare le DNS et on teste
    await page.locator('#btn-sim').click();
    const dns = await openDeskApp(page, 'Serveur', 'Serveur DNS');
    await dns.locator('[data-act="toggle"]').click();
    await runInTerminal(page, 'PC-Alice', 'nslookup WWW.MON-ENTREPRISE.FR');
    await expect(builderScore(page)).toHaveText('📊 Score : 30 / 100 pts');

    // Corrigé puis Départ élève, puis retour : l'essai est repris tel quel
    await page.locator('#btn-cfg').click();
    await page.locator('#btn-depart').click();
    expect(await dnsOn()).toBe(false);
    await page.locator('#btn-sim').click();
    await expect(builderScore(page)).toHaveText('📊 Score : 30 / 100 pts');
    expect(await dnsOn()).toBe(true);
    const alice = await openDeskApp(page, 'PC-Alice', 'Invite de commandes');
    await expect(alice.locator('.dterm-out')).toContainText('192.168.1.100');   // la sortie du terminal aussi

    // Le corrigé change (adresse d'un poste) : l'essai ne correspond plus, il repart de zéro, avec un message
    await page.locator('#btn-cfg').click();
    await page.evaluate(() => { const d = Object.values(S.devs).find((x) => x.name === 'PC-Charlie');
      d.ifaces[0].ip = '192.168.1.77'; render(); });
    await page.locator('#btn-sim').click();
    await expect(builderScore(page)).toHaveText('📊 Score : 0 / 100 pts');
    expect(await dnsOn()).toBe(false);

    // Un simple déplacement d'appareil dans le corrigé ne remet rien à zéro
    const dns2 = await openDeskApp(page, 'Serveur', 'Serveur DNS');
    await dns2.locator('[data-act="toggle"]').click();
    await expect(builderScore(page)).toHaveText('📊 Score : 20 / 100 pts');
    await page.locator('#btn-cfg').click();
    await page.evaluate(() => { const d = Object.values(S.devs).find((x) => x.name === 'PC-Alice'); d.x += 40; render(); });
    await page.locator('#btn-sim').click();
    await expect(builderScore(page)).toHaveText('📊 Score : 20 / 100 pts');

    // « Repartir de zéro » : confirmation (des points seraient perdus), puis départ neuf
    page.dialogs.length = 0;
    await page.locator('#view-bar button', { hasText: 'Repartir de zéro' }).click();
    expect(page.dialogs.at(-1)).toContain('20 % obtenus');
    await expect(builderScore(page)).toHaveText('📊 Score : 0 / 100 pts');
    expect(await dnsOn()).toBe(false);
  });

  test('le builder affiche le score de départ de l\'élève : 0 pour chaque scénario et chaque dépannage de l\'assistant', async ({ page }) => {
    for (const { name } of SCENARIOS) {
      await openBuilderWith(page, name);
      await corrigeComplet(page); await departZero(page);
    }
    for (const theme of ['maison', 'entreprise', 'classe']) {
      await menu(page, 'btn-wizard');
      await page.locator('.wz-card[data-group="type"][data-id="depannage"]').click();
      await page.locator(`.wz-card[data-group="theme"][data-id="${theme}"]`).click();
      await page.locator('#wz-create').click();
      await expect(page.locator('#wz-ovl')).not.toHaveClass(/open/);
      await corrigeComplet(page); await departZero(page);
    }
  });

  test('indice d\'un objectif : proposé selon l\'objectif et la panne, modifiable, affiché à l\'élève', async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-maison');
    await openEval(page);
    await page.locator('button[onclick="EvalModule.addObjective()"]').click();
    const card = page.locator('#ev-list .obj-card[data-objid]').last();
    const hint = card.locator('.obj-hint-in');
    await expect(hint).toHaveValue('Terminal de … : ping …');
    await card.locator('.bld-row', { hasText: 'Type de vérification' }).locator('select').selectOption('cable_exists');
    await card.locator('.bld-row', { hasText: 'Appareil A' }).locator('select').selectOption('PC-Bureau');
    await card.locator('.bld-row', { hasText: 'Appareil B' }).locator('select').selectOption('Switch-Salon');
    await expect(hint).toHaveValue('Outil Liaison : reliez PC-Bureau à Switch-Salon');

    // Une panne « câble débranché » sur ce câble : l'indice proposé devient un indice de dépannage
    await page.locator('button[onclick="EvalModule.addFault()"]').click();
    const fcard = page.locator('#ev-list .obj-card[data-fltid]').last();
    await fcard.locator('.bld-row', { hasText: 'Type de panne' }).locator('select').selectOption('missing_cable');
    await fcard.locator('.bld-row', { hasText: 'Appareil A' }).locator('select').selectOption('PC-Bureau');
    await fcard.locator('.bld-row', { hasText: 'Appareil B' }).locator('select').selectOption('Switch-Salon');
    await expect(fcard.locator('.flt-label-in')).toHaveValue('Câble débranché · PC-Bureau – Switch-Salon');
    await expect(hint).toHaveValue('ipconfig est bon mais rien ne passe ? Regardez les câbles de PC-Bureau');

    // Réécrit par le professeur : gardé ; ↺ revient à la proposition
    await hint.fill('Regarde derrière le bureau');
    await hint.press('Tab');
    await card.locator('.bld-row', { hasText: 'Points' }).locator('input').fill('12');
    await card.locator('.bld-row', { hasText: 'Points' }).locator('input').press('Tab');
    await expect(hint).toHaveValue('Regarde derrière le bureau');
    await card.locator('.obj-hint-reset').click();
    await expect(hint).toHaveValue('ipconfig est bon mais rien ne passe ? Regardez les câbles de PC-Bureau');
    await hint.fill('Regarde derrière le bureau');
    await hint.press('Tab');

    // Chez l'élève, sous l'objectif non atteint
    const file = await exportFile(page, 'html', info.outputPath('indice.html'));
    await page.goto(pathToFileURL(file).href);
    await expect(page.locator('.ao-hint', { hasText: 'Regarde derrière le bureau' })).toHaveCount(1);
  });

  test('câble débranché : le professeur le rebranche en vue Essai, l\'objectif compte (au bon switch seulement)', async ({ page }) => {
    await openBuilderWith(page, 'reseau-maison');
    await menu(page, 'btn-wizard');
    await page.locator('.wz-card[data-group="type"][data-id="depannage"]').click();
    await page.locator('.wz-card[data-group="theme"][data-id="maison"]').click();
    await page.locator('.wz-card[data-group="level"][data-id="college"]').click();
    await page.locator('#wz-create').click();
    await expect(page.locator('#wz-ovl')).not.toHaveClass(/open/);
    await corrigeComplet(page); await departZero(page);
    const fault = await page.evaluate(() => {
      const f = EvalModule.getConfig().faults.find((x) => x.type === 'missing_cable'); return f.params || f; });
    const pts = await page.evaluate(() => EvalModule.getConfig().objectives.find((o) => o.check === 'cable_exists').points);
    const [pc, sw, box] = [await deviceId(page, fault.devA), await deviceId(page, fault.devB), await deviceId(page, 'Box')];
    // En Essai, la panne a débranché le câble : le professeur le rebranche à l'outil Câble
    await page.locator('#btn-sim').click();
    expect(await linkList(page)).not.toContainEqual(expect.objectContaining({ from: pc, to: sw }));
    await page.evaluate(([a, b]) => {
      Object.keys(S.links).forEach((k) => { const l = S.links[k];
        if ((l.from === a && l.to === b) || (l.from === b && l.to === a)) delete S.links[k]; });
      render(); checkAllObjectives();
    }, [pc, sw]);
    await expect(builderScore(page)).toHaveText('📊 Score : 0 / 100 pts');
    await page.locator('#pi-link').click();
    await page.locator(`#gd${pc}`).click();
    await page.locator(`#gd${box}`).click();
    await page.waitForTimeout(200);
    await expect(builderScore(page)).toHaveText('📊 Score : 0 / 100 pts');   // sur la Box : pas le switch indiqué
    await page.evaluate(([a, b]) => {
      Object.keys(S.links).forEach((k) => { const l = S.links[k];
        if ((l.from === a && l.to === b) || (l.from === b && l.to === a)) delete S.links[k]; });
      render(); checkAllObjectives();
    }, [pc, box]);
    await page.locator(`#gd${pc}`).click();
    await page.locator(`#gd${sw}`).click();
    await expect(builderScore(page)).toHaveText(`📊 Score : ${pts} / 100 pts`);
  });

  test('Variante : plus exigeante, panne déplacée, puis réparée chez l\'élève', async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-entreprise');
    await menu(page, 'btn-variant');
    await expect(page.locator('#wz-create')).toBeDisabled();    // rien ne change encore
    await page.locator('.wz-card[data-group="exigence"][data-id="demanding"]').click();
    await page.locator('.wz-card[data-group="faults"][data-id="move"]').click();
    await expect(page.locator('.wz-report')).toContainText('déplacée de PC-Bob vers PC-Charlie');
    await expect(page.locator('.wz-audit')).toContainText('Vérifié');
    await page.locator('#wz-create').click();
    await expect(page.locator('#ev-title')).toHaveValue(/autres pannes, version exigeante$/);
    await expect(page.locator('#ev-mastery')).toHaveValue('70');
    const cfg = await page.evaluate(() => EvalModule.getConfig());
    expect(cfg.faults.map((f) => f.params.dev)).toEqual(['Serveur', 'PC-Charlie']);
    const gw = cfg.objectives.find((o) => o.check === 'gateway_configured');
    expect(gw.params).toEqual({ dev: 'PC-Charlie', gateway: '@routeur' });
    expect(cfg.objectives.some((o) => o.hint)).toBe(false);

    const file = await exportFile(page, 'html', info.outputPath('variante-entreprise.html'));
    await page.goto(pathToFileURL(file).href);
    await studentScore(page, 0);
    await expect(page.locator('.ao-hint')).toHaveCount(0);
    await setGateway(page, 'PC-Charlie', '192.168.1.1');
    await studentScore(page, gw.points);
  });

  test('Variante : choix de pannes combinés (autres appareils + une de plus) sur le réseau maison', async ({ page }) => {
    await openBuilderWith(page, 'reseau-maison');
    await menu(page, 'btn-variant');
    const card = (id) => page.locator(`.wz-card[data-group="faults"][data-id="${id}"]`);
    await card('move').click();
    await expect(page.locator('.wz-report')).toContainText('Ajoutez-en un sur le schéma');
    await expect(page.locator('#wz-create')).toBeDisabled();     // seul poste fixe : rien ne bouge
    await card('add').click();
    await expect(card('move')).toHaveClass(/\bon\b/);
    await expect(card('add')).toHaveClass(/\bon\b/);
    await expect(card('same')).not.toHaveClass(/\bon\b/);
    await card('remove').click();                                // une de moins remplace une de plus
    await expect(card('add')).not.toHaveClass(/\bon\b/);
    await card('add').click();
    await expect(card('remove')).not.toHaveClass(/\bon\b/);
    await expect(page.locator('.wz-report')).toContainText('Panne ajoutée');
    await expect(page.locator('.wz-audit')).toContainText('Vérifié');
    await page.locator('#wz-create').click();
    expect((await page.evaluate(() => EvalModule.getConfig())).faults).toHaveLength(2);
    await menu(page, 'btn-variant');
    await card('move').click();
    await card('same').click();                                  // « Les mêmes » vide la sélection
    await expect(card('move')).not.toHaveClass(/\bon\b/);
    await expect(page.locator('#wz-create')).toBeDisabled();
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
    await importScenarioFile(page, file);
    // Comme chez l'élève : pannes appliquées et routes recalculées à l'import, rien n'est acquis.
    await corrigeComplet(page); await departZero(page);
  });
});

/* ── Souris sur le schéma : palette, déplacement, câblage, double-clic ──
   Gestes réels (souris de Chrome), sans appeler les fonctions du moteur : ils verrouillent
   ce que le passage au mode unique ne doit pas casser. */

const DEV_W = 126, DEV_H = 112;   // DW, DH du moteur

const canvasBox = (page) => page.locator('#canvas').boundingBox();

/* Centre d'un appareil, en coordonnées de la page. */
async function devCenter(page, id) {
  const box = await canvasBox(page);
  const d = await page.evaluate((i) => ({ x: S.devs[i].x, y: S.devs[i].y }), id);
  return { x: box.x + d.x + DEV_W / 2, y: box.y + d.y + DEV_H / 2 };
}

const devPos = (page, id) => page.evaluate((i) => ({ x: S.devs[i].x, y: S.devs[i].y }), id);
const linkList = (page) => page.evaluate(() =>
  Object.values(S.links).map((l) => ({ id: l.id, from: l.from, to: l.to, type: l.type || 'cable' })));

/* Point libre du schéma (coordonnées du canevas) : assez loin de tout appareil pour y déposer. */
const freeSpot = (page) => page.evaluate(() => {
  const r = document.getElementById('canvas').getBoundingClientRect();
  const ds = Object.values(S.devs);
  for (let y = DH; y < r.height - DH; y += 20) {
    for (let x = DW; x < r.width - DW; x += 20) {
      if (ds.every((d) => x + DW / 2 + 20 < d.x || x - DW / 2 - 20 > d.x + DW
        || y + DH / 2 + 20 < d.y || y - DH / 2 - 20 > d.y + DH)) return { x, y };
    }
  }
  throw new Error('aucune place libre sur le schéma');
});

/* Glisse un élément de la palette et le dépose sur le schéma ; rend l'id de l'appareil créé. */
async function dropFromPalette(page, item, x, y) {
  const before = await page.evaluate(() => Object.keys(S.devs));
  await page.locator('#pi-' + item).dragTo(page.locator('#canvas'), { targetPosition: { x, y } });
  return page.evaluate((b) => Object.keys(S.devs).find((k) => !b.includes(k)) || null, before);
}

async function clickDev(page, id, options) {
  const c = await devCenter(page, id);
  await page.mouse.click(c.x, c.y, options);
}

/* Glisser à la souris : appui sur l'appareil, déplacement, relâchement. */
async function dragDev(page, id, dx, dy) {
  const c = await devCenter(page, id);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + dx, c.y + dy, { steps: 6 });
  await page.mouse.up();
}

async function openStudentExport(page, info, scenario) {
  await openBuilderWith(page, scenario);
  const file = await exportFile(page, 'html', info.outputPath(scenario + '-souris.html'));
  await page.goto(pathToFileURL(file).href);
  await studentScore(page, 0);
}

test.describe('Souris sur le schéma', () => {
  test('palette : un appareil glissé est créé à l\'endroit du dépôt, sélectionné, sa fiche ouverte (builder)', async ({ page }) => {
    await page.goto(BUILDER_URL);
    await expect(page.locator('#cv-hint')).toBeVisible();

    const pc = await dropFromPalette(page, 'pc-desktop', 300, 200);
    expect(pc).not.toBeNull();
    const d = await page.evaluate((i) => S.devs[i], pc);
    expect([d.type, d.kind]).toEqual(['pc', 'desktop']);
    expect(Math.abs(d.x - (300 - DEV_W / 2))).toBeLessThanOrEqual(2);
    expect(Math.abs(d.y - (200 - DEV_H / 2))).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => S.sel)).toBe(pc);
    await expect(page.locator('#props-body input').first()).toHaveValue(d.name);
    await expect(page.locator(`#gd${pc}`)).toBeVisible();
    await expect(page.locator('#cv-hint')).toBeHidden();

    // Chaque type de la palette donne le bon appareil
    for (const [item, type, kind] of [['pc-laptop', 'pc', 'laptop'], ['pc-phone', 'pc', 'phone'], ['server', 'server'],
      ['switch', 'switch'], ['router', 'router'], ['wifi_router', 'wifi_router'], ['internet', 'internet']]) {
      const spot = await freeSpot(page);
      const id = await dropFromPalette(page, item, spot.x, spot.y);
      const made = await page.evaluate((i) => ({ type: S.devs[i].type, kind: S.devs[i].kind }), id);
      expect(made.type, item).toBe(type);
      if (kind) expect(made.kind, item).toBe(kind);
      expect(await page.evaluate(() => S.sel), item).toBe(id);
    }
    expect(await page.evaluate(() => Object.keys(S.devs).length)).toBe(8);

    // Annotations : cadre et texte
    await page.locator('#pi-frame').dragTo(page.locator('#canvas'), { targetPosition: { x: 400, y: 300 } });
    await page.locator('#pi-anntext').dragTo(page.locator('#canvas'), { targetPosition: { x: 500, y: 60 } });
    expect(await page.evaluate(() => [Object.keys(S.frames).length, Object.keys(S.texts).length])).toEqual([1, 1]);

    // Un dépôt hors du schéma ne crée rien
    await page.locator('#pi-pc-desktop').dragTo(page.locator('#props-body'));
    expect(await page.evaluate(() => Object.keys(S.devs).length)).toBe(8);
  });

  test('déplacement : glisser un appareil le déplace avec ses câbles ; un clic ou l\'outil Câble ne le déplacent pas', async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-maison');
    const laptop = await deviceId(page, 'Laptop');
    const start = await devPos(page, laptop);

    // Clic simple : sélection, fiche, aucune position modifiée
    await clickDev(page, laptop);
    expect(await devPos(page, laptop)).toEqual(start);
    expect(await page.evaluate(() => [S.sel, S.drag])).toEqual([laptop, null]);
    await expect(page.locator('#props-body input').first()).toHaveValue('Laptop');

    // Glisser : l'appareil suit la souris, ses liaisons aussi. (Pause : deux appuis rapprochés sur
    // le même appareil comptent comme un double-clic, qui ouvrirait son bureau par-dessus le schéma.)
    await page.waitForTimeout(600);
    const c = await devCenter(page, laptop);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 30, c.y + 20, { steps: 4 });
    expect(await page.evaluate(() => S.drag && S.drag.id)).toBe(laptop);
    await page.mouse.move(c.x + 70, c.y - 50, { steps: 4 });
    await page.mouse.up();
    const moved = await devPos(page, laptop);
    expect(Math.abs(moved.x - (start.x + 70))).toBeLessThanOrEqual(1);
    expect(Math.abs(moved.y - (start.y - 50))).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => S.drag)).toBeNull();
    const ends = await page.evaluate((id) => {
      const l = Object.values(S.links).find((k) => k.from === id || k.to === id);
      const el = document.getElementById(l.id);
      const p = l.from === id ? ['x1', 'y1'] : ['x2', 'y2'];
      return [Number(el.getAttribute(p[0])), Number(el.getAttribute(p[1]))];
    }, laptop);
    expect(ends).toEqual([moved.x + DEV_W / 2, moved.y + DEV_H / 2]);

    // Après le relâchement, la souris ne déplace plus rien
    await page.mouse.move(c.x + 200, c.y + 100, { steps: 3 });
    expect(await devPos(page, laptop)).toEqual(moved);

    // Bord du schéma : l'appareil reste à l'intérieur (4 px), et sortir du schéma arrête le glisser
    const box = await canvasBox(page);
    const c2 = await devCenter(page, laptop);
    await page.waitForTimeout(600);
    await page.mouse.move(c2.x, c2.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 3, c2.y, { steps: 8 });
    const edge = { x: 4, y: moved.y };
    expect(await devPos(page, laptop)).toEqual(edge);
    await page.mouse.move(box.x - 30, c2.y, { steps: 3 });   // sur la palette
    expect(await page.evaluate(() => S.drag)).toBeNull();
    await page.mouse.move(box.x + 400, c2.y + 100, { steps: 3 });
    await page.mouse.up();
    expect(await devPos(page, laptop)).toEqual(edge);
    await expect(page.locator('.dwin')).toHaveCount(0);

    // Outil Câble : glisser un appareil ne le déplace pas
    const pcB = await deviceId(page, 'PC-Bureau');
    const pcStart = await devPos(page, pcB);
    await page.locator('#pi-link').click();
    await dragDev(page, pcB, 60, 40);
    expect(await devPos(page, pcB)).toEqual(pcStart);
    await page.keyboard.press('Escape');

    // Le corrigé exporté garde les nouvelles positions ; l'élève déplace de la même façon
    const file = await exportFile(page, 'html', info.outputPath('maison-deplace.html'));
    await page.goto(pathToFileURL(file).href);
    const sLaptop = await deviceId(page, 'Laptop');
    expect(await devPos(page, sLaptop)).toEqual(edge);
    await dragDev(page, sLaptop, 90, 60);
    const sMoved = await devPos(page, sLaptop);
    expect(Math.abs(sMoved.x - (edge.x + 90))).toBeLessThanOrEqual(1);
    expect(Math.abs(sMoved.y - (edge.y + 60))).toBeLessThanOrEqual(1);
    await studentScore(page, 0);   // déplacer ne rapporte rien
  });

  test('câblage à la souris : clic, aperçu, annulation, refus, WiFi, glisser, double-clic, sélection et suppression d\'un câble', async ({ page }) => {
    await page.goto(BUILDER_URL);
    const pc = await dropFromPalette(page, 'pc-desktop', 200, 150);
    const sw = await dropFromPalette(page, 'switch', 480, 150);
    const srv = await dropFromPalette(page, 'server', 760, 150);
    const phone = await dropFromPalette(page, 'pc-phone', 200, 400);
    const box = await dropFromPalette(page, 'wifi_router', 480, 400);
    const cv = await canvasBox(page);
    const prev = () => page.locator('#prev-line').evaluate((el) =>
      ({ shown: el.getAttribute('display') !== 'none', x1: +el.getAttribute('x1'), y1: +el.getAttribute('y1'), x2: +el.getAttribute('x2'), y2: +el.getAttribute('y2') }));
    const state = () => page.evaluate(() => ({ tool: S.tool, from: S.cableFrom, n: Object.keys(S.links).length }));

    // Premier clic : départ du câble, l'aperçu suit la souris
    await page.locator('#pi-link').click();
    await clickDev(page, pc);
    expect(await state()).toEqual({ tool: 'link', from: pc, n: 0 });
    await page.mouse.move(cv.x + 340, cv.y + 260, { steps: 3 });
    const p = await prev();
    expect(p.shown).toBe(true);
    expect([p.x1, p.y1]).toEqual([200, 150]);
    expect(Math.abs(p.x2 - 340) + Math.abs(p.y2 - 260)).toBeLessThanOrEqual(2);

    // Second clic : câble créé, aperçu effacé, l'outil Câble reste actif
    await clickDev(page, sw);
    expect(await state()).toEqual({ tool: 'link', from: null, n: 1 });
    expect(await linkList(page)).toEqual([expect.objectContaining({ from: pc, to: sw, type: 'cable' })]);
    expect((await prev()).shown).toBe(false);

    // Annulations : second clic sur le même appareil, ou clic dans le vide
    await clickDev(page, srv);
    await clickDev(page, srv);
    expect(await state()).toEqual({ tool: 'link', from: null, n: 1 });
    await clickDev(page, srv);
    await page.mouse.click(cv.x + 760, cv.y + 420);
    expect(await state()).toEqual({ tool: 'link', from: null, n: 1 });
    expect((await prev()).shown).toBe(false);

    // Refus : doublon (sans message), second câble d'un poste, téléphone sur un switch
    await clickDev(page, sw);
    await clickDev(page, pc);
    expect((await state()).n).toBe(1);
    await clickDev(page, pc);
    await clickDev(page, srv);
    await expect(page.locator('.notif')).toContainText('a déjà un câble');
    expect((await state()).n).toBe(1);
    await clickDev(page, phone);
    await clickDev(page, sw);
    await expect(page.locator('.notif')).toContainText('ne se connecte qu\'en WiFi');
    expect((await state()).n).toBe(1);

    // Téléphone vers la box : liaison WiFi, réseau de la box choisi sur le téléphone
    await clickDev(page, phone);
    await clickDev(page, box);
    expect((await linkList(page))[1]).toEqual(expect.objectContaining({ from: phone, to: box, type: 'wifi' }));
    expect(await page.evaluate(([t, b]) => S.devs[t].wifi.ssid === S.devs[b].ssid, [phone, box])).toBe(true);

    // Glisser d'un appareil à l'autre avec l'outil Câble : rien ne bouge, le câble reste en attente
    // sur l'appareil de départ et se termine au clic suivant
    const srvStart = await devPos(page, srv);
    const cs = await devCenter(page, srv), cw = await devCenter(page, sw);
    await page.mouse.move(cs.x, cs.y);
    await page.mouse.down();
    await page.mouse.move(cw.x, cw.y, { steps: 6 });
    await page.mouse.up();
    expect(await devPos(page, srv)).toEqual(srvStart);
    expect(await state()).toEqual({ tool: 'link', from: srv, n: 2 });
    await clickDev(page, sw);
    expect(await state()).toEqual({ tool: 'link', from: null, n: 3 });

    // Double-clic avec l'outil Câble : ni bureau, ni câble, rien en attente
    await clickDev(page, box, { clickCount: 2 });
    expect(await state()).toEqual({ tool: 'link', from: null, n: 3 });
    await expect(page.locator('.dwin')).toHaveCount(0);

    // Outil Sélection : un clic sur le câble le sélectionne (fiche « Câble réseau »), un clic dans le vide désélectionne
    await page.locator('#pi-sel').click();
    const cable = (await linkList(page))[0];
    const mid = { x: cv.x + (200 + 480) / 2, y: cv.y + 150 - 20 };   // sur le câble, hors de la pastille centrale
    const onCable = { x: cv.x + 300, y: cv.y + 150 };
    await page.mouse.click(onCable.x, onCable.y);
    expect(await page.evaluate(() => S.sel)).toBe(cable.id);
    await expect(page.locator('#props-body')).toContainText('Câble réseau');
    await expect(page.locator('#' + cable.id)).toHaveClass(/cable-sel/);
    await page.mouse.click(mid.x, mid.y - 60);
    expect(await page.evaluate(() => S.sel)).toBeNull();

    // Clic droit : sélectionne l'appareil ou le câble, ne supprime rien
    await clickDev(page, sw, { button: 'right' });
    expect(await page.evaluate(() => S.sel)).toBe(sw);
    await page.mouse.click(onCable.x, onCable.y, { button: 'right' });
    expect(await page.evaluate(() => S.sel)).toBe(cable.id);
    expect((await state()).n).toBe(3);

    // Outil Supprimer : un clic sur un câble l'efface ; sur un appareil, l'efface avec ses liaisons
    await page.locator('#pi-del').click();
    await page.mouse.click(onCable.x, onCable.y);
    expect((await linkList(page)).map((l) => l.id)).not.toContain(cable.id);
    await clickDev(page, box);
    expect(await page.evaluate((id) => !!S.devs[id], box)).toBe(false);
    expect(await linkList(page)).toEqual([expect.objectContaining({ from: srv, to: sw })]);
    expect(await page.evaluate(() => S.tool)).toBe('delete');
  });

  test('double-clic sur un appareil (builder, vue Corrigé) : ouvre son bureau sans le déplacer ; deux clics lents ne l\'ouvrent pas', async ({ page }) => {
    await openBuilderWith(page, 'reseau-maison');
    const pcB = await deviceId(page, 'PC-Bureau');
    const start = await devPos(page, pcB);
    const c = await devCenter(page, pcB);

    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(600);
    await page.mouse.click(c.x, c.y);
    await expect(page.locator('.dwin')).toHaveCount(0);

    await page.waitForTimeout(600);
    await page.mouse.dblclick(c.x, c.y);
    await expect(page.locator(`#dwin-${pcB}`)).toBeVisible();
    expect(await devPos(page, pcB)).toEqual(start);
    expect(await page.evaluate(() => [S.sel, S.drag])).toEqual([pcB, null]);

    // La fenêtre ouverte, la souris qui passe sur le schéma ne déplace pas l'appareil
    const cv = await canvasBox(page);
    await page.mouse.move(cv.x + 40, cv.y + 40, { steps: 4 });
    expect(await devPos(page, pcB)).toEqual(start);
  });

  test('élève : un seul comportement, bandeau du bas déplié ou replié (palette, câble, fiche, glisser, double-clic, Suppr)', async ({ page }, info) => {
    await openStudentExport(page, info, 'reseau-maison');
    const boxId = await deviceId(page, 'Box-WiFi');
    const laptop = await deviceId(page, 'Laptop');

    await expect(page.locator('#btn-cfg, #btn-sim')).toHaveCount(0);        // plus de boutons de mode
    for (const mode of ['déplié', 'replié']) {
      if (mode === 'replié') {
        await page.locator('#bot-toggle').click();
        await expect(page.locator('.bot')).toHaveClass(/closed/);
      }

      // Palette active : déposer un PC fixe, le câbler à la box
      await expect(page.locator('#pi-pc-desktop'), mode).not.toHaveClass(/disabled/);
      const spot = await freeSpot(page);
      const pc = await dropFromPalette(page, 'pc-desktop', spot.x, spot.y);
      expect(pc, mode).not.toBeNull();
      expect(await page.evaluate(() => S.sel)).toBe(pc);
      await page.locator('#pi-link').click();
      await clickDev(page, pc);
      await clickDev(page, boxId);
      expect(await linkList(page), mode).toContainEqual(expect.objectContaining({ from: pc, to: boxId, type: 'cable' }));
      await page.keyboard.press('Escape');

      // Clic : fiche modifiable, avec les applications de l'appareil
      await clickDev(page, laptop);
      await expect(page.locator('#props-body input').first()).toHaveValue('Laptop');
      await expect(page.locator('#props-body input').first()).toBeEditable();
      await expect(page.locator('#props-body .desk-papps button', { hasText: 'Invite de commandes' })).toBeVisible();

      // Glisser : l'appareil se déplace
      await page.waitForTimeout(600);
      const start = await devPos(page, laptop);
      await dragDev(page, laptop, 40, 30);
      const moved = await devPos(page, laptop);
      expect(Math.abs(moved.x - start.x - 40) + Math.abs(moved.y - start.y - 30), mode).toBeLessThanOrEqual(2);
      await expect(page.locator('.dwin')).toHaveCount(0);

      // Double-clic, juste après le glisser : le bureau s'ouvre, l'appareil ne bouge pas
      await clickDev(page, laptop, { clickCount: 2 });
      await expect(page.locator(`#dwin-${laptop}`), mode).toBeVisible();
      expect(await devPos(page, laptop)).toEqual(moved);
      await page.locator(`#dwin-${laptop} .dw-x`).click();

      // Suppr : l'appareil sélectionné est effacé, avec son câble
      await clickDev(page, pc);
      await page.keyboard.press('Delete');
      expect(await page.evaluate((id) => !!S.devs[id], pc), mode).toBe(false);
      expect((await linkList(page)).some((l) => l.from === pc || l.to === pc)).toBe(false);
    }
    await studentScore(page, 0);
  });

  test('élève : Ctrl+Z rend un appareil supprimé par erreur, annule un déplacement, un câble et une adresse ; Ctrl+Y rétablit', async ({ page }, info) => {
    await openStudentExport(page, info, 'reseau-maison');
    const pcB = await deviceId(page, 'PC-Bureau');
    const box = await deviceId(page, 'Box-WiFi');
    const undo = page.locator('#btn-undo'), redo = page.locator('#btn-redo');
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();
    const links0 = await linkList(page);

    // Réparation, puis suppression par erreur : Ctrl+Z rend l'appareil, ses câbles, son réglage et ses points
    await setGateway(page, 'PC-Bureau', '192.168.1.1');
    await studentScore(page, 35);
    await clickDev(page, pcB);
    await page.keyboard.press('Delete');
    expect(await page.evaluate((id) => !!S.devs[id], pcB)).toBe(false);
    await studentScore(page, 0);
    await page.keyboard.press('Control+z');
    expect(await page.evaluate((id) => S.devs[id].ifaces[0].gateway, pcB)).toBe('192.168.1.1');
    expect(await linkList(page)).toEqual(links0);
    await studentScore(page, 35);
    await expect(redo).toBeEnabled();

    // Ctrl+Y rétablit la suppression, le bouton ↩ l'annule de nouveau
    await page.keyboard.press('Control+y');
    expect(await page.evaluate((id) => !!S.devs[id], pcB)).toBe(false);
    await undo.click();
    expect(await page.evaluate((id) => !!S.devs[id], pcB)).toBe(true);

    // Un déplacement s'annule en un pas
    const start = await devPos(page, pcB);
    await page.waitForTimeout(600);
    await dragDev(page, pcB, 70, 40);
    expect(await devPos(page, pcB)).not.toEqual(start);
    await page.locator('#cw').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    expect(await devPos(page, pcB)).toEqual(start);

    // Un poste ajouté et câblé : deux pas (le câble, puis le poste)
    const spot = await freeSpot(page);
    const pc = await dropFromPalette(page, 'pc-desktop', spot.x, spot.y);
    await page.locator('#pi-link').click();
    await clickDev(page, pc);
    await clickDev(page, box);
    await page.keyboard.press('Escape');
    expect(await linkList(page)).toHaveLength(links0.length + 1);
    await page.keyboard.press('Control+z');
    expect(await linkList(page)).toEqual(links0);
    expect(await page.evaluate((id) => !!S.devs[id], pc)).toBe(true);
    await page.keyboard.press('Control+z');
    expect(await page.evaluate((id) => !!S.devs[id], pc)).toBe(false);

    // Pendant une saisie, Ctrl+Z reste celui du champ : le réseau ne recule pas
    await clickDev(page, pcB);
    const name = page.locator('#props-body input').first();
    await name.focus();
    await page.keyboard.press('Control+z');
    expect(await page.evaluate((id) => !!S.devs[id], pcB)).toBe(true);
    expect(await page.evaluate((id) => S.devs[id].ifaces[0].gateway, pcB)).toBe('192.168.1.1');

    // L'historique ne survit pas au rechargement ; le réseau, si
    await page.reload();
    await expect(page.locator('#btn-undo')).toBeDisabled();
    expect(await page.evaluate((id) => S.devs[id].ifaces[0].gateway, pcB)).toBe('192.168.1.1');
  });

  test('builder : Ctrl+Z annule aussi une adresse, un câble posé et un appareil ajouté ; rien ne s\'annule en vue Départ élève', async ({ page }) => {
    await openBuilderWith(page, 'reseau-maison');
    const pcB = await deviceId(page, 'PC-Bureau');
    const box = await deviceId(page, 'Box-WiFi');
    const links0 = await linkList(page);
    const n0 = await page.evaluate(() => Object.keys(S.devs).length);

    await setGateway(page, 'PC-Bureau', '192.168.1.254');
    const spot = await freeSpot(page);
    const pc = await dropFromPalette(page, 'pc-desktop', spot.x, spot.y);
    await page.locator('#pi-link').click();
    await clickDev(page, pc);
    await clickDev(page, box);
    await page.keyboard.press('Escape');
    await page.locator('#cw').click({ position: { x: 5, y: 5 } });

    // Départ élève : lecture seule, l'historique du corrigé n'y est pas rejoué
    await page.locator('#btn-depart').click();
    await page.keyboard.press('Control+z');
    await page.locator('#btn-cfg').click();
    expect(await linkList(page)).toHaveLength(links0.length + 1);

    await page.keyboard.press('Control+z');                                  // le câble
    expect(await linkList(page)).toEqual(links0);
    await page.keyboard.press('Control+z');                                  // le poste
    expect(await page.evaluate(() => Object.keys(S.devs).length)).toBe(n0);
    await page.keyboard.press('Control+z');                                  // la passerelle
    expect(await page.evaluate((id) => S.devs[id].ifaces[0].gateway, pcB)).toBe('192.168.1.1');
    await page.keyboard.press('Control+y');
    expect(await page.evaluate((id) => S.devs[id].ifaces[0].gateway, pcB)).toBe('192.168.1.254');
  });

  test('un glisser suivi d\'un clic n\'ouvre pas le bureau ; un double-clic qui tremble ne déplace pas l\'appareil', async ({ page }) => {
    await openBuilderWith(page, 'reseau-maison');
    const pcB = await deviceId(page, 'PC-Bureau');

    // Clic moins de 450 ms après l'appui qui a commencé le glisser : ce n'est pas un double-clic
    await dragDev(page, pcB, 50, 30);
    await clickDev(page, pcB);
    await expect(page.locator('.dwin')).toHaveCount(0);

    // Double-clic avec deux pixels de tremblement : le bureau s'ouvre, l'appareil reste en place
    await page.waitForTimeout(600);
    const start = await devPos(page, pcB);
    const c = await devCenter(page, pcB);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 2, c.y + 1);
    await page.mouse.up();
    await page.mouse.down();
    await page.mouse.move(c.x + 1, c.y + 2);
    await page.mouse.up();
    await expect(page.locator(`#dwin-${pcB}`)).toBeVisible();
    expect(await devPos(page, pcB)).toEqual(start);
    expect(await page.evaluate(() => S.drag)).toBeNull();
  });

  test('vue Départ élève : lecture seule à la souris, au clavier et dans la fiche ; vue Essai : tout se règle, le corrigé reste intact', async ({ page }) => {
    await openBuilderWith(page, 'reseau-maison');
    const pcB = await deviceId(page, 'PC-Bureau');
    const start = await devPos(page, pcB);
    const n = await page.evaluate(() => [Object.keys(S.devs).length, Object.keys(S.links).length]);
    const counts = () => page.evaluate(() => [Object.keys(S.devs).length, Object.keys(S.links).length]);

    await page.locator('#btn-depart').click();
    await expect(page.locator('#pi-pc-desktop')).toHaveClass(/disabled/);
    await expect(page.locator('#pi-link')).toHaveClass(/disabled/);

    // Glisser : rien ne bouge ; la fiche s'affiche, champs figés, sans bouton d'action
    await dragDev(page, pcB, 60, 40);
    expect(await devPos(page, pcB)).toEqual(start);
    await expect(page.locator('#props-body input').first()).toHaveValue('PC-Bureau');
    await expect(page.locator('#props-body input').first()).toBeDisabled();
    await expect(page.locator('.pr', { hasText: 'Passerelle' }).locator('input').first()).toBeDisabled();
    await expect(page.locator('#props-body button', { hasText: 'Supprimer' })).toBeHidden();
    await expect(page.locator('#props-body button', { hasText: 'Dupliquer' })).toBeHidden();

    // Suppr sur l'appareil puis sur un câble : rien n'est effacé
    await page.keyboard.press('Delete');
    const lid = await page.evaluate(() => Object.keys(S.links)[0]);
    await page.evaluate((id) => selLink(id), lid);
    await expect(page.locator('#props-body')).toContainText('Câble réseau');
    await expect(page.locator('#props-body button', { hasText: 'Supprimer' })).toBeHidden();
    await page.keyboard.press('Delete');
    expect(await counts()).toEqual(n);

    // Le bureau s'ouvre quand même (lecture seule), sans terminal
    await page.waitForTimeout(600);
    await clickDev(page, pcB, { clickCount: 2 });
    const win = page.locator(`#dwin-${pcB}`);
    await expect(win).toBeVisible();
    await expect(win.locator('.dico', { hasText: 'Invite de commandes' })).toHaveCount(0);

    // Essai : palette active, la fiche répare la panne, l'appareil se déplace
    await page.locator('#btn-sim').click();
    await expect(page.locator('#pi-pc-desktop')).not.toHaveClass(/disabled/);
    await expect(builderScore(page)).toHaveText(/Score : 0 \/ 100/);
    await setGateway(page, 'PC-Bureau', '192.168.1.1');
    await expect(builderScore(page)).toHaveText(/Score : 35 \/ 100/);
    await page.waitForTimeout(600);
    await dragDev(page, pcB, 60, 40);
    const moved = await devPos(page, pcB);
    expect(Math.abs(moved.x - start.x - 60) + Math.abs(moved.y - start.y - 40)).toBeLessThanOrEqual(2);
    const spot = await freeSpot(page);
    expect(await dropFromPalette(page, 'pc-desktop', spot.x, spot.y)).not.toBeNull();

    // Retour au corrigé : ni le poste ajouté, ni le déplacement de l'essai
    await page.locator('#btn-cfg').click();
    expect(await counts()).toEqual(n);
    expect(await devPos(page, pcB)).toEqual(start);
    await expect(page.locator('#props-body input')).toHaveCount(0);
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

  test('sans réparation : statut failed et note de 0 transmis au LMS', async ({ page }) => {
    const sco = await openInLms(page, page.zipFile);
    await studentScore(sco, 0);
    expect((await readCmi(page))['cmi.core.lesson_status']).toBe('incomplete');

    await finish(sco);
    await expect.poll(() => page.dialogs.at(-1)).toContain('À améliorer');
    const cmi = await readCmi(page);
    expect(cmi['cmi.core.lesson_status']).toBe('failed');
    expect(cmi['cmi.core.score.raw']).toBe('0');
    expect(await page.evaluate(() => window.lmsCalls)).toContain('Finish');
  });

  test('reprise : quitter, revenir sur un autre poste, terminer avec passed et 100', async ({ page, browser, problems }, info) => {
    const sco = await openInLms(page, page.zipFile);
    await studentScore(sco, 0);
    await solveMaison(sco);
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

/* ── Barre unique et menu ☰ ──────────────────────────────────────────── */

test.describe('Barre du haut et menu ☰', () => {
  test('une seule barre : menu, onglets, vues ; plus de barre « SCORM Builder » ni d\'onglet Générer', async ({ page }) => {
    await page.goto(BUILDER_URL);
    await expect(page.locator('#bld-nav')).toHaveCount(0);
    await expect(page.locator('.bld-tab')).toHaveCount(0);   // plus d'onglets Réseau / Évaluation : l'évaluation est dans le bandeau du bas
    for (const id of ['#menu-btn', '#btn-cfg', '#btn-depart', '#btn-sim', '#btn-undo', '#btn-redo', '#hdr-score']) {
      await expect(page.locator(id)).toBeVisible();
    }
    // Ce que le menu a remplacé : ♻, 💾 sans effet, 🔄, ⤢, 📤, 📂, Terminer, 🎓
    for (const id of ['#t-clear', '#t-save', '#load-inp']) await expect(page.locator(id)).toHaveCount(0);
    await expect(page.locator('.hdr .fbtn')).toHaveCount(0);
    // Tout tient sur une ligne : l'en-tête ne dépasse pas une barre
    expect(await page.locator('.hdr').evaluate((e) => e.offsetHeight)).toBeLessThan(60);
  });

  test('le menu s\'ouvre, se ferme (clic ailleurs, Échap) et contient fichier, exports, aperçu', async ({ page }) => {
    await page.goto(BUILDER_URL);
    const menuEl = page.locator('#file-menu');
    await expect(menuEl).toBeHidden();
    await page.locator('#menu-btn').click();
    await expect(menuEl).toBeVisible();
    await expect(page.locator('#menu-btn')).toHaveAttribute('aria-expanded', 'true');
    for (const id of ['btn-wizard', 'btn-new', 'btn-open', 'btn-save', 'btn-variant',
      'mi-scorm', 'mi-html', 'mi-enonce', 'mi-corrige', 'mi-options', 'mi-preview', 'btn-fs']) {
      await expect(page.locator('#' + id)).toBeVisible();
    }
    await page.locator('#canvas').click({ position: { x: 300, y: 300 } });
    await expect(menuEl).toBeHidden();
    await page.locator('#menu-btn').click();
    await page.keyboard.press('Escape');
    await expect(menuEl).toBeHidden();
    await expect(page.locator('#menu-btn')).toHaveAttribute('aria-expanded', 'false');
  });

  test('Options d\'export : résumé, mot de passe, plan ; se ferme avec Échap, la croix ou le fond', async ({ page }) => {
    await openBuilderWith(page, 'reseau-maison');
    await menu(page, 'mi-options');
    const dlg = page.locator('#bld-overlay-gen');
    await expect(dlg).toHaveClass(/open/);
    await expect(page.locator('#gen-pwd')).toBeVisible();
    await expect(page.locator('#gen-plan')).toBeChecked();
    await expect(page.locator('#gen-status')).toContainText('Template élève prêt');
    await page.locator('#bld-overlay-gen .wz-x').click();
    await expect(dlg).not.toHaveClass(/open/);
    await menu(page, 'mi-options');
    await page.locator('#bld-overlay-gen').click({ position: { x: 5, y: 5 } });
    await expect(dlg).not.toHaveClass(/open/);
  });

  test('Nouveau : propose d\'abord de garder le travail non enregistré, puis repart d\'un builder vierge', async ({ page }) => {
    await openBuilderWith(page, 'reseau-maison');
    await page.waitForTimeout(1200);                                           // l'empreinte de référence se stabilise 0,8 s après l'ouverture
    await openEval(page);
    await page.locator('#ev-title').fill('Autre titre');                        // travail modifié, non enregistré
    page.dialogAction = 'dismiss';
    await menu(page, 'btn-new');
    await expect.poll(() => page.dialogs.at(-1)).toContain('pas enregistré');
    expect(await page.evaluate(() => Object.keys(S.devs).length)).toBeGreaterThan(0);   // refusé : rien n'est perdu

    page.dialogAction = 'accept';
    await menu(page, 'btn-new');
    await page.waitForLoadState('load');
    await expect.poll(() => page.evaluate(() => Object.keys(S.devs).length)).toBe(0);
    expect(page.dialogs.filter((d) => d.includes('pas enregistré')).length).toBe(2);   // une seule alerte par essai : pas de seconde au rechargement
  });
});

/* ── Évaluation dans le bandeau du bas ───────────────────────────────── */

test.describe('Bandeau Évaluation', () => {
  test('l\'évaluation s\'ouvre sous le schéma, qui reste visible ; Ctrl+2 l\'ouvre, Ctrl+1 le replie', async ({ page }) => {
    await openBuilderWith(page, 'reseau-lycee');
    await expect(page.locator('.bot')).toHaveClass(/closed/);
    await expect(page.locator('#tp-eval')).toBeHidden();
    const canvasBefore = (await page.locator('#cw').boundingBox()).height;

    await page.locator('#bt-eval').click();
    await expect(page.locator('#tp-eval')).toBeVisible();
    // titre, niveau, consignes, seuil, mode d'affichage, total, liste : tout est dans le bandeau
    for (const id of ['#ev-title', '#ev-level', '#ev-instructions', '#ev-mastery', '#ev-displaymode', '#ev-total-pts', '#ev-list']) {
      await expect(page.locator('#tp-eval ' + id)).toBeVisible();
    }
    await expect(page.locator('#ev-title')).toHaveValue('Réseau Lycée — Diagnostic et réparation');
    await expect(page.locator('#ev-obj-count')).toHaveText('21');
    await expect(page.locator('#ev-fault-count')).toHaveText('7');
    // le schéma et ses pastilles de panne restent visibles pendant qu'on règle les pannes
    const canvasOpen = (await page.locator('#cw').boundingBox()).height;
    expect(canvasOpen).toBeLessThan(canvasBefore);
    expect(canvasOpen).toBeGreaterThan(250);
    await expect(page.locator('#layer-badges g').first()).toBeVisible();
    // un clic sur une pastille de panne ouvre la carte de la panne
    await page.locator('#layer-badges g').first().click();
    await expect(page.locator('[data-fltid] .obj-card-body.open')).toHaveCount(1);

    await page.keyboard.press('Control+1');
    await expect(page.locator('.bot')).toHaveClass(/closed/);
    await page.keyboard.press('Control+2');
    await expect(page.locator('#tp-eval')).toBeVisible();
    // Journal et Paquets gardent leur hauteur habituelle, l'évaluation la sienne
    const hEval = (await page.locator('.bot').boundingBox()).height;
    await page.locator('.bt[data-tab="log"]').click();
    const hLog = (await page.locator('.bot').boundingBox()).height;
    expect(hEval).toBeGreaterThan(hLog + 100);
  });

  test('l\'évaluation ne se règle que dans le corrigé : l\'onglet disparaît dans Départ élève et Essai', async ({ page }) => {
    await openBuilderWith(page, 'reseau-maison');
    await openEval(page);
    await page.locator('#btn-depart').click();
    await expect(page.locator('#bt-eval')).toBeHidden();
    await expect(page.locator('#tp-eval')).toBeHidden();
    await expect(page.locator('.bt.active')).toHaveText('📋 Journal');
    await page.locator('#btn-sim').click();
    await expect(page.locator('#bt-eval')).toBeHidden();
    // Ctrl+2 ramène au corrigé et ouvre l'évaluation
    await page.keyboard.press('Control+2');
    await expect(page.locator('#btn-cfg')).toHaveClass(/active/);
    await expect(page.locator('#tp-eval')).toBeVisible();
  });

  test('un réglage de l\'évaluation met à jour le contrôle sans changer d\'onglet', async ({ page }) => {
    await openBuilderWith(page, 'reseau-maison');
    await corrigeComplet(page);
    await openEval(page);
    await page.locator('#ev-mastery').fill('90');
    await expect(page.locator('#ctl-banner')).toContainText('seuil 90 %');
  });

  test('+ Appareil à ajouter : crée un poste marqué « à ajouter », sélectionné, annulable, absent du départ élève', async ({ page }) => {
    await openBuilderWith(page, 'reseau-maison');
    await openEval(page);
    const before = await page.evaluate(() => Object.keys(S.devs));
    await page.locator('#ev-add-dev').click();
    await expect(page.locator('#ev-add-menu')).toBeVisible();
    await page.locator('#ev-add-menu button', { hasText: 'PC fixe' }).click();
    await expect(page.locator('#ev-add-menu')).toBeHidden();

    const id = await page.evaluate((b) => Object.keys(S.devs).find((k) => !b.includes(k)), before);
    expect(id).toBeTruthy();
    const d = await page.evaluate((i) => ({ toAdd: S.devs[i].toAdd, type: S.devs[i].type, kind: S.devs[i].kind, sel: S.sel }), id);
    expect(d).toEqual({ toAdd: true, type: 'pc', kind: 'desktop', sel: id });
    await expect(page.locator(`#layer-badges g[data-toadd="${id}"]`)).toBeVisible();     // pastille verte « + »
    // L'objectif « poste ajouté » correspondant est dans la liste, nommé d'après le poste
    const name = await page.evaluate((i) => S.devs[i].name, id);
    const obj = await page.evaluate((n) => EvalModule.getConfig().objectives.filter((o) => o.check === 'device_added' && o.params.newdev === n)
      .map((o) => ({ type: o.params.type, label: o.label })), name);
    expect(obj).toEqual([{ type: 'pc', label: `Le poste ${name} est ajouté au réseau` }]);
    await expect(page.locator('#ev-obj-count')).toHaveText('8');
    await expect(page.locator('#toadd')).toBeChecked();                                   // case de la fiche

    // Ctrl+Z le retire ; Départ élève ne le montre pas
    await page.locator('body').press('Control+z');
    expect(await page.evaluate((i) => !!S.devs[i], id)).toBe(false);
    await page.locator('#ev-add-dev').click();
    await page.locator('#ev-add-menu button', { hasText: 'Serveur' }).click();
    const id2 = await page.evaluate((b) => Object.keys(S.devs).find((k) => !b.includes(k)), before);
    expect(await page.evaluate((i) => S.devs[i].type, id2)).toBe('server');
    await page.locator('#btn-depart').click();
    expect(await page.evaluate((i) => !!S.devs[i], id2)).toBe(false);
  });

  test("la colonne Activité du bandeau est large, et s'élargit ou se réduit à la souris (double-clic : taille d'origine)", async ({ page }) => {
    await openBuilderWith(page, 'reseau-lycee');
    await openEval(page);
    const side = page.locator('.ev-side');
    const paneW = (await page.locator('.ev-pane').boundingBox()).width;
    const w0 = (await side.boundingBox()).width;
    expect(w0).toBeGreaterThan(paneW * 0.35);                    // la colonne de gauche prend une vraie place

    const hb = await page.locator('#rsz-ev').boundingBox();
    const y = hb.y + hb.height / 2, x = hb.x + hb.width / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + 150, y, { steps: 5 }); await page.mouse.up();
    const w1 = (await side.boundingBox()).width;
    expect(w1).toBeGreaterThan(w0 + 120);

    const hb2 = await page.locator('#rsz-ev').boundingBox();
    await page.mouse.move(hb2.x + 3, hb2.y + 40); await page.mouse.down();
    await page.mouse.move(hb2.x - 2000, hb2.y + 40, { steps: 5 }); await page.mouse.up();
    const w2 = (await side.boundingBox()).width;
    expect(w2).toBeLessThan(w0 - 100);
    expect(w2).toBeGreaterThanOrEqual(215);                      // plancher : les champs restent lisibles

    await page.locator('#rsz-ev').dblclick();
    expect(Math.abs((await side.boundingBox()).width - w0)).toBeLessThan(3);
  });

  test("un objectif ou une panne ajouté arrive ouvert et visible, même au bas d'une longue liste", async ({ page }) => {
    await openBuilderWith(page, 'reseau-lycee');          // 21 objectifs, 7 pannes : la liste dépasse le bandeau
    await openEval(page);
    const inView = async (selector) => {
      const box = await page.locator(selector).boundingBox();
      const main = await page.locator('.ev-main').boundingBox();
      return box.y >= main.y - 1 && box.y + box.height <= main.y + main.height + 1;
    };
    const objs = () => page.evaluate(() => EvalModule.getConfig().objectives.map((o) => o.id));
    const before = await objs();
    await page.locator('.ev-add-btns .btn-add-obj', { hasText: 'Ajouter un objectif' }).click();
    const id = (await objs()).find((i) => !before.includes(i));
    const card = `[data-objid="${id}"]`;
    await expect(page.locator(card + ' .obj-card-body.open')).toBeVisible();
    await expect.poll(() => inView(card + ' .obj-card-hdr')).toBe(true);

    const faults = () => page.evaluate(() => EvalModule.getConfig().faults.map((f) => f.id));
    const fBefore = await faults();
    await page.locator('.ev-add-btns .btn-add-fault').click();
    const fid = (await faults()).find((i) => !fBefore.includes(i));
    await expect(page.locator(`[data-fltid="${fid}"] .obj-card-body.open`)).toBeVisible();
    await expect.poll(() => inView(`[data-fltid="${fid}"] .obj-card-hdr`)).toBe(true);
  });
});

test.describe('Contrôle du corrigé dans le bandeau', () => {
  test("plus de barre orange : l'état est la pastille de l'en-tête, le détail est l'onglet « ✔ Contrôle »", async ({ page }) => {
    await openBuilderWith(page, 'reseau-entreprise');
    await expect(page.locator('#teacher-bar')).toBeHidden();
    await expect(page.locator('.tbar:visible')).toHaveCount(0);
    await expect(page.locator('#bt-ctl')).toBeVisible();
    await expect(page.locator('#hdr-score')).toHaveText('✅ Corrigé complet');

    // La pastille ouvre l'onglet Contrôle, un second clic replie le bandeau
    await page.locator('#hdr-score').click();
    await expect(page.locator('#bt-ctl')).toHaveClass(/active/);
    await expect(page.locator('#ctl-body')).toBeVisible();
    await expect(page.locator('#ctl-banner')).toBeVisible();
    await expect(page.locator('#ctl-banner')).toContainText('Départ élève : 0 / 100');
    await page.locator('#hdr-score').click();
    await expect(page.locator('.bot')).toHaveClass(/closed/);

    // Ctrl+3 l'ouvre aussi
    await page.keyboard.press('Control+3');
    await expect(page.locator('#ctl-body')).toBeVisible();
    await expect(page.locator('#ctl-body tr[data-rv]').first()).toBeVisible();
  });

  test("le tableau suit le réseau en direct, onglet ouvert", async ({ page }) => {
    await openBuilderWith(page, 'reseau-entreprise');
    await page.keyboard.press('Control+3');
    const dns = await openDeskApp(page, 'Serveur', 'Serveur DNS');
    await dns.locator('[data-act="toggle"]').click();
    await expect(page.locator('#hdr-score')).toHaveText('⚠️ Corrigé : 4 objectifs non réalisés');
    await expect(page.locator('#ctl-body tr', { hasText: 'Le service DNS du Serveur est actif' }).locator('td').nth(1)).toContainText('non réalisé dans le corrigé');
  });

  test("l'onglet Contrôle n'existe qu'en vue Corrigé", async ({ page }) => {
    await openBuilderWith(page, 'reseau-entreprise');
    await page.keyboard.press('Control+3');
    await page.locator('#btn-sim').click();
    await expect(page.locator('#bt-ctl')).toBeHidden();
    await expect(page.locator('#bt-ctl')).not.toHaveClass(/active/);
    await page.locator('#btn-depart').click();
    await expect(page.locator('#bt-ctl')).toBeHidden();
  });

  test("le score de l'essai est dans la barre verte, sans rien du corrigé", async ({ page }) => {
    await openBuilderWith(page, 'reseau-entreprise');
    await expect(page.locator('.hdr-r #hdr-score')).toHaveCount(1);      // vue Corrigé : état du corrigé, dans l'en-tête
    await page.locator('#btn-sim').click();
    await expect(page.locator('#view-bar.essai #hdr-score')).toBeVisible();   // plus en haut à droite
    await expect(page.locator('.hdr-r #hdr-score')).toHaveCount(0);
    await expect(page.locator('#hdr-score')).toHaveText('📊 Score : 0 / 100 pts');
    await expect(page.locator('#hdr-score')).not.toContainText('Corrigé');

    await page.locator('#hdr-score').click();
    const panel = page.locator('#score-details');
    await expect(panel).toHaveClass(/open/);
    await expect(panel).toContainText('votre essai');
    await expect(panel).not.toContainText('corrigé');
    await expect(panel).not.toContainText('barre orange');
    await expect(panel).not.toContainText('Pannes');
    await page.locator('#hdr-score').click();

    // Départ élève : la même pastille dans la barre bleue ; retour au corrigé : elle regagne l'en-tête
    await page.locator('#btn-depart').click();
    await expect(page.locator('#view-bar.depart #hdr-score')).toBeVisible();
    await page.locator('#btn-cfg').click();
    await expect(page.locator('.hdr-r #hdr-score')).toBeVisible();
    await expect(page.locator('#hdr-score')).toHaveText('✅ Corrigé complet');
  });
});

test.describe('Vues Conception · Départ élève · Test', () => {
  test("les vues portent leurs nouveaux noms ; « Repartir de zéro » remet réseau et score au départ ; cadre coloré selon la vue", async ({ page }) => {
    await openBuilderWith(page, 'reseau-entreprise');
    await expect(page.locator('#btn-cfg')).toHaveText(/Conception/);
    await expect(page.locator('#btn-depart')).toHaveText(/Départ élève/);
    await expect(page.locator('#btn-sim')).toHaveText(/Test/);
    await expect(page.locator('body')).toHaveAttribute('data-view', 'corrige');

    await page.locator('#btn-depart').click();
    await expect(page.locator('body')).toHaveAttribute('data-view', 'depart');
    await expect(page.locator('#view-bar button', { hasText: 'Passer au test' })).toBeVisible();
    await expect(page.locator('#view-bar button', { hasText: 'Retour' })).toHaveCount(0);
    expect(await page.locator('.cw').evaluate((e) => getComputedStyle(e).outlineStyle)).toBe('solid');

    await page.locator('#view-bar button', { hasText: 'Passer au test' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-view', 'essai');
    await expect(page.locator('#view-bar button', { hasText: 'Repartir de zéro' })).toBeVisible();
    await expect(page.locator('#view-bar button', { hasText: 'Retour' })).toHaveCount(0);
    await expect(page.locator('#view-bar')).not.toContainText('Essai');

    // Un réglage du réseau et des points obtenus, puis tout revient au départ
    const dns = await openDeskApp(page, 'Serveur', 'Serveur DNS');
    await dns.locator('[data-act="toggle"]').click();
    await expect(builderScore(page)).toHaveText('📊 Score : 20 / 100 pts');
    page.dialogs.length = 0;
    await page.locator('#view-bar button', { hasText: 'Repartir de zéro' }).click();
    expect(page.dialogs.at(-1)).toContain('Repartir de zéro');
    await expect(builderScore(page)).toHaveText('📊 Score : 0 / 100 pts');
    expect(await page.evaluate(() => Object.values(S.devs).find((d) => d.name === 'Serveur').dns.on)).toBe(false);

    await page.locator('#btn-cfg').click();
    await expect(page.locator('body')).toHaveAttribute('data-view', 'corrige');
  });
});

test.describe('En-tête élève', () => {
  test("une seule barre : menu ☰, annuler/rétablir, score, Terminer ; plus d'outils en double", async ({ page }, info) => {
    await openBuilderWith(page, 'reseau-maison');
    const file = await exportFile(page, 'html', info.outputPath('maison-entete.html'));
    await page.goto(pathToFileURL(file).href);
    for (const id of ['#stu-menu-btn', '#btn-undo', '#btn-redo', '#hdr-score']) await expect(page.locator(id)).toBeVisible();
    await expect(page.locator('.hdr .fbtn')).toBeVisible();
    // Les outils de la palette ne sont plus répétés dans l'en-tête
    for (const id of ['#t-select', '#t-link', '#t-delete']) await expect(page.locator(id)).toHaveCount(0);
    for (const id of ['#pi-sel', '#pi-link', '#pi-del']) await expect(page.locator(id)).toBeVisible();
    // Le menu contient les actions rares et se ferme avec Échap
    await expect(page.locator('#stu-menu')).toBeHidden();
    await page.locator('#stu-menu-btn').click();
    for (const id of ['#t-clear', '#t-save', '#t-export', '#t-import', '#t-toggleprops', '#btn-fs']) await expect(page.locator(id)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#stu-menu')).toBeHidden();
    // Afficher / masquer le panneau Propriétés depuis le menu
    await page.locator('#stu-menu-btn').click();
    await page.locator('#t-toggleprops').click();
    await expect(page.locator('.props')).toBeHidden();
    await page.locator('#stu-menu-btn').click();
    await expect(page.locator('#t-toggleprops')).toContainText('Afficher');
    await page.locator('#t-toggleprops').click();
    await expect(page.locator('.props')).toBeVisible();
  });
});
