'use strict';
const $ = id => document.getElementById(id); let source, currentSession;
async function enter(endpoint, data){
  $('error').textContent='';
  try {const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(result.error);sessionStorage.setItem('lieguo-session',JSON.stringify(result));connect(result);}
  catch(error){$('error').textContent=error.message;}
}
$('create').onclick=()=>enter('/api/create',{name:$('name').value});
$('join').onclick=()=>enter('/api/join',{name:$('name').value,code:$('roomInput').value});
function connect(session){
  currentSession=session; if(source)source.close();$('lobby').hidden=true;$('game').hidden=false;$('roomCode').textContent=session.code;
  source=new EventSource(`/events?room=${encodeURIComponent(session.code)}&token=${encodeURIComponent(session.token)}`);
  source.onopen=()=>{$('connection').textContent='🟢 已连接';};
  source.onerror=()=>{$('connection').textContent='连接中断，正在重试';};
  source.onmessage=event=>render(JSON.parse(event.data));
}
async function action(type) {
  try {const response=await fetch('/api/'+type,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(currentSession)});const result=await response.json();if(!response.ok)throw new Error(result.error);render(result);}catch(error){$('message').textContent=error.message;}
}
$('start').onclick=()=>action('start'); $('endTurn').onclick=()=>action('end-turn');
function render(state){
  const me=state.self; $('message').textContent=state.event; $('start').hidden=state.phase!=='waiting'||state.hostId!==me.id; $('endTurn').hidden=state.phase!=='playing'||state.currentPlayerId!==me.id; const current=state.players.find(p=>p.id===state.currentPlayerId); $('turn').textContent=current?`第 ${state.round} 轮 · ${current.name}的回合`:'等待开始'; $('self').textContent=`${me.name}（我） · ${me.country}　❤️ ${me.health}/${me.maxHealth}　🪙 ${me.gold}　增益：${me.buffs.length ? me.buffs.join('、') : '无'}`;
  $('generals').textContent=me.generals.length ? me.generals.map(x=>x.name).join('、'):'暂无将领'; $('hand').textContent=me.hand.length ? me.hand.map(x=>x.name).join('、'):'暂无手牌';
  $('opponents').replaceChildren(...state.players.filter(p=>p.id!==me.id).map(player=>{const el=document.createElement('div');el.className='player';el.textContent=`${player.name} · ${player.country}　❤️ ${player.health}/${player.maxHealth}　🪙 ${player.gold}　将领 ${player.generals.length}　手牌 ${player.handCount}　增益 ${player.buffs.length}`;return el;}));
}
try{const session=JSON.parse(sessionStorage.getItem('lieguo-session'));if(session?.code && session?.token)connect(session);}catch{}
