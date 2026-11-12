function checkAllObjectives(){
  if(!ACTIVITY_CONFIG)return;
  var r=evaluateObjectives(ACTIVITY_CONFIG.objectives);
  r.gained.forEach(function(obj){
    notif('✅ Objectif atteint : '+obj.label,'ok');
    addLog('✅ Objectif : '+obj.label,'ok');
  });
  r.lost.forEach(function(obj){
    notif('⚠️ Objectif perdu : '+obj.label,'err');
    addLog('⚠️ Objectif perdu : '+obj.label,'err');
  });
  if(r.gained.length||r.lost.length){updateActivityScore();renderActivityTab();}
}

function checkDynamicObjective(type,context){
  if(!ACTIVITY_CONFIG)return;
  var gained=recordDynamicEvent(ACTIVITY_CONFIG.objectives,type,context);
  gained.forEach(function(obj){
    notif('✅ Objectif atteint : '+obj.label,'ok');
    addLog('✅ Objectif : '+obj.label,'ok');
  });
  if(gained.length){updateActivityScore();renderActivityTab();}
}

function renderScoreDetails(){
  var panel=document.getElementById('score-details');
  if(!panel||!ACTIVITY_CONFIG)return;
  var cfg=ACTIVITY_CONFIG,total=0,earned=0;
  cfg.objectives.forEach(function(obj){total+=obj.points||0;if(ACTIVITY_RESULTS[obj.id])earned+=obj.points||0;});
  var h='<div class="sd-title">📊 Détail des objectifs</div>';
  cfg.objectives.forEach(function(obj){
    var done=!!ACTIVITY_RESULTS[obj.id];
    h+='<div class="sd-obj"><span>'+(done?'✅':'⭕')+'</span>'+
      '<span class="sd-label">'+esc(obj.label)+'</span>'+
      '<span class="sd-pts">'+(obj.points||0)+' pt</span></div>';
  });
  h+='<div class="sd-total">'+earned+' / '+total+' pts</div>';
  panel.innerHTML=h;
}

function updateActivityScore(){
  if(!ACTIVITY_CONFIG)return;
  var total=0,earned=0;
  ACTIVITY_CONFIG.objectives.forEach(function(obj){
    total+=obj.points||0;
    if(ACTIVITY_RESULTS[obj.id])earned+=obj.points||0;
  });
  S.score=total>0?Math.round(earned/total*100):0;
  updScore();
  renderScoreDetails();
  sSet('cmi.core.score.min','0');sSet('cmi.core.score.max','100');sSet('cmi.core.score.raw',String(S.score));sCom();
}

function renderActivityTab(){
  var pane=document.getElementById('activ-pane');if(!pane)return;
  if(!ACTIVITY_CONFIG){
    pane.innerHTML='<div style="color:#a0aec0;font-size:.85em;padding:20px;text-align:center">Aucune activité configurée.</div>';
    return;
  }
  var cfg=ACTIVITY_CONFIG;var mode=cfg.displayMode||'full';
  var total=0,earned=0;
  cfg.objectives.forEach(function(obj){total+=obj.points||0;if(ACTIVITY_RESULTS[obj.id])earned+=obj.points||0;});
  var pct=total>0?Math.round(earned/total*100):0;
  var h='';
  if(cfg.faults&&cfg.faults.length){
    h+='<div style="background:#fff5f5;border:1.5px solid #fc8181;border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:.82em;color:#c53030;">'+
      '<strong>🔴 Mode Panne</strong> — ce réseau contient '+(cfg.faults.length===1?'une erreur cachée':'des erreurs cachées')+'.<br>'+
      '<span style="font-weight:400;color:#742a2a">Utilisez le terminal pour diagnostiquer, puis corrigez la configuration.</span></div>';
  }
  if(mode!=='score'){
    h+='<div class="activ-header">';
    h+='<div class="activ-title">'+esc(cfg.title||'Activité')+'</div>';
    if(cfg.level)h+='<div style="font-size:.75em;opacity:.7">'+esc(cfg.level)+'</div>';
    if(cfg.instructions)h+='<div class="activ-instr">'+esc(cfg.instructions).replace(/\n/g,'<br>')+'</div>';
    h+='</div>';
    cfg.objectives.forEach(function(obj){
      var done=!!ACTIVITY_RESULTS[obj.id];
      h+='<div class="activ-obj'+(done?' done':'')+'">'+
        '<div class="ao-icon">'+(done?'✅':'⭕')+'</div>'+
        '<div style="flex:1"><div class="ao-label">'+esc(obj.label)+'</div>';
      var cons=objectiveConstraint(obj);
      if(cons)h+='<div class="ao-constraint">📐 '+esc(cons).replace(/\n/g,'<br>')+'</div>';
      if(!done&&obj.hint)h+='<div class="ao-hint">💡 '+esc(obj.hint)+'</div>';
      h+='</div><div class="ao-pts">'+obj.points+' pts</div></div>';
    });
  }
  if(mode==='score'){
    h+='<div class="activ-header"><div class="activ-title">'+esc(cfg.title||'Activité')+'</div></div>';
  }
  h+='<div class="activ-footer">';
  h+='<div class="activ-score-bar"><div class="activ-score-fill" style="width:'+pct+'%"></div></div>';
  h+='<div class="activ-score-txt">'+earned+' / '+total+' pts ('+pct+'%)</div>';
  h+='</div>';
  pane.innerHTML=h;
}

