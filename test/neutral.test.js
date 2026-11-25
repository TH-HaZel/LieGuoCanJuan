'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createNeutralPool, revealNeutral, compareNeutralClaims } = require('../game/neutral');

test('中立池包含 20 张黄金和 20 张无色牌', () => {
  const pool = createNeutralPool();
  assert.equal(pool.deck.length, 40);
  const gold = pool.deck.filter(r => r.type === 'gold');
  const cards = pool.deck.filter(r => r.type === 'card');
  assert.equal(gold.length, 20);
  assert.equal(cards.length, 20);
  assert.ok(gold.every(r => Number.isInteger(r.amount) && r.amount >= 1 && r.amount <= 5));
  assert.ok(cards.every(r => r.card.country === '全局'));
  assert.equal(new Set(pool.deck.map(r => r.instanceId)).size, 40);
});

test('公开新资源不覆盖仍在场上的资源', () => {
  const pool = createNeutralPool();
  const first = revealNeutral(pool);
  const second = revealNeutral(pool);
  assert.deepEqual(pool.visible, [first, second]);
  assert.equal(pool.deck.length, 38);
});

test('增援加入全部攻击，最高并列或无争夺者时无人获胜', () => {
  const claims = [{playerId: 'a', mainAttack: 3, supportAttack: 4}, {playerId: 'b', mainAttack: 6}];
  assert.equal(compareNeutralClaims(claims).winnerId, 'a');
  assert.deepEqual(compareNeutralClaims(claims).scores.map(x => x.power), [7, 6]);
  assert.equal(compareNeutralClaims([{playerId: 'a', mainAttack: 3}, {playerId: 'b', mainAttack: 3}]).winnerId, null);
  assert.equal(compareNeutralClaims([]).winnerId, null);
  assert.throws(() => compareNeutralClaims([{playerId:'a',mainAttack:1},{playerId:'a',mainAttack:2}]));
});
