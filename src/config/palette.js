// Палитра: все цвета игры.
(function (G) {
'use strict';

const COLORS = {
  floor: '#1b1b20', wall: '#4a4a55', pillar: '#5d5d6b', pit: '#101018', pitEdge: '#4a4a5e',
  spikeFloor: '#33202a', spikeTeeth: '#9c4a5c', warning: '#b8863c', mine: '#e0d44a',
  player: '#63d2ff', crossbow: '#8ce27a', shotgun: '#e2c05a', medic: '#e07ac0',
  cutter: '#b9c4d4', booster: '#5ad6a0',
  neutral: '#6b6b78', enemy: '#e06060', bull: '#e08040', tower: '#c05ce0',
  scorpion: '#c8a45c', zombie: '#7fa64a', cloud: '#9ccc6a', portal: '#b070ff',
  // подсветка пола зон поля: по ней видно, насколько зона опасна
  zoneTint: { calm: 'rgba(90,150,210,0.07)', easy: 'rgba(110,200,120,0.06)', danger: 'rgba(220,140,60,0.06)', deadly: 'rgba(220,50,70,0.10)' },
  allyShot: '#d8f8b0', enemyShot: '#ff9a7a', blast: '#ff8a3c',
  hpBack: '#2a2a32', hpAlly: '#7ae07a', hpEnemy: '#e07a7a',
};

G.COLORS = COLORS;
})(window.Game = window.Game || {});