function saveToSession(){
  var data={version:2,devs:S.devs,links:S.links,frames:S.frames,texts:S.texts,nid:S.nid,score:S.score,activityResults:ACTIVITY_RESULTS,activityProofs:ACTIVITY_PROOFS};
  var json=JSON.stringify(data);
  var saved=false;
  // SCORM suspend_data (limite 4096 chars SCORM 1.2 — la plupart des LMS acceptent plus)
  if(_api&&_apiOk){
    try{sSet('cmi.suspend_data',json);sCom();saved=true;}catch(e){}
  }
  // localStorage en fallback ou complément
  try{localStorage.setItem(SESSION_KEY,json);saved=true;}catch(e){}
  return saved;
}

function loadFromSession(){
  var json='';
  if(_api&&_apiOk){try{json=sGet('cmi.suspend_data');}catch(e){}}
  if(!json||json===''){try{json=localStorage.getItem(SESSION_KEY)||'';}catch(e){}}

  // Aucune session sauvegardée → utiliser le réseau de départ du prof si défini
  if(!json||json===''){
    if(STARTER_NETWORK&&STARTER_NETWORK.devs){
      applyNetworkData(JSON.parse(JSON.stringify(STARTER_NETWORK)));
      // Configuration fixe mise de côté par le professeur avant de cocher le DHCP : l'élève
      // ne doit pas la retrouver en décochant la case.
      Object.values(S.devs).forEach(function(d){
        (d.ifaces||[]).forEach(function(f){delete f.staticCfg;});
      });
      if(ACTIVITY_CONFIG)
        applyFaults(ACTIVITY_CONFIG.faults);
      return 'starter';
    }
    return false;
  }
  try{
    var data=JSON.parse(json);
    if(!data.devs||!data.links)return false;
    applyNetworkData(data);
    if(data.frames)S.frames=data.frames;
    if(data.texts)S.texts=data.texts;
    if(data.score)S.score=data.score;
    if(data.activityResults)ACTIVITY_RESULTS=data.activityResults;
    ACTIVITY_PROOFS=data.activityProofs||{};
    return true;
  }catch(e){return false;}
}

function toggleProps(){
  var ws=document.querySelector('.workspace');
  var props=document.querySelector('.props');
  var btn=document.getElementById('t-toggleprops');
  _propsVisible=!_propsVisible;
  if(_propsVisible){
    props.style.display='';
    ws.style.gridTemplateColumns='82px 1fr '+_propsSavedW+'px';
    btn.classList.add('active');
    btn.textContent='📋 Config.';
  }else{
    _propsSavedW=props.offsetWidth||275;
    props.style.display='none';
    ws.style.gridTemplateColumns='82px 1fr';
    btn.classList.remove('active');
    btn.textContent='📋 ▶';
  }
}

function clearAll(){
  if(STARTER_NETWORK&&STARTER_NETWORK.devs&&Object.keys(STARTER_NETWORK.devs).length>0){
    if(!confirm('Recommencer depuis le r\u00e9seau de d\u00e9part ?'))return;
    S.mode='config';
    S.score=0;ACTIVITY_RESULTS={};ACTIVITY_PROOFS={};
    applyNetworkData(JSON.parse(JSON.stringify(STARTER_NETWORK)));
    if(ACTIVITY_CONFIG)
      applyFaults(ACTIVITY_CONFIG.faults);
    S.sel=null;S.cableFrom=null;S.drag=null;S.activeLinks=new Set();
    localStorage.removeItem(SESSION_KEY);
    render();noSel();updScore();renderActivityTab();checkAllObjectives();
    notif('\u21a9\ufe0f R\u00e9seau de d\u00e9part recharg\u00e9 \u2014 score remis \u00e0 z\u00e9ro','ok');
  } else {
    if(!confirm('Effacer tout le r\u00e9seau ?'))return;
    S.devs={};S.links={};S.frames={};S.texts={};S.sel=null;S.cableFrom=null;S.drag=null;S.activeLinks=new Set();
    render();noSel();
  }
}

