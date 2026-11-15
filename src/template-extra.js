function checkAllObjectives(){
  if(!ACTIVITY_CONFIG)return;
  var r=evaluateObjectives(scoredObjectives(ACTIVITY_CONFIG));
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
  var gained=recordDynamicEvent(scoredObjectives(ACTIVITY_CONFIG),type,context);
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
  scoredObjectives(cfg).forEach(function(obj){total+=obj.points||0;if(ACTIVITY_RESULTS[obj.id])earned+=obj.points||0;});
  var h='<div class="sd-title">📊 Détail des objectifs</div>';
  scoredObjectives(cfg).forEach(function(obj){
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
  scoredObjectives(ACTIVITY_CONFIG).forEach(function(obj){
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
  scoredObjectives(cfg).forEach(function(obj){total+=obj.points||0;if(ACTIVITY_RESULTS[obj.id])earned+=obj.points||0;});
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
    scoredObjectives(cfg).forEach(function(obj){
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

function sessionJson(){
  return JSON.stringify({version:2,devs:S.devs,links:S.links,frames:S.frames,texts:S.texts,nid:S.nid,score:S.score,activityResults:ACTIVITY_RESULTS,activityProofs:ACTIVITY_PROOFS});
}
var _lastSaved=null;   // dernier état enregistré
/* Sauvegarde temporisée (scheduleSave) : rien n'est envoyé si rien n'a changé depuis la dernière. */
function autoSave(){
  if(sessionJson()!==_lastSaved)saveToSession();
}
function saveToSession(){
  var json=sessionJson();
  var saved=false;
  // SCORM suspend_data (limite 4096 chars SCORM 1.2 — la plupart des LMS acceptent plus).
  // Un LMS strict refuse une valeur trop longue : la reprise sur un autre poste est alors perdue.
  _lmsSaveRefused=false;
  if(_api&&_apiOk){
    try{if(sSet('cmi.suspend_data',json)&&sCom())saved=true;else _lmsSaveRefused=true;}
    catch(e){_lmsSaveRefused=true;}
  }
  // localStorage en fallback ou complément
  try{localStorage.setItem(SESSION_KEY,json);saved=true;}catch(e){}
  if(saved)_lastSaved=json;
  if(_lmsSaveRefused&&!_lmsSaveWarned){
    _lmsSaveWarned=true;
    var code='';try{code=_api.LMSGetLastError?String(_api.LMSGetLastError()):'';}catch(e){}
    addLog('Sauvegarde refusée par la plateforme ('+json.length+' caractères'+(code?', erreur '+code:'')+')','err');
    notif(saved?'⚠️ La plateforme a refusé la sauvegarde : votre réseau n\'est gardé que sur ce poste'
               :'⚠️ La plateforme a refusé la sauvegarde de votre réseau','err');
  }
  return saved;
}
var _lmsSaveRefused=false;   // dernière sauvegarde refusée par le LMS
var _lmsSaveWarned=false;    // l'élève n'est averti qu'une fois

function loadFromSession(){
  var json='';
  if(_api&&_apiOk){try{json=sGet('cmi.suspend_data');}catch(e){}}
  if(!json||json===''){try{json=localStorage.getItem(SESSION_KEY)||'';}catch(e){}}
  // Session illisible ou abîmée : on repart comme s'il n'y en avait pas.
  var data=null;
  if(json){try{data=JSON.parse(json);}catch(e){data=null;}}
  if(data&&networkDataProblem(data))data=null;

  // Aucune session utilisable → utiliser le réseau de départ du prof si défini
  if(!data){
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
  function isObj(o){return !!o&&typeof o==='object'&&!Array.isArray(o);}
  applyNetworkData(data);
  if(typeof data.score==='number')S.score=data.score;
  if(isObj(data.activityResults))ACTIVITY_RESULTS=data.activityResults;
  ACTIVITY_PROOFS=isObj(data.activityProofs)?data.activityProofs:{};
  return true;
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
    S.score=0;ACTIVITY_RESULTS={};ACTIVITY_PROOFS={};
    applyNetworkData(JSON.parse(JSON.stringify(STARTER_NETWORK)));
    if(ACTIVITY_CONFIG)
      applyFaults(ACTIVITY_CONFIG.faults);
    S.sel=null;S.cableFrom=null;S.drag=null;S.activeLinks=new Set();
    localStorage.removeItem(SESSION_KEY);
    histReset();   // on repart de zéro : rien à annuler
    render();noSel();updScore();renderActivityTab();checkAllObjectives();
    notif('\u21a9\ufe0f R\u00e9seau de d\u00e9part recharg\u00e9 \u2014 score remis \u00e0 z\u00e9ro','ok');
  } else {
    if(!confirm('Effacer tout le r\u00e9seau ?'))return;
    snapHistory();
    S.devs={};S.links={};S.frames={};S.texts={};S.sel=null;S.cableFrom=null;S.drag=null;S.activeLinks=new Set();
    render();noSel();
  }
}

// Navigateur du bureau d'un appareil : bc est la zone où la page s'affiche.
function browGo(devId,url,bc){
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
      if(data&&data.version===2&&data.network){data=data.network;}
      // Le fichier est vérifié avant de toucher au réseau en cours ; si l'affichage échoue
      // quand même, le réseau précédent est remis en place.
      var pb=networkDataProblem(data);
      if(pb)throw new Error(pb);
      var prev={devs:S.devs,links:S.links,nid:S.nid,frames:S.frames,texts:S.texts};
      try{
        snapHistory();   // un fichier chargé par erreur s'annule
        applyNetworkData(data);
        S.sel=null;S.cableFrom=null;S.drag=null;
        render();noSel();
      }catch(ex){
        S.devs=prev.devs;S.links=prev.links;S.nid=prev.nid;S.frames=prev.frames;S.texts=prev.texts;
        S.sel=null;S.cableFrom=null;S.drag=null;
        try{render();noSel();}catch(e2){}
        throw ex;
      }
      notif('📂 Réseau chargé : '+Object.keys(S.devs).length+' appareils, '+Object.keys(S.links).length+' câbles','ok');
      addLog('Topologie chargée depuis fichier','info');
    }catch(ex){notif('❌ Chargement impossible : '+ex.message+' — le réseau en cours est conservé','err');}
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
    scoredObjectives(ACTIVITY_CONFIG).forEach(function(obj){
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
  if(ACTIVITY_CONFIG&&scoredObjectives(ACTIVITY_CONFIG).length){
    var tabBtn=document.getElementById('btn-activ-tab');
    if(tabBtn)tabBtn.style.display='';
    renderActivityTab();
    checkAllObjectives();
    showTab('activ'); // bandeau déplié sur l'onglet Activité
  } else {
    setBot(false);    // sans activité : bandeau replié, Journal et Paquets à un clic
  }
  window.addEventListener('keydown',function(e){
    if(e.key==='F11'){e.preventDefault();toggleFullscreen();}
  });
  window.addEventListener('beforeunload',function(){saveToSession();if(_api&&_apiOk){sSet('cmi.core.score.raw',String(S.score));sCom();}});
  addLog('Bienvenue ! Ajoutez des appareils depuis la palette, reliez-les avec des câbles et réglez leurs adresses.','info');
  addLog('Double-cliquez sur un appareil pour ouvrir son bureau : invite de commandes, navigateur, services.','info');
  if(window.opener)addLog('↗ Fenêtre séparée — SCORM actif via la fenêtre parente.','info');

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