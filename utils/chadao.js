// 时令与时辰饮茶：参考复旦大学李辉教授《茶道经》的六茶、六经与子午流注之说。纯函数，不依赖 wx，便于测试。
//
// 六茶对六经：太阳绿茶、太阴白茶、少阴黄茶、少阳红茶、阳明青茶、厥阴黑茶
// 一日时辰：7–9 点绿茶；9–11 点脾经当令宜白茶；11–13 点心经当令宜黄茶；
//          13–15 点小肠经当令宜红茶；15–17 点青茶；17 点以后黑茶；白茶 24 小时皆可
// 四季：春生阳气宜红茶，夏宜绿茶解暑，秋收宜青茶，冬藏宜黑茶，季节之交宜黄茶，白茶四季皆宜
// 另：一日喝茶品种不宜超过三种，临睡前不宜饮茶过量
//
// 原书未细说的地方做了补全：5–7 点并入清晨（绿茶）；21 点后单列“夜里”（黑茶、少量）；
// 季节以四立划分，季节之交按立春 / 立夏 / 立秋 / 立冬前 18 天计。

const DAY = 24 * 3600 * 1000
const DAILY_KINDS = 3 // 一日喝茶品种不宜超过三种
const TRANSITION_DAYS = 18

// effect：首页标注的“品性”，只说口感与适宜的场合，不写保健功效（审核按医疗健康内容卡）
const FAMILIES = {
  lv: { name: '绿茶', jing: '太阳', color: '#6b8f4e', effect: '鲜爽清新，夏日解渴' },
  bai: { name: '白茶', jing: '太阴', color: '#b9b19a', effect: '清甜淡雅，四季皆宜' },
  huang: { name: '黄茶', jing: '少阴', color: '#c9a43c', effect: '甜醇柔和，换季宜饮' },
  qing: { name: '青茶', jing: '阳明', color: '#4f7c6e', effect: '香高耐泡，饭后宜饮' },
  hong: { name: '红茶', jing: '少阳', color: '#a8452f', effect: '甜润温和，舒缓放松' },
  hei: { name: '黑茶', jing: '厥阴', color: '#5a4636', effect: '醇厚顺滑，饭后宜饮', shape: 'jar' } // 茶柜里用陶罐（其余为金属茶叶罐）
}
const FAMILY_ORDER = ['lv', 'bai', 'huang', 'qing', 'hong', 'hei']

// 一日时辰：[start, end) 小时；夜里跨零点
const SHICHEN = [
  { key: 'chen', name: '清晨', range: '5–9', start: 5, end: 9, family: 'lv', text: '清晨宜太阳绿茶，醒神' },
  { key: 'si', name: '巳时', range: '9–11', start: 9, end: 11, family: 'bai', text: '巳时脾经当令，宜太阴白茶' },
  { key: 'wu', name: '午时', range: '11–13', start: 11, end: 13, family: 'huang', text: '午时心经当令，宜少阴黄茶' },
  { key: 'wei', name: '未时', range: '13–15', start: 13, end: 15, family: 'hong', text: '未时小肠经当令，宜少阳红茶' },
  { key: 'shen', name: '申时', range: '15–17', start: 15, end: 17, family: 'qing', text: '申时宜阳明青茶' },
  { key: 'you', name: '傍晚', range: '17–21', start: 17, end: 21, family: 'hei', text: '傍晚以后宜厥阴黑茶' },
  { key: 'ye', name: '夜里', range: '21–5', start: 21, end: 5, family: 'hei', text: '夜里宜温和的黑茶，少量即可', note: '临睡前不宜饮茶过量' }
]

function shichenOf(ms) {
  const h = new Date(ms).getHours()
  const s = SHICHEN.find(x => x.start < x.end && h >= x.start && h < x.end)
  return s ? s.key : 'ye'
}

const getShichen = key => SHICHEN.find(s => s.key === key) || SHICHEN[SHICHEN.length - 1]

