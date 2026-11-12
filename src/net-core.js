'use strict';
/* ─────────────────────────────────────────────────────
   CŒUR RÉSEAU — modèle, simulation IPv4 et évaluation, sans navigateur
   Rien ici ne lit ni n'écrit la page : pas de document, de window, de minuterie, d'alerte, ni
   d'appel à une fonction d'affichage. L'interface est dans sim-ui.js, chargé à la suite.
   Un test (« Cœur réseau isolé ») exécute ce fichier seul et échoue si cette règle est rompue.
───────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────
   RÉSEAU DE DÉPART (intégré par le professeur)
   La ligne suivante est remplacée lors de la génération
───────────────────────────────────────────────────── */
var STARTER_NETWORK = null; /* __STARTER__ */

/* ── Activité personnalisée ── */
var ACTIVITY_CONFIG = null; /* __ACTIVITY__ */
var ACTIVITY_RESULTS = {};  // {objectiveId: true} quand atteint

/* ─────────────────────────────────────────────────────
   MOTEUR D'ACTIVITÉ
───────────────────────────────────────────────────── */
function devByName(name){
  if(!name)return null;
  var n=name.trim().toLowerCase();
  return Object.values(S.devs).find(function(d){return d.name&&d.name.trim().toLowerCase()===n;})||null;
}

/* ── Évaluation des objectifs (partagée par le builder et l'activité élève) ──
   Un objectif n'est acquis que tant que sa condition reste vraie : si l'élève casse
   sa configuration, il le perd, et le score affiché est toujours la note finale. */
var STATIC_OBJ_TYPES=['cable_exists','ip_configured','gateway_configured','dns_configured',
  'service_active','device_added','wifi_link','route_exists','dns_record','ssid_configured'];
var DYNAMIC_OBJ_TYPES=['ping_success','dns_success','http_success','dhcp_success'];
var ACTIVITY_PROOFS={};   // {objectiveId: commande réussie qui l'a validé, rejouée à chaque vérification}
var START_DEV_IDS=null;   // appareils du réseau de départ ; null → ceux de STARTER_NETWORK

/* Adresse attendue par un objectif, octet par octet :
   192.168.1.10 exacte · 192.168.1.* au choix · 192.168.1.10-50 plage. */
function ipPatternIsFlexible(pattern){return /[*-]/.test(pattern||'');}
function ipMatchesPattern(ip,pattern){
  if(!pattern||!ip)return !pattern;
  pattern=pattern.trim();ip=ip.trim();
  if(!ipPatternIsFlexible(pattern))return ip===pattern;
  var pp=pattern.split('.'),ip4=ip.split('.');
  if(pp.length!==4||ip4.length!==4)return false;
  return pp.every(function(seg,i){
    var v=ip4[i];if(!/^\d+$/.test(v)||+v>255)return false;
    if(seg==='*')return true;
    var r=/^(\d+)-(\d+)$/.exec(seg);
    if(r)return +v>=+r[1]&&+v<=+r[2];
    return seg===v;
  });
}
/* Adresse hôte utilisable : ni adresse du réseau, ni diffusion, ni déjà prise par un autre appareil. */
function ipUsableBy(devId,ip,mask){
  var a=ip2n(ip),m=ip2n(mask);
  if(a<0||!vMask(mask))return false;
  var net=(a&m)>>>0,bc=(net|(~m>>>0))>>>0;
  if(a===net||a===bc)return false;
  ip=ip.trim();
  return !Object.values(S.devs).some(function(d){
    return d.id!==devId&&d.ifaces&&d.ifaces.some(function(f){return f.ip&&f.ip.trim()===ip;});
  });
}
/* Une valeur exacte est comparée telle quelle ; une plage ou un joker exige en plus une adresse utilisable. */
function ipObjectiveOK(dev,fi,pattern){
  if(!pattern)return true;
  if(!fi||!ipMatchesPattern(fi.ip||'',pattern))return false;
  return !ipPatternIsFlexible(pattern)||ipUsableBy(dev.id,fi.ip,fi.mask||'');
}

/* Référence à un appareil : « {Srv-Web} » désigne les adresses actuelles de Srv-Web,
   et suit donc ses changements (adresse choisie par l'élève, par exemple). */
function refName(v){var m=/^\{(.+)\}$/.exec((v||'').trim());return m?m[1].trim():null;}
function devHasIP(d,ip){
  ip=(ip||'').trim();
  return !!(d&&ip&&d.ifaces&&d.ifaces.some(function(f){return f.ip&&f.ip.trim()===ip;}));
}
/* Valeur attendue exacte, ou référence : une des adresses de l'appareil désigné. */
function valueMatchesRef(value,expected){
  if(!expected)return true;
  var n=refName(expected);
  if(n!==null)return devHasIP(devByName(n),value);
  return (value||'').trim()===expected.trim();
}

/* Passerelle « cohérente » : l'adresse d'un routeur (ou d'une box) du même réseau que
   l'appareil, et joignable depuis lui. */
var GATEWAY_COHERENT='@routeur';
function gatewayCoherent(d,fi){
  var gw=(fi&&fi.gateway||'').trim();
  if(!gw||!fi.ip||gw===fi.ip.trim())return false;
  if(!sameNet(fi.ip,fi.mask,gw))return false;
  var r=devByIP(gw);
  return !!r&&isRouter(r)&&simPing(d.id,gw).ok;
}
function gatewayOK(d,fi,pattern){
  if(!pattern)return true;
  if(!fi)return false;
  if(pattern.trim()===GATEWAY_COHERENT)return gatewayCoherent(d,fi);
  return ipMatchesPattern(fi.gateway||'',pattern);
}
/* ── Contrainte affichée à l'élève sous un objectif ──
   Texte généré à partir des paramètres, ou rédigé par l'enseignant (constraintText).
   Affichée par défaut seulement quand une adresse est laissée au choix (showConstraint). */
var CONSTRAINT_TYPES=['ip_configured','gateway_configured','device_added'];
function addrConstraintDesc(v){
  v=(v||'').trim();
  var r=/^(\d+\.\d+\.\d+\.)(\d+)-(\d+)$/.exec(v);
  if(r)return 'au choix entre '+r[1]+r[2]+' et '+r[1]+r[3];
  if(!ipPatternIsFlexible(v))return v;
  return 'au choix, de la forme '+v.split('.').map(function(seg){
    if(seg==='*')return 'x';
    var m=/^(\d+)-(\d+)$/.exec(seg);
    return m?'['+m[1]+' à '+m[2]+']':seg;
  }).join('.');
}
function autoConstraintText(obj){
  var p=obj.params||{},parts=[],who;
  if(CONSTRAINT_TYPES.indexOf(obj.check)<0)return '';
  if(p.ip)parts.push('adresse IP '+addrConstraintDesc(p.ip)+(ipPatternIsFlexible(p.ip)?' (adresse libre)':''));
  if(p.mask)parts.push('masque '+p.mask.trim());
  if(p.gateway&&p.gateway.trim()===GATEWAY_COHERENT)parts.push('passerelle vers le routeur de son réseau');
  else if(p.gateway)parts.push('passerelle '+addrConstraintDesc(p.gateway));
  if(obj.check==='device_added')who='Nouveau poste'+(p.newdev?' « '+p.newdev.trim()+' »':'');
  else who=(p.dev||'').trim();
  if(!parts.length)return obj.check==='device_added'&&p.newdev?who:'';
  return (who?who+' : ':'')+parts.join(', ');
}
function constraintShownByDefault(obj){
  var p=obj.params||{};
  return CONSTRAINT_TYPES.indexOf(obj.check)>=0&&
    (ipPatternIsFlexible(p.ip)||ipPatternIsFlexible(p.gateway));
}
/* Texte à afficher à l'élève, ou '' si la contrainte est masquée. */
function objectiveConstraint(obj){
  var show=typeof obj.showConstraint==='boolean'?obj.showConstraint:constraintShownByDefault(obj);
  if(!show)return '';
  var t=(obj.constraintText||'').trim();
  return t||autoConstraintText(obj);
}

/* ── Plan d'adressage (énoncé imprimable et corrigé) ──
   Construit à partir des objectifs d'adressage : une ligne par appareil, une colonne par
   champ utilisé (IP, masque, passerelle, DNS). Chaque case est :
     fixed : valeur donnée à l'élève ; fill : à compléter (label : contrainte éventuelle) ;
     none  : aucun objectif sur ce champ.
   Les solutions viennent du réseau actuel, vérifiées avec les règles d'évaluation. */
