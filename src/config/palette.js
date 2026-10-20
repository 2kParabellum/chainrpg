// Палитра: все цвета игры — только из fantasy-24 (graphics.md).
(function (G) {
'use strict';

const COLORS = {
  // пол, стены и колонны — в палитре fantasy-24 (graphics.md); у стен и колонн верх и передняя грань
  floor: '#392a1c', floorLine: '#2a1d0d', floorStone: '#45230d', wall: '#684c3c', wallSide: '#45230d', pillar: '#927e6a', pillarSide: '#684c3c',
  pit: '#2a1d0d', pitEdge: '#684c3c',
  spikeFloor: '#550f0a', spikeTeeth: '#927e6a', warning: '#efac28', mine: '#efac28',
  // цвета профессий = цвета их шапок (graphics.md), усилений — цвета их значков
  hero: '#efac28', medic: '#efd8a1', buddy: '#efb775', shooter: '#a58c27', speed: '#efac28', power: '#ef3a0c',
  regen: '#3c9f9c', spear: '#ef692f', sturdy: '#927e6a', spiky: '#9b1a0a', will: '#efd8a1', spark: '#3c9f9c',
  neutral: '#927e6a', enemy: '#ef3a0c', bull: '#ab5c1c', tower: '#a56243',
  scorpion: '#927e6a', hunter: '#ef692f', zombie: '#39571c', cloud: '#a58c27', portal: '#9b1a0a',
  boss: '#550f0a', bossGlow: '#ef692f', bossRam: '#ef3a0c', fire: '#ef692f',
  // подсветка пола зон поля: по ней видно, насколько зона опасна
  zoneTint: { calm: 'rgba(90,150,210,0.07)', easy: 'rgba(110,200,120,0.06)', danger: 'rgba(220,140,60,0.06)', deadly: 'rgba(220,50,70,0.10)' },
  allyShot: '#efd8a1', enemyShot: '#ef692f', blast: '#ef692f',
  hpBack: '#2a1d0d', hpAlly: '#6fae3a', hpEnemy: '#ef3a0c',
  // двери, кнопки и неуязвимая пушка-ловушка (уровень «Тропа над пропастью»)
  door: '#724113', doorEdge: '#ab5c1c', button: '#45230d', buttonEdge: '#927e6a', buttonPressed: '#3c9f9c',
  cannon: '#45230d', cannonShot: '#ef692f', finish: '#3c9f9c', bridge: '#724113',
  exit: '#efd8a1', exitGlow: '#efac28', // светлый портал выхода с уровня
  // база и гнёзда врагов (уровень «Оборона»)
  base: '#276468', baseEdge: '#3c9f9c', baseHit: '#ef3a0c', nest: '#9b1a0a',
  // спрут «Логова»: тело, щупальца, тень удара тентакли, всасывание, злые мины и облака пука
  // мишень-манекен тестового уровня: деревянный столб и соломенное тело
  dummy: '#724113', dummyStraw: '#efb775',
  kraken: '#183f39', krakenEdge: '#3c9f9c', tentacle: '#276468', krakenSuck: '#efd8a1', krakenMine: '#ef3a0c', krakenFart: '#a58c27',
};

G.COLORS = COLORS;
})(window.Game = window.Game || {});
