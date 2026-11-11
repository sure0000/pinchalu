// 茶具搭配：按茶类推荐主泡器 + 公道杯 + 品茗杯的组合，计时页展示。
// img 为样品插画（design/gen_teaware.py 生成的 SVG），只示意器型与搭配，不是具体商品。
// 每个茶类给两套，第一套为默认推荐；用户切换后按茶类记在本地。
const SETS = {
  glass: {
    name: '玻璃杯直泡',
    pieces: ['高身玻璃杯 250–300ml', '茶叶罐', '茶则'],
    why: '玻璃通透不闷香，看芽叶在水中舒展起落；先注水再投茶（上投），水温降到 80–85°C 不烫熟嫩芽。',
    img: '/assets/teaware/glass.svg'
  },
  gaiwan: {
    name: '白瓷盖碗',
    pieces: ['白瓷盖碗 110–150ml', '玻璃公道杯', '白瓷品茗杯 ×3'],
    why: '白瓷不吸味、汤色看得清，出汤快、好控时，几乎百搭；新茶、试新茶都先用它。',
    img: '/assets/teaware/gaiwan.svg'
  },
  zisha: {
    name: '紫砂壶',
    pieces: ['紫砂壶 150ml 左右', '玻璃公道杯', '青瓷品茗杯 ×3'],
    why: '紫砂透气、保温好，能收敛杂味、让汤更圆润；适合熟普、老生普和红茶，一把壶最好只泡一类茶。',
    img: '/assets/teaware/zisha.svg'
  },
  zhuni: {
    name: '朱泥小壶 · 功夫茶',
    pieces: ['朱泥小壶 100ml 左右', '茶船', '玻璃公道杯', '若琛杯 ×3（品字形）'],
    why: '朱泥密度高、聚香发香，高温快出，最显单丛、岩茶的香与韵；出汤入公道杯再分斟，也可像潮汕功夫茶那样“关公巡城、韩信点兵”直接点斟。',
    img: '/assets/teaware/zhuni.svg'
  },
  boil: {
    name: '围炉煮茶',
    pieces: ['陶壶或玻璃煮茶壶', '小炭炉 / 电陶炉', '玻璃公道杯', '粗陶杯 ×3'],
    why: '老白茶、熟普、陈年老茶先泡后煮，汤色更红亮、滋味更醇厚，天冷时尤其合宜；煮前可先温润洗茶一道，煮好后经公道杯分斟。',
    img: '/assets/teaware/boil.svg'
  }
}

// 茶类 → [默认, 备选]，code 与 teaConfig 的 CATEGORIES 一致（含黄茶）
const BY_CATEGORY = {
  lvcha: { sets: ['glass', 'gaiwan'], tip: '名优绿茶用玻璃杯赏形，碎茶、炒青用盖碗更好控浓淡。' },
  huangcha: { sets: ['glass', 'gaiwan'], tip: '君山银针等芽茶用玻璃杯看“三起三落”，黄大茶用盖碗。' },
  baicha: { sets: ['gaiwan', 'boil'], tip: '新白茶盖碗冲泡，三年以上的老白茶、老寿眉可以煮。' },
  hongcha: { sets: ['gaiwan', 'zisha'], tip: '盖碗显香，紫砂壶出汤更甜润。' },
  yancha: { sets: ['gaiwan', 'zhuni'], tip: '岩茶要沸水高冲，盖碗或朱泥小壶都能把岩韵逼出来。' },
  dancong: { sets: ['zhuni', 'gaiwan'], tip: '单丛讲究“高冲低斟”，快进快出，避免苦涩。' },
  heicha: { sets: ['boil', 'zisha'], tip: '茯砖、千两茶、六堡宜煮或用紫砂壶，粗老的黑茶煮着更出味。' },
  shengpu: { sets: ['gaiwan', 'zisha'], tip: '新生普盖碗快出汤，五年以上的老生普换紫砂壶。' },
  shupu: { sets: ['zisha', 'boil'], tip: '熟普用紫砂壶醒茶最好，泡到淡了还能再煮一壶。' }
}

const DEFAULT = { sets: ['gaiwan', 'zisha'], tip: '' }

// 返回该茶类的两套搭配 [{ id, name, pieces, why, img }] 与小贴士
function waresOf(category) {
  const c = BY_CATEGORY[category] || DEFAULT
  return { tip: c.tip, sets: c.sets.map(id => Object.assign({ id }, SETS[id])) }
}

function getWare(id) {
  return SETS[id] ? Object.assign({ id }, SETS[id]) : null
}

module.exports = { SETS, waresOf, getWare }
