// Палитра: все цвета игры.
(function (G) {
'use strict';

const COLORS = {
  floor: '#1b1b20', wall: '#4a4a55', pillar: '#5d5d6b', pit: '#101018', pitEdge: '#4a4a5e',
  spikeFloor: '#33202a', spikeTeeth: '#9c4a5c', warning: '#b8863c', mine: '#e0d44a',
  hero: '#63d2ff', medic: '#e07ac0', buddy: '#d9c7a0', shooter: '#8ce27a', speed: '#ffe14a', power: '#ff7a3c',
  regen: '#5be0c0', spear: '#e8e8f0', sturdy: '#8fa8d8', spiky: '#c23b4a', will: '#c090f0', spark: '#7a9cff',
  neutral: '#6b6b78', enemy: '#e06060', bull: '#e08040', tower: '#c05ce0',
  scorpion: '#c8a45c', hunter: '#ff4fa0', zombie: '#7fa64a', cloud: '#9ccc6a', portal: '#b070ff',
  boss: '#7a1830', bossGlow: '#ff5a3c', bossRam: '#ff3048', fire: '#ff6a2e', shield: '#8fd6ff',
  // подсветка пола зон поля: по ней видно, насколько зона опасна
  zoneTint: { calm: 'rgba(90,150,210,0.07)', easy: 'rgba(110,200,120,0.06)', danger: 'rgba(220,140,60,0.06)', deadly: 'rgba(220,50,70,0.10)' },
  allyShot: '#d8f8b0', enemyShot: '#ff9a7a', blast: '#ff8a3c',
  hpBack: '#2a2a32', hpAlly: '#7ae07a', hpEnemy: '#e07a7a',
  // двери, кнопки и неуязвимая пушка-ловушка (уровень «Тропа над пропастью»)
  door: '#6b4a4a', doorEdge: '#c07a5c', button: '#4a4a55', buttonEdge: '#8a8a9a', buttonPressed: '#8ce27a',
  cannon: '#3a3a44', cannonShot: '#ff7a2e', finish: '#63d2ff', bridge: '#24242b',
  // база и гнёзда врагов (уровень «Оборона»)
  base: '#2f5a78', baseEdge: '#8fd6ff', baseHit: '#ff7a7a', nest: '#e04a5a',
};

G.COLORS = COLORS;
})(window.Game = window.Game || {});
