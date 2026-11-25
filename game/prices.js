'use strict';
function deployPrice(player,g){return player.deployDiscountTurn===player.turnsStarted?Math.floor(g.deployCost/2):g.deployCost;}
function buyPrice(room,player,g){return player.buyDiscountRound===room.round?Math.floor(g.cost*3/4):g.cost;}
module.exports={deployPrice,buyPrice};
