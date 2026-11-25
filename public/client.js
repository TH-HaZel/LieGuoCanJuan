'use strict';
const $ = id => document.getElementById(id); let source, currentSession, localGame=null, switching=false, connectionVersion=0;
async function enter(endpoint, data){
  $('error').textContent='';
  try {const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(result.error);sessionStorage.setItem('lieguo-session',JSON.stringify(result));connect(result);}
  catch(error){$('error').textContent=error.message;}
}
let availableGenerals=[];
function escapeText(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function marketOptions(prefix){return availableGenerals.filter(g=>g.source==='store').map((g,i)=>`<label class="market-choice"><input type="checkbox" name="${prefix}-market" value="${escapeText(g.id)}" ${i<5?'checked':''}>${escapeText(g.name)}</label>`).join('');}
function marketSelection(prefix){return Array.from(document.querySelectorAll(`input[name="${prefix}-market"]:checked`),input=>input.value);}
const poolSettings=document.createElement('fieldset');poolSettings.className='market-settings';poolSettings.innerHTML='<legend>额外武将池（最多 5 名）</legend>'+marketOptions('room');$('initial').closest('.row').append(poolSettings);
const selection=()=>({initial:$('initial').value,deckGenerals:[$('general1').value,$('general2').value],marketIds:marketSelection('room')});
$('create').onclick=()=>enter('/api/create',{name:$('name').value,selection:selection()});
$('join').onclick=()=>enter('/api/join',{name:$('name').value,code:$('roomInput').value,selection:selection()});
function connect(session){
  currentSession=session; if(source)source.close();const version=++connectionVersion;$('lobby').hidden=true;$('handoff').hidden=true;$('game').hidden=false;$('roomCode').textContent=session.code;
  source=new EventSource(`/events?room=${encodeURIComponent(session.code)}&token=${encodeURIComponent(session.token)}`);
  source.onopen=()=>{$('connection').textContent='🟢 已连接';};
  source.onerror=()=>{$('connection').textContent='连接中断，正在重试';};
  source.onmessage=event=>{if(version===connectionVersion)render(JSON.parse(event.data))};
}
async function action(type,extra={}) {
  if(localGame&&type==='end-turn'){await localEndTurn();return;}
  try {const response=await fetch('/api/'+type,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...currentSession,...extra})});const result=await response.json();if(!response.ok)throw new Error(result.error);if(localGame&&(type==='war-start'||type==='war-respond')){
      const nextId=result.war?.waitingId||result.currentPlayerId;const nextIndex=result.players.findIndex(p=>p.id===nextId);
      if(result.phase==='playing'&&nextIndex>=0&&nextIndex!==localGame.index){localGame.index=nextIndex;saveLocal();showHandoff();return;}
    }
    render(result);if(result.notice){$('message').textContent=result.notice;showEventToast(result.notice);}}catch(error){$('message').textContent=error.message;showEventToast(error.message);}
}
$('start').onclick=()=>action('start'); $('endTurn').onclick=()=>action('end-turn');
const warPanel=document.createElement('div');warPanel.className='war-actions';warPanel.hidden=true;$('game').append(warPanel);
let lastGameState=null;
function warButton(label,handler){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=handler;return button;}
let selectedGenerals=new Set(),selectionContext='',warTargetId=null;
let selectedCardId=null,selectedCardTarget=null;
const cardActions=document.createElement('div');cardActions.className='card-actions';$('game').append(cardActions);
function renderWar(state){
  warPanel.replaceChildren();const me=state.self,w=state.war;
  const show=state.phase==='playing'&&!!w||state.phase==='playing'&&state.currentPlayerId===me.id&&!state.mainActionUsed;
  warPanel.hidden=!show;
  if(!show)return;
  const detail=document.createElement('p');detail.className='war-detail';
  const controls=document.createElement('div');controls.className='war-action-buttons';
  const nameOf=id=>state.players.find(p=>p.id===id)?.name||'未知玩家';
  const button=(text,fn,primary=false)=>{const b=warButton(text,fn);if(primary)b.classList.add('war-primary');controls.append(b);return b;};
  const amountInput=()=>{const input=document.createElement('input');input.type='number';input.min='0';input.step='1';input.value='0';input.setAttribute('aria-label','黄金数量');controls.append(input);return input;};
  const selectionLabel=()=>{const count=document.createElement('p');count.id='war-selected-count';count.className='war-selection';count.textContent=`已选择 ${selectedGenerals.size} 名将领 · 点击将领卡片选择`;controls.append(count);};
  if(!w){
    if(state.currentPlayerId!==me.id||state.mainActionUsed)return;
    const target=state.players.find(p=>p.id===warTargetId&&p.id!==me.id&&p.health>0);
    if(!target)warTargetId=null;
    detail.id='war-target-label';detail.textContent=target?`目标：${target.name}`:'点击对方头像选择目标，再点击己方将领选择参战。';
    selectionLabel();
    button('确认宣战',()=>{if(!warTargetId||!selectedGenerals.size){$('message').textContent='请先点击对方头像和己方可出战将领';showEventToast('请先点击对方头像和己方可出战将领');return;}action('war-start',{targetId:warTargetId,indices:[...selectedGenerals]});},true);
  }else{
    const attacker=nameOf(w.attackerId),defender=nameOf(w.defenderId);
    if(w.waitingId!==me.id)detail.textContent=`${attacker} 对 ${defender} · 等待对方回应`;
    else if(w.phase==='negotiation'){
      detail.textContent=`${attacker} 向你宣战。可直接迎战，或提出黄金赔偿（已报价 ${w.offers}/3 次）。`;
      const amount=amountInput();button('提出赔偿',()=>action('war-respond',{choice:'offer',amount:Number(amount.value)}));button('直接迎战',()=>action('war-respond',{choice:'fight'}),true);
    }else if(w.phase==='offer_response'){
      detail.textContent=`${defender} 提出支付 ${w.amount} 黄金以取消战争。`;
      button('接受赔偿',()=>action('war-respond',{choice:'accept'}),true);button('拒绝',()=>action('war-respond',{choice:'reject'}));
    }else if(w.phase==='defense'){
      detail.textContent=`${attacker} 正在进攻。点击己方将领选择参战，或选择国家硬抗。`;selectionLabel();
      button('派将迎战',()=>{if(!selectedGenerals.size){$('message').textContent='请点击选择至少一名可出战武将';showEventToast('请点击选择至少一名可出战武将');return;}action('war-respond',{choice:'general',indices:[...selectedGenerals]});},true);button('国家硬抗',()=>action('war-respond',{choice:'hard'}));
    }else if(w.phase==='conceal'){
      detail.textContent='选择一张战争牌暗盖，或选择不出牌。双方确认后一起揭示。';
      detail.textContent='点击手牌选择暗盖，或直接确认不出牌。';
    }else if(w.phase==='aftermath'){
      detail.textContent=`防守获胜：进攻 ${w.result.attackPower}，防守 ${w.result.defensePower}。可以追击或提出赔偿。`;
      const amount=amountInput();button('提出索赔',()=>action('war-respond',{choice:'claim',amount:Number(amount.value)}));button('乘胜追击',()=>action('war-respond',{choice:'pursue'}),true);
    }else if(w.phase==='claim_response'){
      detail.textContent=`${defender} 要求赔偿 ${w.amount} 黄金；拒绝后将受到减半追击。`;
      button('支付赔偿',()=>action('war-respond',{choice:'accept'}),true);button('拒绝',()=>action('war-respond',{choice:'reject'}));
    }
  }
  warPanel.append(detail,controls);
}
const marketPanel=document.createElement('section');marketPanel.className='market-panel';marketPanel.hidden=true;$('message').parentElement.append(marketPanel);
function renderMarket(me,isTurn,phase){
  marketPanel.hidden=phase!=='playing';marketPanel.replaceChildren();if(marketPanel.hidden)return;
  const title=document.createElement('h2');title.textContent='武将商店';marketPanel.append(title);
  const note=document.createElement('p');note.className='market-note';
  note.textContent=me.purchased?'本回合已购买':isTurn?'本轮候选 · 下回合可部署':'本轮候选 · 请等待你的回合';marketPanel.append(note);
  if(!me.market.length){const empty=document.createElement('p');empty.textContent='本轮没有候选武将';marketPanel.append(empty);}
  me.market.forEach(g=>{
    const button=document.createElement('button');button.className='market-option';button.type='button';
    const name=document.createElement('strong');name.textContent=`${g.name} · 💰 ${g.cost}`;
    const stats=document.createElement('span');stats.textContent=`攻 ${g.attack} · 防 ${g.defense} · 生命 ${g.health} · 冷却 ${g.cooldown}`;
    const description=document.createElement('span');description.className='market-description';description.textContent=g.description||'暂无技能介绍。';
    button.append(name,stats,description);button.disabled=!isTurn||me.purchased;button.onclick=()=>action('buy',{id:g.id});marketPanel.append(button);
  });
}
function showCardDetails(card){
  const overlay=document.createElement('div');overlay.className='card-detail-overlay';
  const panel=document.createElement('section');panel.className='card-detail';
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',card.name);
  const title=document.createElement('h2');title.textContent=card.name;
  const description=document.createElement('p');description.textContent=card.description||'暂无介绍';
  const note=document.createElement('small');
  const supported=['T02','T03','T14','T16','T05','T08','N01','N02','N05','N06','N07','N08','N09','N10','N11','N12','N14','N15','N16','N17','N20','N30'];
  note.textContent=card.kind==='general'?(card.description==='无专属技能。'?'无专属技能':'武将技能暂未实现'):(supported.includes(card.id)?'此牌效果已实现':'此牌效果尚未实现');
  const close=document.createElement('button');close.textContent='关闭';
  const dismiss=()=>{overlay.remove();document.removeEventListener('keydown',onKey);};
  const onKey=e=>{if(e.key==='Escape')dismiss();};
  close.onclick=dismiss;overlay.onclick=e=>{if(e.target===overlay)dismiss();};
  document.addEventListener('keydown',onKey);panel.append(title,description,note,close);overlay.append(panel);document.body.append(overlay);close.focus();
}
function renderHand(cards,turnsStarted,state){
  const hand=$('hand');hand.replaceChildren();
  if(!cards.length){const empty=document.createElement('span');empty.className='hand-empty';empty.textContent='暂无手牌';hand.append(empty);return;}
  cards.forEach((card,index)=>{
    const isGeneral=card.kind==='general',button=document.createElement('button');
    const rarityClass=({'低级':'rarity-low','中级':'rarity-mid','高级':'rarity-high',low:'rarity-low',medium:'rarity-mid',high:'rarity-high',legend:'rarity-legend'})[card.rarity]||'rarity-unset';
    button.className='hand-card '+rarityClass+(isGeneral?' hand-card-general':'');
    button.type='button';
    const top=document.createElement('span');top.className='hand-card-top';
    const category=document.createElement('span');category.className='hand-card-category';category.textContent=[card.country,isGeneral?'武将':(card.variety||card.category||'技能牌')].filter(Boolean).join(' · ');
    const cost=document.createElement('span');cost.className='hand-card-cost';cost.textContent='💰 '+(isGeneral?card.deployCost:card.cost);
    top.append(cost,category);
    const name=document.createElement('strong');name.className='hand-card-name';name.textContent=card.name;
    const body=document.createElement('span');body.className='hand-card-body';
    if(isGeneral)body.textContent=`攻击 ${card.attack}  ·  防御 ${card.defense}\n生命 ${card.health}/${card.maxHealth}  ·  冷却 ${card.cooldown}`;
    else {const description=card.description||'';const effect=description.match(/(?:效果[：:]|本次|选择|获得|所有|使|若)/);body.textContent=(effect?description.slice(effect.index):description).replace(/^效果[：:]\s*/,'').trim();}
    const foot=document.createElement('span');foot.className='hand-card-foot';foot.textContent=isGeneral?(card.deployAfterTurn>turnsStarted?'下回合可部署':'点击部署'):`${({'low':'低级','medium':'中级','high':'高级','legend':'传说'})[card.rarity]||card.rarity||'技能牌'} · 点击查看`;
    button.append(top,name,body,foot);button.title=isGeneral?'点击支付部署费用':card.description||card.name;
    if(card.instanceId===selectedCardId)button.classList.add('hand-card-selected');
    button.setAttribute('aria-pressed',String(card.instanceId===selectedCardId));
    button.oncontextmenu=e=>{e.preventDefault();showCardDetails(card);};
    button.onclick=()=>{selectedCardId=selectedCardId===card.instanceId?null:card.instanceId;selectedCardTarget=null;render(state);};
    hand.append(button);
  });
}
function heartFillPercent(fraction){
  const points=[[50,95],[5,48],[3,28],[10,12],[25,5],[39,9],[50,21],[61,9],[75,5],[90,12],[97,28],[95,48]];
  function areaAt(y){
    const clipped=[];
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],inside=a[1]>=y,next=b[1]>=y;
      if(inside)clipped.push(a);
      if(inside!==next){const t=(y-a[1])/(b[1]-a[1]);clipped.push([a[0]+t*(b[0]-a[0]),y]);}
    }
    return Math.abs(clipped.reduce((sum,a,i)=>{const b=clipped[(i+1)%clipped.length];return sum+a[0]*b[1]-b[0]*a[1];},0))/2;
  }
  const total=areaAt(0),target=Math.max(0,Math.min(1,fraction))*total;let low=0,high=100;
  for(let i=0;i<24;i++){const mid=(low+high)/2;if(areaAt(mid)>target)low=mid;else high=mid;}
  return 100-(low+high)/2;
}
const eventToast=document.createElement('div');
eventToast.className='event-toast';eventToast.hidden=true;
$('game').append(eventToast);
let lastEventKey=null,eventToastTimer;
function showEventToast(message){
  if(!message)return;
  eventToast.textContent=message;eventToast.hidden=false;
  clearTimeout(eventToastTimer);
  eventToastTimer=setTimeout(()=>{eventToast.hidden=true;},4000);
}
function renderLastPlayed(cards){
  const middle=document.querySelector('#game .middle');middle.replaceChildren();
  const title=document.createElement('span');title.className='last-played-title';title.textContent=cards.length?'最近出牌':'暂无出牌';middle.append(title);
  const list=document.createElement('div');list.className='last-played-list';
  for(const entry of cards){
    const card=entry.card,button=document.createElement('button');button.type='button';button.className='last-played-card';
    const owner=document.createElement('small');owner.textContent=entry.playerName;
    const name=document.createElement('strong');name.textContent=card.name;
    const description=document.createElement('span');description.textContent=card.description||'暂无介绍';
    button.append(owner,name,description);button.title='点击查看完整介绍';button.onclick=()=>showCardDetails(card);list.append(button);
  }
  middle.append(list);
}
function render(state){
  lastGameState=state;renderLastPlayed(state.lastPlayed||[]);
  const eventKey=state.code+'|'+state.event;
  if(state.phase!=='waiting'&&eventKey!==lastEventKey){lastEventKey=eventKey;showEventToast(state.event);}
  const me=state.self; $('message').textContent=state.event; $('start').hidden=state.phase!=='waiting'||state.hostId!==me.id; $('endTurn').hidden=state.phase!=='playing'||state.currentPlayerId!==me.id; const current=state.players.find(p=>p.id===state.currentPlayerId); $('turn').textContent=current?`第 ${state.round} 轮 · ${current.name}的回合`:'等待开始'; const self=$('self');self.replaceChildren();
  const avatar=document.createElement('span');avatar.className='player-avatar';avatar.textContent='😎';
  const info=document.createElement('span');info.className='player-info';
  const label=document.createElement('strong');label.className='player-name';label.textContent=me.name+' · '+me.country;
  const statuses=document.createElement('span');statuses.className='player-statuses';
  const heart=document.createElement('span');heart.className='health-heart';
  const percentage=me.maxHealth>0?heartFillPercent(me.health/me.maxHealth):0;
  heart.style.setProperty('--health',percentage+'%');heart.title=`生命 ${me.health}/${me.maxHealth}`;
  const hp=document.createElement('span');hp.className='health-value';hp.textContent=me.health;heart.append(hp);
  const gold=document.createElement('span');gold.className='player-gold';gold.textContent='💰 '+me.gold;gold.title='黄金';
  const buffs=document.createElement('span');buffs.className='player-buffs';buffs.textContent='增益：'+(me.buffs.length?me.buffs.join('、'):'无');
  statuses.append(heart,gold);info.append(label,statuses,buffs);self.append(avatar,info);
  const canSelect=state.phase==='playing'&&((!state.war&&state.currentPlayerId===me.id&&!state.mainActionUsed)||(state.war?.phase==='defense'&&state.war.waitingId===me.id));
  const context=canSelect?me.id+':'+(state.war?.phase||'attack')+':'+me.generals.map(g=>(g.instanceId||g.id)+'/'+(g.remaining||0)).join(','):'';
  if(context!==selectionContext){selectedGenerals.clear();warTargetId=null;selectionContext=context;}
  if(selectedCardId&&!me.hand.some(c=>c.instanceId===selectedCardId)){selectedCardId=null;selectedCardTarget=null;}
  const chosen=me.hand.find(c=>c.instanceId===selectedCardId);
  const targetMode=!!chosen&&chosen.id==='T03'&&!state.war&&state.currentPlayerId===me.id;
  const countryTargetMode=!!chosen&&chosen.id==='T16'&&!state.war&&state.currentPlayerId===me.id;
  const generals=$('generals');generals.replaceChildren();
  if(!me.generals.length)generals.textContent='暂无将领';
  me.generals.forEach((g,index)=>{
    const item=document.createElement('div');item.className='general-mini';item.title='右键查看技能';item.oncontextmenu=e=>{e.preventDefault();showCardDetails(g);};
    if(targetMode){item.classList.add('selectable-general');item.tabIndex=0;item.setAttribute('role','button');if(selectedCardTarget===index)item.classList.add('general-selected');item.onclick=()=>{selectedCardTarget=index;render(state);};item.onkeydown=e=>{if(e.target===item&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectedCardTarget=index;render(state);}};}
    else if(canSelect&&!(g.remaining>0)){
      item.classList.add('selectable-general');item.tabIndex=0;item.setAttribute('role','button');
      item.setAttribute('aria-pressed',String(selectedGenerals.has(index)));
      if(selectedGenerals.has(index))item.classList.add('general-selected');
      const toggle=()=>{if(selectedGenerals.has(index))selectedGenerals.delete(index);else selectedGenerals.add(index);item.classList.toggle('general-selected',selectedGenerals.has(index));item.setAttribute('aria-pressed',String(selectedGenerals.has(index)));const count=$('war-selected-count');if(count)count.textContent=`已选择 ${selectedGenerals.size} 名将领 · 点击将领卡片选择`;};
      item.onclick=toggle;item.onkeydown=e=>{if(e.target===item&&(e.key==='Enter'||e.key===' ')){e.preventDefault();toggle();}};
    }
    const name=document.createElement('strong');name.textContent=g.name;
    const stats=document.createElement('span');stats.textContent=`攻 ${g.attack} · 防 ${g.defense}`;
    const health=document.createElement('span');health.textContent=`生命 ${g.health}/${g.maxHealth}`;
    const cooldown=document.createElement('span');cooldown.textContent=`冷却 ${g.remaining||0}`;
    const withdraw=document.createElement('button');withdraw.type='button';withdraw.className='withdraw-general';withdraw.textContent='撤回';withdraw.disabled=state.phase!=='playing'||state.currentPlayerId!==me.id||!!state.war||g.remaining>0;withdraw.onclick=e=>{e.stopPropagation();action('withdraw',{index});};item.append(name,stats,health,cooldown,withdraw);generals.append(item);
  });
  renderHand(me.hand,me.turnsStarted,state);
  cardActions.replaceChildren();
  const isConceal=state.war?.phase==='conceal'&&state.war.waitingId===me.id;
  if(isConceal||(!state.war&&state.phase==='playing'&&state.currentPlayerId===me.id)){
    const label=document.createElement('span');label.textContent=chosen?(countryTargetMode?(selectedCardTarget===null?'请选择其他国家':`目标：${state.players.find(p=>p.id===selectedCardTarget)?.name||''}`):targetMode?(selectedCardTarget===null?'请选择己方武将':`目标：${me.generals[selectedCardTarget]?.name||''}`):`已选：${chosen.name}`):(isConceal?'未选择：可不出牌':'点击手牌选择');cardActions.append(label);
    const confirm=warButton(isConceal?'确认暗盖':'出牌',()=>{
      if(isConceal){if(chosen?.kind==='general'){$('message').textContent='武将不能暗盖';showEventToast('武将不能暗盖');return;}const id=selectedCardId;selectedCardId=null;selectedCardTarget=null;action('war-respond',{choice:'card',instanceId:id});return;}
      if(!chosen){$('message').textContent='请先选择手牌';showEventToast('请先选择手牌');return;}
      if(chosen.kind==='general'){const index=me.hand.findIndex(c=>c.instanceId===chosen.instanceId);selectedCardId=null;action('deploy',{index});return;}
      if(targetMode&&selectedCardTarget===null){$('message').textContent='请先选择己方武将';showEventToast('请先选择己方武将');return;}
      if(countryTargetMode&&selectedCardTarget===null){$('message').textContent='请选择其他存活国家';showEventToast('请选择其他存活国家');return;}
      const id=selectedCardId,targetIndex=targetMode?selectedCardTarget:null,targetPlayerId=countryTargetMode?selectedCardTarget:null;selectedCardId=null;selectedCardTarget=null;action('play-card',{instanceId:id,targetIndex,targetPlayerId});
    });confirm.className='card-confirm';cardActions.append(confirm);
  }

  renderMarket(me,state.currentPlayerId===me.id&&!state.war,state.phase);
  renderWar(state);
  $('opponents').replaceChildren(...state.players.filter(p=>p.id!==me.id).map(player=>{
    const el=document.createElement('div');el.className='player opponent';
    const header=document.createElement('div');header.className='opponent-header';
    const avatar=document.createElement('span');avatar.className='player-avatar';avatar.textContent='😎';
    const canTarget=state.phase==='playing'&&!state.war&&state.currentPlayerId===me.id&&(countryTargetMode||!state.mainActionUsed)&&player.health>0;
    if(canTarget){
      if(countryTargetMode){avatar.classList.add('target-avatar');avatar.tabIndex=0;avatar.setAttribute('role','button');avatar.setAttribute('aria-label','选择 '+player.name+' 为卡牌目标');avatar.setAttribute('aria-pressed',String(selectedCardTarget===player.id));if(selectedCardTarget===player.id)avatar.classList.add('target-selected');const choose=()=>{selectedCardTarget=player.id;render(state);};avatar.onclick=choose;avatar.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}};}
      else {avatar.classList.add('target-avatar');avatar.tabIndex=0;avatar.setAttribute('role','button');avatar.setAttribute('aria-label','选择 '+player.name+' 为宣战目标');
      avatar.setAttribute('aria-pressed',String(warTargetId===player.id));if(warTargetId===player.id)avatar.classList.add('target-selected');
      const choose=()=>{warTargetId=player.id;document.querySelectorAll('.target-avatar').forEach(el=>{el.classList.remove('target-selected');el.setAttribute('aria-pressed','false');});avatar.classList.add('target-selected');avatar.setAttribute('aria-pressed','true');const label=$('war-target-label');if(label)label.textContent='目标：'+player.name;};
      avatar.onclick=choose;avatar.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}};}
    }
    const info=document.createElement('div');info.className='player-info';
    const name=document.createElement('strong');name.className='player-name';name.textContent=player.name+' · '+player.country;
    const statuses=document.createElement('div');statuses.className='player-statuses';
    const heart=document.createElement('span');heart.className='health-heart';heart.style.setProperty('--health',(player.maxHealth>0?heartFillPercent(player.health/player.maxHealth):0)+'%');heart.title=`生命 ${player.health}/${player.maxHealth}`;
    const hp=document.createElement('span');hp.className='health-value';hp.textContent=player.health;heart.append(hp);
    const gold=document.createElement('span');gold.className='player-gold';gold.textContent='💰 '+player.gold;
    const count=document.createElement('span');count.className='opponent-hand';count.textContent=`手牌 ${player.handCount}`;
    const buffs=document.createElement('span');buffs.className='player-buffs';buffs.textContent='增益：'+(player.buffs.length?player.buffs.join('、'):'无');
    statuses.append(heart,gold,count);info.append(name,statuses,buffs);header.append(avatar,info);el.append(header);
    const generals=document.createElement('div');generals.className='opponent-generals';
    player.generals.forEach(g=>{const card=document.createElement('div');card.className='general-mini';card.title='右键查看技能';card.oncontextmenu=e=>{e.preventDefault();showCardDetails(g);};const title=document.createElement('strong');title.textContent=g.name;const stats=document.createElement('span');stats.textContent=`攻 ${g.attack} · 防 ${g.defense}`;const hp=document.createElement('span');hp.textContent=`生命 ${g.health}/${g.maxHealth}`;const cooldown=document.createElement('span');cooldown.textContent=`冷却 ${g.remaining||0}`;card.append(title,stats,hp,cooldown);generals.append(card);});
    el.append(generals);return el;
  }));
}