function showPropsSimu(id){
  var d=S.devs[id];if(!d){noSel();return;}
  var dt=DT[d.type];
  function row(label,val,mono){
    return '<div class="pr"><label>'+label+'</label>'
      +(mono?'<div class="mono">'+esc(val||'—')+'</div>'
            :'<div style="font-size:.83em;color:#2d3748;padding:2px 0">'+esc(val||'—')+'</div>')
      +'</div>';
  }
  function badge(color,text){
    return '<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:.72em;font-weight:700;background:'+color+';color:#fff;margin-left:4px">'+text+'</span>';
  }
  var h='<div class="devbadge" style="background:'+dt.bg+';color:'+dt.tc+';border:1.5px solid '+dt.bd+'">'+devIconHTML(d,20)+' '+esc(d.name)+'</div>';
  h+='<div style="font-size:.72em;color:#718096;margin:2px 0 8px 2px">'+esc(devLabel(d))+'</div>';
  if(d.mac)h+=row('Adresse MAC',d.mac,true);
  if(d.type==='pc'||d.type==='server'){
    var fi=d.ifaces[0]||{};
    h+='<div class="psection">Configuration réseau</div>';
    if(fi.dhcpMode){
      h+=row('Mode','DHCP automatique');
      if(fi.ip)h+=row('IP (obtenue)',fi.ip,true);
      if(fi.mask)h+=row('Masque',fi.mask,true);
      if(fi.gateway)h+=row('Passerelle',fi.gateway,true);
    } else {
      h+=row('Adresse IP',fi.ip,true);
      h+=row('Masque',fi.mask,true);
      h+=row('Passerelle',fi.gateway,true);
      h+=row('Serveur DNS',fi.dns,true);
    }
    h+=wifiPropsHTML(id,false);
  }
  if(d.type==='router'||d.type==='internet'){
    h+='<div class="psection">Interfaces réseau</div>';
    d.ifaces.forEach(function(fi){
      h+='<div class="iface-box"><div class="iface-title"><span>📶 '+esc(fi.name)+'</span></div>'
        +'<div style="font-family:monospace;font-size:.8em;color:#2d3748;padding:2px 4px">'
        +esc(fi.ip||'—')+' / '+esc(fi.mask||'—')+'</div></div>';
    });
    h+='<div class="psection">Table de routage</div>';
    var rt=getRoutingTable(id);
    h+='<table style="width:100%;font-size:.71em;border-collapse:collapse;margin-bottom:6px">';
    h+='<tr style="background:#edf2f7"><th style="padding:2px 5px;text-align:left">Réseau</th>'
      +'<th style="padding:2px 5px;text-align:left">Masque</th>'
      +'<th style="padding:2px 5px;text-align:left">Via</th>'
      +'<th style="padding:2px 5px;text-align:left">If.</th></tr>';
    if(!rt.length){
      h+='<tr><td colspan="4" style="padding:4px 5px;color:#a0aec0;font-style:italic">Aucune route</td></tr>';
    }
    rt.forEach(function(r){
      h+='<tr style="'+(r.type==='rip'?'background:#f0fff4':'')+'"><td style="padding:2px 5px;font-family:monospace">'+esc(r.dest)+'</td>'
        +'<td style="padding:2px 5px;font-family:monospace">'+esc(r.mask)+'</td>'
        +'<td style="padding:2px 5px;font-family:monospace;color:'+(r.gw?'#553c9a':'#718096')+'">'+esc(r.gw||'direct')+'</td>'
        +'<td style="padding:2px 5px">'+esc(r.iface)+(r.type==='rip'?' <span style="color:#48bb78;font-size:.85em">RIP</span>':'')+'</td></tr>';
    });
    h+='</table>';
  }
  if(d.type==='wifi_router'){
    h+='<div class="psection">Réseau WiFi</div>';
    h+=row('SSID (nom du réseau)',d.ssid,true);
    h+=row('Mot de passe',d.wifiPass||'(aucun)');
    h+='<div class="psection">Interfaces réseau</div>';
    d.ifaces.forEach(function(fi){
      h+='<div class="iface-box"><div class="iface-title"><span>'+(fi.name==='WiFi'?'📶':'🔌')+' '+esc(fi.name)+'</span></div>'
        +'<div style="font-family:monospace;font-size:.8em;color:#2d3748;padding:2px 4px">'
        +esc(fi.ip||'—')+' / '+esc(fi.mask||'—')+'</div></div>';
    });
    var wifiClients=Object.values(S.links)
      .filter(function(l){return (l.from===id||l.to===id)&&l.type==='wifi';})
      .map(function(l){var c=S.devs[l.from===id?l.to:l.from];if(c)c._wifiUp=wifiLinkUp(l);return c;})
      .filter(Boolean);
    h+='<div class="psection">Appareils connectés en WiFi</div>';
    if(!wifiClients.length){
      h+='<div style="font-size:.8em;color:#a0aec0;padding:3px 0">Aucun appareil connecté</div>';
    } else {
      wifiClients.forEach(function(c){
        var ci=mainIface(c)||{};
        h+='<div class="iface-box"><div class="iface-title"><span>💻 '+esc(c.name)+'</span>'
          +(c._wifiUp?'':'<span style="color:#c53030;font-size:.85em">❌ non connecté</span>')+'</div>'
          +'<div style="font-family:monospace;font-size:.8em;color:#2d3748;padding:2px 4px">'
          +esc(ci.ip||'—')+'</div></div>';
      });
    }
    if(d.dhcp&&d.dhcp.on){
      h+='<div class="psection">Service DHCP</div>';
      h+=row('Plage d\'adresses',(d.dhcp.start||'?')+' → '+(d.dhcp.end||'?'));
      if(d.dhcp.gateway)h+=row('Passerelle distribuée',d.dhcp.gateway,true);
      if(d.dhcp.dns)h+=row('DNS distribué',d.dhcp.dns,true);
    }
    h+='<div class="psection">Table de routage</div>';
    var rtw=getRoutingTable(id);
    h+='<table style="width:100%;font-size:.71em;border-collapse:collapse;margin-bottom:6px">';
    h+='<tr style="background:#edf2f7"><th style="padding:2px 5px;text-align:left">Réseau</th>'
      +'<th style="padding:2px 5px;text-align:left">Masque</th>'
      +'<th style="padding:2px 5px;text-align:left">Via</th>'
      +'<th style="padding:2px 5px;text-align:left">If.</th></tr>';
    if(!rtw.length){
      h+='<tr><td colspan="4" style="padding:4px 5px;color:#a0aec0;font-style:italic">Aucune route</td></tr>';
    }
    rtw.forEach(function(r){
      h+='<tr><td style="padding:2px 5px;font-family:monospace">'+esc(r.dest)+'</td>'
        +'<td style="padding:2px 5px;font-family:monospace">'+esc(r.mask)+'</td>'
        +'<td style="padding:2px 5px;font-family:monospace;color:'+(r.gw?'#553c9a':'#718096')+'">'+esc(r.gw||'direct')+'</td>'
        +'<td style="padding:2px 5px">'+esc(r.iface)+'</td></tr>';
    });
    h+='</table>';
  }
  if(d.type==='switch'){
    h+='<div class="psection">Informations</div>';
    h+='<div style="font-size:.8em;color:#718096;padding:3px 0">Commutateur couche 2<br>Pas d\'adresse IP</div>';
    var nbPorts=Object.values(S.links).filter(function(l){return l.from===id||l.to===id;}).length;
    h+=row('Ports utilisés',nbPorts+' connexion'+(nbPorts>1?'s':''));
  }
  if(d.type==='server'){
    h+='<div class="psection">Services actifs</div>';
    var svcs=[];
    if(d.http&&d.http.on)svcs.push('🌐 HTTP'+badge('#3182ce',d.http.title||'Web'));
    if(d.dns&&d.dns.on){
      var nbRec=Object.keys(d.dns.records||{}).length;
      svcs.push('🔍 DNS'+badge('#805ad5',nbRec+' enreg.'));
    }
    if(d.dhcp&&d.dhcp.on)svcs.push('📡 DHCP'+badge('#38a169',(d.dhcp.start||'?')+' → '+(d.dhcp.end||'?')));
    if(!svcs.length)svcs.push('<span style="color:#a0aec0">Aucun service actif</span>');
    h+='<div style="font-size:.82em;line-height:2;padding:2px 0">'+svcs.join('<br>')+'</div>';
    if(d.dns&&d.dns.on){
      var recs=d.dns.records||{};var rkeys=Object.keys(recs);
      if(rkeys.length){
        h+='<div class="psection">Enregistrements DNS</div>';
        h+='<table style="width:100%;font-size:.72em;border-collapse:collapse">';
        rkeys.forEach(function(k){
          h+='<tr><td style="padding:2px 4px;font-family:monospace;color:#553c9a">'+esc(k)+'</td>'
            +'<td style="padding:2px 4px;font-family:monospace;color:#2d3748">'+esc(recs[k])+'</td></tr>';
        });
        h+='</table>';
      }
    }
    var sf=d.serverFiles||{};var sfk=Object.keys(sf);
    if(sfk.length){
      h+='<div class="psection">Fichiers disponibles</div>';
      h+='<div style="font-size:.77em;line-height:1.8">';
      sfk.forEach(function(fn){h+='📄 '+esc(fn)+'<br>';});
      h+='</div>';
    }
  }
  document.getElementById('props-body').innerHTML=h;
}

