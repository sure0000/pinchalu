// 茶叶风味轮与专业审评。参照茶叶感官审评的常用做法（GB/T 23776 审评方法、GB/T 14487 审评术语）
// 和常见的茶叶香气风味轮整理，按“大类 → 亚类 → 描述词”三层组织。
//   香气：在风味轮上选描述词，存进 brews.tags / steeps[].tags（字符串，与旧数据兼容）
//   滋味：每一泡的口感变化，存进 steeps[].tastes（字符串数组），与香气分开记录
//   审评：汤色、清亮度、十项强度（0–5，雷达图）、叶底，存进 brews.review
// 自定义描述词仍存 tags 集合，group 为亚类名（旧数据的 group 若是大类名，归到该大类的第一个亚类）。

const WHEEL = [
  {
    name: '花香',
    color: '#c4688a',
    subs: [
      { name: '清花', tags: ['兰花香', '栀子花香', '茉莉花香', '玉兰花香', '白兰花香', '荷花香', '珠兰香', '清香'] },
      { name: '甜花', tags: ['桂花香', '玫瑰花香', '蜜兰香', '姜花香', '槐花香', '金银花香', '花蜜香', '野花香'] }
    ]
  },
  {
    name: '果香',
    color: '#d6843a',
    subs: [
      { name: '鲜果', tags: ['青苹果香', '梨香', '柑橘香', '柠檬香', '荔枝香', '青梅香', '柚子香', '佛手柑香', '番石榴香'] },
      { name: '熟果', tags: ['蜜桃香', '熟芒果香', '桂圆香', '红枣香', '葡萄干香', '梅子香', '无花果香', '香蕉香', '百香果香'] },
      { name: '蜜饯', tags: ['蜜枣香', '桂圆干香', '金桔香', '话梅香', '糖渍果香'] }
    ]
  },
  {
    name: '甜香',
    color: '#c99c35',
    subs: [
      { name: '蜜糖', tags: ['蜜香', '冰糖甜香', '红糖香', '焦糖香', '枫糖香', '麦芽糖香', '蜂蜜香'] },
      { name: '乳香', tags: ['奶香', '乳香', '奶油香', '黄油香'] },
      { name: '谷薯', tags: ['糯香', '麦芽香', '米香', '红薯香', '玉米香', '豆浆香', '板栗香'] }
    ]
  },
  {
    name: '青香',
    color: '#6f9a4a',
    subs: [
      { name: '鲜叶', tags: ['嫩香', '青草香', '竹叶香', '粽叶香', '嫩玉米香', '青豆香'] },
      { name: '豆栗', tags: ['豆香', '栗香', '海苔香', '毫香', '豌豆香', '绿豆香', '抹茶香'] },
      { name: '蔬谷', tags: ['黄瓜香', '芦笋香', '甜菜香', '蒸青香', '海藻香'] }
    ]
  },
  {
    name: '焙烤',
    color: '#9c6a3b',
    subs: [
      { name: '火功', tags: ['轻火', '足火', '炭焙香', '烘焙香', '烟熏', '高火香', '岩韵'] },
      { name: '坚果', tags: ['烤坚果香', '杏仁香', '核桃香', '可可香', '咖啡香', '花生香', '芝麻香', '松子香'] },
      { name: '谷麦', tags: ['炒米香', '烤面包香', '饼干香', '爆米花香', '锅巴香', '焦香'] }
    ]
  },
  {
    name: '木辛',
    color: '#7d5a42',
    subs: [
      { name: '木质', tags: ['木香', '松木香', '檀香', '樟香', '雪松香', '沉香', '竹木香'] },
      { name: '辛香', tags: ['桂皮香', '丁香', '姜香', '胡椒香', '八角香', '花椒香', '茴香', '豆蔻香'] }
    ]
  },
  {
    name: '陈韵',
    color: '#6a5244',
    subs: [
      { name: '陈香', tags: ['陈香', '陈皮香', '荷叶香', '参香', '药香', '槟榔香', '旧木香', '樟木香'] },
      { name: '菌土', tags: ['菌菇香', '菌花香', '泥土香', '苔藓香', '松露香'] },
      { name: '药草', tags: ['甘草香', '艾草香', '当归香', '凉茶香'] }
    ]
  },
  {
    name: '矿物',
    color: '#5d7688',
    subs: [
      { name: '岩石', tags: ['矿石香', '湿石香', '火石香', '岩骨花香', '海盐香', '山岩香'] },
      { name: '清凉', tags: ['薄荷香', '樟脑凉', '冷香', '松针香', '凉感'] }
    ]
  },
  {
    name: '瑕疵',
    color: '#8f897d',
    subs: [
      { name: '工艺', tags: ['生青', '闷味', '焦味', '烟味', '水闷', '青气', '馊味', '酸馊'] },
      { name: '存放', tags: ['堆味', '仓味', '霉味', '杂味', '酸味', '陈腐味', '油哈味'] }
    ]
  }
]

