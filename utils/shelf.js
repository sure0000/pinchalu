// 茶柜的分组方式。纯函数，不依赖 wx，便于测试。
//   all      全部：按六大茶类依次摆放（茶柜默认视图，逻辑在 pages/cabinet）
//   category 品类：六大茶类 + 普洱（见 teaConfig 的 CLASSES），没有茶的类也列出来
//   region   产地：teas.origin 的省份（“福建武夷山” → 福建），认不出省份时用原文
//   merchant 商家：teas.sourceName（茶友赠的标“赠”）
//   variety  品种：teas.variety（肉桂 / 水仙 / 福鼎大白 …）
//   shelf    自定义：teas.shelves（口粮茶 / 待客 …），一款茶可在多个分组
const { CLASSES, classOf, getCategory } = require('../config/teaConfig')

const MODES = [
  { key: 'all', name: '全部' },
  { key: 'category', name: '品类' },
  { key: 'region', name: '产地' },
  { key: 'merchant', name: '商家' },
  { key: 'variety', name: '品种' },
  { key: 'shelf', name: '自定义' }
]

const NONE = {
  category: '未知茶类',
  region: '未填产地',
  merchant: '未填商家',
  variety: '未填品种',
  shelf: '未分组'
}

// 省级行政区简称，按长度降序匹配（“内蒙古”先于“内蒙”）
const PROVINCES = [
  '内蒙古', '黑龙江', '福建', '云南', '浙江', '安徽', '广东', '广西', '湖南', '湖北', '四川', '贵州', '江西', '江苏',
  '河南', '河北', '山东', '山西', '陕西', '甘肃', '青海', '宁夏', '新疆', '西藏', '重庆', '海南', '台湾', '香港', '澳门',
  '北京', '上海', '天津', '吉林', '辽宁'
]

function regionOf(origin) {
  const o = (origin || '').trim()
  if (!o) return ''
  const p = PROVINCES.find(x => o.indexOf(x) === 0)
  return p || o
}

// 产地去掉省份后的部分：“福建武夷山” → “武夷山”
function placeOf(origin) {
  const o = (origin || '').trim()
  const r = regionOf(o)
  return r && r !== o ? o.slice(r.length).replace(/^[省市\s·]+/, '') : ''
}

function merchantOf(t) {
  const n = (t.sourceName || '').trim()
  if (!n) return ''
  return t.sourceType === 'gift' ? n + '（赠）' : n
}

// 一款茶在某种分组下的组名（自定义分组返回数组）
function keysOf(t, mode) {
  if (mode === 'category') {
    const c = classOf(t.category)
    return [c ? c.name : '']
  }
  if (mode === 'region') return [regionOf(t.origin)]
  if (mode === 'merchant') return [merchantOf(t)]
  if (mode === 'variety') return [(t.variety || '').trim()]
  if (mode === 'shelf') return (t.shelves || []).length ? t.shelves : ['']
  return ['']
}

// 格子下面的小字：补充组名以外最有用的一项
function subOf(t, mode) {
  const cat = getCategory(t.category).name
  if (mode === 'category') {
    // 青茶、普洱下面再分岩茶 / 单丛、生普 / 熟普，小字标出来
    const c = classOf(t.category)
    if (c && c.name !== cat) return [cat, t.variety].filter(Boolean).join(' · ')
    return t.variety || regionOf(t.origin)
  }
  if (mode === 'region') return placeOf(t.origin) || cat
  if (mode === 'merchant') return cat
  if (mode === 'variety') return regionOf(t.origin) || cat
  if (mode === 'shelf') return cat
  return ''
}

const recent = (a, b) => (b.lastBrewedAt || 0) - (a.lastBrewedAt || 0) || (b.createdAt || 0) - (a.createdAt || 0)
// 组内：在柜的在前（最近泡过的靠前），喝完的排后
const inGroup = (a, b) => !!a.finished - !!b.finished || recent(a, b)