function showProps(id){
  if(!id){noSel();return;}
  if(S.mode==='simulation'){
    if(id.charAt(0)==='f'||S.texts[id]){return;}
    showPropsSimu(id);return;
  }
  if(id.charAt(0)==='f'){showFrameProps(id);return;}
  if(S.texts[id]){showTextProps(id);return;}
  var d=S.devs[id];if(!d){noSel();return;}

  var dt=DT[d.type];
  var h='<div class="devbadge" style="background:'+dt.bg+';color:'+dt.tc+';border:1.5px solid '+dt.bd+'">'+devIconHTML(d,20)+' '+esc(d.name)+'</div>';

  // Nom
  h+='<div class="psection">Identification</div>';
  h+='<div class="pr"><label>Nom</label><input value="'+esc(d.name)+'" onchange="S.devs[\''+id+'\'].name=this.value;render();showProps(\''+id+'\')"/></div>';
  h+=pcKindRowHTML(id);
  if(d.mac)h+='<div class="pr"><label>Adresse MAC</label><div class="mono">'+esc(d.mac)+'</div></div>';

  // Interfaces réseau
  if(d.type==='pc'||d.type==='server'){
    var fi=d.ifaces[0]||{};
    h+='<div class="psection">Configuration réseau</div>';
    if(d.type==='pc'){
      h+='<div class="pr ck"><input type="checkbox" id="dhcpmode" '+(fi.dhcpMode?'checked':'')+
        ' onchange="toggleDHCPMode(\''+id+'\',this.checked)"/>'+
        '<label for="dhcpmode">Obtenir l\'adresse IP automatiquement (DHCP)</label></div>';
    }
    if(!fi.dhcpMode){
      h+=prow(id,0,'Adresse IP','ip',fi.ip,'192.168.1.10');
      h+=prow(id,0,'Masque de sous-réseau','mask',fi.mask,'255.255.255.0');
      h+=prow(id,0,'Passerelle (gateway)','gateway',fi.gateway||'','192.168.1.1');
      h+=prow(id,0,'Serveur DNS','dns',fi.dns||'','192.168.1.254');
    } else {
      h+='<div class="pr"><label>Adresse IP</label><div class="mono" style="color:#a0aec0;font-size:.82em">'+
        (fi.ip?esc(fi.ip):'(aucune adresse reçue)')+'</div></div>';
      if(fi.ip){
        h+='<div class="pr"><label>Masque</label><div class="mono" style="color:#718096;font-size:.82em">'+esc(fi.mask||'—')+'</div></div>';
        h+='<div class="pr"><label>Passerelle</label><div class="mono" style="color:#718096;font-size:.82em">'+esc(fi.gateway||'—')+'</div></div>';
      }
      if(fi.staticCfg&&fi.staticCfg.ip)h+='<div class="pr" style="font-size:.75em;color:#718096">Configuration fixe mise de côté ('+
        esc(fi.staticCfg.ip)+') : ignorée en DHCP, rétablie si vous décochez la case.</div>';
      // Même effet que la commande dhcp du terminal
      h+='<button class="pb pb-blue" onclick="doDHCP(\''+id+'\')">📡 '+(fi.ip?'Renouveler l\'adresse (DHCP)':'Demander une adresse (DHCP)')+'</button>';
    }
    h+=wifiPropsHTML(id,true);
  }


  // Routeur / Internet : interfaces dynamiques
  if(d.type==='router'||d.type==='internet'){
    h+='<div class="psection">Interfaces réseau</div>';
    d.ifaces.forEach(function(fi,i){
      h+='<div class="iface-box">'+
        '<div class="iface-title"><span>📶 '+esc(fi.name)+'</span>'+
        (d.ifaces.length>2?'<button class="del-iface" onclick="removeIface(\''+id+'\','+i+')" title="Supprimer cette interface">✕</button>':'')+
        '</div>'+
        '<div class="pr"><label>Adresse IP</label><input value="'+esc(fi.ip||'')+'" placeholder="192.168.'+i+'.1"'+
          ' oninput="chkIP(this)" onchange="setIface(\''+id+'\','+i+',\'ip\',this.value)"/></div>'+
        '<div class="pr"><label>Masque</label><input value="'+esc(fi.mask||'')+'" placeholder="255.255.255.0"'+
          ' oninput="chkMask(this)" onchange="setIface(\''+id+'\','+i+',\'mask\',this.value)"/></div>'+
        '</div>';
    });
    h+='<button class="pb pb-gray" onclick="addIface(\''+id+'\')">+ Ajouter une interface (eth'+d.ifaces.length+')</button>';
  }

  // Box WiFi : SSID + interfaces WAN/WiFi + DHCP
  if(d.type==='wifi_router'){
    h+='<div class="psection">Configuration WiFi</div>';
    h+='<div class="pr"><label>SSID (nom du réseau)</label><input value="'+esc(d.ssid||'')+'" placeholder="MonWiFi"'+
      ' onchange="setBoxWifi(\''+id+'\',\'ssid\',this.value)"/></div>';
    h+='<div class="pr"><label>Mot de passe WiFi</label><input value="'+esc(d.wifiPass||'')+'" placeholder="(laisser vide = réseau ouvert)"'+
      ' onchange="setBoxWifi(\''+id+'\',\'pass\',this.value)"/></div>';
    h+='<div class="psection">Interfaces réseau</div>';
    d.ifaces.forEach(function(fi,i){
      h+='<div class="iface-box">'+
        '<div class="iface-title"><span>'+(fi.name==='WiFi'?'📶':'🔌')+' '+esc(fi.name)+'</span></div>'+
        '<div class="pr"><label>Adresse IP</label><input value="'+esc(fi.ip||'')+'" placeholder="192.168.'+(i===0?'0':'1')+'.1"'+
          ' oninput="chkIP(this)" onchange="setIface(\''+id+'\','+i+',\'ip\',this.value)"/></div>'+
        '<div class="pr"><label>Masque</label><input value="'+esc(fi.mask||'')+'" placeholder="255.255.255.0"'+
          ' oninput="chkMask(this)" onchange="setIface(\''+id+'\','+i+',\'mask\',this.value)"/></div>'+
        '</div>';
    });
    var dhw=d.dhcp||{};
    h+='<div class="psection">Service DHCP</div>';
    h+='<div class="pr ck"><input type="checkbox" id="dhon" '+(dhw.on?'checked':'')+
      ' onchange="S.devs[\''+id+'\'].dhcp.on=this.checked;render();showProps(\''+id+'\')"/><label for="dhon">Activer le serveur DHCP</label></div>';
    if(dhw.on){
      h+='<div class="pr"><label>IP de départ</label><input value="'+esc(dhw.start||'192.168.1.100')+'" placeholder="192.168.1.100"'+
        ' oninput="chkIP(this)" onchange="setDHCP(\''+id+'\',\'start\',this.value)"/></div>';
      h+='<div class="pr"><label>IP de fin</label><input value="'+esc(dhw.end||'192.168.1.200')+'" placeholder="192.168.1.200"'+
        ' oninput="chkIP(this)" onchange="setDHCP(\''+id+'\',\'end\',this.value)"/></div>';
      h+='<div class="pr"><label>Masque distribué</label><input value="'+esc(dhw.mask||'255.255.255.0')+'" placeholder="255.255.255.0"'+
        ' oninput="chkMask(this)" onchange="setDHCP(\''+id+'\',\'mask\',this.value)"/></div>';
      h+='<div class="pr"><label>Passerelle distribuée</label><input value="'+esc(dhw.gateway||'')+'" placeholder="192.168.1.1"'+
        ' oninput="chkIP(this)" onchange="setDHCP(\''+id+'\',\'gateway\',this.value)"/></div>';
      h+='<div class="pr"><label>DNS distribué</label><input value="'+esc(dhw.dns||'')+'" placeholder="192.168.1.254"'+
        ' oninput="chkIP(this)" onchange="setDHCP(\''+id+'\',\'dns\',this.value)"/></div>';
    }
  }

  // Services serveur
  if(d.type==='server'){
    h+='<div class="psection">Service HTTP</div>';
    h+='<div class="pr ck"><input type="checkbox" id="hon" '+(d.http.on?'checked':'')+
      ' onchange="S.devs[\''+id+'\'].http.on=this.checked;render();showProps(\''+id+'\')"/><label for="hon">Activer le serveur web (HTTP)</label></div>';
        if(d.http.on){
      h+='<div class="pr"><label>Titre de la page</label><input value="'+esc(d.http.title)+'" onchange="S.devs[\''+id+'\'].http.title=this.value"/></div>';
      h+='<div class="pr ck"><input type="checkbox" id="hmode" '+(d.http.htmlMode?'checked':'')+
        ' onchange="S.devs[\''+id+'\'].http.htmlMode=this.checked;showProps(\''+id+'\')"/>'+
        '<label for="hmode" style="font-size:.76em">Mode HTML <span style=\"font-weight:400;color:#a0aec0\">(balises + fichiers)</span></label></div>';
      h+='<div class="pr"><label>Contenu '+(d.http.htmlMode?'<span style=\"font-weight:400;color:#4299e1\">HTML</span>':'texte')+'</label>'+
        '<textarea id="hcontent-'+id+'" rows="7" style="font-family:\'Courier New\',monospace;font-size:.78em"'+
        ' onchange="S.devs[\''+id+'\'].http.content=this.value">'+esc(d.http.content)+'</textarea></div>';
      h+='<div class="psection">Fichiers du serveur</div>';
      var sf=d.serverFiles||{};var sfkeys=Object.keys(sf);
      h+='<div class="pr">';
      h+='<input type="file" id="fup-'+id+'" style="display:none" multiple accept="image/*,.html,.htm,.svg,.txt,.css,.js"'+
        ' onchange="uploadServerFiles(\''+id+'\'\',this)"/>';
      h+='<button class="pb pb-blue" style="margin-bottom:6px" onclick="document.getElementById(\'fup-'+id+'\').click()">📎 Ajouter des fichiers…</button>';
      h+='<div class="flist" id="flist-'+id+'">';
      if(!sfkeys.length){
        h+='<div style="color:#a0aec0;font-size:.75em;padding:2px 0">Aucun fichier — uploadez une image ou du HTML</div>';
      } else {
        sfkeys.forEach(function(fn){
          var fi=sf[fn];var kb=Math.round((fi.size||0)/102.4)/10;
          h+='<div class="fitem">'+
            '<span class="fitem-name" title="'+esc(fn)+'">'+esc(fn)+'</span>'+
            '<span class="fitem-size">'+kb+'Ko</span>'+
            '<button class="fitem-ins" data-devid="'+esc(id)+'" data-fn="'+esc(fn)+'" onclick="insertFileRef(this.dataset.devid,this.dataset.fn)">⤵ Insérer</button>'+
            '<button class="fitem-del" data-devid="'+esc(id)+'" data-fn="'+esc(fn)+'" onclick="deleteServerFile(this.dataset.devid,this.dataset.fn)">✕</button>'+
            '</div>';
        });
      }
      h+='</div>';
      h+='<div style="font-size:.7em;color:#a0aec0;margin-top:3px">Réf. dans le HTML : <code>&lt;img src=\"files/nom.png\"&gt;</code></div>';
      h+='</div>';
    }
    h+='<div class="psection">Service DNS</div>';
    h+='<div class="pr ck"><input type="checkbox" id="don" '+(d.dns.on?'checked':'')+
      ' onchange="S.devs[\''+id+'\'].dns.on=this.checked;render();showProps(\''+id+'\')"/><label for="don">Activer le serveur DNS</label></div>';
    if(d.dns.on){
      var rtext=Object.entries(d.dns.records).map(function(e){return e[0]+' = '+e[1];}).join('\n');
      h+='<div class="pr"><label>Enregistrements DNS <small style="font-weight:400;color:#a0aec0">(domaine = IP)</small></label>'+
        '<textarea rows="4" placeholder="www.lycee.fr = 192.168.1.100" onchange="parseDNS(\''+id+'\',this.value)">'+esc(rtext)+'</textarea></div>';
    }
    // DHCP
    var dh=d.dhcp||{};
    h+='<div class="psection">Service DHCP</div>';
    h+='<div class="pr ck"><input type="checkbox" id="dhon" '+(dh.on?'checked':'')+
      ' onchange="S.devs[\''+id+'\'].dhcp.on=this.checked;render();showProps(\''+id+'\')"/><label for="dhon">Activer le serveur DHCP</label></div>';
    if(dh.on){
      h+='<div class="pr"><label>IP de départ</label><input value="'+esc(dh.start||'192.168.1.100')+'" placeholder="192.168.1.100"'+
        ' oninput="chkIP(this)" onchange="setDHCP(\''+id+'\',\'start\',this.value)"/></div>';
      h+='<div class="pr"><label>IP de fin</label><input value="'+esc(dh.end||'192.168.1.200')+'" placeholder="192.168.1.200"'+
        ' oninput="chkIP(this)" onchange="setDHCP(\''+id+'\',\'end\',this.value)"/></div>';
      h+='<div class="pr"><label>Masque distribué</label><input value="'+esc(dh.mask||'255.255.255.0')+'" placeholder="255.255.255.0"'+
        ' oninput="chkMask(this)" onchange="setDHCP(\''+id+'\',\'mask\',this.value)"/></div>';
      h+='<div class="pr"><label>Passerelle distribuée</label><input value="'+esc(dh.gateway||'')+'" placeholder="192.168.1.1"'+
        ' oninput="chkIP(this)" onchange="setDHCP(\''+id+'\',\'gateway\',this.value)"/></div>';
      h+='<div class="pr"><label>DNS distribué</label><input value="'+esc(dh.dns||'')+'" placeholder="192.168.1.254"'+
        ' oninput="chkIP(this)" onchange="setDHCP(\''+id+'\',\'dns\',this.value)"/></div>';
    }
  }

  // Table de routage pour les routeurs / internet / wifi_router
  if(d.type==='router'||d.type==='internet'||d.type==='wifi_router'){
    h+='<div class="psection">Table de routage</div>';
    var ar=(d.autoRouteEnabled!==false); // true par défaut
    h+='<div class="pr ck" style="margin-bottom:8px"><input type="checkbox" id="aro" '+(ar?'checked':'')+
      ' onchange="S.devs[\''+id+'\'].autoRouteEnabled=this.checked;if(this.checked)autoRoute();else{S.devs[\''+id+'\'].staticRoutes=[];render();}showProps(\''+id+'\')"/>'+
      '<label for="aro" style="font-weight:600">Calculer les routes automatiquement (RIP)</label></div>';
    var rt=getRoutingTable(id);
    h+='<table style="width:100%;font-size:.71em;border-collapse:collapse;margin-bottom:6px">';
    h+='<tr style="background:#edf2f7"><th style="padding:2px 5px;text-align:left">Réseau dest.</th>'+
       '<th style="padding:2px 5px;text-align:left">Masque</th>'+
       '<th style="padding:2px 5px;text-align:left">Passerelle</th>'+
       '<th style="padding:2px 5px;text-align:left">If.</th></tr>';
    if(rt.length===0){
      h+='<tr><td colspan="4" style="padding:4px 5px;color:#a0aec0;font-style:italic">Aucune route — configurez les interfaces</td></tr>';
    }
    rt.forEach(function(r){
      h+='<tr style="'+(r.type==='rip'?'background:#f0fff4':'')+'">'+
        '<td style="padding:2px 5px;font-family:monospace">'+esc(r.dest)+'</td>'+
        '<td style="padding:2px 5px;font-family:monospace">'+esc(r.mask)+'</td>'+
        '<td style="padding:2px 5px;font-family:monospace;color:'+(r.gw?'#553c9a':'#718096')+'">'+esc(r.gw||'direct')+'</td>'+
        '<td style="padding:2px 5px">'+esc(r.iface)+(r.type==='rip'?' <span style="color:#48bb78;font-size:.85em">RIP</span>':'')+'</td>'+
        '</tr>';
    });
    h+='</table>';
    if(!ar){h+='<button class="pb pb-blue" onclick="autoRoute();showProps(\''+id+'\')" style="margin-bottom:4px">⚡ Calculer les routes maintenant</button>';}
  }

  h+='<div class="psection"></div>';
  h+='<button class="pb pb-red" onclick="delDev(\''+id+'\');render();noSel()">🗑️ Supprimer cet appareil</button>';
  document.getElementById('props-body').innerHTML=h;
}

