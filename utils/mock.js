// 原型阶段的演示数据：一柜子茶、一柜子茶器 + 近两个半月的冲泡记录，只在本地模式（USE_CLOUD: false）下写入。
// 冲泡记录带风味轮描述词、专业审评（汤色 / 十项强度 / 叶底）和用了哪几件茶器。
// 数据 _id 以 mock_ 开头，与自己录入的数据并存；版本号变了会先删掉旧的演示数据再重新写入。
// 想重新生成：开发者工具“清缓存 → 清除数据缓存”，或改 VERSION。时间都相对“写入那一刻”往前推。
const { getCategory } = require('../config/teaConfig')
const MW = require('../config/wares')
const F = require('../config/flavor')

const VERSION = 2
const FLAG = 'mockSeeded'
const DB = 'localdb_'
const DAY = 24 * 3600 * 1000
const TASTE_POOL = F.TASTES.reduce((a, g) => a.concat(g.tags), [])

// [茶名, 茶类, 产地, 品种, 来源方式, 商家/出处, 年份, 自定义分组, 已喝完, 入手几天前, 备注]
const TEAS = [
  ['明前西湖龙井', 'lvcha', '浙江杭州西湖', '龙井群体种', 'buy', '梅家坞周家茶园', 2025, ['口粮茶'], false, 200, '狮峰山脚，炒得偏嫩'],
  ['黄山毛峰', 'lvcha', '安徽黄山', '黄山大叶种', 'buy', '徽六茶庄', 2025, ['办公室'], false, 160, ''],
  ['洞庭碧螺春', 'lvcha', '江苏苏州洞庭山', '洞庭小叶种', 'gift', '阿梅', 2025, [], true, 190, '阿梅从苏州带的'],
  ['福鼎白牡丹', 'baicha', '福建福鼎', '福鼎大白茶', 'buy', '品品香', 2018, ['珍藏'], false, 420, '饼茶，撬了一半'],
  ['老寿眉饼', 'baicha', '福建福鼎', '福鼎大毫茶', 'buy', '品品香', 2016, ['珍藏', '待客'], false, 380, '适合围炉煮'],
  ['白毫银针', 'baicha', '福建政和', '政和大白茶', 'event', '秋季茶博会', 2024, [], false, 30, ''],
  ['君山银针', 'huangcha', '湖南岳阳君山', '君山银针群体种', 'buy', '君山茶业', 2025, [], false, 90, ''],
  ['霍山黄芽', 'huangcha', '安徽霍山', '霍山金鸡种', 'buy', '徽六茶庄', 2024, [], true, 300, ''],
  ['金骏眉', 'hongcha', '福建武夷山桐木关', '武夷菜茶', 'buy', '正山堂', 2025, ['待客'], false, 120, ''],
  ['正山小种', 'hongcha', '福建武夷山桐木关', '武夷菜茶', 'buy', '正山堂', 2024, ['口粮茶'], false, 240, '烟熏款'],
  ['祁门红茶', 'hongcha', '安徽祁门', '祁门槠叶种', 'buy', '祥源茶', 2025, ['办公室', '口粮茶'], false, 150, ''],
  ['凤庆古树滇红', 'hongcha', '云南临沧凤庆', '凤庆大叶种', 'gift', '老王', 2024, [], false, 70, '老王自己做的'],
  ['牛栏坑肉桂', 'yancha', '福建武夷山牛栏坑', '肉桂', 'buy', '瑞泉岩茶', 2023, ['珍藏'], false, 330, '一年一斤的量，省着喝'],
  ['慧苑老枞水仙', 'yancha', '福建武夷山慧苑坑', '水仙', 'buy', '瑞泉岩茶', 2023, ['口粮茶'], false, 330, ''],
  ['大红袍', 'yancha', '福建武夷山', '大红袍', 'buy', '武夷星', 2024, ['待客'], false, 210, ''],
  ['鸭屎香', 'dancong', '广东潮州凤凰山', '鸭屎香', 'buy', '凤凰山阿强', 2025, ['口粮茶'], false, 100, ''],
  ['蜜兰香单丛', 'dancong', '广东潮州凤凰山', '蜜兰香', 'buy', '凤凰山阿强', 2024, [], true, 280, ''],
  ['乌岽宋种', 'dancong', '广东潮州乌岽山', '宋种', 'event', '秋季茶博会', 2024, ['珍藏'], false, 30, '茶博会上抢的 50g'],
  ['冰岛古树', 'shengpu', '云南临沧双江', '勐库大叶种', 'gift', '老王', 2019, ['珍藏'], false, 500, ''],
  ['老班章', 'shengpu', '云南西双版纳勐海', '勐海大叶种', 'buy', '大益', 2022, ['珍藏'], false, 450, ''],
  ['宫廷熟普', 'shupu', '云南西双版纳勐海', '勐海大叶种', 'buy', '大益', 2015, ['口粮茶', '办公室'], false, 600, '饭后来一壶'],
  ['下关沱茶', 'shupu', '云南大理', '云南大叶种', 'buy', '下关沱茶', 2012, [], true, 700, ''],
  ['安化千两茶', 'heicha', '湖南安化', '安化云台山大叶种', 'buy', '白沙溪', 2017, ['珍藏'], false, 520, '锯了三分之一'],
  ['梧州六堡茶', 'heicha', '广西梧州', '六堡群体种', 'buy', '三鹤', 2018, ['口粮茶'], false, 260, '']
]

