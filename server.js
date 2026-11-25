'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const rooms = require('./server/rooms');
const port = Number(process.env.PORT || 3100);
const files = {'/':['index.html','text/html; charset=utf-8'],'/client.js':['client.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
function json(res, status, value) {res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
function nameOf(input) {const name=String(input || '').trim(); if (!name || name.length>20) throw new Error('请输入 1～20 个字符的昵称'); return name;}
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/generals') {json(res,200,require('./game/deck').generals.map(({id,name,source})=>({id,name,source})));return;}
    if (req.method === 'GET' && files[url.pathname]) {
      const [file,mime]=files[url.pathname]; fs.readFile(path.join(__dirname,'public',file),(err,data)=>{if(err){res.writeHead(500);res.end('读取失败');return;}res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'});res.end(data);});return;
    }
    if (req.method === 'GET' && url.pathname === '/events') {
      const {room,player}=rooms.authenticate(url.searchParams.get('room')||'',url.searchParams.get('token')||'');
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache','Connection':'keep-alive'}); rooms.subscribe(room,player,res); return;
    }
    if (req.method==='POST' && ['/api/create','/api/join','/api/start','/api/end-turn','/api/deploy','/api/buy','/api/withdraw','/api/experience-cooldown','/api/play-card','/api/discard-choice','/api/neutral-action','/api/bonus-choice','/api/war-start','/api/war-respond'].includes(url.pathname)) {
      let data=''; for await(const part of req){data+=part;if(data.length>4096) throw new Error('请求过大');}
      const body=JSON.parse(data || '{}');
      if (url.pathname === '/api/start' || url.pathname === '/api/end-turn' || url.pathname === '/api/deploy' || url.pathname === '/api/buy' || url.pathname === '/api/withdraw' || url.pathname === '/api/experience-cooldown' || url.pathname === '/api/play-card' || url.pathname === '/api/discard-choice' || url.pathname === '/api/neutral-action' || url.pathname === '/api/bonus-choice' || url.pathname === '/api/war-start' || url.pathname === '/api/war-respond') {json(res,200,rooms.action(body.code || '',body.token || '',url.pathname.slice(5),body));return;}
      const name=nameOf(body.name);
      if(url.pathname==='/api/create'){const {room,player}=rooms.createRoom(name,body.selection);json(res,200,{code:room.code,token:player.token});}
      else {const code=String(body.code||'').trim().toUpperCase();const player=rooms.joinRoom(code,name,body.selection);json(res,200,{code,token:player.token});}return;
    }
    json(res,404,{error:'未找到'});
  } catch(e) {if(!res.headersSent) json(res,400,{error:e.message || '请求失败'}); else res.end();}
});
server.listen(port,'0.0.0.0',()=>console.log(`服务器已启动：本机 http://localhost:${port}，局域网请使用服务器电脑的 IP 地址。`));