function browGo(){
  var devId=document.getElementById('bd-sel').value;
  var url=document.getElementById('burl').value.trim();
  var bc=document.getElementById('bcont');
  if(!devId){bc.innerHTML='<div class="berr">⚠️ Choisissez un appareil source.</div>';return;}
  if(!url){bc.innerHTML='<div class="berr">⚠️ Entrez une URL.</div>';return;}
  var res=simHTTP(devId,url);
  if(res.domain&&res.ip)addLog('DNS '+res.domain+' → '+res.ip,'info');
  var srcIP2=(mainIface(S.devs[devId])||{}).ip||S.devs[devId].name;
  if(res.ok){
    bc.innerHTML='<div class="bpage">'+
      '<div class="bmeta">'+(res.domain?'🌐 '+esc(res.domain)+' ('+esc(res.ip)+') — ':'')+
      'Serveur : '+esc(res.server)+'</div>'+
      '<h1>'+esc(res.title)+'</h1>'+
      '<p>'+esc(res.content).replace(/\n/g,'<br>')+'</p></div>';
    addLog('HTTP '+url+' depuis '+S.devs[devId].name+' : 200 OK','ok');
    addPacket('HTTP GET',srcIP2,res.ip,'GET '+url+' → 200 OK',true);
    
    if(res.path)animPath(res.path);
    if(res.domain)checkDynamicObjective('dns_success',{from:S.devs[devId]?S.devs[devId].name:'',fromId:devId,domain:res.domain});
    checkDynamicObjective('http_success',{from:S.devs[devId]?S.devs[devId].name:'',fromId:devId,url:url});
  } else {
    bc.innerHTML='<div class="berr">❌ '+esc(url)+'<br><br>'+esc(res.reason)+'</div>';
    addLog('HTTP '+url+' ÉCHEC : '+res.reason,'err');
    addPacket('HTTP GET',srcIP2,'?','GET '+url+' → '+res.reason,false);
  }
}