// [名称, 器型, 材质, 容量 ml, 作者/窑口, 来源方式, 商家/出处, 宜泡, 收起, 入手几天前, 备注]
const WARES = [
  ['甜白釉盖碗', 'gaiwan', 'baici', 120, '景德镇·清风窑', 'buy', '景德镇陶溪川市集', [], false, 400, '胎薄，出汤利落，什么茶都先用它试'],
  ['汝窑天青盖碗', 'gaiwan', 'ruyao', 110, '汝州·宝丰窑', 'buy', '汝州汝瓷坊', ['qing', 'hong'], false, 280, '开片养得越来越好看'],
  ['青花缠枝盖碗', 'gaiwan', 'baici', 150, '', 'gift', '阿梅', [], true, 700, '盖沿磕了个小口，收起来了'],
  ['朱泥西施壶', 'hu', 'zhuni', 100, '宜兴·周师傅', 'buy', '丁蜀镇周家壶坊', ['qing'], false, 360, '专泡单丛、岩茶，聚香'],
  ['紫砂石瓢', 'hu', 'zisha', 180, '宜兴·陈师傅', 'buy', '丁蜀镇周家壶坊', ['puer'], false, 560, '只泡熟普，一壶不侍二茶'],
  ['段泥仿古壶', 'hu', 'duanni', 150, '', 'gift', '老王', ['hong'], false, 200, ''],
  ['高硼硅玻璃杯', 'glass', 'glass', 300, '', 'buy', '物生物', ['lv', 'huang'], false, 500, '看芽叶起落'],
  ['柴烧提梁煮茶壶', 'boil', 'chaishao', 800, '莺歌·林家窑', 'event', '秋季茶博会', ['bai', 'hei'], false, 30, '配电陶炉，煮老白茶、千两茶'],
  ['玻璃公道杯', 'gongdao', 'glass', 220, '', 'buy', '物生物', [], false, 500, ''],
  ['龙泉青瓷公道杯', 'gongdao', 'qingci', 200, '龙泉·弟窑', 'buy', '龙泉青瓷坊', [], false, 260, ''],
  ['兔毫建盏', 'cup', 'heiyou', 60, '建阳·水吉', 'buy', '建阳盏坊', [], false, 330, '喝岩茶、熟普最衬汤色'],
  ['甜白品茗杯（四只）', 'cup', 'baici', 40, '景德镇·清风窑', 'buy', '景德镇陶溪川市集', [], false, 400, '看汤色最准'],
  ['粗陶小杯', 'cup', 'taoqi', 80, '', 'buy', '茶具城', [], false, 150, ''],
  ['铸铁烧水壶', 'kettle', 'tie', 1200, '', 'buy', '老铁匠铺', [], false, 450, '水更软'],
  ['竹制干泡台', 'other', 'other', 0, '', 'buy', '茶具城', [], false, 450, '']
]

