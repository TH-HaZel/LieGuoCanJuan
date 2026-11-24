'use strict';

// 仅计算普通战争的基础结果；输入是已确认的有效战力，不读取或修改对局状态。
function seatDistance(aliveIds, attackerId, defenderId) {
  if (!Array.isArray(aliveIds) || aliveIds.length < 2 || new Set(aliveIds).size !== aliveIds.length) {
    throw new Error('存活国家座位无效');
  }
  const a = aliveIds.indexOf(attackerId), d = aliveIds.indexOf(defenderId);
  if (a < 0 || d < 0 || a === d) throw new Error('战争双方必须是不同的存活国家');
  const diff = Math.abs(a - d);
  return Math.min(diff, aliveIds.length - diff);
}

function calculateBattle({attack, defense, distance, attackerSupport = 0, defenderSupport = 0, hardDefense = false}) {
  for (const value of [attack, defense, attackerSupport, defenderSupport]) {
    if (!Number.isFinite(value)) throw new Error('战力必须是有限数值');
  }
  if (!Number.isInteger(distance) || distance < 1) throw new Error('距离必须为正整数');
  if (typeof hardDefense !== 'boolean') throw new Error('国家硬抗参数无效');
  const attackPower = attack + attackerSupport - (distance - 1);
  const defensePower = defense + defenderSupport;
  const delta = attackPower - defensePower;
  return {
    attackPower, defensePower, delta,
    winner: delta > 0 ? 'attacker' : delta < 0 ? 'defender' : 'draw',
    defenderDamage: delta > 0 ? delta : 0,
    attackerGeneralDefeated: delta < 0,
    defenderGeneralDefeated: delta > 0 && !hardDefense,
    canPursueOrClaim: delta < 0 && !hardDefense
  };
}

function pursuitDamage(delta, refusedClaim = false) {
  if (!Number.isFinite(delta) || delta >= 0) throw new Error('只有防守胜利时才能计算追击');
  const damage = Math.max(1, Math.floor(Math.abs(delta) / 2));
  return refusedClaim ? Math.max(1, Math.floor(damage / 2)) : damage;
}

// 返回战败后生命及状态；阵亡武将的移除由未来的对局结算负责。
function generalAfterDefeat(currentHealth) {
  if (!Number.isInteger(currentHealth) || currentHealth < 0) throw new Error('武将生命值无效');
  if (currentHealth === 0) return {health: 0, status: 'dead'};
  const health = currentHealth - 1;
  return {health, status: health === 0 ? 'critical' : 'active'};
}

module.exports = {seatDistance, calculateBattle, pursuitDamage, generalAfterDefeat};