function updScore(){document.getElementById('hdr-score').textContent='📊 Score : '+S.score+' / 100';}

function saveTopology(){
  var data={version:1,devs:S.devs,links:S.links,nid:S.nid};
  var json=JSON.stringify(data,null,2);
  var blob=new Blob([json],{type:'application/json'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download='reseau-'+(new Date().toISOString().slice(0,10))+'.json';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(url);
  notif('💾 Topologie enregistrée ('+Object.keys(S.devs).length+' appareils)','ok');
}

function loadTopology(ev){
  var file=ev.target.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var data=JSON.parse(e.target.result);
      // Migration format v2 (builder) → v1 (template)
      if(data.version===2&&data.network){data=data.network;}
      if(!data.devs||!data.links)throw new Error('Format invalide — fichier JSON incompatible');
      S.devs=data.devs;S.links=data.links;S.nid=data.nid||1;
      S.frames=data.frames||{};S.texts=data.texts||{};
      S.sel=null;S.cableFrom=null;S.drag=null;S.activeLinks=new Set();S.animPhase=null;
      // Assurer rétrocompatibilité
      Object.values(S.devs).forEach(function(d){
        if(!d.dhcp)d.dhcp={on:false,start:'192.168.1.100',end:'192.168.1.200',mask:'255.255.255.0',gateway:'',dns:''};
    else if(!d.dhcp.end)d.dhcp.end='192.168.1.200';
        if(!d.staticRoutes)d.staticRoutes=[];
        if(!d.http)d.http={on:false,title:'Ma page web',content:''};
        if(!d.dns)d.dns={on:false,records:{}};
      });
      render();noSel();
      notif('📂 Réseau chargé : '+Object.keys(S.devs).length+' appareils, '+Object.keys(S.links).length+' câbles','ok');
      addLog('Topologie chargée depuis fichier','info');
    }catch(ex){notif('❌ Chargement impossible : '+ex.message,'err');}
  };
  reader.readAsText(file);
  ev.target.value='';
}