// 各茶类：风味轮描述词、品饮笔记、习惯冲泡的时刻（小时）、审评画像（汤色、清亮度、十项强度、叶底）
const FLAVOR = {
  lvcha: {
    tags: ['豆香', '栗香', '嫩香', '兰花香', '海苔香', '青草香', '清香'],
    notes: ['栗香明显，第三泡后转淡', '鲜爽度高，水温再低一点更好', '有点闷了，下次别盖盖子', '汤色嫩绿清澈，叶底细嫩'],
    hours: [8, 8, 9, 10],
    liquor: ['嫩绿', '黄绿'],
    clarity: ['清澈', '明亮'],
    scores: { aroma: 4, lasting: 3, sweet: 3, umami: 5, body: 2, huigan: 3, shengjin: 3, houyun: 2, bitter: 2, astringent: 2 },
    leaf: ['细嫩', '芽叶完整', '匀整']
  },
  baicha: {
    tags: ['毫香', '花蜜香', '蜜香', '药香', '陈香', '红枣香', '荷叶香'],
    notes: ['枣香出来了，汤感稠滑', '煮着喝更甜', '毫香足，回甘持久'],
    hours: [10, 10, 15, 20],
    liquor: ['浅黄', '杏黄', '橙黄'],
    clarity: ['明亮', '清澈'],
    scores: { aroma: 3, lasting: 3, sweet: 4, umami: 3, body: 3, huigan: 4, shengjin: 3, houyun: 2, bitter: 1, astringent: 1 },
    leaf: ['肥厚', '柔软', '匀整']
  },
  huangcha: {
    tags: ['嫩玉米香', '栗香', '蜜香', '嫩香', '米香'],
    notes: ['甜润，不刺激', '闷黄的熟玉米香很特别'],
    hours: [11, 12, 12],
    liquor: ['杏黄', '浅黄'],
    clarity: ['明亮'],
    scores: { aroma: 3, lasting: 2, sweet: 4, umami: 3, body: 3, huigan: 3, shengjin: 2, houyun: 2, bitter: 1, astringent: 1 },
    leaf: ['芽叶完整', '细嫩']
  },
  hongcha: {
    tags: ['蜜香', '桂圆香', '红薯香', '花蜜香', '烟熏', '焦糖香', '松木香'],
    notes: ['蜜香很足，冷了更甜', '汤色红亮带金圈，配点心正好', '松烟香重了点，第四泡后转桂圆'],
    hours: [13, 14, 14, 15],
    liquor: ['红亮', '橙红', '金黄'],
    clarity: ['明亮', '清澈'],
    scores: { aroma: 4, lasting: 3, sweet: 5, umami: 2, body: 3, huigan: 3, shengjin: 2, houyun: 2, bitter: 1, astringent: 2 },
    leaf: ['柔软', '匀整']
  },
  yancha: {
    tags: ['桂皮香', '炭焙香', '足火', '兰花香', '矿石香', '岩骨花香', '烤坚果香', '蜜桃香'],
    notes: ['桂皮香冲，岩韵明显，喉底回甘快', '火还没退，再放半年', '七泡后还有味，水中带香', '叶底绿叶红镶边，有弹性'],
    hours: [15, 16, 16, 17],
    liquor: ['橙黄', '橙红'],
    clarity: ['明亮', '尚亮'],
    scores: { aroma: 4, lasting: 5, sweet: 3, umami: 2, body: 4, huigan: 4, shengjin: 4, houyun: 5, bitter: 2, astringent: 2 },
    leaf: ['绿叶红镶边', '肥厚', '有弹性']
  },
  dancong: {
    tags: ['蜜兰香', '花蜜香', '姜花香', '蜜桃香', '熟芒果香', '杏仁香'],
    notes: ['香气高扬，注水要快、出汤要快', '泡久了收敛性强，有点涩', '山韵蜜味，十泡犹存'],
    hours: [15, 16, 17],
    liquor: ['金黄', '橙黄'],
    clarity: ['清澈', '明亮'],
    scores: { aroma: 5, lasting: 4, sweet: 3, umami: 2, body: 3, huigan: 4, shengjin: 4, houyun: 4, bitter: 3, astringent: 3 },
    leaf: ['绿叶红镶边', '有弹性']
  },
  heicha: {
    tags: ['菌花香', '槟榔香', '陈香', '木香', '松木香', '荷叶香', '红枣香'],
    notes: ['金花菌香明显，煮着更甜', '槟榔香出来了，汤色红浓', '汤感滑，喉底有凉意'],
    hours: [18, 19, 20],
    liquor: ['红浓', '褐红'],
    clarity: ['明亮', '尚亮'],
    scores: { aroma: 2, lasting: 3, sweet: 3, umami: 1, body: 4, huigan: 3, shengjin: 2, houyun: 3, bitter: 1, astringent: 1 },
    leaf: ['肥厚', '匀整']
  },
  shengpu: {
    tags: ['兰花香', '蜜香', '樟香', '冰糖甜香', '青梅香', '烟熏', '檀香'],
    notes: ['冰糖甜，生津快，两颊生津', '苦化得快，回甘猛', '还嫩，再存几年'],
    hours: [17, 18, 19],
    liquor: ['金黄', '杏黄', '橙黄'],
    clarity: ['明亮', '清澈'],
    scores: { aroma: 4, lasting: 4, sweet: 3, umami: 3, body: 4, huigan: 5, shengjin: 5, houyun: 4, bitter: 3, astringent: 3 },
    leaf: ['肥厚', '有弹性']
  },
  shupu: {
    tags: ['陈香', '糯香', '红枣香', '木香', '参香', '可可香', '堆味'],
    notes: ['陈香干净，没有堆味', '汤厚如米汤，饭后很舒服', '泡到十泡还红浓'],
    hours: [18, 19, 20, 21],
    liquor: ['红浓', '褐红', '深褐'],
    clarity: ['明亮', '尚亮'],
    scores: { aroma: 2, lasting: 3, sweet: 4, umami: 1, body: 5, huigan: 3, shengjin: 2, houyun: 3, bitter: 1, astringent: 1 },
    leaf: ['柔软', '匀整']
  }
}

