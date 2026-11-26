'use strict';
const {cardPrice}=require('./prices');
const contest = require('./neutralContest');
const tianyi = require('./tianyi');
const allianceFlow = require('./allianceFlow');
const { compareNeutralClaims } = require('./neutral');
const effectResolution=require('./effectResolution');
const generals = require('./generals.json');
const {cards}=require('./deck');
const statuses = require('./statuses');
const cardEffects = require('./cardEffects');
const permanentBonuses = require('./permanentBonuses');
const attackCards = { T08:1, N01:2, N02:1, N05:2, N06:1, N07:3, N13:0, T03:0, T06:0, T13:0, T17:0, N22:0, N23:0, N25:0, N27:0, N28:0, N31:0, N32:0, N29:0, N30:0 };
function begin(room) {
  const players = room.players.filter(p => p.health > 0);
  room.neutralRound = { players, choices: new Map(), ids: room.neutralPool.visible.map(r => r.instanceId), cursor: 0, current: null, logs: [], results: [], bonusChoices: [] };
}
function checkExperience(g, value) {
  const count = value === undefined ? 0 : value;
  if (!Number.isSafeInteger(count) || count < 0 || (!g && count !== 0) || (g && count > (g.warExperience || 0))) throw Error('战争经验选择无效');
  return count;
}
function applyExperience(r, state) {
  if (state.experienceApplied) throw Error('战争经验已经结算');
  const additions = new Map();
  for (const p of r.players) {
    const main = state.mains.get(p.id), support = state.supports.get(p.id);
    if (!main) continue;
    const mainCount = checkExperience(main, r.choices.get(p.id)?.experience);
    const supportCount = checkExperience(support, r.supportExperience?.get(p.id));
    additions.set(p.id, mainCount + supportCount);
  }
  for (const p of r.players) {
    const main = state.mains.get(p.id), support = state.supports.get(p.id);
    if (!main) continue;
    const mainCount = r.choices.get(p.id)?.experience || 0, supportCount = r.supportExperience?.get(p.id) || 0;
    if (mainCount) main.warExperience -= mainCount;
    if (supportCount) support.warExperience -= supportCount;
  }
  state.result = compareNeutralClaims(state.result.scores.map(score => ({playerId:score.playerId, mainAttack:score.power + (additions.get(score.playerId) || 0)})));
  state.experienceApplied = true;
}
function applyAttackStatuses(state, round, weather = false, skillEffects = null) {
  state.blockedGenerals = new Set();
  for (const p of state.players) for (const g of [state.mains.get(p.id), state.supports.get(p.id)].filter(Boolean)) {
    const effects = statuses.active(g, round), shield = effects.find(e => e.kind === 'war_immunity');
    const debuff = effects.find(e => ['N04','N23','N25'].includes(e.source) && e.polarity === 'negative');
    if (shield && debuff) g.statuses = (g.statuses || []).filter(e => e.id !== shield.id && e.id !== debuff.id);
    if (statuses.active(g,round).some(e => e.kind === 'war_lock')) state.blockedGenerals.add(g);
  }
  tianyi.resolve(skillEffects ? skillEffects.filter(e=>!e.cancelled).map(e=>e.choice) : (state.tianyiChoices || []), state.blockedGenerals, round);
  const additions = new Map();
  for (const p of state.players) {
    let change = 0;
    for (const g of [state.mains.get(p.id), state.supports.get(p.id)].filter(Boolean)) {
      const remaining = statuses.active(g, round);
      const active = remaining.filter(e => e.kind === 'attack' && ['N22','N23'].includes(e.source));
      const locked = remaining.some(e => e.kind === 'war_lock');
      const base = permanentBonuses.effective(g, 'attack');
      const modifier = active.reduce((sum, e) => sum + (e.value > 0 && locked ? 0 : weather && e.value > 0 ? Math.max(0, e.value - 1) : e.value), 0);
      change += Math.max(0, base + modifier) - base;
      const consumed = new Set([...active, ...remaining.filter(e => e.kind === 'war_lock')].map(e => e.id));
      g.statuses = (g.statuses || []).filter(e => !consumed.has(e.id));
    }
    additions.set(p.id, change);
  }
  state.result = compareNeutralClaims(state.result.scores.map(score => ({playerId:score.playerId, mainAttack:Math.max(0, score.power + (additions.get(score.playerId) || 0))})));
}
function applyAlliancePenalty(room,state) {
  state.result = compareNeutralClaims(state.result.scores.map(score => {
    const p=state.players.find(x=>x.id===score.playerId);
    return {playerId:score.playerId,mainAttack:Math.max(0,score.power-allianceFlow.penalty(p,room.round)-(p.militaryBetrayalPending?2:0))};
  }));
}
function waiting(room) {
  const r = room.neutralRound;
  if (!r) return null;
  if (r.choices.size < r.players.length) return r.players.find(p => !r.choices.has(p.id)).id;
  if (r.tianyi) return r.tianyi.requests[r.tianyi.choices.length].playerId;
  if (r.counterWindow) return r.counterWindow.effects.find(e=>e.requiresChoice&&!e.counterResolved)?.ownerId||null;
  if (r.cards) return r.players.find(p => r.current.mains.get(p.id) && !r.cards.has(p.id))?.id || null;
  if (r.negotiation) return r.negotiation.offer?.targetId || r.negotiation.turn;
  if (r.current?.phase === 'support') return r.players.find(p => r.current.mains.get(p.id) && !r.current.supports.has(p.id)).id;
  return null;
}
function advance(room) {
  const r = room.neutralRound;
  while (r.cursor < r.ids.length) {
    const id = r.ids[r.cursor], state = contest.start(r.players, id);
    for (const p of r.players) { const c = r.choices.get(p.id); contest.submitMain(state, p.id, c?.resourceId === id ? c.index : null); }
    r.current = state;
    if (state.phase === 'support') {
      const ids = r.players.filter(p => state.mains.get(p.id)).map(p => p.id);
      r.negotiation = { ids, turn: ids[0], passed: new Set(), counts: new Map(), offer: null, message: '可报价、撤退或确认结束谈判' };
      return false;
    }
    applyExperience(r, state);
    applyAttackStatuses(state, room.round);
    applyAlliancePenalty(room, state);
    const summary = contest.view(state, r.players[0].id);
    const result = contest.settle(state, room.neutralPool, room.turnSerial, room.round);
    for(const p of state.players)if(state.mains.get(p.id))p.militaryBetrayalPending=false;
    r.bonusChoices.push(...result.bonusChoices);
    if (summary.result.scores.length) { r.results.push(summary); r.logs.push(result.winnerId ? `${r.players.find(p => p.id === result.winnerId).name}获得中立资源` : '中立资源无人获得'); }
    r.cursor++;
  }
  return true;
}
function finishCards(room,summary){
  const r=room.neutralRound;
    const result = contest.settle(r.current, room.neutralPool, room.turnSerial, room.round);
    for(const p of r.current.players)if(r.current.mains.get(p.id))p.militaryBetrayalPending=false;
    r.bonusChoices.push(...result.bonusChoices); r.results.push(summary);
    r.logs.push(result.winnerId ? `${r.players.find(p => p.id === result.winnerId).name}获得中立资源` : '中立资源无人获得');
    r.cards = null; r.cardTargets = null; r.skillTargets = null; r.supportExperience = null; r.supportsRevealed = false; r.cursor++; return advance(room);
}
function resolveCards(room){
  const r=room.neutralRound;
    applyExperience(r, r.current);
    const entries = r.players.filter(p => r.current.mains.get(p.id));
    const {effects,skillEffects}=r.resolvedEffects; r.resolvedEffects=null;
    const enabled=(p,card,key)=>!!card&&effectResolution.enabled(effects,p.id,card.id,key);
    const weather=entries.some(p=>r.cards.get(p.id)?.id==='N13'&&enabled(p,r.cards.get(p.id),'attackReduction'));
    for (const p of entries) {
      const chosen = r.cards.get(p.id);
      if (!chosen || !['N22','N23','T13','T03','T06','T17','N25','N28','N27','N31','N32'].includes(chosen.id) || !enabled(p,chosen,'effect')) continue;
      const target = r.skillTargets.get(p.id), targetPlayer = r.players.find(x => x.id === target.playerId);
      if (chosen.id === 'N32') continue;
      if (['N27','N31'].includes(chosen.id)) {
        const g=targetPlayer.generals[target.index], present=chosen.id==='N27' ? statuses.active(g,room.round).some(x=>x.id===target.effectId&&x.removable&&x.polarity==='positive') : (g.permanentBonuses||[]).some(x=>x.id===target.effectId);
        if (present) {
          const before=permanentBonuses.effective(g,'attack');
          cardEffects[chosen.id].use({room,player:p,targetPlayerId:target.playerId,targetIndex:target.index,effectId:target.effectId});
          if (chosen.id==='N31' && [r.current.mains.get(target.playerId),r.current.supports.get(target.playerId)].includes(g)) {
            const score=r.current.result.scores.find(x=>x.playerId===target.playerId);
            score.power+=permanentBonuses.effective(g,'attack')-before;
          }
        }
      }
      else if (['T03','T06','T17','N25','N28'].includes(chosen.id)) cardEffects[chosen.id].use({room,player:p,targetPlayerId:target.playerId,targetIndex:target.index,effectId:target.effectId});
      else if (chosen.id === 'T13') statuses.add(targetPlayer.generals[target.index], {source:'T13',kind:'heal_on_win',value:1});
      else statuses.add(targetPlayer.generals[target.index], {source:chosen.id,kind:'attack',value:chosen.id === 'N22' ? 2 : -2,expires:room.round+2});
    }
    for (const p of entries) {
      if (r.cards.get(p.id)?.id !== 'N32'||!enabled(p,r.cards.get(p.id),'effect')) continue;
      const target = r.skillTargets.get(p.id);
      cardEffects.N32.use({room,player:p,targetPlayerId:target.playerId,targetIndex:target.index});
    }
    applyAttackStatuses(r.current, room.round, weather, skillEffects);
    const baseAttack = id => { const g = r.current.mains.get(id); return generals.find(base => base.id === g.id)?.attack ?? g.attack; };
    const scores = r.current.result.scores.map(score => {
      const card = r.cards.get(score.playerId);
      const p=r.players.find(x=>x.id===score.playerId);
      let bonus=card&&enabled(p,card,'attack')?attackCards[card.id]:0;
      if (card?.id === 'N06' && enabled(p,card,'conditionalAttack') && baseAttack(score.playerId) < baseAttack(r.cardTargets.get(score.playerId))) bonus += 2;
      if (weather) bonus = Math.max(0, bonus - 1);
      return { playerId:score.playerId, mainAttack:Math.max(0,score.power + bonus - allianceFlow.penalty(p,room.round) - (p.militaryBetrayalPending?2:0)) };
    });
    const clears=effects.filter(e=>e.tags.includes('CLEAR'));
    const countered=clears.some(e=>e.cancelled);
    const removed=new Set(clears.length===1&&!clears[0].cancelled?[r.cardTargets.get(clears[0].ownerId)]:[]);
    const remainingResult = compareNeutralClaims(scores.filter(score => !removed.has(score.playerId)));
    const total = compareNeutralClaims(scores).scores;
    r.current.result = { winnerId:remainingResult.winnerId, scores:total.map(score => removed.has(score.playerId) ? {...score, forcedDefeat:true} : score) };
    r.current.forcedDefeat = removed;
    const played = [];
    for (const p of entries) {
      const chosen = r.cards.get(p.id);
      if (!chosen) continue;
      p.gold -= cardPrice(p,chosen); p.hand.splice(p.hand.indexOf(chosen), 1); p.discard.push(chosen);
      played.push({playerId:p.id,playerName:p.name,...(chosen.id==='N29'?{outcome:clears.length>1?'mutual_cancel':countered?'countered':'effective'}:{}),...(['N06','N29'].includes(chosen.id)?{targetId:r.cardTargets.get(p.id)}:{}),...(['N22','N23','T13','T03','T06','T17','N25','N28','N27','N31','N32'].includes(chosen.id)?{targetId:r.skillTargets.get(p.id).playerId,targetGeneral: r.players.find(x=>x.id===r.skillTargets.get(p.id).playerId).generals[r.skillTargets.get(p.id).index]?.name||'国家'}:{}),card:{id:chosen.id,name:chosen.name,country:chosen.country,variety:chosen.variety,cost:chosen.cost,rarity:chosen.rarity,description:chosen.description}});
      if (chosen.id === 'N05' && enabled(p,chosen,'winGold') && r.current.result.winnerId === p.id) p.gold += 2;
    }
    if (played.length) room.lastPlayed = played;
    r.current.extraLossPlayers = new Set(entries.filter(p => r.cards.get(p.id)?.id === 'N01'&&enabled(p,r.cards.get(p.id),'defeatDamage')).map(p => p.id));
    const summary = contest.view(r.current, r.players[0].id); summary.cards = played;
    const postEffects=contest.pendingSkills(r.current,room.round);
    const counters=effects.filter(e=>e.tags.includes('COUNTER')&&e.timing==='afterBattle');
    const window={stage:'afterBattle',effects:[...counters,...postEffects],postEffects,summary};
    effectResolution.counter(window.effects);
    if(window.effects.some(e=>e.requiresChoice&&!e.counterResolved)){r.counterWindow=window;return false;}
    r.current.postEffects=postEffects;return finishCards(room,summary);
}
function submit(room, player, body) {
  const r = room.neutralRound;
  if (!r || waiting(room) !== player.id) throw Error('当前不是你的中立争夺操作');
  if (r.choices.size < r.players.length) {
    if (body.choice === 'skip') r.choices.set(player.id, null);
    else if (body.choice === 'main') {
      if (!r.ids.includes(body.resourceId) || !Number.isInteger(body.index) || !player.generals[body.index] || player.generals[body.index].remaining > 0) throw Error('请选择有效资源和可出战武将');
      const experience = checkExperience(player.generals[body.index], body.experience);
      r.choices.set(player.id, { resourceId: body.resourceId, index: body.index, experience });
    } else throw Error('请选择参加或跳过');
    if (r.choices.size === r.players.length) return advance(room);
    return false;
  }
  if (r.negotiation) {
    const n = r.negotiation;
    const nextTurn = id => n.ids[(n.ids.indexOf(id) + 1) % n.ids.length];
    if (n.offer) {
      if (body.choice !== 'accept' && body.choice !== 'reject') throw Error('请选择接受或拒绝报价');
      const offer = n.offer, payer = r.players.find(p => p.id === offer.playerId);
      if (body.choice === 'accept') {
        if (payer.gold < offer.amount) throw Error('报价者黄金不足');
        payer.gold -= offer.amount; player.gold += offer.amount;
        n.ids = n.ids.filter(id => id !== player.id); r.current.mains.set(player.id, null);
        n.message = `${player.name}接受${offer.amount}金并退出争夺`;
      } else n.message = `${player.name}拒绝报价`;
      n.offer = null; n.passed.clear(); n.turn = n.ids.includes(offer.playerId) ? nextTurn(offer.playerId) : n.ids[0];
    } else if (body.choice === 'offer') {
      const target = r.players.find(p => p.id === body.targetId && n.ids.includes(p.id) && p.id !== player.id);
      if (!target || !Number.isSafeInteger(body.amount) || body.amount <= 0 || body.amount > player.gold) throw Error('请选择有效目标并输入可支付的正整数黄金');
      if ((n.counts.get(player.id) || 0) >= 2) throw Error('每人最多报价两次');
      n.counts.set(player.id, (n.counts.get(player.id) || 0) + 1);
      n.offer = {playerId: player.id, targetId: target.id, amount: body.amount}; n.passed.clear();
      n.message = `${player.name}向${target.name}报价${body.amount}金`;
    } else if (body.choice === 'withdraw') {
      const next = nextTurn(player.id); n.ids = n.ids.filter(id => id !== player.id); r.current.mains.set(player.id, null);
      n.passed.clear(); n.turn = next; n.message = `${player.name}退出争夺`;
    } else if (body.choice === 'pass') {
      n.passed.add(player.id); n.turn = nextTurn(player.id);
      if (n.ids.every(id => n.passed.has(id))) r.negotiation = null;
    } else throw Error('请选择报价、撤退或结束谈判');
    if (r.negotiation && n.ids.length < 2) {
      const state = contest.start(r.players, r.current.resourceId);
      for (const p of r.players) {
        const g = r.current.mains.get(p.id);
        contest.submitMain(state, p.id, g ? p.generals.indexOf(g) : null);
      }
      r.current = state; r.negotiation = null;
      applyExperience(r, state);
      applyAttackStatuses(state, room.round);
      applyAlliancePenalty(room, state);
      const summary = contest.view(state, r.players[0].id);
      const result = contest.settle(state, room.neutralPool, room.turnSerial, room.round);
    for(const p of state.players)if(state.mains.get(p.id))p.militaryBetrayalPending=false;
      r.bonusChoices.push(...result.bonusChoices);
      if (summary.result.scores.length) { r.results.push(summary); r.logs.push(result.winnerId ? `${r.players.find(p => p.id === result.winnerId).name}获得中立资源` : '中立资源无人获得'); }
      r.cursor++; return advance(room);
    }
    return false;
  }
  if (r.tianyi) {
    const request=r.tianyi.requests[r.tianyi.choices.length];
    if(body.choice!=='tianyi')throw Error('请选择天意目标或放弃');
    let target=null;
    if(body.targetPlayerId!==null){
      const enemy=r.players.find(p=>p.id===body.targetPlayerId);
      if(!enemy||enemy.id===player.id||!Number.isInteger(body.targetIndex))throw Error('请选择其他争夺者的参战武将');
      target=enemy.generals[body.targetIndex];
      if(!target||![r.current.mains.get(enemy.id),r.current.supports.get(enemy.id)].includes(target))throw Error('请选择其他争夺者的参战武将');
    }
    r.tianyi.choices.push({source:request.general,target});
    if(r.tianyi.choices.length===r.tianyi.requests.length){r.current.tianyiChoices=r.tianyi.choices;r.tianyi=null;r.cards=new Map();}
    return false;
  }
  if(r.counterWindow){
    const window=r.counterWindow,action=window.effects.find(e=>e.requiresChoice&&!e.counterResolved);
    if(!action||action.ownerId!==player.id||body.choice!=='counter-target'||!action.legalTargetIds.includes(body.effectId))throw Error('请选择有效反制目标');
    action.targetId=body.effectId;effectResolution.counter(window.effects);
    if(window.effects.some(e=>e.requiresChoice&&!e.counterResolved))return false;
    r.counterWindow=null;if(window.stage==='afterBattle'){r.current.postEffects=window.postEffects;return finishCards(room,window.summary);}r.resolvedEffects=window;return resolveCards(room);
  }
  if (r.cards) {
    if (body.choice !== 'card' || (body.instanceId !== null && typeof body.instanceId !== 'string')) throw Error('请选择一张牌或不出牌');
    const card = body.instanceId === null ? null : player.hand.find(c => c.instanceId === body.instanceId);
    if (body.instanceId !== null && (!card || !Object.hasOwn(attackCards, card.id) || player.gold < cardPrice(player,card))) throw Error('此牌暂不可用于中立争夺或黄金不足');
    if (['N06','N29'].includes(card?.id) && (!body.targetId || body.targetId === player.id || !r.current.mains.get(body.targetId))) throw Error('请选择参与争夺的对手');
    if (['N06','N29'].includes(card?.id)) (r.cardTargets ||= new Map()).set(player.id, body.targetId);
    if (['N22','N23','T13','T03','T06','T17','N25','N28','N27','N31','N32'].includes(card?.id)) {
      const target = r.players.find(p => p.id === body.targetId && p.health > 0);
      if (!target || (['N22','T13','T03','T06','T17','N28'].includes(card.id) ? target.id !== player.id : target.id === player.id) || (!(body.targetIndex===null&&['T06','N28'].includes(card.id)) && (!Number.isInteger(body.targetIndex) || !target.generals[body.targetIndex]))) throw Error('请选择有效的已部署武将');
      if (['T03','T06','T17','N25','N28','N27','N31','N32'].includes(card.id)) cardEffects[card.id].validate({room,player,targetPlayerId:target.id,targetIndex:body.targetIndex,effectId:body.effectId});
      (r.skillTargets ||= new Map()).set(player.id, {playerId:target.id,index:body.targetIndex,effectId:body.effectId});
    }
    r.cards.set(player.id, card);
    if (waiting(room)) return false;
    const entries=r.players.filter(p=>r.current.mains.get(p.id));
    const cardEffectInstances=entries.flatMap(p=>effectResolution.createAll(r.cards.get(p.id),p.id));
    const skillEffects=(r.current.tianyiChoices||[]).map((choice,i)=>{const owner=r.players.find(p=>p.generals.includes(choice.source));return {...effectResolution.create({id:'G05'},owner.id,null,`tianyi:${i}`),choice};});
    const effects=[...cardEffectInstances,...skillEffects];
    // 多张鸣金收兵本来全部失效，不再提供没有实际作用的反制目标。
    const clears=effects.filter(e=>e.tags.includes('CLEAR'));if(clears.length>1)for(const effect of clears)effect.counterable=false;
    effectResolution.counter(effects.filter(e=>e.timing!=='afterBattle'));
    if(effects.some(e=>e.requiresChoice&&!e.counterResolved)){r.counterWindow={effects,skillEffects};return false;}
    r.resolvedEffects={effects,skillEffects};return resolveCards(room);
  }
  if (r.current?.phase !== 'support' || body.choice !== 'support') throw Error('请选择隐藏增援');
  const support = body.index === null ? null : player.generals[body.index];
  const experience = checkExperience(support, body.experience);
  contest.submitSupport(r.current, player.id, body.index);
  (r.supportExperience ||= new Map()).set(player.id, experience);
  if (r.current.phase !== 'complete') return false;
  const requests=[];
  for(const p of r.players)for(const g of [r.current.mains.get(p.id),r.current.supports.get(p.id)].filter(Boolean))if(g.id==='G05'&&g.health>0)requests.push({playerId:p.id,general:g});
  if(requests.length){r.supportsRevealed=true;r.tianyi={requests,choices:[]};}
  else r.cards = new Map();
  return false;
}
function view(room, player) {
  const r = room.neutralRound;
  if (!r) return null;
  const id = waiting(room), resource = r.current && room.neutralPool.visible.find(x => x.instanceId === r.current.resourceId);
  const contestView = r.current && r.players.includes(player) ? contest.view(r.current, player.id) : null;
  if ((r.cards || r.tianyi) && contestView) { if(!r.supportsRevealed)delete contestView.supports; delete contestView.result; }
  const counterAction=r.counterWindow?.effects.find(e=>e.requiresChoice&&!e.counterResolved);
  const counterOptions=counterAction&&id===player.id?counterAction.legalTargetIds.map(effectId=>{const effect=r.counterWindow.effects.find(e=>e.id===effectId),owner=r.players.find(p=>p.id===effect.ownerId);return {effectId,ownerName:owner?.name||'玩家',sourceId:effect.sourceId,sourceName:generals.find(g=>g.id===effect.sourceId)?.name||cards.find(c=>c.id===effect.sourceId)?.name||effect.sourceId,sourceIndex:effect.choice?owner.generals.indexOf(effect.choice.source):null,targetName:effect.choice?.target?.name||null,key:effect.key||null};}):undefined;
  const tianyiOptions = r.tianyi && id===player.id ? r.players.filter(p=>p.id!==player.id&&r.current.mains.get(p.id)).flatMap(p=>[r.current.mains.get(p.id),r.current.supports.get(p.id)].filter(Boolean).map(g=>({playerId:p.id,index:p.generals.indexOf(g),name:g.name}))) : undefined;
  return { phase: r.choices.size < r.players.length ? 'main' : r.negotiation ? 'negotiation' : r.tianyi ? 'tianyi' : r.counterWindow ? 'counter-target' : r.cards ? 'card' : 'support', waitingId: id, resource, results: r.results, tianyiOptions, counterOptions, counterRevealed:r.counterWindow?r.players.filter(p=>r.current.mains.get(p.id)).map(p=>({playerId:p.id,name:r.cards.get(p.id)?.name||'不出牌'})):undefined, negotiation: r.negotiation ? { ids:r.negotiation.ids, offer:r.negotiation.offer, count:r.negotiation.counts.get(player.id)||0, message:r.negotiation.message } : null, contest: contestView };
}
module.exports = { begin, waiting, submit, view };
