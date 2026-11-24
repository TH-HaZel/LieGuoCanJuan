'use strict';
const {seatDistance,calculateBattle,pursuitDamage,generalAfterDefeat}=require('./combat');
function byId(room,id){return room.players.find(p=>p.id===id);}
function eligible(g){return g && !(g.remaining>0);}
function selected(player,indices){
  if(!Array.isArray(indices)||indices.length<1||indices.length>5||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||!eligible(player.generals[i])))throw Error('请选择一至五名不同的可出战武将');
  return indices.map(i=>player.generals[i]);
}
function teamPower(generals,attribute){return Math.max(0,generals.reduce((sum,g)=>sum+g[attribute],0)-generals.length*(generals.length-1)/2);}
function startWar(room,player,body){
  if(room.phase!=='playing'||room.players[room.turnIndex].id!==player.id)throw Error('只能在自己的回合宣战');
  if(room.war)throw Error('战争尚未结束');if(room.mainActionUsed)throw Error('本回合已使用主要行动');
  const target=byId(room,body.targetId);if(!target||target===player||target.health<=0)throw Error('目标无效');
  selected(player,body.indices);
  room.mainActionUsed=true;room.war={attackerId:player.id,defenderId:target.id,attackerIndices:[...body.indices],phase:'negotiation',waitingId:target.id,offers:0};room.event=`${player.name}向${target.name}宣战，等待防守方回应。`;
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
    w.defenderIndices=hard?[]:[...body.indices];w.hardDefense=hard;
    w.phase='conceal';w.waitingId=a.id;w.selections={};
    room.event='双方依次暗盖战争牌，全部确认后揭示。';return;
  }
  if(w.phase==='conceal'){
    if(body.choice!=='card')throw Error('请选择暗盖牌或不出牌');
    const id=body.instanceId;
    if(id!==null&&typeof id!=='string')throw Error('无效的卡牌');
    const card=id===null?null:player.hand.find(c=>c.instanceId===id);
    const allowed=player.id===a.id?['T05','T08','N02','N30']:['N08','N10','N11','N12','N29','N30'];
    if(id!==null&&(!card||!allowed.includes(card.id)||player.gold<card.cost))throw Error('卡牌不可使用或黄金不足');
    w.selections[player.id]=id;
    if(player.id===a.id){w.waitingId=d.id;room.event='进攻方已确认暗盖，等待防守方。';return;}
    const ac=w.selections[a.id]===null?null:a.hand.find(c=>c.instanceId===w.selections[a.id]);
    const dc=w.selections[d.id]===null?null:d.hand.find(c=>c.instanceId===w.selections[d.id]);
    for(const [owner,c] of [[a,ac],[d,dc]])if(c){owner.gold-=c.cost;owner.hand.splice(owner.hand.indexOf(c),1);owner.discard.push(c);}
    const revealed=`暗盖揭示：${a.name} ${ac?ac.name:'不出牌'}；${d.name} ${dc?dc.name:'不出牌'}。`;
    const attackGenerals=selected(a,w.attackerIndices),defenseGenerals=w.hardDefense?[]:selected(d,w.defenderIndices);
    for(const g of [...attackGenerals,...defenseGenerals]){g.remaining=g.cooldown;g.cooldownStart=room.turnSerial;}
    if(dc?.id==='N29'&&ac?.id!=='N30'){
      for(const g of attackGenerals)defeat(a,g);
      room.event=revealed+'鸣金收兵生效，进攻武将战败，战争结束。';room.war=null;return;
    }
    const distance=seatDistance(room.players.filter(p=>p.health>0).map(p=>p.id),a.id,d.id);
    const penalty=Math.max(0,(ac?.id==='T05'?0:distance-1)-(ac?.id==='N02'?1:0))+(dc?.id==='N11'?2:0);
    const attack=teamPower(attackGenerals,'attack')+(ac?.id==='T08'?3:ac?.id==='N02'?2:0)-(dc?.id==='N12'?2:0);
    const defense=(w.hardDefense?d.defense:teamPower(defenseGenerals,'defense'))+(dc?.id==='N08'?3:dc?.id==='N10'?5:0);
    const result=calculateBattle({attack,defense,distance:penalty+1,hardDefense:w.hardDefense});
    w.result=result;
    if(result.attackerGeneralDefeated)for(const g of attackGenerals)defeat(a,g);
    if(result.defenderGeneralDefeated)for(const g of defenseGenerals)defeat(d,g);
    d.health-=result.defenderDamage;room.event=revealed+`战争结算：进攻 ${result.attackPower}，防守 ${result.defensePower}；${d.name}损失 ${result.defenderDamage} 生命。`;
    if(d.health<=0){finishElimination(room,d,a);room.war=null;return;}
    if(result.canPursueOrClaim){w.phase='aftermath';w.waitingId=d.id;}else room.war=null;return;
  }
  if(w.phase==='aftermath'){
    if(body.choice==='pursue'){a.health-=pursuitDamage(w.result.delta);room.event=`${d.name}乘胜追击，${a.name}损失 ${pursuitDamage(w.result.delta)} 生命。`;if(a.health<=0)finishElimination(room,a,d);room.war=null;return;}
    if(body.choice!=='claim'||!Number.isSafeInteger(body.amount)||body.amount<0||body.amount>a.gold)throw Error('索赔金额无效或进攻方黄金不足');
    w.amount=body.amount;w.phase='claim_response';w.waitingId=a.id;room.event=`${d.name}要求赔偿 ${w.amount} 黄金。`;return;
  }
  if(w.phase==='claim_response'){
    if(body.choice==='accept'){if(a.gold<w.amount)throw Error('进攻方黄金不足');a.gold-=w.amount;d.gold+=w.amount;room.event='进攻方支付赔偿，战争结束。';}
    else if(body.choice==='reject'){const damage=pursuitDamage(w.result.delta,true);a.health-=damage;room.event=`进攻方拒绝赔偿，受到 ${damage} 点追击伤害。`;if(a.health<=0)finishElimination(room,a,d);}
    else throw Error('请选择接受或拒绝');room.war=null;return;
  }
  throw Error('战争阶段无效');
}
function defeat(player,g){const result=generalAfterDefeat(g.health);g.health=result.health;if(result.status==='dead')player.generals.splice(player.generals.indexOf(g),1);}
function finishElimination(room,loser,winner){loser.health=0;winner.gold+=Math.floor(Math.max(0,loser.gold)*0.3);loser.gold=0;room.event+=` ${loser.name}灭亡。`;const alive=room.players.filter(p=>p.health>0);if(alive.length===1){room.phase='finished';room.event+=` ${alive[0].name}获胜。`;}}
function viewWar(room,player){const w=room.war;if(!w)return null;const result={phase:w.phase,attackerId:w.attackerId,defenderId:w.defenderId,waitingId:w.waitingId,offers:w.offers};if(w.phase==='offer_response'||w.phase==='claim_response')result.amount=w.amount;if(w.result)result.result=w.result;if(player.id===w.attackerId)result.attackerIndices=w.attackerIndices;return result;}
module.exports={startWar,respondWar,viewWar};