// 返回 [{ key, title, teas, on, done, cls }]。品类按 CLASSES 顺序且全部列出，其余按款数多少；“未填”组放最后。
function groupTeas(teas, mode) {
  const map = {}
  const order = []
  if (mode === 'category') {
    CLASSES.forEach(c => {
      map[c.name] = []
      order.push(c.name)
    })
  }
  teas.forEach(t => {
    keysOf(t, mode).forEach(k => {
      if (!map[k]) {
        map[k] = []
        order.push(k)
      }
      if (map[k].indexOf(t) < 0) map[k].push(t)
    })
  })
  const catIndex = name => {
    const i = CLASSES.findIndex(c => c.name === name)
    return i < 0 ? CLASSES.length : i
  }
  const keys = order.slice().sort((a, b) => {
    if (!a !== !b) return a ? -1 : 1
    if (mode === 'category') return catIndex(a) - catIndex(b)
    return map[b].length - map[a].length || order.indexOf(a) - order.indexOf(b)
  })
  return keys.map(k => {
    const list = map[k].slice().sort(inGroup)
    const done = list.filter(t => t.finished).length
    const cls = mode === 'category' ? CLASSES.find(c => c.name === k) : null
    return { key: mode + '_' + (k || 'none'), title: k || NONE[mode], teas: list, on: list.length - done, done, cls }
  })
}

// 所有茶用过的自定义分组名，按用到的款数从多到少
function allShelves(teas) {
  const n = {}
  teas.forEach(t => (t.shelves || []).forEach(s => (n[s] = (n[s] || 0) + 1)))
  return Object.keys(n).sort((a, b) => n[b] - n[a])
}

/* ---------------- 器柜 ---------------- */
//   all      全部：按器型依次摆，收起的排后
//   kind     器型：盖碗 / 茶壶 / 公道杯 …（按 KINDS 顺序）
//   material 材质：白瓷 / 紫砂 / 朱泥 …（按 MATERIALS 顺序）
//   merchant 商家 / 作者：sourceName，其次作者窑口 maker
//   fit      宜泡：forClasses（六大茶类 + 普洱），没标的归“百搭”
const W = require('../config/wares')

const WARE_MODES = [
  { key: 'all', name: '全部' },
  { key: 'kind', name: '器型' },
  { key: 'material', name: '材质' },
  { key: 'merchant', name: '商家' },
  { key: 'fit', name: '宜泡' }
]

function wareKeys(w, mode) {
  if (mode === 'kind') return [W.getKind(w.kind).name]
  if (mode === 'material') return [W.getMaterial(w.material).name]
  if (mode === 'merchant') return [merchantOf(w) || (w.maker || '').trim()]
  if (mode === 'fit') {
    const names = (w.forClasses || []).map(c => (CLASSES.find(x => x.code === c) || {}).name).filter(Boolean)
    return names.length ? names : ['百搭']
  }
  return ['']
}

const wareRank = (mode, name) => {
  const list = mode === 'kind' ? W.KINDS : mode === 'material' ? W.MATERIALS : mode === 'fit' ? CLASSES.concat([{ name: '百搭' }]) : null
  const i = list ? list.findIndex(x => x.name === name) : -1
  return i < 0 ? 999 : i
}

// 组内：在用的在前，同器型挨着，新入手的靠前
const wareOrder = (a, b) =>
  !!a.retired - !!b.retired || wareRank('kind', W.getKind(a.kind).name) - wareRank('kind', W.getKind(b.kind).name) || (b.acquiredAt || b.createdAt || 0) - (a.acquiredAt || a.createdAt || 0)

// 返回 [{ key, title, wares, on, done }]
function groupWares(wares, mode) {
  if (mode === 'all') {
    const list = wares.slice().sort(wareOrder)
    const done = list.filter(w => w.retired).length
    return [{ key: 'all', title: '', wares: list, on: list.length - done, done }]
  }
  const map = {}
  const order = []
  wares.forEach(w => {
    wareKeys(w, mode).forEach(k => {
      if (!map[k]) {
        map[k] = []
        order.push(k)
      }
      map[k].push(w)
    })
  })
  const fixed = mode !== 'merchant'
  const keys = order.slice().sort((a, b) => {
    if (!a !== !b) return a ? -1 : 1
    if (fixed) return wareRank(mode, a) - wareRank(mode, b)
    return map[b].length - map[a].length || order.indexOf(a) - order.indexOf(b)
  })
  return keys.map(k => {
    const list = map[k].slice().sort(wareOrder)
    const done = list.filter(w => w.retired).length
    return { key: mode + '_' + (k || 'none'), title: k || '未填商家', wares: list, on: list.length - done, done }
  })
}

// 格子下面的小字
function wareSubOf(w, mode) {
  if (mode === 'material') return [W.getKind(w.kind).name, w.capacityMl ? w.capacityMl + 'ml' : ''].filter(Boolean).join(' · ')
  if (mode === 'merchant') return W.getKind(w.kind).name
  return W.wareSub(w)
}

module.exports = { MODES, regionOf, placeOf, merchantOf, subOf, groupTeas, allShelves, WARE_MODES, groupWares, wareSubOf }
