'use strict';
const { randomInt, randomUUID } = require('node:crypto');
const { cards, shuffle, general } = require('./deck');
const config=require('./neutralConfig.json');

// 资源池与玩家牌堆分开；抽牌顺序仅保存在服务器。
function createNeutralPool() {
  const publicCards = cards.filter(card => card.country === '全局');
  for(const [key,value] of Object.entries({goldCount:config.goldCount,publicCardCount:config.publicCardCount,revealPerRound:config.revealPerRound,goldMin:config.goldMin,goldMax:config.goldMax}))if(!Number.isSafeInteger(value)||value<0)throw Error(`中立资源配置无效：${key}`);
  if(config.revealPerRound<1||config.goldMax<config.goldMin||publicCards.length<config.publicCardCount||!Array.isArray(config.initialGeneralIds))throw Error('中立资源配置无效');
  const gold = Array.from({ length: config.goldCount }, () => ({
    instanceId: randomUUID(), type: 'gold', amount: randomInt(config.goldMin, config.goldMax+1)
  }));
  const skills = shuffle([...publicCards]).slice(0, config.publicCardCount).map(card => ({
    instanceId: randomUUID(), type: 'card', card: structuredClone(card)
  }));
  const generals=config.initialGeneralIds.map(id=>({instanceId:randomUUID(),type:'card',card:general(id)}));
  return { deck: shuffle([...gold, ...skills,...generals]), visible: [] };
}

// 每大轮公开一张；场上已有资源不被覆盖。
function revealNeutral(pool) {
  if (!pool.deck.length) return null;
  const resource = pool.deck.pop();
  pool.visible.push(resource);
  return resource;
}

// 输入是服务器计算出的有效战力，不接受客户端提供的结算结果。
function compareNeutralClaims(claims) {
  if (!Array.isArray(claims)) throw Error('争夺者列表无效');
  const players = new Set();
  const scores = claims.map(({ playerId, mainAttack, supportAttack = 0 }) => {
    if (typeof playerId !== 'string' || !playerId || players.has(playerId) ||
        !Number.isFinite(mainAttack) || mainAttack < 0 ||
        !Number.isFinite(supportAttack) || supportAttack < 0) throw Error('争夺者战力无效');
    players.add(playerId);
    return { playerId, power: mainAttack + supportAttack };
  });
  if (!scores.length) return { winnerId: null, scores };
  const highest = Math.max(...scores.map(score => score.power));
  const winners = scores.filter(score => score.power === highest);
  return { winnerId: winners.length === 1 ? winners[0].playerId : null, scores };
}


function recoverEliminated(pool,player) {
  if(!pool||!Array.isArray(pool.deck))throw Error('中立资源池无效');
  const resources=[];
  for(const item of [...player.hand,...player.generals]) {
    if(item.kind==='general'&&item.health>0)resources.push({instanceId:randomUUID(),type:'card',card:general(item.id)});
    else if(item.kind!=='general'&&item.country==='全局') {
      const original=cards.find(c=>c.id===item.id&&c.country==='全局');
      if(original)resources.push({instanceId:randomUUID(),type:'card',card:structuredClone(original)});
    }
  }
  pool.deck=shuffle([...pool.deck,...resources]);
  player.hand=[];player.generals=[];
  return resources.length;
}
module.exports = { createNeutralPool, revealNeutral, compareNeutralClaims, recoverEliminated, config };