// 固定种子的伪随机，每次生成的数据一样
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function makeTea(row, i, now) {
  const [name, category, origin, variety, sourceType, sourceName, year, shelves, finished, daysAgo, note] = row
  const acquiredAt = now - daysAgo * DAY
  const tea = { _id: 'mock_t' + pad(i + 1), name, category, origin, variety, sourceType, sourceName, year, acquiredAt, createdAt: acquiredAt, updatedAt: acquiredAt }
  if (shelves.length) tea.shelves = shelves
  if (finished) tea.finished = true
  if (note) tea.note = note
  return tea
}

function makeWare(row, i, now) {
  const [name, kind, material, capacityMl, maker, sourceType, sourceName, forClasses, retired, daysAgo, note] = row
  const acquiredAt = now - daysAgo * DAY
  const w = { _id: 'mock_w' + pad(i + 1), name, kind, material, sourceType, sourceName, acquiredAt, createdAt: acquiredAt, updatedAt: acquiredAt }
  if (capacityMl) w.capacityMl = capacityMl
  if (maker) w.maker = maker
  if (forClasses.length) w.forClasses = forClasses
  if (retired) w.retired = true
  if (note) w.note = note
  return w
}

// 一场冲泡用的茶器：主泡器挑最合适的（偶尔换第二合适的），公道杯、品茗杯随手拿
function pickWares(wares, category, rand, at) {
  const owned = wares.filter(w => w.acquiredAt <= at)
  const best = role => {
    const list = owned
      .filter(w => MW.getKind(w.kind).role === role)
      .map(w => ({ w, s: MW.fitScore(w, category) }))
      .sort((a, b) => b.s - a.s)
    if (!list.length) return null
    return (rand() < 0.2 && list[1] ? list[1] : list[0]).w
  }
  const any = role => {
    const list = owned.filter(w => MW.getKind(w.kind).role === role && !w.retired)
    return list.length ? list[Math.floor(rand() * list.length)] : null
  }
  const main = best('main')
  // 玻璃杯直泡、煮茶不用公道杯
  const fair = main && (main.kind === 'glass' || main.kind === 'boil') ? null : any('fair')
  return [main, fair, any('cup')].filter(Boolean).map(w => w._id)
}

// 审评：按茶类画像上下浮动一点
function makeReview(f, rand) {
  const pick = arr => arr[Math.floor(rand() * arr.length)]
  const scores = {}
  Object.keys(f.scores).forEach(k => {
    const r = rand()
    scores[k] = Math.max(1, Math.min(5, f.scores[k] + (r < 0.2 ? -1 : r > 0.8 ? 1 : 0)))
  })
  const review = { liquor: pick(f.liquor), clarity: pick(f.clarity), scores }
  if (rand() < 0.7) review.leaf = f.leaf.filter(() => rand() < 0.7)
  if (review.leaf && !review.leaf.length) delete review.leaf
  return review
}