var PLAN_COLS=['ip','mask','gateway','dns'];
function addrKind(spec){
  spec=(spec||'').trim();
  if(!spec)return 'none';
  if(spec===GATEWAY_COHERENT)return 'coherent';
  if(refName(spec)!==null)return 'ref';
  if(/^\d+\.\d+\.\d+\.\d+-\d+$/.test(spec))return 'range';
  if(ipPatternIsFlexible(spec))return 'any';
  return 'exact';
}
function _planCellShown(obj,spec){
  if(typeof obj.showConstraint==='boolean')return obj.showConstraint;
  return constraintShownByDefault(obj)||['range','any','coherent','ref'].indexOf(addrKind(spec))>=0;
}
function _planCell(obj,col,spec){
  var k=addrKind(spec),c={kind:'fill',label:'',prefix:'',spec:spec||'',objKind:k,check:obj.check,obj:obj};
  if(!_planCellShown(obj,spec))return c;
  if(k==='exact'){c.kind='fixed';c.value=spec.trim();}
  else if(k==='range'){var r=/^(\d+\.\d+\.\d+\.)(\d+)-(\d+)$/.exec(spec.trim());c.label='entre '+r[1]+r[2]+' et .'+r[3];}
  else if(k==='any'){
    if(/^(\d+\.){3}\*$/.test(spec.trim()))c.prefix=spec.trim().slice(0,-1);
    else c.label=addrConstraintDesc(spec);
  }
  else if(k==='coherent')c.label='adresse du routeur';
  else if(k==='ref')c.label='adresse de '+refName(spec);
  return c;
}
function _devFrame(d){
  if(!d)return null;
  var cx=d.x+DW/2,cy=d.y+DH/2,best=null;
  Object.values(S.frames||{}).forEach(function(f){
    if(cx>=f.x&&cx<=f.x+f.w&&cy>=f.y&&cy<=f.y+f.h&&(!best||f.w*f.h<best.w*best.h))best=f;
  });
  return best;
}
/* Appareil à ajouter : son encadré est celui de l'appareil auquel un objectif le relie. */
function _linkedFrame(name,objectives){
  var n=(name||'').trim().toLowerCase(),fr=null;
  objectives.some(function(o){
    if(o.check!=='cable_exists'&&o.check!=='wifi_link')return false;
    var p=o.params||{},other=null;
    if((p.devA||'').trim().toLowerCase()===n)other=p.devB;
    else if((p.devB||'').trim().toLowerCase()===n)other=p.devA;
    fr=other?_devFrame(devByName(other)):null;
    return !!fr;
  });
  return fr;
}
/* Appareil qui sert de solution à une ligne « nouveau poste » sans nom. */
function _newDevSolution(obj){
  var p=obj.params||{},start=startDevIds();
  var cands=Object.values(S.devs).filter(function(dv){
    return start.indexOf(dv.id)<0&&(!p.type||dv.type===p.type);
  });
  var good=cands.filter(function(dv){var o2={check:'device_added',params:{}};
    Object.keys(p).forEach(function(k){o2.params[k]=p[k];});
    o2.params.newdev=dv.name;return checkObjectiveStatic(o2);});
  return good[0]||cands[0]||null;
}
function _planSolution(d,col,cell){
  var fi=d&&mainIface(d),val=fi?(fi[col]||'').trim():'';
  if(cell.objKind==='exact')return{value:cell.spec.trim()};
  if(cell.objKind==='ref'){
    var rd=devByName(refName(cell.spec)),rf=rd&&mainIface(rd);
    return rf&&rf.ip?{value:rf.ip}:{missing:true};
  }
  if(!d||!val)return{missing:true};
  var ok;
  if(col==='ip')ok=ipObjectiveOK(d,fi,cell.spec);
  else if(col==='mask')ok=!cell.spec||val===cell.spec.trim();
  else if(col==='gateway')ok=gatewayOK(d,fi,cell.spec);
  else ok=valueMatchesRef(val,cell.spec);
  if(!ok)return{missing:true};
  return{value:val,possible:cell.objKind==='range'||cell.objKind==='any'||cell.objKind==='none'};
}
function addressPlan(objectives){
  objectives=objectives||[];
  var rows={},order=[],used={};
  function row(key,name,toAdd,obj){
    if(!rows[key]){rows[key]={name:name,toAdd:toAdd,ref:false,cells:{},solObj:obj};order.push(key);}
    return rows[key];
  }
  function put(r,col,obj,spec){
    if(r.cells[col])return;
    r.cells[col]=_planCell(obj,col,spec);used[col]=true;
  }
  var newCount=0;
  objectives.forEach(function(o){
    var p=o.params||{},r,name;
    if(o.check==='ip_configured'||o.check==='gateway_configured'||o.check==='dns_configured'){
      name=(p.dev||'').trim();if(!name)return;
      r=row(name.toLowerCase(),name,!devByName(name),null);
      if(o.check==='ip_configured'){put(r,'ip',o,p.ip);if(p.mask)put(r,'mask',o,p.mask);}
      else if(o.check==='gateway_configured')put(r,'gateway',o,p.gateway);
      else put(r,'dns',o,p.dns);
    } else if(o.check==='device_added'){
      if(p.newdev){
        // Appareil du réseau de départ (objectif de présence) : pas « à ajouter ».
        name=p.newdev.trim();
        var nd=devByName(name),start=startDevIds();
        r=row(name.toLowerCase(),name,!(nd&&(!start.length||start.indexOf(nd.id)>=0)),null);
      }
      else{newCount++;r=row('#'+o.id,'Nouveau poste',true,o);}
      if(p.ip)put(r,'ip',o,p.ip);
      if(p.mask)put(r,'mask',o,p.mask);
      if(p.gateway)put(r,'gateway',o,p.gateway);
    }
  });
  if(newCount>1){var i=0;order.forEach(function(k){if(k[0]==='#')rows[k].name='Nouveau poste '+(++i);});}
  var cols=PLAN_COLS.filter(function(c){return used[c];});
  // Appareils cités par « l'adresse de… » : donnés en référence s'ils n'ont pas leur ligne.
  order.slice().forEach(function(k){
    PLAN_COLS.forEach(function(c){
      var cell=rows[k].cells[c];if(!cell||cell.objKind!=='ref')return;
      var n=refName(cell.spec),key=n.toLowerCase();
      if(rows[key])return;
      var d=devByName(n),f=d&&mainIface(d);
      var r={name:d?d.name:n,toAdd:!d,ref:true,cells:{}};
      cols.forEach(function(col){
        var v=f?(f[col]||'').trim():'';
        r.cells[col]=v?{kind:'fixed',value:v}:{kind:'none'};
      });
      rows[key]=r;order.push(key);
    });
  });
  // Cases sans objectif, solutions, encadrés
  var groups={},gorder=[];
  order.forEach(function(k){
    var r=rows[k],d=r.solObj?_newDevSolution(r.solObj):devByName(r.name);
    cols.forEach(function(c){
      if(!r.cells[c])r.cells[c]={kind:'none'};
      var cell=r.cells[c];
      if(!r.ref&&cell.kind!=='none')cell.solution=_planSolution(d,c,cell);
      delete cell.obj;
    });
    var fr=_devFrame(d||devByName(r.name))||(r.toAdd?_linkedFrame(r.name,objectives):null);
    var gk=fr?fr.id:'';
    if(!groups[gk]){groups[gk]={label:fr?(fr.label||'Zone'):'',y:fr?fr.y:1e9,x:fr?fr.x:1e9,rows:[]};gorder.push(gk);}
    delete r.solObj;
    groups[gk].rows.push(r);
  });
  var glist=gorder.map(function(k){return groups[k];});
  glist.sort(function(a,b){return a.y-b.y||a.x-b.x;});
  glist.forEach(function(g){
    g.rows.sort(function(a,b){return (a.ref-b.ref)||a.name.localeCompare(b.name);});
    delete g.x;delete g.y;
  });
  return{cols:cols,groups:glist};
}

function startDevIds(){
  if(START_DEV_IDS)return START_DEV_IDS;
  return STARTER_NETWORK&&STARTER_NETWORK.devs?Object.keys(STARTER_NETWORK.devs):[];
}

