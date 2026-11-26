'use strict';
const permanentBonuses = require('./permanentBonuses');
const effectResolution = require('./effectResolution');
const { generalAfterDefeat } = require('./combat');

// 战斗结算后调用；每名武将单独记录是否被封锁。
function afterBattle(player, general, blocked, outcome, options = {}) {
  if (!player.generals.includes(general) || general.health <= 0 || blocked) return false;
  const effects=options.effects||effectResolution.createGeneral(general,player.id);
  const enabled=key=>effectResolution.enabled(effects,player.id,general.id,key);
  if (general.id === 'G02' && outcome === 'win' && enabled('winAttack')) {permanentBonuses.add(general, 'attack', 'G02');return true;}
  if (general.id === 'G02' && outcome === 'loss') {
    if(enabled('lossAttack'))permanentBonuses.reduce(general, 'attack');
    if (!options.neutralSupport && enabled('lossHealth')) {
      const damage=generalAfterDefeat(general.health);general.health=damage.health;
      if (damage.status === 'dead') player.generals.splice(player.generals.indexOf(general),1);
    }
    return true;
  }
  if (general.id === 'G06' && outcome === 'loss') {
    if(enabled('lossHealth')){const damage=generalAfterDefeat(general.health);general.health=damage.health;
    if (damage.status === 'dead') player.generals.splice(player.generals.indexOf(general),1);}
    return enabled('damageReduction');
  }
  if (general.id === 'G03' && outcome === 'win' && enabled('winDefense')) {permanentBonuses.add(general, 'defense', 'G03');return true;}
  if (general.id === 'G03' && outcome === 'loss') {if(enabled('lossAttack'))permanentBonuses.reduce(general, 'attack');if(enabled('lossDefense'))permanentBonuses.reduce(general, 'defense');return true;}
  if (general.id === 'G04') {
    if(enabled('attackGrowth'))permanentBonuses.add(general, 'attack', 'G04');
    if(enabled('defenseGrowth'))permanentBonuses.add(general, 'defense', 'G04');
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