// 审评十项强度（0 未评，1–5），雷达图按这个顺序排一圈
const DIMS = [
  { key: 'aroma', name: '香气', hint: '香高' },
  { key: 'lasting', name: '持久', hint: '香久' },
  { key: 'sweet', name: '甜度', hint: '甜' },
  { key: 'umami', name: '鲜爽', hint: '鲜' },
  { key: 'body', name: '醇厚', hint: '汤感厚' },
  { key: 'huigan', name: '回甘', hint: '' },
  { key: 'shengjin', name: '生津', hint: '' },
  { key: 'houyun', name: '喉韵', hint: '韵' },
  { key: 'bitter', name: '苦', hint: '' },
  { key: 'astringent', name: '涩', hint: '' }
]

// 滋味（每一泡的口感变化，按“分组 → 描述词”组织，多选；与香气风味轮分开记录）
// 参照 GB/T 14487 审评术语的滋味用词：醇、甘、鲜、爽、厚、滑、回甘、生津、苦、涩、酸、淡薄等
const TASTES = [
  { name: '甘甜', color: '#c99c35', tags: ['清甜', '甘甜', '蜜甜', '冰糖甜', '甜醇', '回甘'] },
  { name: '鲜爽', color: '#6f9a4a', tags: ['鲜爽', '鲜醇', '清鲜', '爽口', '鲜甜', '清冽'] },
  { name: '醇厚', color: '#9c6a3b', tags: ['醇厚', '醇和', '浓醇', '饱满', '顺滑', '绵柔', '细腻', '稠厚'] },
  { name: '回韵', color: '#5d7688', tags: ['生津', '喉韵', '清凉感', '岩韵', '陈韵', '余韵长'] },
  { name: '苦', color: '#7d5a42', tags: ['微苦', '苦', '苦后化开', '苦底'] },
  { name: '涩', color: '#8f897d', tags: ['微涩', '涩', '收敛', '涩后化开'] },
  { name: '酸', color: '#d6843a', tags: ['微酸', '果酸', '酸'] },
  { name: '淡薄', color: '#a9a397', tags: ['清淡', '平和', '淡薄', '水味'] }
]

// 汤色（GB/T 14487 常用汤色术语）
const LIQUORS = [
  { name: '嫩绿', color: '#cfdc86' },
  { name: '黄绿', color: '#d9d47c' },
  { name: '浅黄', color: '#efdf9c' },
  { name: '杏黄', color: '#e9c96a' },
  { name: '金黄', color: '#e2ae48' },
  { name: '橙黄', color: '#d9943a' },
  { name: '橙红', color: '#c4672e' },
  { name: '红亮', color: '#a9412a' },
  { name: '红浓', color: '#862f22' },
  { name: '褐红', color: '#6c3122' },
  { name: '深褐', color: '#48291d' }
]

const CLARITY = ['清澈', '明亮', '尚亮', '浑浊']

// 叶底
const LEAF = ['细嫩', '芽叶完整', '肥厚', '匀整', '柔软', '有弹性', '绿叶红镶边', '花杂', '焦斑', '硬杂']

