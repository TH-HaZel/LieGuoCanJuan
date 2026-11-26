'use strict';
function deployPrice(player,g){return player.deployDiscountTurn===player.turnsStarted?Math.floor(g.deployCost/2):g.deployCost;}
function buyPrice(room,player,g){return player.buyDiscountRound===room.round?Math.floor(g.cost*3/4):g.cost;}
function cardPrice(player,card){return Math.max(0,card.cost-(player.generals.some(g=>g.id==='G(T15)'&&g.health>0)?1:0));}
module.exports={deployPrice,buyPrice,cardPrice};