// 每一泡的审评（无叶底）：在茶类画像上随泡数带点走势（苦涩递减、回甘生津递增），便于看逐泡趋势
function makeSteepReview(f, rand, s, count) {
  const pick = arr => arr[Math.floor(rand() * arr.length)]
  const scores = {}
  Object.keys(f.scores).forEach(k => {
    let drift = 0
    if (k === 'bitter' || k === 'astringent') drift = -(s - 1) * 0.5
    if (k === 'huigan' || k === 'shengjin' || k === 'sweet' || k === 'houyun') drift = (s - 1) * 0.4
    const r = rand()
    const jitter = r < 0.2 ? -1 : r > 0.8 ? 1 : 0
    scores[k] = Math.max(1, Math.min(5, Math.round(f.scores[k] + drift + jitter)))
  })
  return { liquor: pick(f.liquor), clarity: pick(f.clarity), scores }
}

// 一款茶的若干场冲泡：在柜的茶 2–7 场，喝完的 3–5 场且都在一个月前
function makeBrews(tea, wares, rand, now) {
  const cat = getCategory(tea.category)
  const f = FLAVOR[tea.category]
  const pick = arr => arr[Math.floor(rand() * arr.length)]
  const n = tea.finished ? 3 + Math.floor(rand() * 3) : tea._id === 'mock_t06' || tea._id === 'mock_t18' ? 1 : 2 + Math.floor(rand() * 6)
  const out = []
  for (let k = 0; k < n; k++) {
    const minAgo = tea.finished ? 35 : 1
    const dayAgo = minAgo + Math.floor(rand() * Math.min(70, (now - tea.acquiredAt) / DAY - minAgo))
    const d = new Date(now - dayAgo * DAY)
    d.setHours(pick(f.hours), Math.floor(rand() * 60), 0, 0)
    const startedAt = +d
    const manual = rand() < 0.15
    const count = manual ? 1 + Math.floor(rand() * 6) : 3 + Math.floor(rand() * (cat.family === 'hei' || cat.family === 'qing' ? 7 : 4))
    const steeps = []
    let total = 0
    for (let s = 1; s <= count; s++) {
      if (manual) {
        steeps.push({ n: s })
        continue
      }
      const seconds = cat.firstSec + cat.stepSec * (s - 1) + (rand() < 0.3 ? 5 : 0)
      const st = { n: s, seconds }
      if (rand() < 0.35) st.tags = [pick(f.tags)]
      if (rand() < 0.35) st.tastes = [pick(TASTE_POOL)]
      if (rand() < 0.6) st.review = makeSteepReview(f, rand, s, count)
      if (s === 2 && rand() < 0.3) st.note = pick(['这泡最好', '香气最高', '出汤慢了点'])
      steeps.push(st)
      total += seconds + 40
    }
    const tags = []
    steeps.forEach(s => (s.tags || []).forEach(t => tags.indexOf(t) < 0 && tags.push(t)))
    if (!tags.length || rand() < 0.6) [pick(f.tags), pick(f.tags), pick(f.tags)].forEach(t => tags.indexOf(t) < 0 && tags.push(t))
    const r = rand()
    let review = {}
    if (!manual) {
      if (steeps.some(x => x.review)) {
        review = F.aggregateSteepReviews(steeps)
        if (rand() < 0.7) review.leaf = f.leaf.filter(() => rand() < 0.7)
      } else if (rand() < 0.75) {
        review = makeReview(f, rand)
      }
    }
    const brew = {
      _id: tea._id.replace('mock_t', 'mock_b') + '_' + k,
      teaId: tea._id,
      category: tea.category,
      source: manual ? 'manual' : 'timer',
      startedAt,
      endedAt: startedAt + (manual ? 30 * 60 * 1000 : total * 1000),
      leafG: cat.leafG + (rand() < 0.3 ? 1 : 0),
      waterMl: cat.waterMl,
      tempC: cat.tempC,
      steeps,
      tags,
      wareIds: manual ? [] : pickWares(wares, tea.category, rand, startedAt),
      review,
      rating: r < 0.12 ? 0 : r < 0.3 ? 3 : r < 0.7 ? 4 : 5,
      note: rand() < 0.6 ? pick(f.notes) : '',
      createdAt: startedAt,
      updatedAt: startedAt
    }
    // 主泡器有容量就按它的水量
    const main = wares.find(w => w._id === brew.wareIds[0])
    if (main && main.capacityMl && main.capacityMl <= 500 && main.kind !== 'boil') brew.waterMl = main.capacityMl
    out.push(brew)
  }
  return out
}

