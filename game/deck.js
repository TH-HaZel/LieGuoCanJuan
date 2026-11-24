'use strict';
const crypto = require('node:crypto');
const cards = require('./cards.json');
const categories = {'攻击增益':5, '防御增益':5, '能力':3, '状态':4, '解场':3};
const generals = [
  ['G01','秦琼',3,3,3,1,1], ['G02','薛仁贵',4,1,2,2,3],
  ['G03','尉迟敬德',2,4,4,1,3], ['G04','李勣',2,2,3,2,4],
  ['G05','裴行俭',2,3,3,3,6], ['G06','郭子仪',5,4,4,4,8],
  ['G07','李嗣业',2,2,3,4,10], ['G08','刘仁轨',3,3,3,1,1]
].map(([id,name,attack,defense,maxHealth,cooldown,cost])=>({id,name,attack,defense,maxHealth,health:maxHealth,cooldown,remaining:0,cost,deployCost:1,kind:'general'}));
function shuffle(arr) { for(let i=arr.length-1;i>0;i--){const j=crypto.randomInt(i+1);[arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }
function general(id) {const g=generals.find(x=>x.id===id);if(!g)throw new Error('武将不存在');return structuredClone(g);}
function createTestDeck(generalIds) {
  if(!Array.isArray(generalIds)||generalIds.length!==2||new Set(generalIds).size!==2)throw new Error('请选择两名不同的主牌组武将');
  const national=cards.filter(c=>c.category==='唐朝专属');
  const neutral=Object.entries(categories).flatMap(([category,n])=>cards.filter(c=>c.category===category).slice(0,n));
  return shuffle([...national,...neutral,...generalIds.map(general)].map(c=>({...structuredClone(c),instanceId:crypto.randomUUID()})));
}
function drawCard(player) {
  if(!player.deck.length&&player.discard.length){player.deck=shuffle(player.discard);player.discard=[];}
  if(!player.deck.length)return '牌堆和弃牌堆均为空';
  const card=player.deck.pop();if(player.hand.length>=10){player.discard.push(card);return '手牌已满，新牌进入弃牌堆';}
  player.hand.push(card);return '摸一张牌';
}
module.exports={cards,generals,general,createTestDeck,drawCard};