document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.repeat||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||event.isComposing||$('game').hidden||!lastGameState)return;
  const target=event.target;
  if(target instanceof Element&&(target.closest('input,textarea,select,button,[role=button],[contenteditable]:not([contenteditable="false"]),[role="dialog"]')||document.querySelector('.card-detail-overlay')))return;
  if(event.code==='Space'&&lastGameState.phase==='playing'&&!lastGameState.war&&lastGameState.currentPlayerId===lastGameState.self.id&&!$('endTurn').hidden&&!$('endTurn').disabled){event.preventDefault();$('endTurn').click();}
  else if(event.key==='Enter'){const confirm=cardActions.querySelector('.card-confirm');if(confirm&&!confirm.disabled){event.preventDefault();confirm.click();}}
});

const localKey='lieguo-hotseat-v1';
function saveLocal(){sessionStorage.setItem(localKey,JSON.stringify(localGame));}
function generalOptions(selected){return availableGenerals.filter(g=>g.source==='primary').map((g,i)=>`<option value="${escapeText(g.id)}" ${i===selected?'selected':''}>${escapeText(g.name)}</option>`).join('');}
function localFields(){const count=Number($('localCount').value);$('localPlayers').innerHTML=Array.from({length:count},(_,i)=>`<details class="local-player"><summary>玩家 ${i+1}</summary><div class="row"><label>昵称<input id="localName${i}" maxlength="20" value="玩家 ${i+1}"></label><label>初始武将<select id="localInitial${i}">${generalOptions(0)}</select></label><label>主牌组武将 1<select id="localGeneralA${i}">${generalOptions(1)}</select></label><label>主牌组武将 2<select id="localGeneralB${i}">${generalOptions(2)}</select></label></div><fieldset class="market-settings"><legend>额外武将池（最多 5 名）</legend>${marketOptions('local'+i)}</fieldset></details>`).join('');}
$('localCount').onchange=localFields;
for(const id of ['create','join','localStart'])$(id).disabled=true;
fetch('/api/generals').then(response=>{if(!response.ok)throw Error('无法读取武将列表');return response.json();}).then(data=>{
  if(!Array.isArray(data)||data.filter(g=>g.source==='primary').length<3)throw Error('主牌组武将不足，至少需要三名');
  availableGenerals=data;
  for(const [index,id] of ['initial','general1','general2'].entries()){
    $(id).replaceChildren(...data.filter(g=>g.source==='primary').map(g=>{const option=document.createElement('option');option.value=g.id;option.textContent=g.name;return option;}));
    $(id).selectedIndex=index;
  }
  poolSettings.innerHTML='<legend>额外武将池（最多 5 名）</legend>'+marketOptions('room');
  localFields();for(const id of ['create','join','localStart'])$(id).disabled=false;
}).catch(error=>{$('error').textContent='武将列表加载失败：'+error.message;});
async function post(endpoint,data){const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(result.error||'操作失败');return result;}
function showHandoff(){++connectionVersion;if(source){source.close();source=null;}$('game').hidden=true;$('lobby').hidden=true;$('handoff').hidden=false;$('hand').replaceChildren();warPanel.replaceChildren();warPanel.hidden=true;lastGameState=null;cardActions.replaceChildren();selectedCardId=null;selectedCardTarget=null;selectedGenerals.clear();selectionContext='';warTargetId=null;marketPanel.hidden=true;marketPanel.replaceChildren();$('self').textContent='';$('generals').textContent='';$('handoffName').textContent=localGame.players[localGame.index].name;}
$('localStart').onclick=async()=>{
 if(switching)return;const count=Number($('localCount').value),configs=[];
 for(let i=0;i<count;i++){const name=$('localName'+i).value.trim(),initial=$('localInitial'+i).value,deckGenerals=[$('localGeneralA'+i).value,$('localGeneralB'+i).value],marketIds=marketSelection('local'+i);if(marketIds.length>5||marketIds.includes(initial)){$('error').textContent=`请检查玩家 ${i+1} 的额外武将池（最多五名，不能包含初始武将）。`;return;}if(!name||deckGenerals[0]===deckGenerals[1]||deckGenerals.includes(initial)){$('error').textContent=`请检查玩家 ${i+1} 的昵称，三名武将须互不相同。`;return;}configs.push({name,selection:{initial,deckGenerals,marketIds}});}
 switching=true;$('localStart').disabled=true;$('error').textContent='';
 try{const host=await post('/api/create',configs[0]);const players=[{...host,name:configs[0].name}];for(let i=1;i<count;i++){const joined=await post('/api/join',{...configs[i],code:host.code});players.push({...joined,name:configs[i].name});}await post('/api/start',host);localGame={players,index:0};saveLocal();sessionStorage.removeItem('lieguo-session');showHandoff();}catch(e){$('error').textContent=e.message;}finally{switching=false;$('localStart').disabled=false;}
};
async function localEndTurn(){if(switching)return;switching=true;$('endTurn').disabled=true;const previous=localGame.index;showHandoff();$('handoffReveal').disabled=true;$('handoffName').textContent='下一位玩家（正在切换）';
 try{const result=await post('/api/end-turn',localGame.players[previous]);const next=result.players.findIndex(p=>p.id===result.currentPlayerId);if(next<0)throw Error('无法找到下一位玩家');localGame.index=next;saveLocal();showHandoff();}catch(e){localGame.index=previous;saveLocal();showHandoff();$('handoffName').textContent=localGame.players[previous].name+'（切换失败：'+e.message+'）';}finally{switching=false;$('endTurn').disabled=false;$('handoffReveal').disabled=false;}}