function checkObjectiveStatic(obj){
  var p=obj.params||{};
  var d,fi;
  switch(obj.check){
    case 'cable_exists':
      var devA=devByName(p.devA),devB=devByName(p.devB);
      if(!devA||!devB)return false;
      return !!Object.values(S.links).find(function(l){
        return (l.from===devA.id&&l.to===devB.id)||(l.from===devB.id&&l.to===devA.id);
      });
    case 'ip_configured':
      d=devByName(p.dev);if(!d)return false;
      fi=mainIface(d);if(!fi)return false;
      if(p.ip&&!ipObjectiveOK(d,fi,p.ip))return false;
      if(p.mask&&fi.mask!==p.mask)return false;
      return true;
    case 'gateway_configured':
      d=devByName(p.dev);if(!d)return false;
      fi=mainIface(d);if(!fi)return false;
      if(p.gateway&&!gatewayOK(d,fi,p.gateway))return false;
      return true;
    case 'dns_configured':
      d=devByName(p.dev);if(!d)return false;
      fi=mainIface(d);if(!fi)return false;
      if(!fi.dns)return false;
      if(p.dns&&!valueMatchesRef(fi.dns,p.dns))return false;
      return true;
    case 'service_active':
      d=devByName(p.dev);if(!d)return false;
      if(p.service==='http')return !!(d.http&&d.http.on);
      if(p.service==='dns')return !!(d.dns&&d.dns.on);
      if(p.service==='dhcp')return !!(d.dhcp&&d.dhcp.on);
      return false;
    case 'device_added':{
      // Nom imposé : l'appareil de ce nom, qu'il soit du départ ou non.
      // Sans nom : seul un appareil absent du réseau de départ compte.
      var cands;
      if(p.newdev){d=devByName(p.newdev);cands=d?[d]:[];}
      else{
        var start=startDevIds();
        cands=Object.values(S.devs).filter(function(dv){return start.indexOf(dv.id)<0;});
      }
      return cands.some(function(nd){
        var f=mainIface(nd);
        if(p.type&&nd.type!==p.type)return false;
        if(p.ip&&!ipObjectiveOK(nd,f,p.ip))return false;
        if(p.mask&&(!f||f.mask!==p.mask))return false;
        if(p.gateway&&!gatewayOK(nd,f,p.gateway))return false;
        return true;
      });}
    case 'wifi_link':{
      var wA=devByName(p.devA),wB=devByName(p.devB);
      if(!wA||!wB)return false;
      return !!Object.values(S.links).find(function(l){
        return l.type==='wifi'&&wifiLinkUp(l)&&
          ((l.from===wA.id&&l.to===wB.id)||(l.from===wB.id&&l.to===wA.id));
      });}
    case 'route_exists':{
      d=devByName(p.dev);if(!d)return false;
      var rt=getRoutingTable(d.id);
      if(!p.dest)return rt.length>0;
      return !!rt.find(function(r){
        if(p.dest&&r.dest!==p.dest)return false;
        if(p.mask&&r.mask!==p.mask)return false;
        return true;
      });}
    case 'dns_record':{
      d=devByName(p.dev);if(!d||!d.dns||!d.dns.on)return false;
      if(!p.domain)return Object.keys(d.dns.records||{}).length>0;
      var dom=(p.domain||'').toLowerCase().trim();
      var rec=(d.dns.records||{})[dom];
      if(!rec)return false;
      if(p.ip&&!valueMatchesRef(rec,p.ip))return false;
      return true;}
    case 'ssid_configured':{
      d=devByName(p.dev);if(!d||d.type!=='wifi_router')return false;
      if(!d.ssid)return false;
      if(p.ssid&&d.ssid!==p.ssid)return false;
      return true;}
    default:
      return false;
  }
}

/* Cible d'un objectif de ping : une adresse, ou un appareil désigné par « {nom} »
   (ou par son nom seul, format des anciens scénarios). */
function pingTargetDev(to){
  if(!to)return null;
  var n=refName(to);
  if(n!==null)return devByName(n);
  if(/^\d+\.\d+\.\d+\.\d+$/.test(to))return null;
  return devByName(to);
}
function pingTargetIP(to){
  var _ptoDev=pingTargetDev(to);
  if(!_ptoDev)return refName(to)!==null?'':to;
  var f=mainIface(_ptoDev);return f&&f.ip?f.ip:'';
}
/* Le ping qu'a réussi l'élève atteint-il la cible de l'objectif ? Un appareil désigné
   compte quelle que soit son interface visée (un routeur en a plusieurs). */