/* ---------------- 节气（寿星公式，适用 2001–2099 年） ---------------- */

const TERMS = [
  ['小寒', 5.4055], ['大寒', 20.12], ['立春', 3.87], ['雨水', 18.73], ['惊蛰', 5.63], ['春分', 20.646],
  ['清明', 4.81], ['谷雨', 20.1], ['立夏', 5.52], ['小满', 21.04], ['芒种', 5.678], ['夏至', 21.37],
  ['小暑', 7.108], ['大暑', 22.83], ['立秋', 7.5], ['处暑', 23.13], ['白露', 7.646], ['秋分', 23.042],
  ['寒露', 8.318], ['霜降', 23.438], ['立冬', 7.438], ['小雪', 22.36], ['大雪', 7.18], ['冬至', 21.94]
]

// 该年第 i 个节气（0 = 小寒）的本地零点时间戳
function termAt(year, i) {
  const y = year % 100
  const L = i < 4 ? Math.floor((y - 1) / 4) : Math.floor(y / 4)
  const day = Math.floor(y * 0.2422 + TERMS[i][1]) - L
  return +new Date(year, Math.floor(i / 2), day)
}

// 前一年到后一年的全部节气，按时间排序
function termsAround(year) {
  const out = []
  for (let y = year - 1; y <= year + 1; y++) TERMS.forEach((t, i) => out.push({ name: t[0], at: termAt(y, i) }))
  return out
}

const dayStart = ms => {
  const d = new Date(ms)
  return +new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/* ---------------- 季节 ---------------- */

const SEASONS = {
  spring: { name: '春', family: 'hong', text: '春生，阳气生发，宜红茶' },
  summer: { name: '夏', family: 'lv', text: '夏长，宜绿茶解暑' },
  autumn: { name: '秋', family: 'qing', text: '秋收，宜青茶' },
  winter: { name: '冬', family: 'hei', text: '冬藏，宜黑茶' }
}
const LI = { 立春: 'spring', 立夏: 'summer', 立秋: 'autumn', 立冬: 'winter' }

// → { term, key, name, family, text, baseFamily, baseText, transition, nextLi, daysToNext }
// family / text 是此刻最宜的茶类与说法（季节之交为黄茶）；baseFamily / baseText 是本季本身的。
function seasonOf(ms) {
  const today = dayStart(ms)
  const terms = termsAround(new Date(ms).getFullYear())
  const past = terms.filter(t => t.at <= today)
  const term = past[past.length - 1]
  const lastLi = past.filter(t => LI[t.name]).pop()
  const next = terms.find(t => t.at > today && LI[t.name])
  const key = LI[lastLi.name]
  const s = SEASONS[key]
  const daysToNext = Math.round((next.at - today) / DAY)
  const transition = daysToNext <= TRANSITION_DAYS
  return {
    term: term.name,
    key,
    name: s.name,
    family: transition ? 'huang' : s.family,
    text: transition ? next.name + '还有 ' + daysToNext + ' 天，季节之交宜黄茶' : s.text,
    baseFamily: s.family,
    baseText: s.text,
    transition,
    nextLi: next.name,
    daysToNext
  }
}

/* ---------------- 契合度（0–1） ---------------- */

function timeFit(family, slot) {
  if (!family) return 0
  if (family === slot.family) return 1
  return family === 'bai' ? 0.4 : 0 // 白茶 24 小时皆可，但不压过正当时辰的茶
}

function seasonFit(family, season) {
  if (!family) return 0
  if (family === season.family) return 1
  if (season.transition && family === season.baseFamily) return 0.6
  return family === 'bai' ? 0.4 : 0 // 白茶四季皆宜，但不压过当季的茶
}

module.exports = {
  DAILY_KINDS,
  FAMILIES,
  FAMILY_ORDER,
  SHICHEN,
  shichenOf,
  getShichen,
  termAt,
  seasonOf,
  dayStart,
  timeFit,
  seasonFit
}