function finishActivity(){
  var threshold=ACTIVITY_CONFIG?ACTIVITY_CONFIG.masteryscore||60:75;
  var passed=S.score>=threshold;
  saveToSession();
  sEnd(S.score,passed);
  var msg='🎉 Activité terminée !\n\nScore : '+S.score+' / 100\n\n';
  if(ACTIVITY_CONFIG){
    var total=0,earned=0;
    ACTIVITY_CONFIG.objectives.forEach(function(obj){
      total+=obj.points||0;if(ACTIVITY_RESULTS[obj.id])earned+=obj.points||0;
      msg+=(ACTIVITY_RESULTS[obj.id]?'✅':'❌')+' '+obj.label+' ('+obj.points+' pts)\n';
    });
    msg+='\n'+(total>0?Math.round(earned/total*100):0)+'% — '+(passed?'✅ RÉUSSI (≥'+threshold+'%)':'⚠️ À améliorer (<'+threshold+'%)');
  } else {
    msg+='Aucun objectif configuré.';
  }
  alert(msg);
}

window.addEventListener('load',function(){
  scormInit();
  // Charger la source HTML pour la génération SCORM prof
  _htmlSource='';
  fetch('./index.html').then(function(r){return r.text();}).then(function(t){_htmlSource=t;}).catch(function(){});
  // Restaurer la session ou charger le réseau de départ
  var loaded=loadFromSession();
  if(loaded===true){
    render();updScore();
    notif('↩️ Réseau restauré — vous reprenez où vous en étiez','ok');
  } else if(loaded==='starter'){
    render();
    notif('📋 Réseau de départ chargé — bonne activité !','info');
  } else {
    
  }
  // Activité personnalisée : afficher l'onglet et vérifier les objectifs initiaux
  if(ACTIVITY_CONFIG&&ACTIVITY_CONFIG.objectives&&ACTIVITY_CONFIG.objectives.length){
    var tabBtn=document.getElementById('btn-activ-tab');
    if(tabBtn)tabBtn.style.display='';
    showTab('activ'); // afficher directement l'onglet Activité
    renderActivityTab();
    checkAllObjectives();
    // Garder le panneau bas visible même en mode configuration
    document.querySelector('.bot').style.display='flex';
  } else {
    document.querySelector('.bot').style.display='none'; // masqué en mode config par défaut
  }
  window.addEventListener('keydown',function(e){
    if(e.key==='F11'){e.preventDefault();toggleFullscreen();}
  });
  window.addEventListener('beforeunload',function(){saveToSession();if(_api&&_apiOk){sSet('cmi.core.score.raw',String(S.score));sCom();}});
  tpr('Bienvenue dans le Simulateur Réseau IPv4 (inspiré de Filius).','info');
  tpr('Ajoutez des appareils depuis la palette, reliez-les avec des câbles,','info');
  tpr('configurez les IPs, puis passez en mode Simulation pour tester.','info');
  tpr('Tapez "help" pour voir toutes les commandes disponibles.','info');
  tpr('');
  if(window.opener)tpr('↗ Fenêtre séparée — SCORM actif via la fenêtre parente.','info');

  /* ── Redimensionnement des panneaux ── */
  (function(){
    var bot=document.querySelector('.bot');
    var ws=document.querySelector('.workspace');
    var rszBot=document.getElementById('rsz-bot');
    var rszProps=document.getElementById('rsz-props');
    var _dBot=false,_sY,_sH,_dProps=false,_sX,_sW;
    rszBot.addEventListener('mousedown',function(e){
      _dBot=true;_sY=e.clientY;_sH=bot.offsetHeight;
      rszBot.classList.add('dragging');document.body.style.cursor='ns-resize';e.preventDefault();
    });
    rszProps.addEventListener('mousedown',function(e){
      _dProps=true;_sX=e.clientX;_sW=document.querySelector('.props').offsetWidth;
      rszProps.classList.add('dragging');document.body.style.cursor='ew-resize';e.preventDefault();
    });
    document.addEventListener('mousemove',function(e){
      if(_dBot){
        var newH=Math.max(60,Math.min(Math.round(window.innerHeight*0.72),_sH+(_sY-e.clientY)));
        bot.style.height=newH+'px';
      }
      if(_dProps){
        var newW=Math.max(160,Math.min(560,_sW+(_sX-e.clientX)));
        ws.style.gridTemplateColumns='82px 1fr '+newW+'px';
        _propsSavedW=newW;
      }
    });
    document.addEventListener('mouseup',function(){
      if(_dBot){_dBot=false;rszBot.classList.remove('dragging');}
      if(_dProps){_dProps=false;rszProps.classList.remove('dragging');}
      document.body.style.cursor='';
    });
    rszBot.addEventListener('dblclick',function(){bot.style.height='215px';});
    rszProps.addEventListener('dblclick',function(){ws.style.gridTemplateColumns='82px 1fr 275px';});
  })();
});