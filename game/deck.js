'use strict';
const crypto = require('node:crypto');
const cards = require('./cards.json');
const categories = {'攻击增益':5, '防御增益':5, '能力':3, '状态':4, '解场':3};
const generals = require('./generals.json').map(g=>({...g,health:g.maxHealth,remaining:0,kind:'general'}));
function shuffle(arr) { for(let i=arr.length-1;i>0;i--){const j=crypto.randomInt(i+1);[arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }
function general(id) {const g=generals.find(x=>x.id===id);if(!g)throw new Error('武将不存在');return structuredClone(g);}
const deckGroups={
  '攻击增益':['N01','N02','N05','N06','N07'],
  '防御增益':['N08','N09','N10','N11','N12','N13','N14'],
  '能力':['N03','N15','N16','N17','N18','N19','N20'],
  '状态':['N04','N21','N22','N23','N24','N25','N26'],
  '解场':['N27','N28','N29','N30','N31','N32']
};
const defaultNeutral=['N01','N02','N05','N06','N07','N08','N09','N10','N11','N12','N03','N15','N16','N04','N21','N22','N23','N27','N28','N29'];
function neutralOptions(){return Object.entries(deckGroups).flatMap(([category,ids])=>ids.map(id=>{const c=cards.find(x=>x.id===id&&x.country==='全局');if(!c)throw Error('公共卡牌数据无效');return {...c,deckCategory:category};}));}
function validateNeutralDeck(ids){
  if(!Array.isArray(ids)||ids.length!==20)throw Error('请选择 20 张公共牌');
  const options=neutralOptions(),counts=new Map(),groups={};
  for(const id of ids){const card=options.find(c=>c.id===id);if(!card)throw Error('公共牌无效');const count=(counts.get(id)||0)+1;counts.set(id,count);if(count>({high:1,medium:2,low:4}[card.rarity]||0))throw Error(`${card.name}超过稀有度携带上限`);groups[card.deckCategory]=(groups[card.deckCategory]||0)+1;}
  for(const [name,limit] of Object.entries(categories))if(groups[name]!==limit)throw Error(`${name}需要 ${limit} 张`);
  return ids.map(id=>cards.find(c=>c.id===id));
}
function createTestDeck(generalIds,neutralIds=defaultNeutral) {
  if(!Array.isArray(generalIds)||generalIds.length!==2||new Set(generalIds).size!==2)throw new Error('请选择两名不同的主牌组武将');
  const national=cards.filter(c=>c.country==='唐'&&c.id!=='T15(1)');
  const neutral=validateNeutralDeck(neutralIds);
  if(national.length!==18||neutral.length!==20)throw Error('测试牌组需要 18 张唐牌和 20 张公共牌，请检查卡牌数据');
  return shuffle([...national,...neutral,...generalIds.map(general)].map(c=>({...structuredClone(c),instanceId:crypto.randomUUID()})));
}
function drawCard(player) {
  if(!player.deck.length&&player.discard.length){player.deck=shuffle(player.discard);player.discard=[];}
  if(!player.deck.length)return '牌堆和弃牌堆均为空';
  const card=player.deck.pop();if(player.hand.length>=10){player.discard.push(card);return '手牌已满，新牌进入弃牌堆';}
  player.hand.push(card);return '摸一张牌';
}
module.exports={cards,generals,general,shuffle,createTestDeck,drawCard,neutralOptions,defaultNeutral,categories,validateNeutralDeck};
