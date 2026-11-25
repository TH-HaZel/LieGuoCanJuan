'use strict';
const {seatDistance,calculateBattle,pursuitDamage,generalAfterDefeat}=require('./combat');
const {generals}=require('./deck');
const statuses=require('./statuses');
const permanentBonuses=require('./permanentBonuses');
const generalSkills=require('./generalSkills');
const tianyi=require('./tianyi');
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
  room.mainActionUsed=true;room.war={attackerExperience:experience,attackerId:player.id,defenderId:target.id,attackerIndices:[...body.indices],phase:'negotiation',waitingId:target.id,offers:0};room.event=`${player.name}向${target.name}宣战，等待防守方回应。`;
}
function beginTianyi(room,w,a,d) {
  const requests=[];
  for(const [owner,own,enemy] of [[a,w.attackerIndices,w.defenderIndices],[d,w.defenderIndices,w.attackerIndices]]) {
    if(!enemy.length)continue;
    for(const index of own) {const g=owner.generals[index];if(g?.id==='G05'&&g.health>0)requests.push({ownerId:owner.id,index});}
  }
  w.tianyiRequests=requests;w.tianyiChoices=[];
  if(requests.length){w.phase='tianyi';w.waitingId=requests[0].ownerId;room.event='等待裴行俭选择天意目标。';}
  else {w.phase='conceal';w.waitingId=a.id;w.selections={};room.event='双方依次暗盖战争牌，全部确认后揭示。';}
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
    beginTianyi(room,w,a,d);return;
  }
  if(w.phase==='tianyi'){
    const request=w.tianyiRequests[w.tianyiChoices.length];
    const enemyIndices=player.id===a.id?w.defenderIndices:w.attackerIndices;
    if(body.choice!=='target'||(body.targetIndex!==null&&(!Number.isInteger(body.targetIndex)||!enemyIndices.includes(body.targetIndex))))throw Error('请选择对方参战武将或放弃天意');
    w.tianyiChoices.push({ownerId:player.id,index:request.index,targetIndex:body.targetIndex});
    if(w.tianyiChoices.length<w.tianyiRequests.length){w.waitingId=w.tianyiRequests[w.tianyiChoices.length].ownerId;room.event='等待裴行俭选择天意目标。';}
    else {w.phase='conceal';w.waitingId=a.id;w.selections={};room.event='双方依次暗盖战争牌，全部确认后揭示。';}
    return;
  }
  if(w.phase==='conceal'){
    if(body.choice!=='card')throw Error('请选择暗盖牌或不出牌');
    const id=body.instanceId;
    if(id!==null&&typeof id!=='string')throw Error('无效的卡牌');
    const card=id===null?null:player.hand.find(c=>c.instanceId===id);
    const allowed=player.id===a.id?['T05','T08','N01','N02','N05','N06','N07','N13','N29','N30']:['N08','N09','N10','N11','N12','N13','N14','N29','N30'];
    if(id!==null&&(!card||!allowed.includes(card.id)||player.gold<card.cost))throw Error('卡牌不可使用或黄金不足');
    w.selections[player.id]=id;
    if(player.id===a.id){w.waitingId=d.id;room.event='进攻方已确认暗盖，等待防守方。';return;}
    const ac=w.selections[a.id]===null?null:a.hand.find(c=>c.instanceId===w.selections[a.id]);
    const dc=w.selections[d.id]===null?null:d.hand.find(c=>c.instanceId===w.selections[d.id]);
    for(const [owner,c] of [[a,ac],[d,dc]])if(c){owner.gold-=c.cost;owner.hand.splice(owner.hand.indexOf(c),1);owner.discard.push(c);}
    const played=[[a,ac],[d,dc]].filter(([,card])=>card).map(([owner,card])=>({playerName:owner.name,card:{id:card.id,name:card.name,country:card.country,variety:card.variety,cost:card.cost,rarity:card.rarity,description:card.description}}));
    if(played.length)room.lastPlayed=played;
    const revealed=`暗盖揭示：${a.name} ${ac?ac.name:'不出牌'}；${d.name} ${dc?dc.name:'不出牌'}。`;
    const attackGenerals=selected(a,w.attackerIndices),defenseGenerals=w.hardDefense?[]:selected(d,w.defenderIndices);
    spendExperience(a,w.attackerExperience);spendExperience(d,w.defenderExperience);
    for(const g of [...attackGenerals,...defenseGenerals]){const active=statuses.active(g,room.round),shield=active.find(e=>e.kind==='war_immunity'),debuff=active.find(e=>['N04','N23','N25'].includes(e.source)&&e.polarity==='negative');if(shield&&debuff)g.statuses=g.statuses.filter(e=>e.id!==shield.id&&e.id!==debuff.id);}
    const blockedGenerals=new Set([...attackGenerals,...defenseGenerals].filter(g=>statuses.active(g,room.round).some(e=>e.kind==='war_lock')));
    const skillChoices=(w.tianyiChoices||[]).filter(choice=>choice.targetIndex!==null).map(choice=>{
      const owner=byId(room,choice.ownerId),enemy=owner===a?d:a;
      return {source:owner.generals[choice.index],target:enemy.generals[choice.targetIndex]};
    });
    tianyi.resolve(skillChoices,blockedGenerals,room.round);
    for(const g of [...attackGenerals,...defenseGenerals]){g.remaining=g.cooldown;g.cooldownStart=room.turnSerial;}
    if((ac?.id==='N29'&&dc?.id!=='N29'&&dc?.id!=='N30')||(dc?.id==='N29'&&ac?.id!=='N29'&&ac?.id!=='N30')){
      const victim=ac?.id==='N29'?d:a,team=ac?.id==='N29'?defenseGenerals:attackGenerals;
      for(const g of team)defeat(victim,g);
      const winner=ac?.id==='N29'?a:d;winner.gold+=(winner.warIncome||0)*5;a.warIncome=0;d.warIncome=0;
      const choices=[];for(const [owner,units] of [[a,attackGenerals],[d,defenseGenerals]])for(const g of units){const effects=statuses.active(g,room.round),healing=effects.filter(e=>e.kind==='heal_on_win').reduce((sum,e)=>sum+e.value,0),cooldown=effects.filter(e=>e.kind==='cooldown_after_battle').reduce((sum,e)=>sum+e.value,0);if(healing&&owner===winner&&g.health>0)g.health=Math.min(g.maxHealth,g.health+healing);if(cooldown)g.remaining=Math.max(0,g.remaining-cooldown);for(const effect of effects)if(effect.kind==='permanent_after_war'&&owner.generals.includes(g))choices.push({type:'permanent-bonus',playerId:owner.id,general:g});g.statuses=effects.filter(e=>!['attack','defense','heal_on_win','cooldown_after_battle','war_lock','permanent_after_war'].includes(e.kind));}if(choices.length){room.pendingBonuses=choices;room.pendingChoice=choices[0];}
      room.event=revealed+'鸣金收兵生效，对方参战武将战败，战争结束。';room.war=null;return;
    }
    const distance=seatDistance(room.players.filter(p=>p.health>0).map(p=>p.id),a.id,d.id);
    const penalty=ac?.id==='N07'?0:Math.max(0,(ac?.id==='T05'?0:distance-1)-(ac?.id==='N02'?1:0))+(dc?.id==='N11'?2:0);
    const baseAttack=gs=>gs.reduce((sum,g)=>sum+(generals.find(base=>base.id===g.id)?.attack??0),0);
    const n06Bonus=ac?.id==='N06'?1+(defenseGenerals.length&&baseAttack(attackGenerals)<baseAttack(defenseGenerals)?2:0):0;
    const attackCardBonus=n06Bonus+(ac?.id==='T08'?1:ac?.id==='N02'?1:ac?.id==='N05'?2:ac?.id==='N07'?3:ac?.id==='N01'?2:0);
    const attackStats=attackGenerals.map((g,i)=>({...g,attack:g.attack+(w.attackerExperience[w.attackerIndices[i]]||0)+statuses.active(g,room.round).filter(e=>e.kind==='attack').reduce((sum,e)=>sum+(e.value>0&&statuses.active(g,room.round).some(s=>s.kind==='war_lock')?0:e.value>0&&dc?.id==='N13'?Math.max(0,e.value-1):e.value),0)}));
    const attack=teamPower(attackStats,'attack')+Math.max(0,attackCardBonus-(dc?.id==='N13'?1:0))-(dc?.id==='N12'?2:0);
    const defenseStats=defenseGenerals.map((g,i)=>({...g,defense:g.defense+(w.defenderExperience[w.defenderIndices[i]]||0)+statuses.active(g,room.round).filter(e=>e.kind==='defense').reduce((sum,e)=>sum+e.value,0)}));
    const defenseMultiplier=generalSkills.hasDefenseDoubler(defenseGenerals,blockedGenerals)?2:1;
    const defense=(w.hardDefense?d.health+d.defense:teamPower(defenseStats,'defense',defenseMultiplier))+(dc?.id==='N08'?3:dc?.id==='N09'?2:dc?.id==='N10'?5:dc?.id==='N14'?(d.health<=15?3:1):0);
    const attackAfterAlliance=allianceFlow.penalty(a,room.round)?Math.max(0,attack-penalty-1)+penalty:attack;
    const defenseAfterAlliance=allianceFlow.penalty(d,room.round)&&defense>0?Math.max(0,defense-1):defense;
    const result=calculateBattle({attack:attackAfterAlliance,defense:defenseAfterAlliance,distance:penalty+1,hardDefense:w.hardDefense});
    const attackerDamageBoost=generalSkills.hasDamageBoost(attackGenerals,blockedGenerals);
    w.defenderDamageBoost=generalSkills.hasDamageBoost(defenseGenerals,blockedGenerals);
    result.defenderDamage=generalSkills.boostDamage(result.defenderDamage,attackerDamageBoost);
    w.result=result;
    for(const [team,side] of [[attackGenerals,'attacker'],[defenseGenerals,'defender']])for(const g of team){const effects=statuses.active(g,room.round);const healing=effects.filter(e=>e.kind==='heal_on_win').reduce((sum,e)=>sum+e.value,0);if(healing&&result.winner===side&&g.health>0)g.health=Math.min(g.maxHealth,g.health+healing);const cooldown=effects.filter(e=>e.kind==='cooldown_after_battle').reduce((sum,e)=>sum+e.value,0);if(cooldown)g.remaining=Math.max(0,g.remaining-cooldown);g.statuses=effects.filter(e=>!['attack','defense','heal_on_win','cooldown_after_battle','war_lock'].includes(e.kind));}
    for(const [owner,side] of [[a,'attacker'],[d,'defender']]){if(result.winner===side)owner.gold+=(owner.warIncome||0)*5;owner.warIncome=0;}
    if(ac?.id==='N05'&&result.winner==='attacker')a.gold+=2;
    if(dc?.id==='N09'&&result.winner==='defender')d.gold+=2;
    if(result.attackerGeneralDefeated)for(const g of attackGenerals)defeat(a,g);
    if(ac?.id==='N01'&&result.winner==='defender')for(const g of attackGenerals)if(a.generals.includes(g))defeat(a,g);
    if(result.defenderGeneralDefeated)for(const g of defenseGenerals)defeat(d,g);
    let attackerDamageReduction=false,defenderDamageReduction=false;
    for(const [owner,team,side] of [[a,attackGenerals,'attacker'],[d,defenseGenerals,'defender']])for(const g of team){
      const outcome=result.winner==='draw'?'draw':result.winner===side?'win':'loss';
      const triggered=generalSkills.afterBattle(owner,g,blockedGenerals.has(g),outcome);
      if(g.id==='G06'&&outcome==='loss'&&triggered){if(side==='attacker')attackerDamageReduction=true;else defenderDamageReduction=true;}
    }
    w.attackerDamageReduction=attackerDamageReduction;
    if(defenderDamageReduction)result.defenderDamage=Math.floor(result.defenderDamage/2);
    d.health-=result.defenderDamage;room.event=revealed+`战争结算：进攻 ${result.attackPower}，防守 ${result.defensePower}；${d.name}损失 ${result.defenderDamage} 生命。`;
    const eliminated=d.health<=0;if(eliminated){finishElimination(room,d,a);room.war=null;}
    const choices=[];for(const [owner,team] of [[a,attackGenerals],[d,defenseGenerals]])for(const g of team){const effects=(g.statuses||[]).filter(e=>e.kind==='permanent_after_war');g.statuses=(g.statuses||[]).filter(e=>e.kind!=='permanent_after_war');if(room.phase==='playing'&&owner.health>0&&owner.generals.includes(g))for(const effect of effects)choices.push({type:'permanent-bonus',playerId:owner.id,general:g});}if(choices.length){room.pendingBonuses=choices;room.pendingChoice=choices[0];}if(eliminated)return;
    if(result.canPursueOrClaim){w.phase='aftermath';w.waitingId=d.id;}else room.war=null;return;
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
function finishElimination(room,loser,winner){loser.health=0;room.alliances=alliances.prune(room.alliances||[],room.players.filter(p=>p.health>0).map(p=>p.id));winner.gold+=Math.floor(Math.max(0,loser.gold)*0.3);loser.gold=0;room.event+=` ${loser.name}灭亡。`;const alive=room.players.filter(p=>p.health>0);if(alive.length===1){room.phase='finished';room.event+=` ${alive[0].name}获胜。`;}}
function viewWar(room,player){const w=room.war;if(!w)return null;const result={phase:w.phase,attackerId:w.attackerId,defenderId:w.defenderId,waitingId:w.waitingId,offers:w.offers};if(w.phase==='offer_response'||w.phase==='claim_response')result.amount=w.amount;if(w.result)result.result=w.result;if(player.id===w.attackerId)result.attackerIndices=w.attackerIndices;if(w.phase==='tianyi'&&w.waitingId===player.id){const enemy=byId(room,player.id===w.attackerId?w.defenderId:w.attackerId),indices=player.id===w.attackerId?w.defenderIndices:w.attackerIndices;result.tianyiOptions=indices.map(index=>({index,name:enemy.generals[index].name}));}return result;}
module.exports={startWar,respondWar,viewWar};
