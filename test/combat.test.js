'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {seatDistance, calculateBattle, pursuitDamage, generalAfterDefeat} = require('../game/combat');

test('座位环使用最短距离，并在移除灭亡国家后重算', () => {
  assert.equal(seatDistance(['a','b','c','d','e','f'], 'a', 'e'), 2);
  assert.equal(seatDistance(['a','b','c','e','f'], 'a', 'e'), 2);
  assert.equal(seatDistance(['a','b','e','f'], 'a', 'e'), 2);
  assert.equal(seatDistance(['a','e','f'], 'a', 'e'), 1);
  assert.throws(() => seatDistance(['a','b'], 'a', 'a'));
});

test('进攻获胜、平局、防守获胜及国家硬抗', () => {
  const win = calculateBattle({attack: 5, defense: 3, distance: 2});
  assert.equal(win.delta, 1);
  assert.equal(win.defenderDamage, 1);
  assert.equal(win.defenderGeneralDefeated, true);
  const tie = calculateBattle({attack: 3, defense: 3, distance: 1});
  assert.equal(tie.winner, 'draw');
  assert.equal(tie.attackerGeneralDefeated, false);
  assert.equal(tie.defenderGeneralDefeated, false);
  const loss = calculateBattle({attack: 2, defense: 4, distance: 1});
  assert.equal(loss.attackerGeneralDefeated, true);
  assert.equal(loss.canPursueOrClaim, true);
  const hard = calculateBattle({attack: 2, defense: 4, distance: 1, hardDefense: true});
  assert.equal(hard.canPursueOrClaim, false);
  const hardLoss = calculateBattle({attack: 5, defense: 0, distance: 1, hardDefense: true});
  assert.equal(hardLoss.defenderDamage, 5);
  assert.equal(hardLoss.defenderGeneralDefeated, false);
});

test('援军贡献加到对应战力且距离仅惩罚进攻方', () => {
  const r = calculateBattle({attack: 4, defense: 3, distance: 3, attackerSupport: 2, defenderSupport: 1});
  assert.equal(r.attackPower, 4);
  assert.equal(r.defensePower, 4);
  assert.equal(r.winner, 'draw');
});

test('追击及拒绝赔偿后的追击向下取整且最低为一', () => {
  assert.equal(pursuitDamage(-9), 4);
  assert.equal(pursuitDamage(-9, true), 2);
  assert.equal(pursuitDamage(-1, true), 1);
  assert.throws(() => pursuitDamage(0));
});

test('武将生命降到零时濒死，再次战败阵亡', () => {
  assert.deepEqual(generalAfterDefeat(2), {health: 1, status: 'active'});
  assert.deepEqual(generalAfterDefeat(1), {health: 0, status: 'critical'});
  assert.deepEqual(generalAfterDefeat(0), {health: 0, status: 'dead'});
  assert.throws(() => generalAfterDefeat(-1));
});
