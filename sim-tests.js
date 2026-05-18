/**
 * sim-tests.js — Tests unitaires du moteur de simulation réseau
 * Usage : node sim-tests.js
 *
 * Approche : extraction du JS de index.html, exécution dans un sandbox
 * Node.js via vm.createContext(), puis appel direct des fonctions.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

/* ─────────────────────────────────────────────────────
   1. EXTRACTION DU JS SIMULATEUR
───────────────────────────────────────────────────── */
const SRC = path.join(__dirname, 'scorm2', 'index.html');
const html = fs.readFileSync(SRC, 'utf-8');

// Extraire le contenu du bloc <script> principal (le seul dans <body>)
const scriptStart = html.indexOf('<script>', html.indexOf('<body>')) + '<script>'.length;
const scriptEnd   = html.lastIndexOf('</script>');
let simJs = html.slice(scriptStart, scriptEnd);

// Supprimer le bloc d'init (window.addEventListener('load',...)) — inutile et
// referencerait document, ce que le sandbox ne peut pas fournir
const initMarker = "window.addEventListener('load',function(){";
const initIdx    = simJs.indexOf(initMarker);
if (initIdx !== -1) simJs = simJs.slice(0, initIdx);

/* ─────────────────────────────────────────────────────
   2. SANDBOX DOM (stubs minimalistes)
───────────────────────────────────────────────────── */
function makeElem(tag) {
  const el = {
    tagName: (tag||'div').toUpperCase(),
    innerHTML: '', textContent: '', value: '',
    style: {}, className: '',
    children: [], dataset: {},
    _handlers: {},
    addEventListener: function(ev, fn) { this._handlers[ev] = fn; },
    removeEventListener: function() {},
    querySelector: function(sel) { return makeElem('div'); },
    querySelectorAll: function(sel) { return []; },
    getAttribute: function() { return null; },
    setAttribute: function() {},
    closest: function() { return null; },
    getBoundingClientRect: function() { return {left:0,top:0,width:800,height:600}; },
    focus: function() {}, blur: function() {}, click: function() {},
    appendChild: function(c) { this.children.push(c); return c; },
    insertBefore: function(c) { this.children.push(c); return c; },
    remove: function() {},
    contains: function() { return false; },
  };
  return el;
}

const _docElements = {};
const sandbox = {
  /* Globals JS */
  console,
  setTimeout: function(fn, ms) { return 0; },
  clearTimeout: function() {},
  setInterval: function() { return 0; },
  clearInterval: function() {},
  requestAnimationFrame: function(fn) { return 0; },
  cancelAnimationFrame: function() {},
  localStorage: { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} },
  sessionStorage: { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} },
  JSON, Math, Date, Set, Map, Promise, Array, Object, parseInt, parseFloat,
  isNaN, isFinite, encodeURIComponent, decodeURIComponent, atob: function() { return ''; },

  /* DOM */
  document: {
    getElementById: function(id) {
      if (!_docElements[id]) _docElements[id] = makeElem('div');
      return _docElements[id];
    },
    querySelector: function(sel) { return makeElem('div'); },
    querySelectorAll: function(sel) { return []; },
    createElement: function(tag) { return makeElem(tag); },
    createElementNS: function(ns, tag) { return makeElem(tag); },
    createTextNode: function(t) { return makeElem('text'); },
    body: makeElem('body'),
    head: makeElem('head'),
    addEventListener: function() {},
    removeEventListener: function() {},
  },
  window: {
    addEventListener: function() {},
    removeEventListener: function() {},
    innerWidth: 1280, innerHeight: 800,
    location: { href: '', search: '', hash: '', hostname: 'localhost' },
    history: { pushState: function() {} },
    scrollY: 0,
  },
  navigator: { userAgent: 'Node.js test runner' },
  location: { href: '', search: '', hash: '', hostname: 'localhost' },

  /* Fonctions UI appelées depuis le moteur */
  notif: function() {},
  addLog: function() {},
  addPacket: function() {},
  unlock: function() {},
  render: function() {},
  renderLinks: function() {},
  renderDevs: function() {},
  showProps: function() {},
  checkBadges: function() {},
  updSelects: function() {},
  tpr: function() {},
  setTermDev: function() {},
  showTab: function() {},
  hidePrev: function() {},
  noSel: function() {},
  saveToSession: function() { return true; },

  /* JSZip stub */
  JSZip: function() {
    this.file = function() {};
    this.generateAsync = function() { return Promise.resolve(new Uint8Array()); };
  },
};
sandbox.self = sandbox.window;

