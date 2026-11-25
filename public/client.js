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
  try {const response=await fetch('/api/'+type,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...currentSession,...extra})});const result=await response.json();if(!response.ok)throw new Error(result.error);if(localGame&&(type==='war-start'||type==='war-respond'||type==='bonus-choice'||type==='play-card'||type==='neutral-action')){
      const nextId=result.pendingChoice?.playerId||result.neutral?.waitingId||result.war?.waitingId||result.currentPlayerId;const nextIndex=result.players.findIndex(p=>p.id===nextId);
      if(result.phase==='playing'&&nextIndex>=0&&nextIndex!==localGame.index){localGame.index=nextIndex;saveLocal();showHandoff();return;}
    }
    render(result);if(result.notice){$('message').textContent=result.notice;showEventToast(result.notice);}}catch(error){$('message').textContent=error.message;showEventToast(error.message);}
}
$('start').onclick=()=>action('start'); $('endTurn').onclick=()=>action('end-turn');
const warPanel=document.createElement('div');warPanel.className='war-actions';warPanel.hidden=true;$('game').append(warPanel);
let lastGameState=null,lastScoutReport=null;
function warButton(label,handler){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=handler;return button;}
let selectedGenerals=new Set(),selectedExperience=new Map(),selectionContext='',warTargetId=null;
function warExperienceSelection(){return Object.fromEntries([...selectedGenerals].map(index=>[index,selectedExperience.get(index)||0]));}
let selectedCardId=null,selectedCardTarget=null;
const cardActions=document.createElement('div');cardActions.className='card-actions';$('game').append(cardActions);
function renderWar(state){
  warPanel.replaceChildren();const me=state.self,w=state.war;
  const show=!state.neutral&&!state.pendingChoice&&(state.phase==='playing'&&!!w||state.phase==='playing'&&state.currentPlayerId===me.id&&!state.mainActionUsed);
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
    button('确认宣战',()=>{if(!warTargetId||!selectedGenerals.size){$('message').textContent='请先点击对方头像和己方可出战将领';showEventToast('请先点击对方头像和己方可出战将领');return;}action('war-start',{targetId:warTargetId,indices:[...selectedGenerals],experience:warExperienceSelection()});},true);
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
      button('派将迎战',()=>{if(!selectedGenerals.size){$('message').textContent='请点击选择至少一名可出战武将';showEventToast('请点击选择至少一名可出战武将');return;}action('war-respond',{choice:'general',indices:[...selectedGenerals],experience:warExperienceSelection()});},true);button('国家硬抗',()=>action('war-respond',{choice:'hard'}));
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
    const name=document.createElement('strong');name.textContent=`${g.name} · 💰 ${me.buyDiscountRound===lastGameState?.round?Math.floor(g.cost*3/4):g.cost}`;
    const stats=document.createElement('span');stats.textContent=`攻 ${generalStat(g,'attack')} · 防 ${generalStat(g,'defense')} · 生命 ${g.health} · 冷却 ${g.cooldown}`;
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
  const supported=['N04','T18','T17','N29','T15(1)','T11','N31','N32','N03','T07','T09','T10','T01','T02','T03','T04','T12','T13','T14','T16','T05','T08','N01','N02','N05','N06','N07','N08','N09','N10','N11','N12','N13','N14','N15','N16','N17','N18','N19','N20','N21','N22','N23','N24','N26','N30'];
  note.textContent=['T06','N28'].includes(card.id)?'已支持清除武将负面状态；国家状态待接入':card.id==='N25'?'暂时限制临时攻击增益；武将技能系统待接入':card.id==='N27'?'可移除当前已接入的临时武将增益':card.id==='T15'?'加入牌库已实现；李世民技能与贞观之治待实现':card.kind==='general'?(card.description==='无专属技能。'?'无专属技能':'武将技能暂未实现'):(supported.includes(card.id)?'此牌效果已实现':'此牌效果尚未实现');
  const close=document.createElement('button');close.textContent='关闭';
  const dismiss=()=>{overlay.remove();document.removeEventListener('keydown',onKey);};
  const onKey=e=>{if(e.key==='Escape')dismiss();};
  close.onclick=dismiss;overlay.onclick=e=>{if(e.target===overlay)dismiss();};
  document.addEventListener('keydown',onKey);panel.append(title,description,note,close);overlay.append(panel);document.body.append(overlay);close.focus();
}
function generalStat(g,attribute){return g[attribute]+(g.permanentBonuses||[]).filter(b=>b.attribute===attribute).length;}
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
    const cost=document.createElement('span');cost.className='hand-card-cost';cost.textContent='💰 '+(isGeneral?(state.self.deployDiscountTurn===turnsStarted?Math.floor(card.deployCost/2):card.deployCost):card.cost);
    top.append(cost,category);
    const name=document.createElement('strong');name.className='hand-card-name';name.textContent=card.name;
    const body=document.createElement('span');body.className='hand-card-body';
    if(isGeneral)body.textContent=`攻击 ${generalStat(card,'attack')}  ·  防御 ${generalStat(card,'defense')}\n生命 ${card.health}/${card.maxHealth}  ·  冷却 ${card.cooldown}`;
    else {const description=card.description||'';const effect=description.match(/(?:效果[：:]|本次|选择|获得|所有|使|若)/);body.textContent=(effect?description.slice(effect.index):description).replace(/^效果[：:]\s*/,'').trim();}
    const foot=document.createElement('span');foot.className='hand-card-foot';foot.textContent=isGeneral?(card.deployAfterTurn>turnsStarted?'下回合可部署':'点击部署'):`${({'low':'低级','medium':'中级','high':'高级','legend':'传说'})[card.rarity]||card.rarity||'技能牌'} · 点击查看`;
    button.append(top,name,body,foot);button.title=isGeneral?'点击支付部署费用':card.description||card.name;
    if(card.instanceId===selectedCardId)button.classList.add('hand-card-selected');
    button.setAttribute('aria-pressed',String(card.instanceId===selectedCardId));
    button.oncontextmenu=e=>{e.preventDefault();showCardDetails(card);};
    button.onclick=()=>{const selected=cards.find(c=>c.instanceId===selectedCardId);if(selected?.id==='T04'&&isGeneral){selectedCardTarget=card.instanceId;render(state);return;}selectedCardId=selectedCardId===card.instanceId?null:card.instanceId;selectedCardTarget=null;render(state);};
    if(selectedCardTarget===card.instanceId&&cards.find(c=>c.instanceId===selectedCardId)?.id==='T04')button.classList.add('hand-card-selected');
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
function renderNeutral(state){
  const middle=document.querySelector('#game .middle');middle.replaceChildren();
  const title=document.createElement('strong');title.textContent=state.neutral?'⚔️ 中立资源争夺':'中立资源';middle.append(title);
  const resources=state.neutralResources||[];
  for(const resource of resources){if(resource.type==='card'){const card=warButton(`🃏 ${resource.card.name}`,()=>showCardDetails(resource.card));card.title='查看中立牌效果';middle.append(card);}else{const line=document.createElement('span');line.textContent=`💰 ${resource.amount} 金`;middle.append(line);}}
  const n=state.neutral;const completed=n?.results||state.lastNeutralResults||[];for(const result of completed){if(!result.result?.scores.length)continue;const line=document.createElement('small');line.textContent='上次争夺：'+result.result.scores.map(x=>(state.players.find(p=>p.id===x.playerId)?.name||'玩家')+' '+x.power+(x.forcedDefeat?'（直接失败）':'')).join(' / ')+(result.supports?.length?' · 增援：'+result.supports.map(x=>x.name).join('、'):'');middle.append(line);if(result.cards?.length){const cards=document.createElement('small');cards.textContent='出牌：'+result.cards.map(entry=>entry.playerName+' · '+entry.card.name+(entry.targetGeneral?'（'+entry.targetGeneral+'）':'')+(entry.outcome==='countered'?'（被识破）':entry.outcome==='mutual_cancel'?'（同时使用失效）':'')+(entry.targetId?' → '+(state.players.find(p=>p.id===entry.targetId)?.name||'玩家'):'' )).join(' / ');middle.append(cards);}}if(!n)return;
  if(n.resource){const line=document.createElement('span');line.textContent='当前争夺：'+(n.resource.type==='gold'?`${n.resource.amount} 金`:n.resource.card.name);middle.append(line);}
  const info=document.createElement('span');const who=state.players.find(p=>p.id===n.waitingId);info.textContent=n.waitingId===state.self.id?'轮到你选择':`等待 ${who?.name||'其他玩家'} 选择`;middle.append(info);
  if(n.contest?.mains)for(const entry of n.contest.mains){const line=document.createElement('span');line.textContent=`${state.players.find(p=>p.id===entry.playerId)?.name||'玩家'}：${entry.name} · 攻 ${entry.power}`;middle.append(line);}
  if(n.waitingId!==state.self.id)return;
  if(n.phase==='card'){
    const list=document.createElement('select');list.setAttribute('aria-label','选择中立争夺牌');const skip=document.createElement('option');skip.value='';skip.textContent='不出牌';list.append(skip);
    for(const c of state.self.hand.filter(c=>['T08','N01','N02','N05','N06','N07','N13','T03','T06','T13','T17','N22','N23','N25','N27','N28','N29','N30','N31','N32'].includes(c.id))){const option=document.createElement('option');option.value=c.instanceId;option.textContent=`${c.name} · 💰${c.cost}`;option.disabled=c.cost>state.self.gold;list.append(option);}
    const target=document.createElement('select');target.setAttribute('aria-label','选择卡牌目标国家');
    const general=document.createElement('select');general.setAttribute('aria-label','选择卡牌目标武将');
    const effect=document.createElement('select');effect.setAttribute('aria-label','选择要移除的效果');
    const updateEffects=()=>{effect.replaceChildren();const p=state.players.find(x=>x.id===target.value),g=p?.generals[Number(general.value)],type=state.self.hand.find(c=>c.instanceId===list.value)?.id;if(type==='N31'){for(const bonus of (g?.permanentBonuses||[])){const option=document.createElement('option');option.value=bonus.id;option.textContent=bonus.source+'：'+(bonus.attribute==='attack'?'攻击':'防御')+' +1';effect.append(option);}}else{for(const status of (g?.statuses||[])){if(status.removable&&status.polarity===(type==='N27'?'positive':'negative')&&(status.expires===null||state.round<status.expires)){const option=document.createElement('option');option.value=status.id;option.textContent=status.source+'：'+status.kind;effect.append(option);}}}};
    general.onchange=updateEffects;
    const updateGenerals=()=>{general.replaceChildren();const p=state.players.find(x=>x.id===target.value);for(const [index,g] of (p?.generals||[]).entries()){const option=document.createElement('option');option.value=String(index);option.textContent=g.name;general.append(option);}updateEffects();};
    target.onchange=updateGenerals;
    const refreshTarget=()=>{const chosen=state.self.hand.find(c=>c.instanceId===list.value);const type=chosen?.id;target.replaceChildren();for(const p of state.players){if(p.health<=0||(['N22','T13','T03','T06','T17','N28'].includes(type)?p.id!==state.self.id:p.id===state.self.id))continue;if(['N06','N29'].includes(type)&&!(n.contest?.mains||[]).some(entry=>entry.playerId===p.id))continue;const option=document.createElement('option');option.value=p.id;option.textContent=p.name;target.append(option);}target.hidden=!['N06','N29','N22','N23','T13','T03','T06','T17','N25','N28','N27','N31','N32'].includes(type);general.hidden=!['N22','N23','T13','T03','T06','T17','N25','N28','N27','N31','N32'].includes(type);effect.hidden=!['T06','N28','N27','N31'].includes(type);updateGenerals();};
    list.onchange=refreshTarget;refreshTarget();
    middle.append(list,target,general,effect,warButton('确认出牌',()=>action('neutral-action',{choice:'card',instanceId:list.value||null,...(!target.hidden?{targetId:target.value}:{}),...(!general.hidden?{targetIndex:Number(general.value)}:{}),...(!effect.hidden?{effectId:effect.value}:{})})));return;
  }
  if(n.phase==='negotiation'){
    const negotiation=n.negotiation, message=document.createElement('span');message.textContent=negotiation.message;middle.append(message);
    if(negotiation.offer){middle.append(warButton('接受并退出',()=>action('neutral-action',{choice:'accept'})),warButton('拒绝',()=>action('neutral-action',{choice:'reject'})));return;}
    const target=document.createElement('select');target.setAttribute('aria-label','报价对象');for(const id of negotiation.ids.filter(id=>id!==state.self.id)){const option=document.createElement('option');option.value=id;option.textContent=state.players.find(p=>p.id===id)?.name||'玩家';target.append(option);}
    const amount=document.createElement('input');amount.type='number';amount.min='1';amount.max=String(state.self.gold);amount.value='1';amount.setAttribute('aria-label','报价黄金');middle.append(target,amount);
    const offer=warButton(`报价 (${negotiation.count}/2)`,()=>action('neutral-action',{choice:'offer',targetId:target.value,amount:Number(amount.value)}));offer.disabled=negotiation.count>=2||state.self.gold<1;
    middle.append(offer,warButton('撤退',()=>action('neutral-action',{choice:'withdraw'})),warButton('结束谈判',()=>action('neutral-action',{choice:'pass'})));return;
  }
  const units=document.createElement('select');units.setAttribute('aria-label','选择武将');
  state.self.generals.forEach((g,index)=>{const option=document.createElement('option');option.value=index;option.textContent=g.name+(g.remaining>0?'（冷却中）':'');option.disabled=g.remaining>0||(n.phase==='support'&&n.contest?.mains?.some(x=>x.playerId===state.self.id&&x.index===index));units.append(option);});
  const xpLabel=document.createElement('label');xpLabel.textContent='消耗战功';const xp=document.createElement('input');xp.type='number';xp.min='0';xp.step='1';xp.value='0';xp.style.width='48px';xp.setAttribute('aria-label','本次进攻消耗战功');xpLabel.append(xp);units.onchange=()=>{xp.max=String(state.self.generals[Number(units.value)]?.warExperience||0);if(units.value==='none')xp.max='0';xp.value='0';};
  if(n.phase==='main'){
    const list=document.createElement('select');list.setAttribute('aria-label','选择中立资源');resources.forEach(r=>{const o=document.createElement('option');o.value=r.instanceId;o.textContent=r.type==='gold'?`${r.amount} 金`:r.card.name;list.append(o);});middle.append(list,units,xpLabel);units.onchange();
    const yes=warButton('参与',()=>{if(!list.value||!units.value){showEventToast('请选择资源和可出战武将');return;}action('neutral-action',{choice:'main',resourceId:list.value,index:Number(units.value),experience:Number(xp.value)});});const skip=warButton('跳过',()=>action('neutral-action',{choice:'skip'}));middle.append(yes,skip);
  }else{
    const none=document.createElement('option');none.value='none';none.textContent='不派增援';units.prepend(none);units.value='none';middle.append(units,xpLabel);units.onchange();
    const confirm=warButton('确认增援',()=>action('neutral-action',{choice:'support',index:units.value==='none'?null:Number(units.value),experience:Number(xp.value)}));middle.append(confirm);
  }
}
function render(state){
  lastGameState=state;if(state.neutral||(state.neutralResources||[]).length)renderNeutral(state);else renderLastPlayed(state.lastPlayed||[]);
  const eventKey=state.code+'|'+state.event;
  if(state.phase!=='waiting'&&eventKey!==lastEventKey){lastEventKey=eventKey;showEventToast(state.event);}
  const me=state.self; if(me.scoutReport&&me.scoutReport.id!==lastScoutReport){lastScoutReport=me.scoutReport.id;showEventToast(me.scoutReport.message);} $('message').textContent=state.event; $('start').hidden=state.phase!=='waiting'||state.hostId!==me.id; $('endTurn').hidden=state.phase!=='playing'||state.currentPlayerId!==me.id||!!state.pendingChoice||!!state.neutral; const current=state.players.find(p=>p.id===state.currentPlayerId); $('turn').textContent=current?`第 ${state.round} 轮 · ${current.name}的回合`:'等待开始'; const self=$('self');self.replaceChildren();
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
  const canSelect=!state.neutral&&state.phase==='playing'&&((!state.war&&state.currentPlayerId===me.id&&!state.mainActionUsed)||(state.war?.phase==='defense'&&state.war.waitingId===me.id));
  const context=canSelect?me.id+':'+(state.war?.phase||'attack')+':'+me.generals.map(g=>(g.instanceId||g.id)+'/'+(g.remaining||0)).join(','):'';
  if(context!==selectionContext){selectedGenerals.clear();selectedExperience.clear();warTargetId=null;selectionContext=context;}
  if(selectedCardId&&!me.hand.some(c=>c.instanceId===selectedCardId)){selectedCardId=null;selectedCardTarget=null;}
  const chosen=me.hand.find(c=>c.instanceId===selectedCardId);
  const handGeneralTargetMode=!!chosen&&chosen.id==='T04'&&!state.war&&state.currentPlayerId===me.id;
  const targetMode=!!chosen&&['T03','T06','T11','T13','T17','N19','N22','N28'].includes(chosen.id)&&!state.war&&state.currentPlayerId===me.id;
  const enemyGeneralTargetMode=!!chosen&&['N04','N23','N25','N27','N31','N32'].includes(chosen.id)&&!state.war&&state.currentPlayerId===me.id;
  const countryTargetMode=!!chosen&&['T10','T16','N18','N24'].includes(chosen.id)&&!state.war&&state.currentPlayerId===me.id;
  if(countryTargetMode&&chosen.id==='T10'&&me.health>0&&!state.pendingChoice){avatar.classList.add('target-avatar');avatar.tabIndex=0;avatar.setAttribute('role','button');avatar.setAttribute('aria-label','选择自己为卡牌目标');avatar.setAttribute('aria-pressed',String(selectedCardTarget===me.id));if(selectedCardTarget===me.id)avatar.classList.add('target-selected');const chooseSelf=()=>{selectedCardTarget=me.id;render(state);};avatar.onclick=chooseSelf;avatar.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseSelf();}};}
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
    const stats=document.createElement('span');stats.textContent=`攻 ${generalStat(g,'attack')} · 防 ${generalStat(g,'defense')}`;
    const health=document.createElement('span');health.textContent=`生命 ${g.health}/${g.maxHealth}`;
    const cooldown=document.createElement('span');cooldown.textContent=`冷却 ${g.remaining||0}`;
    let clearExperience=null;if((g.warExperience||0)>0&&(g.remaining||0)>0){const clear=document.createElement('button');clear.type='button';clear.className='withdraw-general';clear.textContent='消耗战功清冷却';clear.disabled=!!state.neutral||!!state.pendingChoice||state.phase!=='playing'||state.currentPlayerId!==me.id||!!state.war;clear.onclick=e=>{e.stopPropagation();action('experience-cooldown',{index});};clearExperience=clear;}
    let experienceInput=null;if(canSelect&&(g.warExperience||0)>0&&!(g.remaining>0)){const xp=document.createElement('input');xp.type='number';xp.min='0';xp.max=String(g.warExperience);xp.value=String(selectedExperience.get(index)||0);xp.title=state.war?'本次防御消耗的战功':'本次进攻消耗的战功';xp.setAttribute('aria-label',xp.title);xp.style.width='48px';xp.onclick=e=>e.stopPropagation();xp.onchange=()=>{const value=Number(xp.value);selectedExperience.set(index,Number.isInteger(value)&&value>=0&&value<=g.warExperience?value:0);};const label=document.createElement('label');label.textContent=state.war?'战功防御':'战功进攻';label.append(xp);experienceInput=label;}
    const withdraw=document.createElement('button');withdraw.type='button';withdraw.className='withdraw-general';withdraw.textContent='撤回';withdraw.disabled=!!state.neutral||state.phase!=='playing'||state.currentPlayerId!==me.id||!!state.war||g.remaining>0;withdraw.onclick=e=>{e.stopPropagation();action('withdraw',{index});};item.append(name,stats,health,cooldown);if(experienceInput)item.append(experienceInput);if(clearExperience)item.append(clearExperience);item.append(withdraw);generals.append(item);
  });
  renderHand(me.hand,me.turnsStarted,state);
  cardActions.replaceChildren();
  if(me.scoutReport?.card){const report=warButton('🔎 查看密探情报',()=>showCardDetails(me.scoutReport.card));report.title=me.scoutReport.message;cardActions.append(report);}
  const isConceal=state.war?.phase==='conceal'&&state.war.waitingId===me.id;
  const discarding=state.pendingChoice?.type==='discard'&&state.pendingChoice.playerId===me.id;
  if(state.pendingChoice?.type==='tribute'&&state.pendingChoice.playerId===me.id){const label=document.createElement('span');label.textContent='万国来朝：请选择';cardActions.append(label);const gold=warButton('失去 2 金',()=>action('bonus-choice',{choice:'gold'})),health=warButton('失去 2 生命',()=>action('bonus-choice',{choice:'health'}));gold.className='card-confirm';health.className='card-confirm';health.disabled=me.health<=2;cardActions.append(gold,health);}
  else if(state.pendingChoice?.type==='permanent-bonus'&&state.pendingChoice.playerId===me.id){const label=document.createElement('span');label.textContent='军功簿：'+state.pendingChoice.generalName+'选择永久增益';cardActions.append(label);for(const [attribute,name] of [['attack','攻击 +1'],['defense','防御 +1']]){const b=warButton(name,()=>action('bonus-choice',{attribute}));b.className='card-confirm';cardActions.append(b);}}
  else if(discarding){const label=document.createElement('span');label.textContent=chosen?`弃置：${chosen.name}`:'策令：请选择一张手牌弃置';cardActions.append(label);const button=warButton('确认弃牌',()=>{if(!chosen){showEventToast('请选择一张手牌');return;}const id=chosen.instanceId;selectedCardId=null;selectedCardTarget=null;action('discard-choice',{instanceId:id});});button.className='card-confirm';cardActions.append(button);}
  else if(!state.neutral&&!state.pendingChoice&&(isConceal||(!state.war&&state.phase==='playing'&&state.currentPlayerId===me.id))){
    const label=document.createElement('span');label.textContent=chosen?(handGeneralTargetMode?(selectedCardTarget===null?'请选择手牌中冷却的武将':`目标：${me.hand.find(c=>c.instanceId===selectedCardTarget)?.name||''}`):enemyGeneralTargetMode?(selectedCardTarget===null?'请选择敌方武将':`目标：${state.players.find(p=>p.id===selectedCardTarget.playerId)?.generals[selectedCardTarget.index]?.name||''}`):countryTargetMode?(selectedCardTarget===null?(chosen.id==='T10'?'请选择一名存活玩家':'请选择其他国家'):`目标：${state.players.find(p=>p.id===selectedCardTarget)?.name||''}`):targetMode?(selectedCardTarget===null?'请选择己方武将':`目标：${me.generals[selectedCardTarget]?.name||''}`):`已选：${chosen.name}`):(isConceal?'未选择：可不出牌':'点击手牌选择');cardActions.append(label);
    let effectSelect=null;
    if(chosen?.id==='N31'&&selectedCardTarget!==null){const g=state.players.find(p=>p.id===selectedCardTarget.playerId)?.generals[selectedCardTarget.index];effectSelect=document.createElement('select');effectSelect.setAttribute('aria-label','选择永久增益');(g?.permanentBonuses||[]).forEach(b=>{const option=document.createElement('option');option.value=b.id;option.textContent=(b.attribute==='attack'?'攻击':'防御')+' +1 · '+b.source;effectSelect.append(option);});cardActions.append(effectSelect);}
    if(chosen?.id==='N27'&&selectedCardTarget!==null){const g=state.players.find(p=>p.id===selectedCardTarget.playerId)?.generals[selectedCardTarget.index];effectSelect=document.createElement('select');effectSelect.setAttribute('aria-label','选择要移除的增益');(g?.statuses||[]).forEach(effect=>{if(effect.polarity==='positive'&&effect.removable&&(effect.expires===null||state.round<effect.expires)){const option=document.createElement('option');option.value=effect.id;option.textContent=effect.kind==='attack'?`攻击 +${effect.value}`:`战胜后恢复 ${effect.value} 生命`;effectSelect.append(option);}});cardActions.append(effectSelect);}
    if(['T06','N28'].includes(chosen?.id)&&selectedCardTarget!==null){const g=me.generals[selectedCardTarget];effectSelect=document.createElement('select');effectSelect.setAttribute('aria-label','选择负面状态');(g?.statuses||[]).forEach(effect=>{if(effect.polarity==='negative'&&effect.removable&&(effect.expires===null||state.round<effect.expires)){const option=document.createElement('option');option.value=effect.id;option.textContent=effect.kind==='war_lock'?`${effect.source}：战争封锁`:`${effect.source}：攻击 ${effect.value}`;effectSelect.append(option);}});cardActions.append(effectSelect);}
    const confirm=warButton(isConceal?'确认暗盖':'出牌',()=>{
      if(isConceal){if(chosen?.kind==='general'){$('message').textContent='武将不能暗盖';showEventToast('武将不能暗盖');return;}const id=selectedCardId;selectedCardId=null;selectedCardTarget=null;action('war-respond',{choice:'card',instanceId:id});return;}
      if(!chosen){$('message').textContent='请先选择手牌';showEventToast('请先选择手牌');return;}
      if(chosen.kind==='general'){const index=me.hand.findIndex(c=>c.instanceId===chosen.instanceId);selectedCardId=null;action('deploy',{index});return;}
      if(targetMode&&selectedCardTarget===null){$('message').textContent='请先选择己方武将';showEventToast('请先选择己方武将');return;}
      if(countryTargetMode&&selectedCardTarget===null){const message=chosen.id==='T10'?'请选择一名存活玩家':'请选择其他存活国家';$('message').textContent=message;showEventToast(message);return;}
      if(enemyGeneralTargetMode&&selectedCardTarget===null){showEventToast('请选择敌方武将');return;}
      if(chosen.id==='N31'&&(!effectSelect||!effectSelect.options.length)){showEventToast('该武将没有可移除的永久增益');return;}
      if(chosen.id==='N27'&&(!effectSelect||!effectSelect.options.length)){showEventToast('该武将没有可移除的临时攻击增益');return;}
      if(['T06','N28'].includes(chosen.id)&&(!effectSelect||!effectSelect.options.length)){showEventToast('该武将没有可移除的负面状态');return;}
      if(handGeneralTargetMode&&selectedCardTarget===null){showEventToast('请选择手牌中冷却的武将');return;}
      const targetInstanceId=handGeneralTargetMode?selectedCardTarget:null;
      const effectId=effectSelect?effectSelect.value:null;
      const id=selectedCardId,targetIndex=targetMode?selectedCardTarget:enemyGeneralTargetMode?selectedCardTarget.index:null,targetPlayerId=countryTargetMode?selectedCardTarget:enemyGeneralTargetMode?selectedCardTarget.playerId:null;selectedCardId=null;selectedCardTarget=null;action('play-card',{instanceId:id,targetIndex,targetPlayerId,effectId,targetInstanceId});
    });confirm.className='card-confirm';cardActions.append(confirm);
  }

  renderMarket(me,state.currentPlayerId===me.id&&!state.war&&!state.neutral,state.phase);
  renderWar(state);
  $('opponents').replaceChildren(...state.players.filter(p=>p.id!==me.id).map(player=>{
    const el=document.createElement('div');el.className='player opponent';
    const header=document.createElement('div');header.className='opponent-header';
    const avatar=document.createElement('span');avatar.className='player-avatar';avatar.textContent='😎';
    const canTarget=!state.neutral&&state.phase==='playing'&&!state.war&&state.currentPlayerId===me.id&&(countryTargetMode||!state.mainActionUsed)&&player.health>0;
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
    player.generals.forEach((g,index)=>{const card=document.createElement('div');card.className='general-mini';if(enemyGeneralTargetMode&&player.health>0){card.classList.add('selectable-general');card.tabIndex=0;card.setAttribute('role','button');if(selectedCardTarget?.playerId===player.id&&selectedCardTarget?.index===index)card.classList.add('general-selected');const choose=()=>{selectedCardTarget={playerId:player.id,index};render(state);};card.onclick=choose;card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}};}card.title='右键查看技能';card.oncontextmenu=e=>{e.preventDefault();showCardDetails(g);};const title=document.createElement('strong');title.textContent=g.name;const stats=document.createElement('span');stats.textContent=`攻 ${generalStat(g,'attack')} · 防 ${generalStat(g,'defense')}`;const hp=document.createElement('span');hp.textContent=`生命 ${g.health}/${g.maxHealth}`;const cooldown=document.createElement('span');cooldown.textContent=`冷却 ${g.remaining||0}`;card.append(title,stats,hp,cooldown);generals.append(card);});
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
 try{const result=await post('/api/end-turn',localGame.players[previous]);const next=result.players.findIndex(p=>p.id===(result.neutral?.waitingId||result.currentPlayerId));if(next<0)throw Error('无法找到下一位玩家');localGame.index=next;saveLocal();showHandoff();}catch(e){localGame.index=previous;saveLocal();showHandoff();$('handoffName').textContent=localGame.players[previous].name+'（切换失败：'+e.message+'）';}finally{switching=false;$('endTurn').disabled=false;$('handoffReveal').disabled=false;}}
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
