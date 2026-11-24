'use strict';
const crypto = require('node:crypto');
const cards = require('./cards.json');
const categories = {'攻击增益':5, '防御增益':5, '能力':3, '状态':4, '解场':3};
const generals = require('./generals.json').map(g=>({...g,health:g.maxHealth,remaining:0,kind:'general'}));
function shuffle(arr) { for(let i=arr.length-1;i>0;i--){const j=crypto.randomInt(i+1);[arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }
function general(id) {const g=generals.find(x=>x.id===id);if(!g)throw new Error('武将不存在');return structuredClone(g);}
function createTestDeck(generalIds) {
  if(!Array.isArray(generalIds)||generalIds.length!==2||new Set(generalIds).size!==2)throw new Error('请选择两名不同的主牌组武将');
  const national=cards.filter(c=>c.country==='唐'&&c.id!=='T15(1)');
  const neutralIds=[...Array.from({length:18},(_,i)=>`N${String(i+1).padStart(2,'0')}`),'N29','N30'];
  const neutral=neutralIds.map(id=>cards.find(c=>c.id===id)).filter(Boolean);
  if(national.length!==18||neutral.length!==20)throw Error('测试牌组需要 18 张唐牌和 20 张公共牌，请检查卡牌数据');
  return shuffle([...national,...neutral,...generalIds.map(general)].map(c=>({...structuredClone(c),instanceId:crypto.randomUUID()})));
}
function drawCard(player) {
  if(!player.deck.length&&player.discard.length){player.deck=shuffle(player.discard);player.discard=[];}
  if(!player.deck.length)return '牌堆和弃牌堆均为空';
  const card=player.deck.pop();if(player.hand.length>=10){player.discard.push(card);return '手牌已满，新牌进入弃牌堆';}
  player.hand.push(card);return '摸一张牌';
}
module.exports={cards,generals,general,shuffle,createTestDeck,drawCard};
