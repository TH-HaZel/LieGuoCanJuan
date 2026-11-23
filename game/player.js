'use strict';
const crypto = require('node:crypto');
function createPlayer(name, seat) {
  return {id:crypto.randomUUID(), token:crypto.randomBytes(24).toString('hex'), name, seat, country:'初始国家', health:40, maxHealth:40, gold:10, defense:0, buffs:[], generals:[], hand:[]};
}
function publicPlayer(p) {return {id:p.id,name:p.name,seat:p.seat,country:p.country,health:p.health,maxHealth:p.maxHealth,gold:p.gold,defense:p.defense,buffs:p.buffs,generals:p.generals,handCount:p.hand.length};}
module.exports={createPlayer,publicPlayer};