// 今天已经喝过的（早上一杯龙井、午后一壶祁红），让首页看得出“今日已喝”；还没到点的不放
function todayBrews(teas, wares, rand, now) {
  const out = []
  const spans = [
    ['mock_t01', 8, 30],
    ['mock_t11', 14, 10]
  ]
  spans.forEach(([teaId, h, m], k) => {
    const d = new Date(now)
    d.setHours(h, m, 0, 0)
    const at = +d
    if (now - at < 20 * 60 * 1000) return
    const tea = teas.find(t => t._id === teaId)
    const cat = getCategory(tea.category)
    const steeps = [1, 2, 3, 4].map(n => ({ n, seconds: cat.firstSec + cat.stepSec * (n - 1) }))
    out.push({
      _id: 'mock_today_' + k,
      teaId,
      category: tea.category,
      source: 'timer',
      startedAt: at,
      endedAt: at + 10 * 60 * 1000,
      leafG: cat.leafG,
      waterMl: cat.waterMl,
      tempC: cat.tempC,
      steeps,
      tags: FLAVOR[tea.category].tags.slice(0, 3),
      wareIds: pickWares(wares, tea.category, rand, at),
      review: makeReview(FLAVOR[tea.category], rand),
      rating: 4,
      note: '',
      createdAt: at,
      updatedAt: at
    })
  })
  return out
}

const isMock = r => typeof r._id === 'string' && r._id.indexOf('mock_') === 0

function load(name) {
  try {
    return wx.getStorageSync(DB + name) || []
  } catch (e) {
    return []
  }
}

// 写入演示数据（已是当前版本则跳过）。自己录入的数据保留不动。
function seed() {
  try {
    if (wx.getStorageSync(FLAG) === VERSION) return
  } catch (e) {}
  const now = Date.now()
  const rand = rng(20261030)
  const teas = TEAS.map((row, i) => makeTea(row, i, now))
  const wares = WARES.map((row, i) => makeWare(row, i, now))
  let brews = []
  teas.forEach(t => (brews = brews.concat(makeBrews(t, wares, rand, now))))
  brews = brews.concat(todayBrews(teas, wares, rand, now))

  // 冗余字段：最近一次冲泡的时间与评分
  teas.forEach(t => {
    const last = brews.filter(b => b.teaId === t._id).sort((a, b) => b.startedAt - a.startedAt)[0]
    if (!last) return
    t.lastBrewedAt = last.startedAt
    if (last.rating) t.lastRating = last.rating
  })

  // 自定义描述词：group 为风味轮的亚类
  const tags = [
    { _id: 'mock_tag1', group: '清花', name: '夜来香', createdAt: now },
    { _id: 'mock_tag2', group: '熟果', name: '山楂香', createdAt: now }
  ]
  try {
    wx.setStorageSync(DB + 'teas', load('teas').filter(r => !isMock(r)).concat(teas))
    wx.setStorageSync(DB + 'wares', load('wares').filter(r => !isMock(r)).concat(wares))
    wx.setStorageSync(DB + 'brews', load('brews').filter(r => !isMock(r)).concat(brews))
    wx.setStorageSync(DB + 'tags', load('tags').filter(r => !isMock(r)).concat(tags))
    // 作废 db.js 的缓存，各页下次进入重新读取
    const info = wx.getStorageInfoSync()
    info.keys.forEach(k => {
      if (k === 'teasCache' || k === 'waresCache' || k === 'recentBrewsAt' || k === 'customTagsCache' || k.indexOf('brewsCache_') === 0) wx.removeStorageSync(k)
    })
    wx.setStorageSync(FLAG, VERSION)
  } catch (e) {}
}

module.exports = { seed, TEAS, WARES }
