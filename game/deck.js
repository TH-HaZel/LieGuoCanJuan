'use strict';
const crypto = require('node:crypto');
// 测试牌组；摸牌按钮的次数与时机暂不代表正式规则。
function createTestDeck() {
  const deck = Array.from({length:20}, (_, i) => ({id:crypto.randomUUID(), name:`测试牌 ${i + 1}`}));
  for (let i=deck.length-1; i>0; i--) {const j=crypto.randomInt(i+1); [deck[i],deck[j]]=[deck[j],deck[i]];}
  return deck;
}
function drawCard(player) {
  if (player.hand.length >= 10) throw new Error('手牌已达上限（10 张）');
  if (!player.deck.length) throw new Error('测试牌堆已摸完');
  player.hand.push(player.deck.pop());
}
module.exports = {createTestDeck, drawCard};