$('handoffReveal').onclick=()=>{if(!switching&&localGame)connect(localGame.players[localGame.index]);};
function compactLobby(){
  const lobby=$('lobby'),heading=lobby.querySelector('h1');
  const labels=lobby.querySelectorAll(':scope > label');
  const notes=lobby.querySelectorAll(':scope > p');
  const rows=lobby.querySelectorAll(':scope > .row');
  const divider=lobby.querySelector(':scope > hr'),localHeading=lobby.querySelector(':scope > h2');
  const home=document.createElement('div');home.className='lobby-options';
  const config=document.createElement('section');config.className='lobby-config';config.hidden=true;
  const configTitle=document.createElement('h2');
  const content=document.createElement('div');content.className='lobby-config-content';
  const stash=document.createElement('div');stash.hidden=true;
  const back=document.createElement('button');back.type='button';back.textContent='← 返回主页';
  const roomNodes=[labels[0],notes[0],rows[0],rows[1]];
  const localNodes=[notes[1],labels[1],$('localStart'),$('localPlayers')];
  function openConfig(title,nodes){
    stash.append(...roomNodes,...localNodes);
    $('error').textContent='';configTitle.textContent=title;
    if(nodes===localNodes){
      const left=document.createElement('div');left.className='local-config-main';left.append(nodes[0],nodes[1],nodes[2]);
      const right=document.createElement('div');right.className='local-config-players';right.append(nodes[3]);
      content.classList.add('local-config-columns');content.replaceChildren(left,right);
    }else{content.classList.remove('local-config-columns');content.replaceChildren(...nodes);}
    home.hidden=true;config.hidden=false;
  }
  function entry(title,nodes){
    const button=document.createElement('button');button.type='button';button.className='lobby-entry';button.textContent=title;
    button.onclick=()=>openConfig(title,nodes);return button;
  }
  back.onclick=()=>{$('error').textContent='';config.hidden=true;home.hidden=false;};
  stash.append(...roomNodes,...localNodes);
  lobby.append(stash);
  heading.textContent='🎴 列国残卷';
  home.append(entry('创建或加入房间',roomNodes),entry('单机轮流测试',localNodes));
  config.append(back,configTitle,content);
  if(divider)divider.remove();if(localHeading)localHeading.remove();
  lobby.insertBefore(home,$('error'));lobby.insertBefore(config,$('error'));
}
compactLobby();
try{localGame=JSON.parse(sessionStorage.getItem(localKey));if(localGame?.players?.length&&Number.isInteger(localGame.index)&&localGame.players[localGame.index])showHandoff();else{localGame=null;const session=JSON.parse(sessionStorage.getItem('lieguo-session'));if(session?.code&&session?.token)connect(session);}}catch{localGame=null;}
