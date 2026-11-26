'use strict';
const bonuses=require('./permanentBonuses');
const statuses=require('./statuses');
function player(room,id){return room.players.find(p=>p.id===id);}
function packageOf(p,input){
 if(!input||!Number.isSafeInteger(input.gold)||input.gold<0||input.gold>p.gold||!Array.isArray(input.generals))throw Error('交易内容或黄金无效');
 const selected=input.generals.map(x=>{if(!x||!['hand','generals'].includes(x.area)||!Number.isInteger(x.index)||x.index<0)throw Error('武将选择无效');const g=p[x.area][x.index];if(!g||g.kind!=='general')throw Error('武将选择无效');return {area:x.area,g};});
 if(new Set(selected.map(x=>x.g)).size!==selected.length)throw Error('不能重复选择武将');
 return {gold:input.gold,selected};
}
function propose(room,p,targetId,input){
 if(room.phase!=='playing'||room.players[room.turnIndex]!==p||p.health<=0||room.mainActionUsed||room.war||room.neutralRound||room.pendingChoice||room.pendingAlliance||room.pendingTrade)throw Error('当前不能发起交易');
 const target=player(room,targetId);if(!target||target===p||target.health<=0)throw Error('交易对象无效');
 room.pendingTrade={proposerId:p.id,targetId,offer:packageOf(p,input),phase:'reply'};room.mainActionUsed=true;room.event=`${p.name}发起武将交易，等待${target.name}回应。`;
}
function respond(room,p,body){
 const t=room.pendingTrade;if(!t)throw Error('没有进行中的交易');
 const a=player(room,t.proposerId),b=player(room,t.targetId);
 if(body.choice==='reject'&&((t.phase==='reply'&&p===b)||(t.phase==='confirm'&&p===a))){room.pendingTrade=null;room.event='交易未达成。';return;}
 if(t.phase==='reply'&&p===b&&body.choice==='offer'){t.reply=packageOf(b,body);if(!t.offer.selected.length&&!t.reply.selected.length)throw Error('交易至少需要一名武将');t.phase='confirm';room.event=`${b.name}提出交易条件，等待${a.name}确认。`;return;}
 if(t.phase!=='confirm'||p!==a||body.choice!=='accept')throw Error('当前不能响应交易');
 for(const [owner,pack] of [[a,t.offer],[b,t.reply]]){if(owner.gold<pack.gold||pack.selected.some(x=>!owner[x.area].includes(x.g)))throw Error('交易内容已变化');}
 const handSize=(owner,outgoing,incoming)=>owner.hand.length-outgoing.selected.filter(x=>x.area==='hand').length+incoming.selected.length;
 if(handSize(a,t.offer,t.reply)>10||handSize(b,t.reply,t.offer)>10)throw Error('交易后手牌超过上限，无法成交');
 for(const [owner,pack] of [[a,t.offer],[b,t.reply]])for(const x of pack.selected)owner[x.area].splice(owner[x.area].indexOf(x.g),1);
 a.gold+=t.reply.gold-t.offer.gold;b.gold+=t.offer.gold-t.reply.gold;
 for(const x of t.reply.selected)a.hand.push(x.g);for(const x of t.offer.selected)b.hand.push(x.g);
 room.pendingTrade=null;room.event=`${a.name}与${b.name}完成武将交易。`;
}
function view(room,p){const t=room.pendingTrade;if(!t)return null;const allowed=[t.proposerId,t.targetId].includes(p.id);const pack=x=>({gold:x.gold,generals:x.selected.map(({g})=>({name:g.name,health:g.health,maxHealth:g.maxHealth,remaining:g.remaining||0,attack:bonuses.effective(g,'attack'),defense:bonuses.effective(g,'defense'),warExperience:g.warExperience||0,permanentBonuses:structuredClone(g.permanentBonuses||[]),permanentPenalties:structuredClone(g.permanentPenalties||{}),statuses:structuredClone(statuses.active(g,room.round))}))});return {proposerId:t.proposerId,targetId:t.targetId,phase:t.phase,waitingId:t.phase==='reply'?t.targetId:t.proposerId,...(allowed?{offer:pack(t.offer),reply:t.reply?pack(t.reply):null}:{})};}
module.exports={propose,respond,view};