function pingTargetMatches(to,ip){
  if(!to)return true;
  var _ptoDev=pingTargetDev(to);
  if(_ptoDev)return devHasIP(_ptoDev,ip);
  return refName(to)===null&&to.trim()===(ip||'').trim();
}
/* La commande que vient de réussir l'élève correspond-elle à l'objectif ? */
function dynamicEventMatches(obj,type,context){
  var p=obj.params||{};
  if(obj.check!==type)return false;
  // Même règle que devByName : le nom de l'appareil ne dépend ni de la casse ni des espaces.
  if(p.from&&p.from.trim().toLowerCase()!==(context.from||'').trim().toLowerCase())return false;
  if(type==='ping_success')return pingTargetMatches(p.to,context.to);
  if(type==='dns_success')
    // Même règle que simDNS : un nom de domaine ne dépend pas de la casse.
    return !p.domain||p.domain.trim().toLowerCase()===(context.domain||'').trim().toLowerCase();
  if(type==='http_success'){
    var _normURL=function(u){return (u||'').trim().replace(/^https?:\/\//i,'').replace(/\/$/,'').toLowerCase();};
    return !p.url||_normURL(p.url)===_normURL(context.url);
  }
  return type==='dhcp_success';
}
/* Rejoue sans rien afficher la commande qui a validé l'objectif, sur le réseau actuel. */
function dynamicStillHolds(obj,proof){
  var p=obj.params||{};
  var src=p.from?devByName(p.from):(S.devs[proof.fromId]||devByName(proof.from));
  if(!src)return false;
  switch(obj.check){
    case 'ping_success':{
      // Même adresse que la commande réussie tant qu'elle désigne encore la cible,
      // sinon l'adresse actuelle de l'appareil visé.
      var to=!p.to||pingTargetMatches(p.to,proof.to)?proof.to:pingTargetIP(p.to);
      return !!to&&simPing(src.id,to).ok;}
    case 'dns_success':return simDNS(src.id,p.domain||proof.domain||'').ok;
    case 'http_success':return simHTTP(src.id,p.url||proof.url||'').ok;
    case 'dhcp_success':{
      // L'appareil garde l'adresse reçue et un serveur DHCP actif reste joignable.
      var f=mainIface(src);
      if(!f||!f.ip||f.ip!==proof.ip)return false;
      return lanSeg(src.id).some(function(id){
        var s=S.devs[id];return s&&(s.type==='server'||s.type==='wifi_router')&&s.dhcp&&s.dhcp.on;
      });}
  }
  return false;
}
function objectiveHolds(obj){
  if(STATIC_OBJ_TYPES.indexOf(obj.check)>=0)return checkObjectiveStatic(obj);
  if(DYNAMIC_OBJ_TYPES.indexOf(obj.check)<0)return false;
  var pr=ACTIVITY_PROOFS[obj.id];
  // Validé par une sauvegarde antérieure à l'enregistrement des preuves : on le garde.
  if(!pr)return !!ACTIVITY_RESULTS[obj.id];
  return dynamicStillHolds(obj,pr);
}
/* Réévalue tous les objectifs ; renvoie ceux qui viennent d'être atteints ou perdus. */
function evaluateObjectives(objectives){
  var gained=[],lost=[];
  (objectives||[]).forEach(function(obj){
    var was=!!ACTIVITY_RESULTS[obj.id],now=!!objectiveHolds(obj);
    ACTIVITY_RESULTS[obj.id]=now;
    if(now&&!was)gained.push(obj);
    else if(was&&!now)lost.push(obj);
  });
  return{gained:gained,lost:lost};
}
/* Enregistre une commande réussie ; renvoie les objectifs qu'elle valide. */
function recordDynamicEvent(objectives,type,context){
  var gained=[];
  (objectives||[]).forEach(function(obj){
    if(!dynamicEventMatches(obj,type,context))return;
    var pr={};Object.keys(context).forEach(function(k){pr[k]=context[k];});
    if(!pr.fromId){var fd=devByName(context.from);if(fd)pr.fromId=fd.id;}
    ACTIVITY_PROOFS[obj.id]=pr;
    if(!ACTIVITY_RESULTS[obj.id]){ACTIVITY_RESULTS[obj.id]=true;gained.push(obj);}
  });
  return gained;
}

/* ─────────────────────────────────────────────────────
   CHARGEMENT D'UN RÉSEAU (fichier, session, scénario)
───────────────────────────────────────────────────── */
/* Ce qui empêche d'utiliser ces données comme réseau (fichier, session, scénario) : message, ou ''
   si tout va bien. Sans affichage ; à appeler avant de remplacer le réseau en cours. */
function networkDataProblem(data){
  function isObj(o){return !!o&&typeof o==='object'&&!Array.isArray(o);}
  function optObj(o){return o===undefined||o===null||isObj(o);}
  if(!isObj(data)||!isObj(data.devs)||!isObj(data.links))return 'ce fichier ne contient pas de réseau';
  if(!optObj(data.frames)||!optObj(data.texts))return 'cadres ou textes illisibles';
  var ids=Object.keys(data.devs),i,d,l,who;
  for(i=0;i<ids.length;i++){
    d=data.devs[ids[i]];who='appareil « '+ids[i]+' »';
    if(!isObj(d))return who+' illisible';
    if(d.id!==ids[i])return who+' : identifiant incohérent';
    if(!Object.prototype.hasOwnProperty.call(DT,d.type))return who+' : type inconnu';
    if(d.name!==undefined&&typeof d.name!=='string')return who+' : nom illisible';
    if(d.ifaces===undefined?!isRouter(d):!Array.isArray(d.ifaces)||!d.ifaces.every(isObj))return who+' : interfaces illisibles';
    if(!optObj(d.dhcp)||!optObj(d.http)||!optObj(d.serverFiles))return who+' : services illisibles';
    if(!optObj(d.dns)||(d.dns&&!isObj(d.dns.records)))return who+' : service DNS illisible';
    if(d.staticRoutes!==undefined&&d.staticRoutes!==null&&!(Array.isArray(d.staticRoutes)&&d.staticRoutes.every(isObj)))return who+' : routes illisibles';
  }
  ids=Object.keys(data.links);
  for(i=0;i<ids.length;i++){
    l=data.links[ids[i]];
    if(!isObj(l)||!isObj(data.devs[l.from])||!isObj(data.devs[l.to]))return 'liaison « '+ids[i]+' » vers un appareil absent';
  }
  return '';
}
/* Prochain numéro libre : jamais sous un identifiant déjà pris (d12, l13, f14, ta15), sinon un
   appareil ajouté ensuite remplacerait un appareil existant. */
function nextFreeId(data){
  var max=0;
  [data.devs,data.links,data.frames,data.texts].forEach(function(o){
    Object.keys(o||{}).forEach(function(k){var m=/(\d+)$/.exec(k);if(m&&+m[1]>max)max=+m[1];});
  });
  return Math.max(parseInt(data.nid,10)||1,max+1);
}
function applyNetworkData(data){
  S.devs=data.devs||{};S.links=data.links||{};S.nid=nextFreeId(data);
  S.frames=data.frames||{};S.texts=data.texts||{};
  S.activeLinks=new Set();S.animPhase=null;
  Object.values(S.devs).forEach(function(d){
    if(!d.dhcp)d.dhcp={on:false,start:'192.168.1.100',end:'192.168.1.200',mask:'255.255.255.0',gateway:'',dns:''};
    else if(!d.dhcp.end)d.dhcp.end='192.168.1.200';
    if(!d.staticRoutes)d.staticRoutes=[];
    if((d.type==='router'||d.type==='internet'||d.type==='wifi_router')&&d.autoRouteEnabled===undefined)d.autoRouteEnabled=true;
    if((d.type==='router'||d.type==='internet'||d.type==='wifi_router')&&(!d.ifaces||d.ifaces.length===0))
      d.ifaces=[{name:'eth0',ip:'',mask:'255.255.255.0'},{name:'eth1',ip:'',mask:'255.255.255.0'}];
    if(d.type==='wifi_router'&&!d.ssid)d.ssid='MonWiFi';
    if(d.type==='wifi_router'&&d.wifiPass===undefined)d.wifiPass='';
    if(!d.http)d.http={on:false,title:'Ma page web',content:'',htmlMode:false};
    if(d.http&&d.http.htmlMode===undefined)d.http.htmlMode=false;
    if(!d.dns)d.dns={on:false,records:{}};
    if(d.type==='server'&&!d.serverFiles)d.serverFiles={};
  });
}

/* ─────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────── */
var DW=126,DH=112;
var DT={
  pc:      {label:'PC',       icon:'🖥️',bg:'#ebf8ff',bd:'#4299e1',tc:'#2b6cb0'},
  server:  {label:'Serveur',  icon:'🖧', bg:'#f0fff4',bd:'#48bb78',tc:'#276749'},
  switch:  {label:'Switch',   icon:'🔀',bg:'#fffbeb',bd:'#ed8936',tc:'#c05621'},
  router:  {label:'Routeur',  icon:'📡',bg:'#faf5ff',bd:'#9f7aea',tc:'#553c9a'},
  wifi_router:{label:'Box WiFi',icon:'📶',bg:'#f0f4ff',bd:'#667eea',tc:'#4c51bf'},
  internet:{label:'Internet', icon:'🌐',bg:'#e0f2fe',bd:'#0ea5e9',tc:'#0369a1'}
};
// Modèles de terminal (d.kind sur un appareil de type 'pc') : l'icône fixe les connexions possibles.
// Un 'pc' sans kind (anciens scénarios) garde le comportement historique : 1 câble + 1 WiFi.
var PC_KINDS={
  desktop:{label:'PC fixe',    icon:'🖥️',cable:true, wifi:false},
  laptop: {label:'PC portable',icon:'💻',cable:true, wifi:true,short:'Portable'},
  phone:  {label:'Téléphone',  icon:'📱',cable:false,wifi:true},
  tablet: {label:'Tablette',   icon:'📲',cable:false,wifi:true}
};
function pcKind(d){return d&&d.type==='pc'&&d.kind&&PC_KINDS[d.kind]?PC_KINDS[d.kind]:null;}
function devLabel(d){var k=pcKind(d);return k?k.label:(DT[d.type]?DT[d.type].label:d.type);}
function canCable(d){var k=pcKind(d);return !k||k.cable;}
function canWifi(d){var k=pcKind(d);return !k||k.wifi;}
// Liens existants devenus interdits pour l'appareil (après changement de modèle)
function forbiddenLinks(id){
  var d=S.devs[id];if(!d)return [];
  return Object.keys(S.links).filter(function(lid){
    var l=S.links[lid];if(l.from!==id&&l.to!==id)return false;
    return l.type==='wifi'?!canWifi(d):!canCable(d);
  });
}
var VMASKS=['255.255.255.0','255.255.0.0','255.0.0.0',
  '255.255.255.128','255.255.255.192','255.255.255.224',
  '255.255.255.240','255.255.255.248','255.255.255.252'];

/* ─────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────── */
var S={
  devs:{},links:{},frames:{},texts:{},nid:1,
  tool:'select',mode:'config',
  sel:null,cableFrom:null,drag:null,
  termDev:null,
  score:0,
  activeLinks:new Set(),  // câbles animés
  animPhase:null,         // 'fwd'|'ret'|null
  packets:[]              // sniffer de paquets
};

/* ─────────────────────────────────────────────────────
   IP UTILS
───────────────────────────────────────────────────── */
function ip2n(ip){
  if(!ip)return -1;var p=ip.trim().split('.');if(p.length!==4)return -1;
  var n=0;for(var i=0;i<4;i++){var x=parseInt(p[i],10);if(isNaN(x)||x<0||x>255)return -1;n=n*256+x;}
  return n>>>0;
}
function vIP(ip){return ip2n(ip)>=0;}
function vMask(m){return m&&VMASKS.indexOf(m.trim())!==-1;}

/* ── Validation stricte saisie utilisateur ── */
function isValidUserIP(ip){
  var v=(ip||'').trim();
  if(v==='')return true;
  var p=v.split('.');
  if(p.length!==4)return false;
  for(var i=0;i<4;i++){
    var s=p[i];
    if(!/^\d+$/.test(s))return false;
    if(s.length>1&&s[0]==='0')return false;
    var n=parseInt(s,10);
    if(n<0||n>255)return false;
  }
  if(v==='0.0.0.0')return false;
  return true;
}
function isValidUserMask(mask){
  var v=(mask||'').trim();
  if(v==='')return true;
  var p=v.split('.');
  if(p.length!==4)return false;
  var n32=0;
  for(var i=0;i<4;i++){
    var s=p[i];
    if(!/^\d+$/.test(s))return false;
    var n=parseInt(s,10);
    if(n<0||n>255)return false;
    n32=(n32<<8)|n;
  }
  n32=n32>>>0;
  var inv=(~n32)>>>0;
  return (inv&(inv+1))===0;
}
function sameNet(ip1,mask,ip2){
  var a=ip2n(ip1),m=ip2n(mask),b=ip2n(ip2);
  if(a<0||m<0||b<0)return false;return((a&m)>>>0)===((b&m)>>>0);
}
function macOf(id){
  var n=parseInt(id.replace(/\D/g,''),10)||0;
  return 'AA:BB:CC:00:'+('0'+Math.floor(n/256).toString(16)).slice(-2).toUpperCase()+':'+('0'+(n%256).toString(16)).slice(-2).toUpperCase();
}

/* ─────────────────────────────────────────────────────
   DEVICE / LINK MANAGEMENT
───────────────────────────────────────────────────── */
function mkDev(type,x,y,kind){
  var id='d'+(S.nid++);
  if(type!=='pc'||!PC_KINDS[kind])kind=undefined;
  var num=Object.values(S.devs).filter(function(d){return d.type===type&&(type!=='pc'||d.kind===kind);}).length+1;
  var label=kind?(PC_KINDS[kind].short||PC_KINDS[kind].label):DT[type].label;
  var ifaces=[];
  if(type==='router'||type==='internet'||type==='wifi_router'){
    ifaces=type==='wifi_router'?
      [{name:'WAN',ip:'',mask:'255.255.255.0'},{name:'WiFi',ip:'',mask:'255.255.255.0'}]:
      [{name:'eth0',ip:'',mask:'255.255.255.0'},{name:'eth1',ip:'',mask:'255.255.255.0'}];
  } else if(type==='switch'){
    ifaces=[];
  } else {
    ifaces=[{name:'eth0',ip:'',mask:'255.255.255.0',gateway:'',dns:''}];
  }
  S.devs[id]={id:id,type:type,name:label+' '+num,x:x,y:y,
    mac:macOf(id),ifaces:ifaces,
    http:{on:false,title:'Ma page web',content:'Bienvenue sur ce serveur !',htmlMode:false},
    dns:{on:false,records:{}},
    serverFiles:{},
    dhcp:{on:false,start:'192.168.1.100',end:'192.168.1.200',mask:'255.255.255.0',gateway:'',dns:''},
    staticRoutes:[],
    autoRouteEnabled:((type==='router'||type==='internet'||type==='wifi_router')?true:undefined),
    ssid:(type==='wifi_router'?'MonWiFi':undefined),
    wifiPass:(type==='wifi_router'?'':undefined)};
  if(kind)S.devs[id].kind=kind;
  return id;
}

function delDev(id){
  Object.keys(S.links).forEach(function(lid){var l=S.links[lid];if(l.from===id||l.to===id)delete S.links[lid];});
  delete S.devs[id];
  if(S.sel===id)S.sel=null;if(S.cableFrom===id)S.cableFrom=null;if(S.termDev===id)S.termDev=null;
}

/* Règles de câblage entre a et b, sans rien modifier ni afficher :
   {ok:true, wifi} si la liaison peut être créée, {ok:false, msg} sinon (msg vide : rien à signaler). */
function linkCheck(a,b){
  if(a===b)return{ok:false,msg:''};
  // Pas de doublon
  var dup=Object.values(S.links).find(function(l){return(l.from===a&&l.to===b)||(l.from===b&&l.to===a);});
  if(dup)return{ok:false,msg:''};
  // PC/Serveur : 1 câble + 1 WiFi ; auto-tag liaison WiFi
  var da=S.devs[a],db=S.devs[b];
  // Un PC fixe relié à une Box WiFi l'est par câble (port LAN), pas en WiFi
  var isWifi=!!((da&&da.type==='wifi_router'&&db&&(db.type==='pc'||db.type==='server')&&canWifi(db))
            ||(db&&db.type==='wifi_router'&&da&&(da.type==='pc'||da.type==='server')&&canWifi(da)));
  if(!isWifi){
    var nc=[da,db].find(function(d){return d&&!canCable(d);});
    if(nc)return{ok:false,msg:nc.name+' ('+devLabel(nc)+') ne se connecte qu\'en WiFi, à une Box WiFi'};
  }
  function cableCount(id){return Object.values(S.links).filter(function(l){return (l.from===id||l.to===id)&&l.type!=='wifi';}).length;}
  function wifiCount(id){return Object.values(S.links).filter(function(l){return (l.from===id||l.to===id)&&l.type==='wifi';}).length;}
  if(isWifi){
    if(da&&(da.type==='pc'||da.type==='server')&&wifiCount(a)>=1)return{ok:false,msg:da.name+' est déjà connecté en WiFi'};
    if(db&&(db.type==='pc'||db.type==='server')&&wifiCount(b)>=1)return{ok:false,msg:db.name+' est déjà connecté en WiFi'};
  } else {
    if(da&&(da.type==='pc'||da.type==='server')&&cableCount(a)>=1)return{ok:false,msg:da.name+' a déjà un câble — connexion unique autorisée'};
    if(db&&(db.type==='pc'||db.type==='server')&&cableCount(b)>=1)return{ok:false,msg:db.name+' a déjà un câble — connexion unique autorisée'};
  }
  return{ok:true,wifi:isWifi};
}

/* ── Connexion WiFi d'un terminal ──────────────────────────────
   d.wifi = {ssid, pass} : réseau choisi et mot de passe saisi sur le terminal. La liaison WiFi
   tracée vers une box ne transporte rien tant que le SSID n'est pas celui de la box et, pour un
   réseau protégé, que le mot de passe n'est pas le bon. Sans d.wifi (scénarios antérieurs),
   le terminal est connecté à la box qu'il touche. */
function wifiLinkOf(d){
  return d?Object.values(S.links).find(function(l){
    if(l.type!=='wifi'||(l.from!==d.id&&l.to!==d.id))return false;
    var o=S.devs[l.from===d.id?l.to:l.from];return !!o&&o.type==='wifi_router';
  })||null:null;
}
function wifiBoxOf(d){var l=wifiLinkOf(d);return l?S.devs[l.from===d.id?l.to:l.from]:null;}
/* {ok} ou {ok:false, why:'ssid'|'pass'} pour le terminal t et la box b. */
function wifiAssoc(t,b){
  if(!t||!b)return{ok:false,why:'ssid'};
  if(!t.wifi)return{ok:true};
  if((t.wifi.ssid||'').trim()!==(b.ssid||'').trim())return{ok:false,why:'ssid'};
  if(b.wifiPass&&(t.wifi.pass||'')!==b.wifiPass)return{ok:false,why:'pass'};
  return{ok:true};
}
function wifiLinkUp(l){
  if(!l||l.type!=='wifi')return true;
  var a=S.devs[l.from],b=S.devs[l.to];if(!a||!b)return false;
  if(a.type==='wifi_router'&&b.type==='wifi_router')return true;
  return a.type==='wifi_router'?wifiAssoc(b,a).ok:wifiAssoc(a,b).ok;
}
/* Message quand le terminal n'est relié que par un WiFi qui ne s'associe pas ; '' sinon. */
function wifiProblem(devId){
  var d=S.devs[devId],l=wifiLinkOf(d);
  if(!l||wifiLinkUp(l))return '';
  var wired=Object.values(S.links).some(function(k){return k.type!=='wifi'&&(k.from===devId||k.to===devId);});
  if(wired)return '';
  var st=wifiAssoc(d,wifiBoxOf(d)),ss=(d.wifi&&d.wifi.ssid||'').trim();
  if(st.why==='pass')return 'Non connecté au WiFi : mot de passe incorrect pour « '+ss+' »';
  return ss?'Non connecté au WiFi : SSID « '+ss+' » inconnu (aucune box ne le diffuse ici)'
    :'Non connecté au WiFi : aucun réseau choisi dans la fiche de '+d.name;
}

function nbrs(devId){
  var r=[];
  Object.values(S.links).forEach(function(l){
    if(!wifiLinkUp(l))return;
    if(l.from===devId)r.push(l.to);else if(l.to===devId)r.push(l.from);});
  return r;
}

// BFS LAN segment (traverse through switches)
function lanSeg(startId){
  var vis=new Set(),q=[startId],res=new Set();
  while(q.length){var id=q.shift();if(vis.has(id))continue;vis.add(id);res.add(id);
    nbrs(id).forEach(function(nid){res.add(nid);if(!vis.has(nid)&&S.devs[nid]&&S.devs[nid].type==='switch')q.push(nid);});}
  return Array.from(res);
}

// BFS cable path (returns link ID list between two devices, through switches)
function cablePath(fromId,toId){
  if(fromId===toId)return[];
  var vis=new Set();
  var q=[{id:fromId,path:[]}];
  while(q.length){
    var cur=q.shift();
    if(vis.has(cur.id))continue;
    vis.add(cur.id);
    var links=Object.values(S.links).filter(function(l){return l.from===cur.id||l.to===cur.id;});
    for(var i=0;i<links.length;i++){
      var l=links[i];
      var nid=(l.from===cur.id)?l.to:l.from;
      var np=cur.path.concat(l.id);
      if(nid===toId)return np;          // ← chemin trouvé
      if(!vis.has(nid))q.push({id:nid,path:np});
    }
  }
  return[];                             // ← aucun chemin physique
}

function devByIP(ip){
  return Object.values(S.devs).find(function(d){
    return d.ifaces&&d.ifaces.some(function(f){return f.ip&&f.ip.trim()===ip.trim();});
  })||null;
}
function mainIface(d){return d.ifaces&&d.ifaces[0]?d.ifaces[0]:null;}

/* ─────────────────────────────────────────────────────
   SIMULATION ENGINE
───────────────────────────────────────────────────── */
function isRouter(d){return d&&(d.type==='router'||d.type==='internet'||d.type==='wifi_router');}

/* ── Acheminement d'un ping ──
   Aller puis retour : chaque routeur suit sa table de routage (route la plus précise, puis route
   par défaut). Les réponses venant d'Internet reviennent toujours : le routeur d'accès traduit
   les adresses (NAT). Une adresse privée, ou d'un réseau du schéma, que personne ne porte est
   inconnue ; une adresse publique inconnue est sur Internet. */
var PING_MAX_HOPS=16;
function isPrivateIP(ip){
  var a=ip2n(ip);if(a<0)return false;
  return (a>>>24)===10||(a>>>20)===0xAC1||(a>>>16)===0xC0A8;
}
/* L'adresse appartient-elle à un réseau du schéma (hors Internet) ? */
function inLocalNetwork(ip){
  return Object.values(S.devs).some(function(d){
    if(d.type==='internet')return false;
    return (d.ifaces||[]).some(function(f){return f.ip&&vMask(f.mask)&&sameNet(f.ip,f.mask,ip);});
  });
}
/* Câble d'une box côté WAN : il mène à Internet, ou à un réseau qui contient une adresse du
   réseau WAN de la box. Les autres câbles (vers le switch de la maison…) sont côté LAN. */
function boxLinkIsWan(box,link){
  if(link.type==='wifi')return false;
  var other=link.from===box.id?link.to:link.from,od=S.devs[other];
  if(!od||od.type==='internet')return true;
  var w=box.ifaces&&box.ifaces[0];
  var seg=od.type==='switch'?lanSeg(other):[other];
  return seg.some(function(id){
    var d=S.devs[id];if(!d||d.id===box.id)return false;
    if(d.type==='internet')return true;
    return !!(w&&w.ip&&vMask(w.mask))&&(d.ifaces||[]).some(function(f){return f.ip&&sameNet(w.ip,w.mask,f.ip);});
  });
}
/* Livraison sur un même réseau : câbles (via les switchs), et pont d'une box entre ses clients
   WiFi et son côté LAN câblé, comme une vraie box. Le port WAN n'est jamais ponté. */
function l2Reach(fromId,toId){
  if(lanSeg(fromId).indexOf(toId)!==-1)return{ok:true,path:[fromId,toId]};
  var vis={},q=[{id:fromId,via:null,box:null}];
  while(q.length){
    var cur=q.shift();
    if(vis[cur.id])continue;
    vis[cur.id]=true;
    var d=S.devs[cur.id],start=cur.id===fromId;
    if(!start){
      if(!d)continue;
      if(d.type==='wifi_router'){if(boxLinkIsWan(d,cur.via))continue;}
      else if(d.type!=='switch')continue;
    }
    var box=cur.box||(!start&&d.type==='wifi_router'?d.id:null);
    var links=Object.values(S.links);
    for(var i=0;i<links.length;i++){
      var l=links[i];
      if(l.from!==cur.id&&l.to!==cur.id)continue;
      if(!wifiLinkUp(l))continue;
      if(!start&&d.type==='wifi_router'&&boxLinkIsWan(d,l))continue;
      var n=l.from===cur.id?l.to:l.from;
      if(n===toId&&box)return{ok:true,path:[fromId,box,toId],wifi:true};
      if(!vis[n])q.push({id:n,via:l,box:box});
    }
  }
  return{ok:false};
}
/* TTL affiché par ping : 64 moins les routeurs traversés. Les switchs et le pont d'une box
   (WiFi ↔ câble, même réseau) ne le décrémentent pas. */
function pingTTL(res){
  if(!res||!res.path)return 64;
  if(res.wifi&&res.path.length===3)return 64;
  return 64-res.path.slice(1,-1).filter(function(id){return isRouter(S.devs[id]);}).length;
}
/* Route la plus précise de la table du routeur pour cette destination. */
function bestRoute(r,destIP){
  var d=ip2n(destIP),best=null,bestMask=-1;
  getRoutingTable(r.id).forEach(function(rt){
    var m=ip2n(rt.mask),n=ip2n(rt.dest);
    if(m<0||n<0||((d&m)>>>0)!==((n&m)>>>0))return;
    if(m>bestMask){best=rt;bestMask=m;}
  });
  return best;
}
/* Achemine un paquet de fromId vers destIP : appareil dstId, ou Internet si dstId est nul. */
function routePacket(fromId,destIP,dstId){
  var from=S.devs[fromId],path=[fromId],r,l2;
  if(!isRouter(from)){
    var si=mainIface(from);
    if(dstId&&sameNet(si.ip,si.mask,destIP)){
      l2=l2Reach(fromId,dstId);
      if(l2.ok)return{ok:true,path:l2.path,wifi:l2.wifi};
      return{ok:false,reason:'Même sous-réseau mais appareils non reliés physiquement'};
    }
    var gw=(si.gateway||'').trim();
    if(!gw)return{ok:false,reason:'Aucune passerelle configurée sur '+from.name+' (champ Gateway)'};
    if(!sameNet(si.ip,si.mask,gw))
      return{ok:false,reason:'La passerelle '+gw+' n\'est pas dans le sous-réseau de '+from.name};
    r=devByIP(gw);
    if(!r)return{ok:false,reason:'Passerelle '+gw+' introuvable'};
    if(!isRouter(r))return{ok:false,reason:gw+' n\'est pas un routeur'};
    if(!l2Reach(fromId,r.id).ok)return{ok:false,reason:'Pas de liaison physique vers le routeur '+r.name};
    path.push(r.id);
  } else r=from;
  var seen={};
  for(var hop=0;hop<PING_MAX_HOPS;hop++){
    if(seen[r.id])return{ok:false,reason:'Boucle de routage : le paquet repasse par '+r.name};
    seen[r.id]=true;
    if(dstId===r.id)return{ok:true,path:path};
    if(!dstId&&r.type==='internet')return{ok:true,path:path,internet:true};
    if(r.type==='internet'&&isPrivateIP(destIP)){
      var last=path.length>1?S.devs[path[path.length-2]]:null;
      return{ok:false,reason:'Pas de route vers '+destIP+(last?' sur '+last.name:'')+
        ' : le paquet part vers Internet par la route par défaut, et Internet n\'achemine pas les adresses privées'};
    }
    var rt=bestRoute(r,destIP);
    if(!rt)return{ok:false,reason:'Pas de route vers '+destIP+' dans la table de '+r.name};
    if(!rt.gw){
      if(!dstId)return{ok:false,reason:'Hôte '+destIP+' inconnu sur le réseau de '+r.name};
      l2=l2Reach(r.id,dstId);
      if(!l2.ok)return{ok:false,reason:S.devs[dstId].name+' n\'est pas relié physiquement à '+r.name};
      return{ok:true,path:path.concat(l2.path.slice(1)),wifi:l2.wifi};
    }
    var nh=devByIP(rt.gw);
    if(!nh||!isRouter(nh))return{ok:false,reason:'Le routeur suivant '+rt.gw+' (table de '+r.name+') est introuvable'};
    if(!l2Reach(r.id,nh.id).ok)return{ok:false,reason:r.name+' n\'est pas relié physiquement au routeur suivant '+nh.name};
    path.push(nh.id);r=nh;
  }
  return{ok:false,reason:'Trop de routeurs traversés (plus de '+PING_MAX_HOPS+')'};
}

function simPing(srcId,destIP){
  var src=S.devs[srcId];if(!src)return{ok:false,reason:'Appareil introuvable'};
  if(src.type==='switch')return{ok:false,reason:'Un switch n\'a pas d\'adresse IP'};
  var wp=wifiProblem(srcId);if(wp)return{ok:false,reason:wp};
  var si=mainIface(src);
  if(!isRouter(src)&&(!si||!si.ip))return{ok:false,reason:'Adresse IP non configurée sur '+src.name};
  destIP=(destIP||'').trim();
  if(devHasIP(src,destIP))return{ok:true,path:[src.id],lat:0};
  var dst=devByIP(destIP);
  if(dst&&wifiProblem(dst.id))return{ok:false,reason:dst.name+' n\'est pas connecté au WiFi ('+
    wifiProblem(dst.id).replace('Non connecté au WiFi : ','')+')'};
  if(!dst){
    if(isPrivateIP(destIP)||inLocalNetwork(destIP))
      return{ok:false,reason:'Hôte '+destIP+' inconnu (aucun appareil n\'a cette IP)'};
    if(!findInternetDev())return{ok:false,reason:'Hôte '+destIP+' inconnu : ce réseau n\'a pas d\'accès à Internet'};
  }
  var go=routePacket(srcId,destIP,dst?dst.id:null);
  if(!go.ok)return go;
  var viaInternet=go.internet||go.path.some(function(id){return S.devs[id]&&S.devs[id].type==='internet';});
  // Retour vers la source (sauf depuis Internet, grâce au NAT, ou depuis un routeur)
  if(dst&&!viaInternet&&!isRouter(src)){
    var back=routePacket(dst.id,si.ip.trim(),srcId);
    if(!back.ok)return{ok:false,reason:'Le paquet arrive à '+dst.name+', mais la réponse ne revient pas : '+back.reason};
  }
  var routed=go.path.slice(1,-1).some(function(id){return isRouter(S.devs[id])&&!(go.wifi&&go.path.length===3);});
  return{ok:true,path:go.path,lat:go.internet?32:(go.wifi?1:go.path.length-1),
    router:routed||undefined,wifi:go.wifi||undefined,internet:go.internet||undefined};
}

function simDNS(srcId,domain){
  var src=S.devs[srcId];if(!src)return{ok:false,reason:'Appareil introuvable'};
  var si=mainIface(src);
  if(!si||!si.dns)return{ok:false,reason:'Pas de DNS configuré dans la config IP de '+src.name};
  var dip=si.dns.trim();
  // DNS local
  var ddev=devByIP(dip);if(!ddev)return{ok:false,reason:'Serveur DNS '+dip+' introuvable'};
  var pr=simPing(srcId,dip);if(!pr.ok)return{ok:false,reason:'DNS inaccessible : '+pr.reason};
  if(!ddev.dns||!ddev.dns.on)return{ok:false,reason:ddev.name+' n\'a pas le service DNS activé'};
  var ip=ddev.dns.records[(domain||'').toLowerCase().trim()];
  if(!ip)return{ok:false,reason:'Domaine "'+domain+'" non trouvé dans le DNS de '+ddev.name};
  return{ok:true,ip:ip,server:ddev.name};
}

/* Sans affichage : l'appelant journalise la résolution DNS (domain et ip du résultat, présents
   aussi quand la requête échoue après une résolution réussie). */
function simHTTP(srcId,rawURL){
  var url=rawURL.trim().replace(/^https?:\/\//i,'');
  var he=url.search(/[/?#]/);var host=he>0?url.substring(0,he):url;
  var destIP,domain=null;
  if(/^\d+\.\d+\.\d+\.\d+$/.test(host)){destIP=host;}
  else{
    domain=host;var dr=simDNS(srcId,domain);
    if(!dr.ok)return{ok:false,reason:'DNS : '+dr.reason};
    destIP=dr.ip;
  }
  var srv=devByIP(destIP);
  if(!srv)return{ok:false,reason:'Serveur '+destIP+' introuvable',ip:destIP,domain:domain};
  if(!srv.http||!srv.http.on)return{ok:false,reason:srv.name+' n\'a pas de service HTTP activé',ip:destIP,domain:domain};
  var pr=simPing(srcId,destIP);if(!pr.ok)return{ok:false,reason:'Serveur inaccessible : '+pr.reason,ip:destIP,domain:domain};
  return{ok:true,title:srv.http.title||'Sans titre',content:srv.http.content||'',
    htmlMode:!!(srv.http.htmlMode),serverFiles:srv.serverFiles||{},
    ip:destIP,domain:domain,server:srv.name,path:pr.path};
}

/* ─────────────────────────────────────────────────────
   SYSTÈME DE FICHIERS SERVEUR
───────────────────────────────────────────────────── */
function resolveFileRefs(content,serverFiles){
  if(!serverFiles)return content;
  return content.replace(/(src|href)="files\/([^"]+)"/g,function(m,attr,fn){
    var f=serverFiles[fn];return f?attr+'="'+f.data+'"':m;
  });
}

function parseDNS(devId,text){
  var r={};text.split('\n').forEach(function(line){
    var m=line.match(/^\s*([^\s=]+)\s*=\s*(\S+)\s*$/);if(m)r[m[1].toLowerCase()]=m[2];
  });
  S.devs[devId].dns.records=r;
}

/* ─────────────────────────────────────────────────────
   DHCP
───────────────────────────────────────────────────── */
function simDHCP(srcId){
  var src=S.devs[srcId];if(!src)return{ok:false,reason:'Appareil introuvable'};
  if(src.type==='switch'||isRouter(src))return{ok:false,reason:'Seuls PC et Serveur peuvent faire une demande DHCP'};
  var wp=wifiProblem(srcId);if(wp)return{ok:false,reason:wp};
  var seg=lanSeg(srcId);
  var dhcpSrv=null;
  seg.forEach(function(nid){
    if(dhcpSrv)return;
    var d=S.devs[nid];
    if(d&&(d.type==='server'||d.type==='wifi_router')&&d.dhcp&&d.dhcp.on)dhcpSrv=d;
  });
  if(!dhcpSrv)return{ok:false,reason:'Aucun serveur DHCP trouvé sur ce segment LAN'};
  var start=ip2n(dhcpSrv.dhcp.start||'192.168.1.100');
  var end=ip2n(dhcpSrv.dhcp.end||'192.168.1.200');
  if(start<0)return{ok:false,reason:'IP de départ DHCP invalide dans '+dhcpSrv.name};
  if(end<0)return{ok:false,reason:'IP de fin DHCP invalide dans '+dhcpSrv.name};
  if(end<start)return{ok:false,reason:'IP de fin inférieure à l\'IP de départ dans '+dhcpSrv.name};
  var used=new Set(Object.values(S.devs).map(function(d){
    return d.ifaces&&d.ifaces[0]?ip2n(d.ifaces[0].ip||''):-1;
  }));
  var assigned=-1;
  for(var cand=start;cand<=end;cand++){if(!used.has(cand>>>0)){assigned=cand>>>0;break;}}
  if(assigned<0)return{ok:false,reason:'Plage DHCP épuisée ('+dhcpSrv.dhcp.start+' → '+dhcpSrv.dhcp.end+')'};
  var aIP=[(assigned>>>24)&255,(assigned>>>16)&255,(assigned>>>8)&255,assigned&255].join('.');
  src.ifaces[0].ip=aIP;
  src.ifaces[0].mask=dhcpSrv.dhcp.mask||'255.255.255.0';
  src.ifaces[0].gateway=dhcpSrv.dhcp.gateway||'';
  src.ifaces[0].dns=dhcpSrv.dhcp.dns||'';
  return{ok:true,ip:aIP,mask:src.ifaces[0].mask,gw:src.ifaces[0].gateway,dns:src.ifaces[0].dns,server:dhcpSrv.name};
}

/* ─────────────────────────────────────────────────────
   TABLE DE ROUTAGE
───────────────────────────────────────────────────── */
function netAddr(ip,mask){
  var a=ip2n(ip),m=ip2n(mask);
  if(a<0||m<0)return ip;
  var n=(a&m)>>>0;
  return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join('.');
}

function getRoutingTable(routerId){
  var d=S.devs[routerId];if(!d||!isRouter(d))return[];
  var routes=[];
  d.ifaces.forEach(function(fi){
    if(!fi.ip||!fi.mask)return;
    routes.push({dest:netAddr(fi.ip,fi.mask),mask:fi.mask,gw:'',iface:fi.name,type:'direct'});
  });
  if(d.staticRoutes){d.staticRoutes.forEach(function(r){routes.push(r);});}
  return routes;
}

/* ─────────────────────────────────────────────────────
   ROUTAGE AUTOMATIQUE (RIP simplifié)
───────────────────────────────────────────────────── */
/* Calcule les routes sans rien afficher ; renvoie le nombre de routes ajoutées.
   onlyAuto : laisse de côté les routeurs dont le routage automatique est décoché. */
/* RIP : chaque routeur apprend, de proche en proche, les réseaux connus de ses voisins (routeurs
   qui partagent un de ses réseaux), jusqu'à ce que plus rien ne change. L'appareil Internet
   annonce en plus la route par défaut (0.0.0.0/0). Les routes RIP sont recalculées à chaque
   fois : elles suivent la configuration actuelle. onlyAuto : seulement les routeurs dont le
   routage automatique est activé ; les autres gardent leurs routes. */
function computeRoutes(onlyAuto){
  var routers=Object.values(S.devs).filter(function(d){return isRouter(d);});
  // L'appareil Internet représente le réseau public : il n'apprend pas les réseaux du schéma.
  var learners=routers.filter(function(r){return r.type!=='internet'&&!(onlyAuto&&r.autoRouteEnabled===false);});
  routers.forEach(function(r){r.staticRoutes=r.staticRoutes||[];});
  learners.forEach(function(r){r.staticRoutes=r.staticRoutes.filter(function(sr){return sr.type!=='rip';});});
  function announced(r){
    var nets=[];
    r.ifaces.forEach(function(f){if(f.ip&&vMask(f.mask))nets.push({dest:netAddr(f.ip,f.mask),mask:f.mask});});
    r.staticRoutes.forEach(function(sr){nets.push({dest:sr.dest,mask:sr.mask});});
    if(r.type==='internet')nets.push({dest:'0.0.0.0',mask:'0.0.0.0'});
    return nets;
  }
  var added=0,changed=true;
  for(var round=0;changed&&round<20;round++){
    changed=false;
    learners.forEach(function(r1){
      r1.ifaces.forEach(function(fi1){
        if(!fi1.ip||!vMask(fi1.mask))return;
        routers.forEach(function(r2){
          if(r1.id===r2.id)return;
          r2.ifaces.forEach(function(fi2){
            if(!fi2.ip||!vMask(fi2.mask)||!sameNet(fi1.ip,fi1.mask,fi2.ip))return;
            // r1 et r2 sont voisins via fi1/fi2 : r1 apprend ce que r2 annonce
            announced(r2).forEach(function(n){
              var own=r1.ifaces.some(function(f){return f.ip&&vMask(f.mask)&&netAddr(f.ip,f.mask)===n.dest&&f.mask===n.mask;});
              if(own)return;
              if(r1.staticRoutes.some(function(sr){return sr.dest===n.dest&&sr.mask===n.mask;}))return;
              r1.staticRoutes.push({dest:n.dest,mask:n.mask,gw:fi2.ip,iface:fi1.name,type:'rip'});
              added++;changed=true;
            });
          });
        });
      });
    });
  }
  return added;
}

/* ─────────────────────────────────────────────────────
   MODE PANNE — injection de fautes dans le réseau élève
───────────────────────────────────────────────────── */
/* Sans affichage : le builder s'en sert aussi pour calculer le score de départ de l'élève. */
function injectFaults(faults){
  faults.forEach(function(f){
    // Support format plat {type,dev,badValue} ET format builder {type,params:{dev,badValue}}
    var p=f.params||{};
    var fdev     = f.dev      != null ? f.dev      : p.dev;
    var fbadVal  = f.badValue != null ? f.badValue : p.badValue;
    var fservice = f.service  != null ? f.service  : p.service;
    var fdevA    = f.devA     != null ? f.devA     : p.devA;
    var fdevB    = f.devB     != null ? f.devB     : p.devB;
    var d,fi;
    switch(f.type){
      case 'bad_ip':
        d=devByName(fdev);if(!d)return;fi=mainIface(d);if(fi)fi.ip=fbadVal||'';break;
      case 'bad_mask':
        d=devByName(fdev);if(!d)return;fi=mainIface(d);if(fi)fi.mask=fbadVal||'';break;
      case 'bad_gateway':
        d=devByName(fdev);if(!d)return;fi=mainIface(d);if(fi)fi.gateway=fbadVal||'';break;
      case 'bad_dns':
        d=devByName(fdev);if(!d)return;fi=mainIface(d);if(fi)fi.dns=fbadVal||'';break;
      case 'service_down':
        d=devByName(fdev);if(!d)return;
        if(fservice==='http'&&d.http)d.http.on=false;
        if(fservice==='dns'&&d.dns)d.dns.on=false;
        if(fservice==='dhcp'&&d.dhcp)d.dhcp.on=false;
        break;
      case 'missing_cable':{
        var dA=devByName(fdevA),dB=devByName(fdevB);
        if(!dA||!dB)return;
        Object.keys(S.links).forEach(function(lid){
          var l=S.links[lid];
          if((l.from===dA.id&&l.to===dB.id)||(l.from===dB.id&&l.to===dA.id))
            delete S.links[lid];
        });
        break;}
      case 'ssid_wrong':
        d=devByName(fdev);if(!d||d.type!=='wifi_router')return;
        d.ssid=fbadVal||'';break;
      case 'wifi_pass_wrong':{
        d=devByName(fdev);if(!d||d.type==='wifi_router')return;
        var wb=wifiBoxOf(d);
        d.wifi={ssid:d.wifi?d.wifi.ssid:(wb?wb.ssid||'':''),pass:fbadVal||''};
        break;}
    }
  });
}

/* État de départ d'une activité : pannes éventuelles, puis routes. L'affichage revient à l'appelant. */
function applyFaults(faults){
  if(faults&&faults.length)injectFaults(faults);
  computeRoutes(true);
}

/* ─────────────────────────────────────────────────────
   INTERNET
───────────────────────────────────────────────────── */
function findInternetDev(){
  return Object.values(S.devs).find(function(d){return d.type==='internet';})||null;
}
function routesToInternet(srcId){
  var inet=findInternetDev();if(!inet)return null;
  var src=S.devs[srcId];if(!src||src.type==='switch')return null;
  var si=mainIface(src);if(!si||!si.ip||!si.gateway)return null;
  var gwDev=devByIP(si.gateway.trim());
  if(!gwDev||!isRouter(gwDev))return null;
  if(lanSeg(srcId).indexOf(gwDev.id)===-1)return null;
  if(nbrs(gwDev.id).indexOf(inet.id)===-1)return null;
  return{router:gwDev,inet:inet};
}
function parseExtSites(devId,text){
  var sites=[];
  text.split('\n').forEach(function(line){
    var m=line.match(/^\s*([^\s=|]+)\s*=\s*([0-9.]+)(?:\s*\|\s*(.*))?$/);
    if(m)sites.push({domain:m[1].toLowerCase().trim(),ip:m[2].trim(),title:m[3]?m[3].trim():'Page '+m[1],content:''});
  });
  S.devs[devId].extSites=sites;
}

/* ─────────────────────────────────────────────────────
   CADRES & TEXTES D'ANNOTATION
───────────────────────────────────────────────────── */
var FRAME_COLORS=[
  {bg:'#fffbeb',bd:'#d97706'},{bg:'#f0fdf4',bd:'#16a34a'},{bg:'#eff6ff',bd:'#2563eb'},
  {bg:'#fdf4ff',bd:'#9333ea'},{bg:'#fff1f2',bd:'#e11d48'},{bg:'#f0fdfa',bd:'#0d9488'}
];
var _frameColorIdx=0;

function mkFrame(x,y){
  var id='f'+(S.nid++);
  var col=FRAME_COLORS[_frameColorIdx%FRAME_COLORS.length];_frameColorIdx++;
  S.frames[id]={id:id,x:x,y:y,w:300,h:200,label:'Zone',bg:col.bg,border:col.bd};
  return id;
}
function mkAnnotText(x,y){
  var id='ta'+(S.nid++); // commence par 't' mais 'ta' pour éviter conflit avec 't' seul
  S.texts[id]={id:id,x:x,y:y,text:'Texte',size:16,color:'#1e293b'};
  return id;
}
