'use strict';
const {seatDistance,calculateBattle,pursuitDamage,generalAfterDefeat}=require('./combat');
const {generals,cards}=require('./deck');
const statuses=require('./statuses');
const {cardPrice}=require('./prices');
const permanentBonuses=require('./permanentBonuses');
const generalSkills=require('./generalSkills');
const tianyi=require('./tianyi');
const support=require('./warSupport');
const effectResolution=require('./effectResolution');
const neutral=require('./neutral');
const allianceFlow=require('./allianceFlow');
const alliances=require('./alliances');
function byId(room,id){return room.players.find(p=>p.id===id);}
function eligible(g){return g && !(g.remaining>0);}
function selected(player,indices){
  if(!Array.isArray(indices)||indices.length<1||indices.length>5||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||!eligible(player.generals[i])))throw Error('请选择一至五名不同的可出战武将');
  return indices.map(i=>player.generals[i]);
}
function validateExperience(player,indices,input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('战争经验选择无效');
  for(const [key,value] of Object.entries(input)){
    const index=Number(key),g=player.generals[index];
    if(!Number.isInteger(index)||String(index)!==key||!indices.includes(index)||!Number.isSafeInteger(value)||value<0||value>(g.warExperience||0))throw Error('战争经验选择无效');
  }
  return Object.fromEntries(Object.entries(input).filter(([,v])=>v>0));
}
function spendExperience(player,choice){for(const [index,count] of Object.entries(choice||{}))player.generals[Number(index)].warExperience-=count;}
function teamPower(generals,attribute,multiplier=1){return Math.max(0,generals.reduce((sum,g)=>sum+Math.max(0,g[attribute]+permanentBonuses.total(g,attribute)-permanentBonuses.penalty(g,attribute))*multiplier,0)-generals.length*(generals.length-1)/2);}
function startWar(room,player,body){
  if(room.neutralRound)throw Error('中立资源争夺进行中');
  if(room.pendingChoice)throw Error('请先完成弃牌');
  if(room.phase!=='playing'||room.players[room.turnIndex].id!==player.id)throw Error('只能在自己的回合宣战');
  if(room.war)throw Error('战争尚未结束');if(room.mainActionUsed)throw Error('本回合已使用主要行动');
  const target=byId(room,body.targetId);if(!target||target===player||target.health<=0)throw Error('目标无效');
  selected(player,body.indices);
  const experience=validateExperience(player,body.indices,body.experience);
  const group=(room.alliances||[]).find(g=>g.includes(player.id)&&g.includes(target.id));
  const betrayal=!!group,previousBetrayal=!!player.militaryBetrayalPending;
  if(betrayal){room.alliances=room.alliances.map(g=>g===group?g.filter(id=>id!==player.id):g).filter(g=>g.length>1);player.gold-=10;player.betrayalAllianceUntil=room.round+2;player.militaryBetrayalPending=true;}
  room.mainActionUsed=true;room.war={betrayal,previousBetrayal,attackerExperience:experience,attackerId:player.id,defenderId:target.id,attackerIndices:[...body.indices],phase:'negotiation',waitingId:target.id,offers:0};room.event=`${player.name}向${target.name}宣战${betrayal?'，背叛同盟并失去 10 金':''}，等待防守方回应。`;
}
function beginSupport(room,w,a,d){
 w.supports={};w.supportTurn=0;advanceSupport(room,w,a,d);
}
function advanceSupport(room,w,a,d){
 const sides=[a,d];
 while(w.supportTurn<2){const side=sides[w.supportTurn],enemy=sides[1-w.supportTurn];if(side===d&&w.hardDefense){w.supportTurn++;continue;}const options=support.candidates(room,side.id,enemy.id).filter(p=>p.id!==w.supports[enemy.id]?.playerId);if(!options.length){w.supportTurn++;continue;}w.phase='support_request';w.waitingId=side.id;room.event='等待战争方选择是否请求盟友增援。';return;}
 beginTianyi(room,w,a,d);
}
function participants(w,sideId){
 const indices=sideId===w.attackerId?w.attackerIndices:w.defenderIndices;
 const entries=indices.map(index=>({playerId:sideId,index}));
 if(w.supports?.[sideId])entries.push(w.supports[sideId]);
 return entries;
}
function beginTianyi(room,w,a,d) {
 const requests=[];
 for(const side of [a,d]){const enemy=side===a?d:a;if(!participants(w,enemy.id).length)continue;for(const entry of participants(w,side.id)){const g=byId(room,entry.playerId).generals[entry.index];if(g?.id==='G05'&&g.health>0)requests.push({...entry,ownerId:entry.playerId,sideId:side.id});}}
 w.tianyiRequests=requests;w.tianyiChoices=[];
 const disclosed=Object.entries(w.supports||{}).map(([sideId,x])=>`${byId(room,sideId).name}的援军：${byId(room,x.playerId).generals[x.index].name}`);
 w.supportReveal=disclosed.length?disclosed.join('；'):'双方均无盟友援军';
 if(requests.length){w.phase='tianyi';w.waitingId=requests[0].ownerId;room.event=w.supportReveal+'；等待裴行俭选择天意目标。';}
 else {w.phase='conceal';w.waitingId=a.id;w.selections={};room.event=w.supportReveal+'；双方依次暗盖战争牌，全部确认后揭示。';}
}
function resolveAfterBattle(room,w,a,d,ctx,postEffects){
  const {result,attackGenerals,defenseGenerals,attackSupport,defenseSupport,blockedGenerals,revealed}=ctx;
    let attackerDamageReduction=false,defenderDamageReduction=false;
    for(const [owner,team,side] of [[a,attackGenerals,'attacker'],[d,defenseGenerals,'defender']])for(const g of team){
      const outcome=result.winner==='draw'?'draw':result.winner===side?'win':'loss';
      const triggered=generalSkills.afterBattle(owner,g,blockedGenerals.has(g),outcome,{effects:postEffects.filter(e=>e.choice.source===g)});
      if(g.id==='G06'&&outcome==='loss'&&triggered){if(side==='attacker')attackerDamageReduction=true;else defenderDamageReduction=true;}
    }
    for(const [g,side] of [[attackSupport,'attacker'],[defenseSupport,'defender']])if(g){
      const owner=byId(room,w.supports[side==='attacker'?a.id:d.id].playerId);
      const outcome=result.winner==='draw'?'draw':result.winner===side?'win':'loss';
      const triggered=generalSkills.afterBattle(owner,g,blockedGenerals.has(g),outcome,{neutralSupport:true,effects:postEffects.filter(e=>e.choice.source===g)});
      if(g.id==='G06'&&outcome==='loss'&&triggered){if(side==='attacker')attackerDamageReduction=true;else defenderDamageReduction=true;}
      const effects=statuses.active(g,room.round);const healing=effects.filter(e=>e.kind==='heal_on_win').reduce((sum,e)=>sum+e.value,0);if(healing&&outcome==='win'&&g.health>0)g.health=Math.min(g.maxHealth,g.health+healing);const cooldown=effects.filter(e=>e.kind==='cooldown_after_battle').reduce((sum,e)=>sum+e.value,0);if(cooldown)g.remaining=Math.max(0,g.remaining-cooldown);g.statuses=effects.filter(e=>!['attack','defense','heal_on_win','cooldown_after_battle','war_lock'].includes(e.kind));
    }
    w.attackerDamageReduction=attackerDamageReduction;
    if(defenderDamageReduction)result.defenderDamage=Math.floor(result.defenderDamage/2);
    d.health-=result.defenderDamage;room.event=revealed+`战争结算：进攻 ${result.attackPower}，防守 ${result.defensePower}；${d.name}损失 ${result.defenderDamage} 生命。`;
    const eliminated=d.health<=0;if(eliminated){finishElimination(room,d,a);room.war=null;}
    const choices=[];for(const [owner,team] of [[a,attackGenerals],[d,defenseGenerals],...[attackSupport?[byId(room,w.supports[a.id].playerId),[attackSupport]]:null,defenseSupport?[byId(room,w.supports[d.id].playerId),[defenseSupport]]:null].filter(Boolean)])for(const g of team){const effects=(g.statuses||[]).filter(e=>e.kind==='permanent_after_war');g.statuses=(g.statuses||[]).filter(e=>e.kind!=='permanent_after_war');if(room.phase==='playing'&&owner.health>0&&owner.generals.includes(g))for(const effect of effects)choices.push({type:'permanent-bonus',playerId:owner.id,general:g});}if(choices.length){room.pendingBonuses=choices;room.pendingChoice=choices[0];}if(eliminated)return;
    if(result.canPursueOrClaim){w.phase='aftermath';w.waitingId=d.id;}else room.war=null;return;
}
function resolveConcealed(room,w,a,d){
    const ac=w.selections[a.id]===null?null:a.hand.find(c=>c.instanceId===w.selections[a.id]);
    const dc=w.selections[d.id]===null?null:d.hand.find(c=>c.instanceId===w.selections[d.id]);
    for(const [owner,c] of [[a,ac],[d,dc]])if(c){owner.gold-=cardPrice(owner,c);owner.hand.splice(owner.hand.indexOf(c),1);owner.discard.push(c);}
    const played=[[a,ac],[d,dc]].filter(([,card])=>card).map(([owner,card])=>({playerName:owner.name,card:{id:card.id,name:card.name,country:card.country,variety:card.variety,cost:card.cost,rarity:card.rarity,description:card.description}}));
    if(played.length)room.lastPlayed=played;w.revealedCards=[[a,ac],[d,dc]].map(([owner,card])=>({playerId:owner.id,name:card?.name||'不出牌'}));
    const revealed=`暗盖揭示：${a.name} ${ac?ac.name:'不出牌'}；${d.name} ${dc?dc.name:'不出牌'}。`;
    const attackGenerals=selected(a,w.attackerIndices),defenseGenerals=w.hardDefense?[]:selected(d,w.defenderIndices);
    const attackSupport=w.supports?.[a.id]?byId(room,w.supports[a.id].playerId).generals[w.supports[a.id].index]:null,defenseSupport=w.supports?.[d.id]?byId(room,w.supports[d.id].playerId).generals[w.supports[d.id].index]:null;
    spendExperience(a,w.attackerExperience);spendExperience(d,w.defenderExperience);
    for(const g of [...attackGenerals,...defenseGenerals,...[attackSupport,defenseSupport].filter(Boolean)]){const active=statuses.active(g,room.round),shield=active.find(e=>e.kind==='war_immunity'),debuff=active.find(e=>['N04','N23','N25'].includes(e.source)&&e.polarity==='negative');if(shield&&debuff)g.statuses=g.statuses.filter(e=>e.id!==shield.id&&e.id!==debuff.id);}
    const blockedGenerals=new Set([...attackGenerals,...defenseGenerals,...[attackSupport,defenseSupport].filter(Boolean)].filter(g=>statuses.active(g,room.round).some(e=>e.kind==='war_lock')));
    const {effects,skillEffects}=w.resolvedEffects;w.resolvedEffects=null;
    const enabled=(owner,card,key)=>!!card&&effectResolution.enabled(effects,owner.id,card.id,key);
    tianyi.resolve(skillEffects.filter(e=>!e.cancelled).map(e=>e.choice),blockedGenerals,room.round);
    for(const effect of effects)if(['defenseBoost','damageBoost'].includes(effect.key)&&effect.cancelled)blockedGenerals.add(effect.choice.source);
    for(const g of [...attackGenerals,...defenseGenerals,...[attackSupport,defenseSupport].filter(Boolean)]){g.remaining=g.cooldown;g.cooldownStart=room.turnSerial;}
    const clears=effects.filter(e=>e.tags.includes('CLEAR'));
    const clear=clears.length===1&&!clears[0].cancelled?clears[0]:null;
    if(clear){
      a.militaryBetrayalPending=!!w.betrayal;d.militaryBetrayalPending=false;for(const x of Object.values(w.supports||{}))byId(room,x.playerId).militaryBetrayalPending=false;
      const victim=clear.ownerId===a.id?d:a,team=clear.ownerId===a.id?defenseGenerals:attackGenerals;
      for(const g of team)defeat(victim,g);
      const winner=clear.ownerId===a.id?a:d;winner.gold+=(winner.warIncome||0)*5;a.warIncome=0;d.warIncome=0;
      const choices=[];for(const [owner,units] of [[a,attackGenerals],[d,defenseGenerals],...[attackSupport?[byId(room,w.supports[a.id].playerId),[attackSupport]]:null,defenseSupport?[byId(room,w.supports[d.id].playerId),[defenseSupport]]:null].filter(Boolean)])for(const g of units){const effects=statuses.active(g,room.round),healing=effects.filter(e=>e.kind==='heal_on_win').reduce((sum,e)=>sum+e.value,0),cooldown=effects.filter(e=>e.kind==='cooldown_after_battle').reduce((sum,e)=>sum+e.value,0);if(healing&&(owner===winner||owner.id===w.supports[winner.id]?.playerId)&&g.health>0)g.health=Math.min(g.maxHealth,g.health+healing);if(cooldown)g.remaining=Math.max(0,g.remaining-cooldown);for(const effect of effects)if(effect.kind==='permanent_after_war'&&owner.generals.includes(g))choices.push({type:'permanent-bonus',playerId:owner.id,general:g});g.statuses=effects.filter(e=>!['attack','defense','heal_on_win','cooldown_after_battle','war_lock','permanent_after_war'].includes(e.kind));}if(choices.length){room.pendingBonuses=choices;room.pendingChoice=choices[0];}
      room.event=revealed+'鸣金收兵生效，对方参战武将战败，战争结束。';room.war=null;return;
    }
    const distance=seatDistance(room.players.filter(p=>p.health>0).map(p=>p.id),a.id,d.id);
    const penalty=ac?.id==='N07'&&enabled(a,ac,'distance')?0:Math.max(0,(ac?.id==='T05'&&enabled(a,ac,'distance')?0:distance-1)-(ac?.id==='N02'&&enabled(a,ac,'distance')?1:0))+(dc?.id==='N11'&&enabled(d,dc,'distance')?2:0);
    const baseAttack=gs=>gs.reduce((sum,g)=>sum+(generals.find(base=>base.id===g.id)?.attack??0),0);
    const n06Bonus=ac?.id==='N06'?(enabled(a,ac,'attack')?1:0)+(enabled(a,ac,'conditionalAttack')&&defenseGenerals.length&&baseAttack(attackGenerals)<baseAttack(defenseGenerals)?2:0):0;
    const attackCardBonus=n06Bonus+(enabled(a,ac,'attack')?(ac?.id==='T08'?1:ac?.id==='N02'?1:ac?.id==='N05'?2:ac?.id==='N07'?3:ac?.id==='N01'?2:0):0);
    const attackStats=attackGenerals.map((g,i)=>({...g,attack:g.attack+(w.attackerExperience[w.attackerIndices[i]]||0)+statuses.active(g,room.round).filter(e=>e.kind==='attack').reduce((sum,e)=>sum+(e.value>0&&statuses.active(g,room.round).some(s=>s.kind==='war_lock')?0:e.value>0&&dc?.id==='N13'&&enabled(d,dc,'attackReduction')?Math.max(0,e.value-1):e.value),0)}));
    const attack=teamPower(attackStats,'attack')+Math.max(0,attackCardBonus-(dc?.id==='N13'&&enabled(d,dc,'attackReduction')?1:0))-(dc?.id==='N12'&&enabled(d,dc,'attackPenalty')?2:0);
    const defenseStats=defenseGenerals.map((g,i)=>({...g,defense:g.defense+(w.defenderExperience[w.defenderIndices[i]]||0)+statuses.active(g,room.round).filter(e=>e.kind==='defense').reduce((sum,e)=>sum+e.value,0)}));
    const defenseMultiplier=generalSkills.hasDefenseDoubler([...defenseGenerals,...[defenseSupport].filter(Boolean)],blockedGenerals)?2:1;
    const defense=(w.hardDefense?d.defense:teamPower(defenseStats,'defense',defenseMultiplier))+(enabled(d,dc,'defense')?(dc?.id==='N08'?3:dc?.id==='N09'?2:dc?.id==='N10'?5:dc?.id==='N14'?(d.health<=15?3:1):0):0);
    const attackerSupportPower=attackSupport?support.power(attackSupport,'attack',room.round,{weather:dc?.id==='N13'&&enabled(d,dc,'attackReduction')}):0;
    const defenderSupportPower=defenseSupport?support.power(defenseSupport,'defense',room.round,{multiplier:defenseMultiplier}):0;
    const attackerAlly=attackSupport?byId(room,w.supports[a.id].playerId):null,defenderAlly=defenseSupport?byId(room,w.supports[d.id].playerId):null;
    const attackPenalty=allianceFlow.penalty(a,room.round)+((w.betrayal?w.previousBetrayal:a.militaryBetrayalPending)?2:0)+(attackerAlly?.militaryBetrayalPending?2:0);
    const attackAfterAlliance=attackPenalty?Math.max(0,attack+attackerSupportPower-penalty-attackPenalty)+penalty:attack+attackerSupportPower;
    const defensePenalty=allianceFlow.penalty(d,room.round)+(d.militaryBetrayalPending?2:0)+(defenderAlly?.militaryBetrayalPending?2:0);
    const defenseAfterAlliance=Math.max(0,defense+defenderSupportPower-defensePenalty);
    a.militaryBetrayalPending=!!w.betrayal;d.militaryBetrayalPending=false;if(attackerAlly)attackerAlly.militaryBetrayalPending=false;if(defenderAlly)defenderAlly.militaryBetrayalPending=false;
    const result=calculateBattle({attack:attackAfterAlliance,defense:defenseAfterAlliance,distance:penalty+1,hardDefense:w.hardDefense});
    const attackerDamageBoost=generalSkills.hasDamageBoost([...attackGenerals,...[attackSupport].filter(Boolean)],blockedGenerals);
    w.defenderDamageBoost=generalSkills.hasDamageBoost([...defenseGenerals,...[defenseSupport].filter(Boolean)],blockedGenerals);
    result.defenderDamage=generalSkills.boostDamage(result.defenderDamage,attackerDamageBoost);
    w.result=result;
    for(const [team,side] of [[attackGenerals,'attacker'],[defenseGenerals,'defender']])for(const g of team){const effects=statuses.active(g,room.round);const healing=effects.filter(e=>e.kind==='heal_on_win').reduce((sum,e)=>sum+e.value,0);if(healing&&result.winner===side&&g.health>0)g.health=Math.min(g.maxHealth,g.health+healing);const cooldown=effects.filter(e=>e.kind==='cooldown_after_battle').reduce((sum,e)=>sum+e.value,0);if(cooldown)g.remaining=Math.max(0,g.remaining-cooldown);g.statuses=effects.filter(e=>!['attack','defense','heal_on_win','cooldown_after_battle','war_lock'].includes(e.kind));}
    for(const [owner,side] of [[a,'attacker'],[d,'defender']]){if(result.winner===side)owner.gold+=(owner.warIncome||0)*5;owner.warIncome=0;}
    if(ac?.id==='N05'&&enabled(a,ac,'winGold')&&result.winner==='attacker')a.gold+=2;
    if(dc?.id==='N09'&&enabled(d,dc,'winGold')&&result.winner==='defender')d.gold+=2;
    if(result.attackerGeneralDefeated)for(const g of attackGenerals)defeat(a,g);
    if(ac?.id==='N01'&&enabled(a,ac,'defeatDamage')&&result.winner==='defender')for(const g of attackGenerals)if(a.generals.includes(g))defeat(a,g);
    if(result.defenderGeneralDefeated)for(const g of defenseGenerals)defeat(d,g);
    const context={result,attackGenerals,defenseGenerals,attackSupport,defenseSupport,blockedGenerals,revealed};
    const groups=[[a,attackGenerals,'attacker'],[d,defenseGenerals,'defender'],...[attackSupport?[byId(room,w.supports[a.id].playerId),[attackSupport],'attacker']:null,defenseSupport?[byId(room,w.supports[d.id].playerId),[defenseSupport],'defender']:null].filter(Boolean)];
    const postEffects=[];
    for(const [owner,team,side] of groups)for(const g of team){
      if(!owner.generals.includes(g)||g.health<=0||blockedGenerals.has(g))continue;
      const outcome=result.winner==='draw'?'draw':result.winner===side?'win':'loss';
      const isSupport=g===attackSupport||g===defenseSupport;
      const keys=g.id==='G02'?(outcome==='win'?['winAttack']:outcome==='loss'?['lossAttack',...(!isSupport?['lossHealth']:[])]:[]):g.id==='G03'?(outcome==='win'?['winDefense']:outcome==='loss'?['lossAttack','lossDefense']:[]):g.id==='G04'?['attackGrowth','defenseGrowth']:g.id==='G06'&&outcome==='loss'?['lossHealth','damageReduction']:[];
      for(const effect of effectResolution.createGeneral(g,owner.id).filter(e=>keys.includes(e.key)))postEffects.push({...effect,id:`after:${owner.id}:${owner.generals.indexOf(g)}:${effect.key}`,sideId:side==='attacker'?a.id:d.id,counterable:effectResolution.counterable(g.id,effect.key,true),choice:{source:g}});
    }
    const counters=effects.filter(e=>e.tags.includes('COUNTER')&&e.timing==='afterBattle');
    const window={stage:'afterBattle',effects:[...counters,...postEffects],postEffects,context};effectResolution.counter(window.effects);
    const pending=window.effects.find(e=>e.requiresChoice&&!e.counterResolved);
    if(pending){w.counterWindow=window;w.phase='counter-target';w.waitingId=pending.ownerId;room.event='战斗结果已确定，等待选择战后反制目标。';return;}
    return resolveAfterBattle(room,w,a,d,context,postEffects);
}
function respondWar(room,player,body){
  const w=room.war;if(!w||w.waitingId!==player.id)throw Error('当前不是你的战争响应阶段');
  const a=byId(room,w.attackerId),d=byId(room,w.defenderId);
  if(w.phase==='negotiation'){
    if(body.choice==='fight'){w.phase='defense';w.waitingId=d.id;room.event='进入防守选将阶段。';return;}
    if(body.choice!=='offer'||!Number.isSafeInteger(body.amount)||body.amount<0||body.amount>d.gold)throw Error('报价无效或黄金不足');
    w.amount=body.amount;w.offers++;w.phase='offer_response';w.waitingId=a.id;room.event=`${d.name}提出赔偿 ${body.amount} 黄金。`;return;
  }
  if(w.phase==='offer_response'){
    if(body.choice==='accept'){if(d.gold<w.amount)throw Error('防守方黄金不足');d.gold-=w.amount;a.gold+=w.amount;room.war=null;room.event='双方达成战前赔偿，战争取消。';return;}
    if(body.choice!=='reject')throw Error('请选择接受或拒绝');w.phase=w.offers>=3?'defense':'negotiation';w.waitingId=d.id;room.event='进攻方拒绝报价。';return;
  }
  if(w.phase==='defense'){
    const hard=body.choice==='hard';if(!hard&&body.choice!=='general')throw Error('请选择武将或国家硬抗');
    if(!hard)selected(d,body.indices);
    w.defenderIndices=hard?[]:[...body.indices];w.hardDefense=hard;w.defenderExperience=validateExperience(player,w.defenderIndices,body.experience);
    beginSupport(room,w,a,d);return;
  }
  if(w.phase==='support_request'){
    const enemy=player===a?d:a;
    if(body.choice==='skip'){w.supportTurn++;advanceSupport(room,w,a,d);return;}
    const ally=support.candidates(room,player.id,enemy.id).find(p=>p.id===body.targetId&&p.id!==w.supports[enemy.id]?.playerId);
    if(body.choice!=='request'||!ally)throw Error('请选择有效盟友');
    w.supportRequester=player.id;w.supportAlly=ally.id;w.phase='support_reply';w.waitingId=ally.id;room.event=`${player.name}请求${ally.name}增援。`;return;
  }
  if(w.phase==='support_reply'){
    const requester=byId(room,w.supportRequester),choices=support.eligible(player);
    if(body.choice==='refuse'){if(choices.length)support.refuse(room,requester,player);}
    else if(body.choice==='support'&&Number.isInteger(body.index)&&choices.some(x=>x.index===body.index))w.supports[requester.id]={playerId:player.id,index:body.index};
    else throw Error('请选择可增援武将或拒绝');
    w.supportTurn++;advanceSupport(room,w,a,d);return;
  }
  if(w.phase==='tianyi'){
    const request=w.tianyiRequests[w.tianyiChoices.length];
    const enemyId=request.sideId===a.id?d.id:a.id;
    const targetPlayerId=body.targetPlayerId||enemyId;
    if(body.choice!=='target'||(body.targetIndex!==null&&(!Number.isInteger(body.targetIndex)||!participants(w,enemyId).some(x=>x.playerId===targetPlayerId&&x.index===body.targetIndex))))throw Error('请选择对方参战武将或放弃天意');
    w.tianyiChoices.push({ownerId:player.id,index:request.index,targetPlayerId,targetIndex:body.targetIndex});
    if(w.tianyiChoices.length<w.tianyiRequests.length){w.waitingId=w.tianyiRequests[w.tianyiChoices.length].ownerId;room.event='等待裴行俭选择天意目标。';}
    else {w.phase='conceal';w.waitingId=a.id;w.selections={};room.event='双方依次暗盖战争牌，全部确认后揭示。';}
    return;
  }
  if(w.phase==='counter-target'){
    const window=w.counterWindow,action=window.effects.find(e=>e.requiresChoice&&!e.counterResolved);
    if(!action||action.ownerId!==player.id||body.choice!=='counter-target'||!action.legalTargetIds.includes(body.effectId))throw Error('请选择有效反制目标');
    action.targetId=body.effectId;effectResolution.counter(window.effects);const pending=window.effects.find(e=>e.requiresChoice&&!e.counterResolved);
    if(pending){w.waitingId=pending.ownerId;return;}
    w.counterWindow=null;if(window.stage==='afterBattle')return resolveAfterBattle(room,w,a,d,window.context,window.postEffects);w.resolvedEffects=window;return resolveConcealed(room,w,a,d);
  }
  if(w.phase==='conceal'){
    if(body.choice!=='card')throw Error('请选择暗盖牌或不出牌');
    const id=body.instanceId;
    if(id!==null&&typeof id!=='string')throw Error('无效的卡牌');
    const card=id===null?null:player.hand.find(c=>c.instanceId===id);
    const allowed=player.id===a.id?['T05','T08','N01','N02','N05','N06','N07','N13','N29','N30']:['N08','N09','N10','N11','N12','N13','N14','N29','N30'];
    if(id!==null&&(!card||!allowed.includes(card.id)||player.gold<cardPrice(player,card)))throw Error('卡牌不可使用或黄金不足');
    w.selections[player.id]=id;
    if(player.id===a.id){w.waitingId=d.id;room.event='进攻方已确认暗盖，等待防守方。';return;}
    const ac=w.selections[a.id]===null?null:a.hand.find(c=>c.instanceId===w.selections[a.id]);
    const dc=w.selections[d.id]===null?null:d.hand.find(c=>c.instanceId===w.selections[d.id]);
    const cardEffects=[[a,ac],[d,dc]].flatMap(([owner,card])=>effectResolution.createAll(card,owner.id).map(e=>({...e,sideId:owner.id})));
    const selectedChoices=(w.tianyiChoices||[]).filter(c=>c.targetIndex!==null);
    const skillEffects=selectedChoices.map((selection,i)=>{const owner=byId(room,selection.ownerId),enemy=byId(room,selection.targetPlayerId),sideId=selection.ownerId===a.id||w.supports?.[a.id]?.playerId===selection.ownerId?a.id:d.id;return {...effectResolution.create({id:'G05'},selection.ownerId,null,`tianyi:${i}`),sideId,choice:{source:owner.generals[selection.index],target:enemy.generals[selection.targetIndex]}};});
    const passiveEffects=[a,d].flatMap(side=>participants(w,side.id).flatMap(({playerId,index})=>{
      const owner=byId(room,playerId),g=owner.generals[index];if(!g||g.health<=0||!(g.id==='G07'||(g.id==='G08'&&side.id===d.id)))return [];
      const active=statuses.active(g,room.round),shield=active.find(e=>e.kind==='war_immunity'),debuff=active.find(e=>['N04','N23','N25'].includes(e.source)&&e.polarity==='negative');
      if(active.some(e=>e.kind==='war_lock'&&!(shield&&debuff?.id===e.id)))return [];
      return effectResolution.createGeneral(g,owner.id).filter(e=>['defenseBoost','damageBoost'].includes(e.key)).map(e=>({...e,id:`passive:${playerId}:${index}:${e.key}`,sideId:side.id,counterable:effectResolution.counterable(g.id,e.key,true),choice:{source:g}}));
    }));
    const effects=[...cardEffects,...skillEffects,...passiveEffects];const clears=effects.filter(e=>e.tags.includes('CLEAR'));if(clears.length>1)for(const effect of clears)effect.counterable=false;
    effectResolution.counter(effects.filter(e=>e.timing!=='afterBattle'));
    const pending=effects.find(e=>e.requiresChoice&&!e.counterResolved);
    if(pending){w.counterWindow={effects,skillEffects};w.phase='counter-target';w.waitingId=pending.ownerId;room.event='战争牌已揭示，等待选择反制目标。';return;}
    w.resolvedEffects={effects,skillEffects};return resolveConcealed(room,w,a,d);
  }
  if(w.phase==='aftermath'){
    if(body.choice==='pursue'){let damage=generalSkills.boostDamage(pursuitDamage(w.result.delta),w.defenderDamageBoost);if(w.attackerDamageReduction)damage=Math.floor(damage/2);a.health-=damage;room.event=`${d.name}乘胜追击，${a.name}损失 ${damage} 生命。`;if(a.health<=0)finishElimination(room,a,d);room.war=null;return;}
    if(body.choice!=='claim'||!Number.isSafeInteger(body.amount)||body.amount<0||body.amount>a.gold)throw Error('索赔金额无效或进攻方黄金不足');
    w.amount=body.amount;w.phase='claim_response';w.waitingId=a.id;room.event=`${d.name}要求赔偿 ${w.amount} 黄金。`;return;
  }
  if(w.phase==='claim_response'){
    if(body.choice==='accept'){if(a.gold<w.amount)throw Error('进攻方黄金不足');a.gold-=w.amount;d.gold+=w.amount;room.event='进攻方支付赔偿，战争结束。';}
    else if(body.choice==='reject'){let damage=generalSkills.boostDamage(pursuitDamage(w.result.delta,true),w.defenderDamageBoost);if(w.attackerDamageReduction)damage=Math.floor(damage/2);a.health-=damage;room.event=`进攻方拒绝赔偿，受到 ${damage} 点追击伤害。`;if(a.health<=0)finishElimination(room,a,d);}
    else throw Error('请选择接受或拒绝');room.war=null;return;
  }
  throw Error('战争阶段无效');
}
function defeat(player,g){const result=generalAfterDefeat(g.health);g.health=result.health;if(result.status==='dead')player.generals.splice(player.generals.indexOf(g),1);}
function finishElimination(room,loser,winner){loser.health=0;neutral.recoverEliminated(room.neutralPool,loser);room.alliances=alliances.prune(room.alliances||[],room.players.filter(p=>p.health>0).map(p=>p.id));winner.gold+=Math.floor(Math.max(0,loser.gold)*0.3);loser.gold=0;room.event+=` ${loser.name}灭亡。`;const alive=room.players.filter(p=>p.health>0);if(alive.length===1){room.phase='finished';room.event+=` ${alive[0].name}获胜。`;}}
function viewWar(room,player){const w=room.war;if(!w)return null;const result={phase:w.phase,attackerId:w.attackerId,defenderId:w.defenderId,waitingId:w.waitingId,offers:w.offers};if(w.phase==='offer_response'||w.phase==='claim_response')result.amount=w.amount;if(w.result)result.result=w.result;if(['tianyi','conceal','counter-target','aftermath','claim_response'].includes(w.phase))result.supportReveal=w.supportReveal;if(player.id===w.attackerId)result.attackerIndices=w.attackerIndices;if(w.phase==='counter-target')result.counterRevealed=w.revealedCards||[w.attackerId,w.defenderId].map(id=>({playerId:id,name:byId(room,id).hand.find(c=>c.instanceId===w.selections[id])?.name||'不出牌'}));if(w.phase==='counter-target'&&w.waitingId===player.id){const action=w.counterWindow.effects.find(e=>e.requiresChoice&&!e.counterResolved);result.counterOptions=action.legalTargetIds.map(effectId=>{const effect=w.counterWindow.effects.find(e=>e.id===effectId);return {effectId,ownerName:byId(room,effect.ownerId)?.name||'玩家',sourceId:effect.sourceId,sourceName:generals.find(g=>g.id===effect.sourceId)?.name||cards.find(c=>c.id===effect.sourceId)?.name||effect.sourceId,sourceIndex:effect.choice?byId(room,effect.ownerId).generals.indexOf(effect.choice.source):null,targetName:effect.choice?.target?.name||null,key:effect.key||null};});}if(w.phase==='support_request'&&w.waitingId===player.id)result.supportOptions=support.candidates(room,player.id,player.id===w.attackerId?w.defenderId:w.attackerId).map(p=>({id:p.id,name:p.name}));if(w.phase==='support_reply'&&w.waitingId===player.id)result.supportOptions=support.eligible(player).map(({g,index})=>({index,name:g.name}));if(w.phase==='tianyi'&&w.waitingId===player.id){const request=w.tianyiRequests[w.tianyiChoices.length],enemyId=request.sideId===w.attackerId?w.defenderId:w.attackerId;result.tianyiOptions=participants(w,enemyId).map(({playerId,index})=>({playerId,index,name:byId(room,playerId).generals[index].name}));}return result;}
module.exports={startWar,respondWar,viewWar};
