'use strict';
const permanentBonuses = require('./permanentBonuses');
const { generalAfterDefeat } = require('./combat');

// 战斗结算后调用；每名武将单独记录是否被封锁。
function afterBattle(player, general, blocked, outcome, options = {}) {
  if (!player.generals.includes(general) || general.health <= 0 || blocked) return false;
  if (general.id === 'G02' && outcome === 'win') {permanentBonuses.add(general, 'attack', 'G02');return true;}
  if (general.id === 'G02' && outcome === 'loss') {
    permanentBonuses.reduce(general, 'attack');
    if (!options.neutralSupport) {
      const damage=generalAfterDefeat(general.health);general.health=damage.health;
      if (damage.status === 'dead') player.generals.splice(player.generals.indexOf(general),1);
    }
    return true;
  }
  if (general.id === 'G06' && outcome === 'loss') {
    const damage=generalAfterDefeat(general.health);general.health=damage.health;
    if (damage.status === 'dead') player.generals.splice(player.generals.indexOf(general),1);
    return true;
  }
  if (general.id === 'G03' && outcome === 'win') {permanentBonuses.add(general, 'defense', 'G03');return true;}
  if (general.id === 'G03' && outcome === 'loss') {permanentBonuses.reduce(general, 'attack');permanentBonuses.reduce(general, 'defense');return true;}
  if (general.id === 'G04') {
    permanentBonuses.add(general, 'attack', 'G04');
    permanentBonuses.add(general, 'defense', 'G04');
    return true;
  }
  return false;
}
function hasDefenseDoubler(generals, blocked) {
  return generals.some(g => g.id === 'G08' && g.health > 0 && !blocked.has(g));
}
function hasDamageBoost(generals, blocked) {
  return generals.some(g => g.id === 'G07' && g.health > 0 && !blocked.has(g));
}
function boostDamage(damage, enabled) {
  return enabled ? damage + Math.floor(damage / 2) : damage;
}
module.exports = { afterBattle, hasDamageBoost, boostDamage, hasDefenseDoubler };
