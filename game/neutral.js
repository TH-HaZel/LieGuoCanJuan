'use strict';
const { randomInt, randomUUID } = require('node:crypto');
const { cards, shuffle } = require('./deck');

// 资源池与玩家牌堆分开；抽牌顺序仅保存在服务器。
function createNeutralPool() {
  const publicCards = cards.filter(card => card.country === '全局');
  if (publicCards.length < 20) throw Error('公共卡牌不足 20 张');
  const gold = Array.from({ length: 20 }, () => ({
    instanceId: randomUUID(), type: 'gold', amount: randomInt(1, 6)
  }));
  const skills = shuffle([...publicCards]).slice(0, 20).map(card => ({
    instanceId: randomUUID(), type: 'card', card: structuredClone(card)
  }));
  return { deck: shuffle([...gold, ...skills]), visible: [] };
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

module.exports = { createNeutralPool, revealNeutral, compareNeutralClaims };
