// 器柜：自己的茶器。器型 kind、材质 material 的 code 存在 wares 集合里。
// role：main 主泡器 | fair 公道杯 | cup 品茗杯 | water 烧水 | other 其他；计时页按 role 分行选。
// 与 config/teaware.js（按茶类推荐的“搭配参考”套组）的关系：套组只是参考插画，这里是实物。
const { classOf } = require('./teaConfig')
const T = require('./teaware')

const KINDS = [
  { code: 'gaiwan', name: '盖碗', role: 'main' },
  { code: 'hu', name: '茶壶', role: 'main' },
  { code: 'glass', name: '玻璃杯', role: 'main' },
  { code: 'boil', name: '煮茶器', role: 'main' },
  { code: 'gongdao', name: '公道杯', role: 'fair' },
  { code: 'cup', name: '品茗杯', role: 'cup' },
  { code: 'kettle', name: '烧水壶', role: 'water' },
  { code: 'other', name: '其他', role: 'other' } // 茶盘、壶承、茶则、茶针……
]

const ROLES = { main: '主泡器', fair: '公道杯', cup: '品茗杯', water: '烧水', other: '其他' }

// color 为器柜里的着色；light 的浅色材质加一道描边；glass 画成透明
const MATERIALS = [
  { code: 'baici', name: '白瓷', color: '#f3f0e8', light: true },
  { code: 'qingci', name: '青瓷', color: '#9fbba6' },
  { code: 'ruyao', name: '汝窑', color: '#b9c9c3', light: true },
  { code: 'heiyou', name: '黑釉 / 建盏', color: '#3b2d26' },
  { code: 'zisha', name: '紫砂', color: '#7a4b3b' },
  { code: 'zhuni', name: '朱泥', color: '#b2593d' },
  { code: 'duanni', name: '段泥', color: '#c9a76e' },
  { code: 'glass', name: '玻璃', color: '#d5e5e8', glass: true },
  { code: 'taoqi', name: '粗陶', color: '#8c7966' },
  { code: 'chaishao', name: '柴烧', color: '#a5704e' },
  { code: 'yin', name: '银', color: '#cfcfca', light: true },
  { code: 'tie', name: '铁', color: '#45433f' },
  { code: 'other', name: '其他', color: '#a9a397' }
]

const getKind = code => KINDS.find(k => k.code === code) || KINDS[KINDS.length - 1]
const getMaterial = code => MATERIALS.find(m => m.code === code) || MATERIALS[MATERIALS.length - 1]

// 搭配参考套组 → 对应的器型与材质
const SET_MATCH = {
  glass: { kind: 'glass' },
  gaiwan: { kind: 'gaiwan', materials: ['baici', 'qingci', 'ruyao'] },
  zisha: { kind: 'hu', materials: ['zisha', 'duanni'] },
  zhuni: { kind: 'hu', materials: ['zhuni'] },
  boil: { kind: 'boil' }
}

// 这件茶器配某茶类的分数：标了“宜泡”的按标的来（一壶不侍二茶），其次看是否合推荐套组的器型、材质
function fitScore(ware, category) {
  const cls = classOf(category)
  let s = 0
  const fc = ware.forClasses || []
  if (fc.length) s += cls && fc.indexOf(cls.code) >= 0 ? 4 : -3
  T.waresOf(category).sets.forEach((set, i) => {
    const m = SET_MATCH[set.id]
    if (!m || m.kind !== ware.kind) return
    s += i === 0 ? 2 : 1
    if (m.materials && m.materials.indexOf(ware.material) >= 0) s += 1
  })
  return s
}

// “白瓷 · 120ml”
function wareSub(w) {
  return [getMaterial(w.material).name, w.capacityMl ? w.capacityMl + 'ml' : ''].filter(Boolean).join(' · ')
}

module.exports = { KINDS, ROLES, MATERIALS, getKind, getMaterial, fitScore, wareSub }