// 逐泡趋势图展示的滋味强度维度：审评十项里与口感最相关的八项（去掉香气、持久）
const TREND_DIMS = ['sweet', 'umami', 'body', 'huigan', 'shengjin', 'houyun', 'bitter', 'astringent']
const TREND_NAMES = TREND_DIMS.map(k => DIMS.find(d => d.key === k))

// 苦、涩两项偏负面，趋势图里用暖色区分，其余用茶绿
function trendColor(key) {
  return key === 'bitter' || key === 'astringent' ? '#b5651d' : '#4a6b4f'
}

// 汇总每一泡的专业审评：汤色取最常见、清亮度取最常见、十项强度取各泡打分平均值（只算打了分的泡）。叶底只在整场层面，不参与汇总。
function aggregateSteepReviews(steeps) {
  const acc = {}
  const liquors = {}
  const clarity = {}
  ;(steeps || []).forEach(s => {
    const r = (s && s.review) || {}
    if (r.liquor) liquors[r.liquor] = (liquors[r.liquor] || 0) + 1
    if (r.clarity) clarity[r.clarity] = (clarity[r.clarity] || 0) + 1
    const sc = r.scores || {}
    Object.keys(sc).forEach(k => {
      acc[k] = acc[k] || { sum: 0, cnt: 0 }
      acc[k].sum += sc[k]
      acc[k].cnt++
    })
  })
  const scores = {}
  Object.keys(acc).forEach(k => {
    const v = Math.round((acc[k].sum / acc[k].cnt) * 10) / 10
    if (v > 0) scores[k] = v
  })
  const top = obj => Object.keys(obj).sort((a, b) => obj[b] - obj[a])[0] || ''
  const out = {}
  if (top(liquors)) out.liquor = top(liquors)
  if (top(clarity)) out.clarity = top(clarity)
  if (Object.keys(scores).length) out.scores = scores
  return out
}

// 旧版亚类名 → 新版亚类名（风味轮扩充后，老用户的自定义描述词仍能归位）
const SUB_ALIASES = { '乳谷': '谷薯', '豆藻': '豆栗' }

// 带上自定义描述词的风味轮：[{ name, color, subs: [{ name, tags: [{ name, custom }] }] }]
function mergeWheel(custom) {
  const wheel = WHEEL.map(c => ({
    name: c.name,
    color: c.color,
    subs: c.subs.map(s => ({ name: s.name, tags: s.tags.map(name => ({ name, custom: false })) }))
  }))
  ;(custom || []).forEach(t => {
    let sub = null
    const group = SUB_ALIASES[t.group] || t.group
    wheel.forEach(c => {
      if (sub) return
      if (c.name === group) sub = c.subs[0]
      else sub = c.subs.find(s => s.name === group) || null
    })
    if (sub && !sub.tags.some(x => x.name === t.name)) sub.tags.push({ name: t.name, custom: true })
  })
  return wheel
}

// 描述词 → { cat, color, sub }，认不出（旧标签、口感类词）返回 null
const INDEX = {}
WHEEL.forEach(c => c.subs.forEach(s => s.tags.forEach(t => (INDEX[t] = { cat: c.name, color: c.color, sub: s.name }))))

function locate(tag, custom) {
  if (INDEX[tag]) return INDEX[tag]
  const t = (custom || []).find(x => x.name === tag)
  if (!t) return null
  const group = SUB_ALIASES[t.group] || t.group
  for (const c of WHEEL) {
    if (c.name === group) return { cat: c.name, color: c.color, sub: c.subs[0].name }
    const s = c.subs.find(x => x.name === group)
    if (s) return { cat: c.name, color: c.color, sub: s.name }
  }
  return null
}

const liquorColor = name => (LIQUORS.find(l => l.name === name) || {}).color || ''

// 把 #rrggbb 往 bg 方向混 k（0–1），风味轮上没选中的扇区用浅色
function mix(hex, k, bg) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  const a = p(hex)
  const b = p(bg || '#fffdf8')
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('')
}

module.exports = { WHEEL, TASTES, DIMS, LIQUORS, CLARITY, LEAF, TREND_DIMS, TREND_NAMES, trendColor, aggregateSteepReviews, mergeWheel, locate, liquorColor, mix }
