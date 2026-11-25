'use strict';
const permanentBonuses = require('./permanentBonuses');
const { compareNeutralClaims } = require('./neutral');

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
  return Math.max(0, general.attack + permanentBonuses.total(general, 'attack'));
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
    mains: revealed ? state.players.filter(p => state.mains.get(p.id)).map(p => ({ playerId: p.id, name: state.mains.get(p.id).name, power: power(state.mains.get(p.id)) })) : undefined,
    supports: state.phase === 'complete' ? state.players.filter(p => state.supports.get(p.id)).map(p => ({ playerId: p.id, name: state.supports.get(p.id).name, power: power(state.supports.get(p.id)) })) : undefined,
    result: state.phase === 'complete' ? state.result : undefined
  };
}
module.exports = { start, submitMain, submitSupport, view };
