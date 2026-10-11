// Палитра: все цвета игры.
(function (G) {
'use strict';

const COLORS = {
  // пол, стены и колонны — в палитре fantasy-24 (graphics.md); у стен и колонн верх и передняя грань
  floor: '#392a1c', floorLine: '#2a1d0d', floorStone: '#45230d', wall: '#684c3c', wallSide: '#45230d', pillar: '#927e6a', pillarSide: '#684c3c',
  pit: '#2a1d0d', pitEdge: '#684c3c',
  spikeFloor: '#550f0a', spikeTeeth: '#927e6a', warning: '#b8863c', mine: '#e0d44a',
  // цвета профессий = цвета их шапок (graphics.md), усилений — цвета их значков
  hero: '#efac28', medic: '#efd8a1', buddy: '#efb775', shooter: '#a58c27', speed: '#efac28', power: '#ef3a0c',
  regen: '#3c9f9c', spear: '#ef692f', sturdy: '#927e6a', spiky: '#9b1a0a', will: '#efd8a1', spark: '#3c9f9c',
  neutral: '#927e6a', enemy: '#e06060', bull: '#e08040', tower: '#c05ce0',
  scorpion: '#c8a45c', hunter: '#ff4fa0', zombie: '#7fa64a', cloud: '#9ccc6a', portal: '#b070ff',
  turret: '#5c8fb0', boss: '#7a1830', bossGlow: '#ff5a3c', bossRam: '#ff3048', fire: '#ff6a2e', shield: '#8fd6ff',
  // подсветка пола зон поля: по ней видно, насколько зона опасна
  zoneTint: { calm: 'rgba(90,150,210,0.07)', easy: 'rgba(110,200,120,0.06)', danger: 'rgba(220,140,60,0.06)', deadly: 'rgba(220,50,70,0.10)' },
  allyShot: '#d8f8b0', enemyShot: '#ff9a7a', blast: '#ff8a3c',
  hpBack: '#2a1d0d', hpAlly: '#7ae07a', hpEnemy: '#e07a7a',
  // двери, кнопки и неуязвимая пушка-ловушка (уровень «Тропа над пропастью»)
  door: '#6b4a4a', doorEdge: '#c07a5c', button: '#4a4a55', buttonEdge: '#8a8a9a', buttonPressed: '#8ce27a',
  cannon: '#3a3a44', cannonShot: '#ff7a2e', finish: '#63d2ff', bridge: '#724113',
  exit: '#fff2b8', exitGlow: '#ffe58a', // светлый портал выхода с уровня
  // база и гнёзда врагов (уровень «Оборона»)
  base: '#2f5a78', baseEdge: '#8fd6ff', baseHit: '#ff7a7a', nest: '#e04a5a',
  // спрут «Логова»: тело, щупальца, тень удара тентакли, всасывание, злые мины и облака пука
  kraken: '#3c2a5c', krakenEdge: '#9a6ad8', tentacle: '#7a4aa8', krakenSuck: '#6ad8c8', krakenMine: '#ff2a6a', krakenFart: '#a060e0',
};

G.COLORS = COLORS;
})(window.Game = window.Game || {});
