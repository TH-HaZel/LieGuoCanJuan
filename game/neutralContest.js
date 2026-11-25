'use strict';
const permanentBonuses = require('./permanentBonuses');
const { compareNeutralClaims } = require('./neutral');
const { generalAfterDefeat } = require('./combat');
const { randomUUID } = require('node:crypto');
const statuses = require('./statuses');
const generalSkills = require('./generalSkills');

// This module operates on server-side player objects; clients submit only indices.
function start(players, resourceId) {
  if (!Array.isArray(players) || players.length < 2 || typeof resourceId !== 'string' || !resourceId ||
      players.some(p => !p || typeof p.id !== 'string' || !Array.isArray(p.generals)) ||
      new Set(players.map(p => p.id)).size !== players.length) throw Error('争夺数据无效');
  const alive = players.filter(p => p.health > 0);
  if (alive.length < 2) throw Error('存活国家不足');
  return { resourceId, players: alive, phase: 'main', mains: new Map(), supports: new Map(), result: null };
}
function participant(state, playerId) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) throw Error('不在本次争夺中');
  return player;
}
function generalAt(player, index) {
  if (!Number.isInteger(index) || index < 0 || index >= player.generals.length) throw Error('请选择已部署武将');
  const general = player.generals[index];
  if (general.remaining > 0) throw Error('冷却中的武将不可出战');
  return general;
}
function power(general) {
  return permanentBonuses.effective(general, 'attack');
}
function submitMain(state, playerId, index) {
  if (state.phase !== 'main' || state.mains.has(playerId)) throw Error('当前不能选择主将');
  const player = participant(state, playerId);
  const general = index === null ? null : generalAt(player, index);
  state.mains.set(playerId, general);
  if (state.mains.size === state.players.length) {
    const entries = state.players.filter(p => state.mains.get(p.id));
    if (entries.length < 2) {
      state.phase = 'complete';
      state.result = compareNeutralClaims(entries.map(p => ({ playerId: p.id, mainAttack: power(state.mains.get(p.id)) })));
    } else state.phase = 'support';
  }
}
function submitSupport(state, playerId, index) {
  if (state.phase !== 'support' || state.supports.has(playerId) || !state.mains.get(playerId)) throw Error('当前不能选择增援');
  const player = participant(state, playerId);
  const general = index === null ? null : generalAt(player, index);
  if (general && general === state.mains.get(playerId)) throw Error('主将不能同时作为增援');
  state.supports.set(playerId, general);
  const entries = state.players.filter(p => state.mains.get(p.id));
  if (state.supports.size === entries.length) {
    state.result = compareNeutralClaims(entries.map(p => ({ playerId: p.id, mainAttack: power(state.mains.get(p.id)), supportAttack: state.supports.get(p.id) ? power(state.supports.get(p.id)) : 0 })));
    state.phase = 'complete';
  }
}
function view(state, playerId) {
  participant(state, playerId);
  const revealed = state.phase !== 'main';
  return {
    resourceId: state.resourceId,
    phase: state.phase,
    submitted: state.phase === 'main' ? state.mains.has(playerId) : state.supports.has(playerId),
    mains: revealed ? state.players.filter(p => state.mains.get(p.id)).map(p => ({ playerId: p.id, index: p.generals.indexOf(state.mains.get(p.id)), name: state.mains.get(p.id).name, power: power(state.mains.get(p.id)) })) : undefined,
    supports: state.phase === 'complete' ? state.players.filter(p => state.supports.get(p.id)).map(p => ({ playerId: p.id, index: p.generals.indexOf(state.supports.get(p.id)), name: state.supports.get(p.id).name, power: power(state.supports.get(p.id)) })) : undefined,
    result: state.phase === 'complete' ? state.result : undefined
  };
}
function settle(state, pool, turnSerial, round = 0) {
  if (state.phase !== 'complete' || !state.result || state.settled) throw Error('当前不能结算');
  if (!pool || !Array.isArray(pool.visible) || !Number.isSafeInteger(turnSerial) || turnSerial < 0 || !Number.isSafeInteger(round) || round < 0) throw Error('资源池或回合无效');
  const index = pool.visible.findIndex(r => r.instanceId === state.resourceId);
  if (index < 0) throw Error('中立资源不存在');
  const resource = pool.visible[index];
  if (!resource || !['gold','card'].includes(resource.type) ||
      (resource.type === 'gold' && (!Number.isSafeInteger(resource.amount) || resource.amount < 0)) ||
      (resource.type === 'card' && (!resource.card || typeof resource.card.id !== 'string'))) throw Error('中立资源无效');
  const winner = state.result.winnerId && participant(state, state.result.winnerId);
  if (winner && (!Number.isFinite(winner.gold) || !Array.isArray(winner.hand) || !Array.isArray(winner.discard))) throw Error('获胜玩家数据无效');
  const entrants = state.players.filter(p => state.mains.get(p.id));
  for (const p of entrants) {
    const units = [state.mains.get(p.id), state.supports.get(p.id)].filter(Boolean);
    if (units.some(g => !p.generals.includes(g) || !Number.isSafeInteger(g.health) || g.health < 0 || !Number.isSafeInteger(g.cooldown) || g.cooldown < 0)) throw Error('参战武将数据无效');
  }
  const losers = winner ? state.result.scores.filter(s => s.playerId !== winner.id) : [];
  const minimum = losers.length ? Math.min(...losers.map(s => s.power)) : null;
  const lowest = losers.filter(s => s.power === minimum).map(s => s.playerId);
  for (const p of entrants) {
    const main = state.mains.get(p.id), support = state.supports.get(p.id);
    for (const g of [main, support].filter(Boolean)) { g.remaining = g.cooldown; g.cooldownStart = turnSerial; }
    if ((winner && p.id !== winner.id) || state.forcedDefeat?.has(p.id)) {
      const outcome = generalAfterDefeat(main.health);
      main.health = outcome.health;
      if (outcome.status === 'dead') p.generals.splice(p.generals.indexOf(main), 1);
    }
  }
  // 破釜沉舟仅在存在唯一胜者且使用者落败时生效。
  if (state.extraLossPlayers) {
    for (const p of entrants) {
      if (!((winner && p.id !== winner.id) || state.forcedDefeat?.has(p.id)) || !state.extraLossPlayers.has(p.id)) continue;
      for (const g of [state.mains.get(p.id), state.supports.get(p.id)].filter(Boolean)) {
        const index = p.generals.indexOf(g);
        if (index < 0) continue;
        const outcome = generalAfterDefeat(g.health);
        g.health = outcome.health;
        if (outcome.status === 'dead') p.generals.splice(index, 1);
      }
    }
  }
  for (const p of entrants) {
    for (const g of [state.mains.get(p.id), state.supports.get(p.id)].filter(Boolean)) {
      const blocked = state.blockedGenerals ? state.blockedGenerals.has(g) : statuses.active(g, round).some(e => e.kind === 'war_lock');
      const outcome = winner?.id === p.id ? 'win' : winner || state.forcedDefeat?.has(p.id) ? 'loss' : 'draw';
      // 戍卫仅对国家受伤的普通战争生效；中立资源争夺不触发。
      if (g.id !== 'G06') generalSkills.afterBattle(p, g, blocked, outcome, {neutralSupport:g === state.supports.get(p.id)});
    }
  }
  const bonusChoices = [];
  for (const p of entrants) {
    for (const g of [state.mains.get(p.id), state.supports.get(p.id)].filter(Boolean)) {
      const active = statuses.active(g, round);
      const triggered = active.filter(e => ['permanent_after_war', 'cooldown_after_battle', 'heal_on_win'].includes(e.kind));
      if (p.generals.includes(g)) {
        for (const effect of triggered) {
          if (effect.kind === 'permanent_after_war') bonusChoices.push({type:'permanent-bonus',playerId:p.id,general:g});
          else if (effect.kind === 'cooldown_after_battle') g.remaining = Math.max(0, g.remaining - effect.value);
          else if (winner && winner.id === p.id && g.health > 0) g.health = Math.min(g.maxHealth, g.health + effect.value);
        }
      }
      const consumed = new Set(triggered.map(e => e.id));
      g.statuses = (g.statuses || []).filter(e => !consumed.has(e.id));
    }
  }
  if (winner) {
    if (resource.type === 'gold') winner.gold += resource.amount;
    else {
      const card = { ...structuredClone(resource.card), instanceId: randomUUID() };
      (winner.hand.length < 10 ? winner.hand : winner.discard).push(card);
    }
    pool.visible.splice(index, 1);
  }
  if (lowest.length === 1) {
    const p = participant(state, lowest[0]), g = state.mains.get(p.id);
    if (p.generals.includes(g)) g.warExperience = Math.min(3, (g.warExperience || 0) + 1);
  }
  state.settled = true;
  return { winnerId: winner ? winner.id : null, experienceTie: lowest.length > 1 ? lowest : [], bonusChoices };
}
module.exports = { start, submitMain, submitSupport, view, settle };