vm.createContext(sandbox);
vm.runInContext(simJs, sandbox);

/* Extraire les fonctions du sandbox */
const {
  S, ip2n, isValidUserIP, isValidUserMask, sameNet, netAddr,
  isRouter, lanSeg, cablePath, devByIP, mainIface,
  simPing, simDNS, simHTTP, simDHCP,
  getRoutingTable, autoRoute,
  mkDev, addLink, delDev,
} = sandbox;

/* ─────────────────────────────────────────────────────
   3. HARNAIS DE TEST
───────────────────────────────────────────────────── */
let _passed = 0, _failed = 0, _suite = '';
const RESET = '\x1b[0m', GREEN = '\x1b[32m', RED = '\x1b[31m',
      CYAN  = '\x1b[36m', BOLD  = '\x1b[1m', DIM = '\x1b[2m';

function suite(name) {
  _suite = name;
  console.log('\n' + CYAN + BOLD + '▶ ' + name + RESET);
}

function test(label, fn) {
  try {
    fn();
    console.log('  ' + GREEN + '✅' + RESET + ' ' + label);
    _passed++;
  } catch (err) {
    console.log('  ' + RED + '❌' + RESET + ' ' + label);
    console.log('     ' + DIM + err.message + RESET);
    _failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion échouée');
}
function eq(a, b) {
  if (a !== b) throw new Error('attendu ' + JSON.stringify(b) + ' obtenu ' + JSON.stringify(a));
}
function ok(v) { assert(!!v, 'attendu valeur truthy, obtenu ' + JSON.stringify(v)); }
function notOk(v) { assert(!v, 'attendu falsy, obtenu ' + JSON.stringify(v)); }

/* ─────────────────────────────────────────────────────
   4. HELPERS RÉSEAU
───────────────────────────────────────────────────── */
function resetNet() {
  Object.keys(S.devs).forEach(function(k) { delete S.devs[k]; });
  Object.keys(S.links).forEach(function(k) { delete S.links[k]; });
  S.nid = 1;
}

function mkPC(ip, mask, gw, dns) {
  var id = mkDev('pc', 10, 10);
  var d = S.devs[id];
  d.ifaces[0].ip   = ip   || '';
  d.ifaces[0].mask = mask || '255.255.255.0';
  d.ifaces[0].gateway = gw  || '';
  d.ifaces[0].dns     = dns || '';
  return id;
}

function mkServer(ip, mask, gw, dns) {
  var id = mkDev('server', 10, 10);
  var d = S.devs[id];
  d.ifaces[0].ip   = ip   || '';
  d.ifaces[0].mask = mask || '255.255.255.0';
  d.ifaces[0].gateway = gw  || '';
  d.ifaces[0].dns     = dns || '';
  return id;
}

function mkSwitch() {
  return mkDev('switch', 10, 10);
}

function mkRouter(eth0ip, eth0mask, eth1ip, eth1mask) {
  var id = mkDev('router', 10, 10);
  var d = S.devs[id];
  d.ifaces[0].ip   = eth0ip   || '';
  d.ifaces[0].mask = eth0mask || '255.255.255.0';
  d.ifaces[1].ip   = eth1ip   || '';
  d.ifaces[1].mask = eth1mask || '255.255.255.0';
  return id;
}

function link(a, b) {
  // Force-ajouter même si type PC (contourne la limite 1 câble pour les tests)
  var id = 'l' + (S.nid++);
  S.links[id] = { id: id, from: a, to: b };
  return id;
}

/* ─────────────────────────────────────────────────────
   5. SUITES DE TESTS
───────────────────────────────────────────────────── */

/* ── ip2n ── */
suite('ip2n — conversion IP → entier 32 bits');

test('192.168.1.1 → 3232235777', function() {
  eq(ip2n('192.168.1.1'), 3232235777);
});
test('0.0.0.0 → 0', function() {
  eq(ip2n('0.0.0.0'), 0);
});
test('255.255.255.255 → 4294967295', function() {
  eq(ip2n('255.255.255.255'), 4294967295);
});
test('10.0.0.1 → 167772161', function() {
  eq(ip2n('10.0.0.1'), 167772161);
});
test('chaîne vide → -1', function() {
  eq(ip2n(''), -1);
});
test('chaîne invalide "abc" → -1', function() {
  eq(ip2n('abc'), -1);
});
test('trop peu de segments "1.2.3" → -1', function() {
  eq(ip2n('1.2.3'), -1);
});
test('octet > 255 "192.168.1.300" → -1', function() {
  eq(ip2n('192.168.1.300'), -1);
});

/* ── isValidUserIP ── */
suite('isValidUserIP — validation saisie utilisateur');

test('vide → true (non configuré = accepté)', function() {
  ok(isValidUserIP(''));
});
test('192.168.1.1 → true', function() {
  ok(isValidUserIP('192.168.1.1'));
});
test('0.0.0.0 → false (tout-zéro interdit)', function() {
  notOk(isValidUserIP('0.0.0.0'));
});
test('192.168.01.1 → false (zéro en tête interdit)', function() {
  notOk(isValidUserIP('192.168.01.1'));
});
test('192.168.1.300 → false (> 255)', function() {
  notOk(isValidUserIP('192.168.1.300'));
});
test('abc.def.ghi.jkl → false', function() {
  notOk(isValidUserIP('abc.def.ghi.jkl'));
});
test('255.255.255.255 → true', function() {
  ok(isValidUserIP('255.255.255.255'));
});

/* ── isValidUserMask ── */
suite('isValidUserMask — validation masque sous-réseau');

test('vide → true', function() {
  ok(isValidUserMask(''));
});
test('255.255.255.0 → true', function() {
  ok(isValidUserMask('255.255.255.0'));
});
test('255.255.0.0 → true', function() {
  ok(isValidUserMask('255.255.0.0'));
});
test('255.255.255.128 → true', function() {
  ok(isValidUserMask('255.255.255.128'));
});
test('255.0.255.0 → false (bits non contigus)', function() {
  notOk(isValidUserMask('255.0.255.0'));
});
test('255.255.255.3 → false (bits non contigus)', function() {
  notOk(isValidUserMask('255.255.255.3'));
});
test('0.0.0.0 → true (masque hôte = autorisé)', function() {
  ok(isValidUserMask('0.0.0.0'));
});

/* ── sameNet ── */
suite('sameNet — appartenance au même sous-réseau');

test('192.168.1.1 et 192.168.1.50 /24 → même réseau', function() {
  ok(sameNet('192.168.1.1', '255.255.255.0', '192.168.1.50'));
});
test('192.168.1.1 et 192.168.2.1 /24 → réseaux différents', function() {
  notOk(sameNet('192.168.1.1', '255.255.255.0', '192.168.2.1'));
});
test('10.0.0.1 et 10.0.0.2 /8 → même réseau', function() {
  ok(sameNet('10.0.0.1', '255.0.0.0', '10.0.0.2'));
});
test('IP invalide → false', function() {
  notOk(sameNet('', '255.255.255.0', '192.168.1.1'));
});

/* ── netAddr ── */
suite('netAddr — adresse réseau');

test('192.168.1.42 /24 → 192.168.1.0', function() {
  eq(netAddr('192.168.1.42', '255.255.255.0'), '192.168.1.0');
});
test('10.1.2.3 /8 → 10.0.0.0', function() {
  eq(netAddr('10.1.2.3', '255.0.0.0'), '10.0.0.0');
});
test('172.16.5.200 /16 → 172.16.0.0', function() {
  eq(netAddr('172.16.5.200', '255.255.0.0'), '172.16.0.0');
});

/* ── isRouter ── */
suite('isRouter — détection routeur/internet');

test('objet type router → true', function() {
  ok(isRouter({ type: 'router' }));
});
test('objet type internet → true', function() {
  ok(isRouter({ type: 'internet' }));
});
test('objet type pc → false', function() {
  notOk(isRouter({ type: 'pc' }));
});
test('objet type switch → false', function() {
  notOk(isRouter({ type: 'switch' }));
});
test('null → false', function() {
  notOk(isRouter(null));
});

/* ── lanSeg & cablePath ── */
suite('lanSeg — segment LAN via BFS switch');

test('PC seul → segment = lui-même', function() {
  resetNet();
  var pc = mkPC('192.168.1.1');
  var seg = lanSeg(pc);
  ok(seg.indexOf(pc) !== -1);
  eq(seg.length, 1);
});

test('PC — switch — serveur : segment contient les 3', function() {
  resetNet();
  var pc  = mkPC('192.168.1.1');
  var sw  = mkSwitch();
  var srv = mkServer('192.168.1.2');
  link(pc, sw); link(sw, srv);
  var seg = lanSeg(pc);
  ok(seg.indexOf(pc)  !== -1);
  ok(seg.indexOf(sw)  !== -1);
  ok(seg.indexOf(srv) !== -1);
});

test('PC isolé ne voit pas un autre PC sans câble', function() {
  resetNet();
  var pc1 = mkPC('192.168.1.1');
  var pc2 = mkPC('192.168.1.2');
  var seg = lanSeg(pc1);
  assert(seg.indexOf(pc2) === -1, 'pc2 ne devrait pas être dans le segment de pc1');
});

suite('cablePath — chemin physique entre deux appareils');

test('PC → switch → serveur : chemin de 2 liens', function() {
  resetNet();
  var pc  = mkPC('192.168.1.1');
  var sw  = mkSwitch();
  var srv = mkServer('192.168.1.2');
  var l1 = link(pc, sw), l2 = link(sw, srv);
  var p = cablePath(pc, srv);
  eq(p.length, 2);
  ok(p.indexOf(l1) !== -1);
  ok(p.indexOf(l2) !== -1);
});

test('aucun câble → chemin vide', function() {
  resetNet();
  var pc1 = mkPC('192.168.1.1');
  var pc2 = mkPC('192.168.1.2');
  var p = cablePath(pc1, pc2);
  eq(p.length, 0);
});

test('device seul → chemin vers lui-même = vide', function() {
  resetNet();
  var pc = mkPC('192.168.1.1');
  eq(cablePath(pc, pc).length, 0);
});

/* ── devByIP ── */
suite('devByIP — trouver un appareil par IP');

test('IP existante → retourne le device', function() {
  resetNet();
  var pc = mkPC('10.0.0.5');
  var d = devByIP('10.0.0.5');
  ok(d);
  eq(d.id, pc);
});

test('IP inconnue → null', function() {
  resetNet();
  mkPC('10.0.0.5');
  eq(devByIP('10.0.0.99'), null);
});

/* ── simPing ── */
suite('simPing — scénarios de ping');

test('ping vers sa propre IP → ok, latence 0', function() {
  resetNet();
  var pc = mkPC('192.168.1.10');
  var r = simPing(pc, '192.168.1.10');
  ok(r.ok);
  eq(r.lat, 0);
});

test('ping entre 2 PCs même sous-réseau câblés → ok', function() {
  resetNet();
  var pc1 = mkPC('192.168.1.1');
  var pc2 = mkPC('192.168.1.2');
  link(pc1, pc2);
  var r = simPing(pc1, '192.168.1.2');
  ok(r.ok);
  eq(r.lat, 1);
});

test('ping même sous-réseau sans câble → échec', function() {
  resetNet();
  var pc1 = mkPC('192.168.1.1');
  var pc2 = mkPC('192.168.1.2');
  var r = simPing(pc1, '192.168.1.2');
  notOk(r.ok);
  ok(r.reason);
});

test('ping via routeur 1 saut → ok, router=true', function() {
  resetNet();
  var pc1 = mkPC('192.168.1.10', '255.255.255.0', '192.168.1.254');
  var rtr = mkRouter('192.168.1.254', '255.255.255.0', '192.168.2.254', '255.255.255.0');
  var pc2 = mkPC('192.168.2.10', '255.255.255.0', '192.168.2.254');
  link(pc1, rtr); link(rtr, pc2);
  var r = simPing(pc1, '192.168.2.10');
  ok(r.ok);
  ok(r.router);
});

test('ping via routeur sans passerelle configurée → échec', function() {
  resetNet();
  var pc1 = mkPC('192.168.1.10', '255.255.255.0', '');
  var rtr = mkRouter('192.168.1.254', '255.255.255.0', '192.168.2.254', '255.255.255.0');
  var pc2 = mkPC('192.168.2.10', '255.255.255.0', '192.168.2.254');
  link(pc1, rtr); link(rtr, pc2);
  var r = simPing(pc1, '192.168.2.10');
  notOk(r.ok);
  ok(r.reason.indexOf('passerelle') !== -1 || r.reason.indexOf('Gateway') !== -1);
});

test('ping destination inconnue → échec', function() {
  resetNet();
  var pc = mkPC('192.168.1.1');
  var r = simPing(pc, '10.99.99.99');
  notOk(r.ok);
});

test('ping multi-hop (2 routeurs) → ok', function() {
  resetNet();
  var pc1 = mkPC('10.0.1.10', '255.255.255.0', '10.0.1.1');
  var r1  = mkRouter('10.0.1.1',  '255.255.255.0', '10.0.12.1', '255.255.255.0');
  var r2  = mkRouter('10.0.12.2', '255.255.255.0', '10.0.2.1',  '255.255.255.0');
  var pc2 = mkPC('10.0.2.10', '255.255.255.0', '10.0.2.1');
  link(pc1, r1); link(r1, r2); link(r2, pc2);
  var res = simPing(pc1, '10.0.2.10');
  ok(res.ok);
  ok(res.router);
});

/* ── simDNS ── */
suite('simDNS — résolution DNS');

test('résolution réussie → ok + ip retournée', function() {
  resetNet();
  var pc  = mkPC('192.168.1.10', '255.255.255.0', '', '192.168.1.53');
  var dns = mkServer('192.168.1.53');
  S.devs[dns].dns.on = true;
  S.devs[dns].dns.records['example.com'] = '192.168.1.100';
  var srv = mkServer('192.168.1.100');
  link(pc, dns); link(pc, srv);
  var r = simDNS(pc, 'example.com');
  ok(r.ok);
  eq(r.ip, '192.168.1.100');
});

test('aucun DNS configuré sur le PC → échec', function() {
  resetNet();
  var pc = mkPC('192.168.1.10', '255.255.255.0', '', '');
  var r = simDNS(pc, 'example.com');
  notOk(r.ok);
  ok(r.reason.indexOf('DNS') !== -1);
});

test('serveur DNS inaccessible (pas de câble) → échec', function() {
  resetNet();
  var pc  = mkPC('192.168.1.10', '255.255.255.0', '', '192.168.1.53');
  var dns = mkServer('192.168.1.53');
  S.devs[dns].dns.on = true;
  S.devs[dns].dns.records['example.com'] = '192.168.1.100';
  // pas de câble entre pc et dns
  var r = simDNS(pc, 'example.com');
  notOk(r.ok);
});

test('domaine inconnu → échec', function() {
  resetNet();
  var pc  = mkPC('192.168.1.10', '255.255.255.0', '', '192.168.1.53');
  var dns = mkServer('192.168.1.53');
  S.devs[dns].dns.on = true;
  link(pc, dns);
  var r = simDNS(pc, 'inconnu.com');
  notOk(r.ok);
  ok(r.reason.indexOf('inconnu.com') !== -1 || r.reason.indexOf('non trouvé') !== -1);
});

test('service DNS désactivé → échec', function() {
  resetNet();
  var pc  = mkPC('192.168.1.10', '255.255.255.0', '', '192.168.1.53');
  var dns = mkServer('192.168.1.53');
  S.devs[dns].dns.on = false;
  link(pc, dns);
  var r = simDNS(pc, 'example.com');
  notOk(r.ok);
});

/* ── simHTTP ── */
suite('simHTTP — accès HTTP');

test('accès HTTP par IP directe → ok', function() {
  resetNet();
  var pc  = mkPC('192.168.1.10');
  var srv = mkServer('192.168.1.20');
  S.devs[srv].http.on    = true;
  S.devs[srv].http.title = 'Test';
  link(pc, srv);
  var r = simHTTP(pc, 'http://192.168.1.20');
  ok(r.ok);
  eq(r.title, 'Test');
});

test('service HTTP désactivé → échec', function() {
  resetNet();
  var pc  = mkPC('192.168.1.10');
  var srv = mkServer('192.168.1.20');
  S.devs[srv].http.on = false;
  link(pc, srv);
  var r = simHTTP(pc, 'http://192.168.1.20');
  notOk(r.ok);
  ok(r.reason.indexOf('HTTP') !== -1);
});

test('accès HTTP par hostname (DNS) → ok', function() {
  resetNet();
  var pc  = mkPC('192.168.1.10', '255.255.255.0', '', '192.168.1.53');
  var dns = mkServer('192.168.1.53');
  S.devs[dns].dns.on = true;
  S.devs[dns].dns.records['web.local'] = '192.168.1.20';
  var srv = mkServer('192.168.1.20');
  S.devs[srv].http.on    = true;
  S.devs[srv].http.title = 'Accueil';
  link(pc, dns); link(pc, srv);
  var r = simHTTP(pc, 'http://web.local');
  ok(r.ok);
  eq(r.title, 'Accueil');
  eq(r.domain, 'web.local');
});

test('serveur HTTP introuvable → échec', function() {
  resetNet();
  var pc = mkPC('192.168.1.10');
  var r = simHTTP(pc, 'http://192.168.9.99');
  notOk(r.ok);
});

/* ── simDHCP ── */
suite('simDHCP — attribution d\'adresse DHCP');

test('attribution réussie → ok + adresse IP dans la plage', function() {
  resetNet();
  var sw  = mkSwitch();
  var pc  = mkPC('');
  var srv = mkServer('192.168.1.1');
  S.devs[srv].dhcp = { on: true, start: '192.168.1.100', end: '192.168.1.200', mask: '255.255.255.0', gateway: '192.168.1.1', dns: '' };
  link(pc, sw); link(sw, srv);
  var r = simDHCP(pc);
  ok(r.ok);
  ok(r.ip);
  // IP doit être dans la plage 100-200
  var last = parseInt(r.ip.split('.')[3], 10);
  ok(last >= 100 && last <= 200);
});

test('aucun serveur DHCP sur le segment → échec', function() {
  resetNet();
  var pc = mkPC('');
  var r  = simDHCP(pc);
  notOk(r.ok);
  ok(r.reason.indexOf('DHCP') !== -1);
});

test('routeur ne peut pas faire de demande DHCP → échec', function() {
  resetNet();
  var rtr = mkRouter('192.168.1.254', '255.255.255.0');
  var r   = simDHCP(rtr);
  notOk(r.ok);
  ok(r.reason.indexOf('PC') !== -1 || r.reason.indexOf('Serveur') !== -1);
});

test('plage DHCP épuisée → échec', function() {
  resetNet();
  var sw  = mkSwitch();
  var srv = mkServer('192.168.1.1');
  S.devs[srv].dhcp = { on: true, start: '192.168.1.10', end: '192.168.1.10', mask: '255.255.255.0', gateway: '', dns: '' };
  // Un PC occupe déjà la seule adresse disponible
  var pc_occ = mkPC('192.168.1.10');
  var pc_new = mkPC('');
  link(pc_occ, sw); link(pc_new, sw); link(sw, srv);
  var r = simDHCP(pc_new);
  notOk(r.ok);
  ok(r.reason.indexOf('épuisée') !== -1 || r.reason.indexOf('plage') !== -1 || r.reason.indexOf('épuisé') !== -1);
});

/* ── getRoutingTable ── */
suite('getRoutingTable — table de routage');

test('routeur 2 interfaces → 2 routes directes', function() {
  resetNet();
  var rtr = mkRouter('192.168.1.1', '255.255.255.0', '10.0.0.1', '255.0.0.0');
  var rt  = getRoutingTable(rtr);
  ok(rt.length >= 2);
  var dests = rt.map(function(r) { return r.dest; });
  ok(dests.indexOf('192.168.1.0') !== -1);
  ok(dests.indexOf('10.0.0.0') !== -1);
});

test('non-routeur → table vide', function() {
  resetNet();
  var pc = mkPC('192.168.1.1');
  var rt = getRoutingTable(pc);
  eq(rt.length, 0);
});

/* ── autoRoute ── */
suite('autoRoute — RIP simplifié');

test('deux routeurs voisins → routes échangées', function() {
  resetNet();
  var r1 = mkRouter('192.168.1.1', '255.255.255.0', '10.0.0.1', '255.255.255.0');
  var r2 = mkRouter('10.0.0.2',   '255.255.255.0', '172.16.0.1','255.255.0.0');
  link(r1, r2);
  autoRoute();
  // r1 doit connaître le réseau de r2 (172.16.0.0)
  var rt1 = getRoutingTable(r1);
  var dests1 = rt1.map(function(r) { return r.dest; });
  ok(dests1.indexOf('172.16.0.0') !== -1);
  // r2 doit connaître le réseau de r1 (192.168.1.0)
  var rt2 = getRoutingTable(r2);
  var dests2 = rt2.map(function(r) { return r.dest; });
  ok(dests2.indexOf('192.168.1.0') !== -1);
});

test('autoRoute sur réseau sans routeurs → aucune erreur', function() {
  resetNet();
  var pc1 = mkPC('192.168.1.1');
  var pc2 = mkPC('192.168.1.2');
  link(pc1, pc2);
  // ne doit pas lever d'exception
  autoRoute();
  ok(true);
});

/* ─────────────────────────────────────────────────────
   6. BILAN
───────────────────────────────────────────────────── */
var total = _passed + _failed;
console.log('\n' + BOLD + '─'.repeat(50) + RESET);
if (_failed === 0) {
  console.log(GREEN + BOLD + '✅ ' + _passed + '/' + total + ' tests passés — SUCCÈS' + RESET);
} else {
  console.log(RED + BOLD + '❌ ' + _failed + ' échec(s) / ' + total + ' tests' + RESET);
  process.exitCode = 1;
}
console.log('');
