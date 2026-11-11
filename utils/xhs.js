// 小红书分享：从一条冲泡记录（brews）生成种草文案与分享卡片的数据。
// 纯函数为主，不依赖 wx，方便后续测试；pending 用于把 summary / tea-detail 的
// 记录传给分享页（对象较大，不适合塞 URL）。

const F = require('../config/flavor')
const { getCategory } = require('../config/teaConfig')

// 分享页读取记录用的临时通道
let pending = null
function setPending(data) {
  pending = data
}
function consumePending() {
  const d = pending
  pending = null
  return d
}

function stars(n) {
  n = Math.max(0, Math.min(5, Math.round(n || 0)))
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}

// 香气（整场标签）与滋味（各泡口味词合并去重）
function aromas(brew) {
  return (brew.tags || []).filter(Boolean)
}
function tastes(brew) {
  const out = []
  ;(brew.steeps || []).forEach(s => (s.tastes || []).forEach(t => t && out.indexOf(t) < 0 && out.push(t)))
  return out
}
function liquor(brew) {
  return (brew.review && brew.review.liquor) || ''
}

// 文案风格：只呈现冲泡参数与客观评测结果，不加入主观感受。
// variant 用来在“换一版”时轮换标题 / 排列方式，避免每版完全一样。
const STYLES = [
  { id: 'review', name: '测评笔记' },
  { id: 'params', name: '参数清单' },
  { id: 'data', name: '审评数据' }
]

function hashtags(list, extra) {
  const seen = {}
  const out = []
  ;(list || []).concat(extra || []).forEach(t => {
    t = String(t || '').trim().replace(/^#/, '')
    if (!t || seen[t]) return
    seen[t] = 1
    out.push('#' + t)
  })
  return out
}

// 根据一条冲泡记录生成文案。meta = { teaName, categoryName, wareText }
// 只呈现冲泡参数与客观评测结果（香气 / 滋味 / 汤色 / 叶底 / 评分 / 审评强度），不加入主观感受。
function buildCopy(brew, meta, styleId, variant) {
  meta = meta || {}
  const tea = meta.teaName || '这款茶'
  const cat = meta.categoryName || getCategory(brew.category).name
  const ware = meta.wareText || ''
  const v = ((variant || 0) % 3 + 3) % 3
  const n = (brew.steeps || []).length || 1
  const as = aromas(brew)
  const ts = tastes(brew)
  const lq = liquor(brew)
  const clarity = (brew.review && brew.review.clarity) || ''
  const leaf = (brew.review && brew.review.leaf) || []
  const note = String(brew.note || '').trim()
  const rating = brew.rating || 0
  const scores = (brew.review && brew.review.scores) || {}
  const scoreItems = F.DIMS.filter(d => scores[d.key] > 0).map(d => d.name + ' ' + scores[d.key]).join(' · ')
  const lqTxt = lq + (clarity ? ' · ' + clarity : '')
  const paramLine = '投茶 ' + (brew.leafG || 0) + 'g · 水 ' + (brew.waterMl || 0) + 'ml · ' + (brew.tempC || 0) + '°C · 共 ' + n + ' 泡' + (ware ? ' · 配 ' + ware : '')

  if (styleId === 'params') {
    const titles = ['「' + tea + '」冲泡参数记录', '「' + tea + '」参数清单', '「' + tea + '」冲泡数据 · 参数']
    const ps = []
    ps.push('📋 参数：' + paramLine + '。')
    if (as.length) ps.push('香气：' + as.join('、') + '。')
    if (ts.length) ps.push('滋味：' + ts.join('、') + '。')
    if (lq) ps.push('汤色：' + lqTxt + '。')
    if (leaf.length) ps.push('叶底：' + leaf.join('、') + '。')
    if (rating > 0) ps.push('评分：' + stars(rating) + ' ' + rating + ' / 5。')
    return { title: titles[v], paragraphs: ps, hashtags: hashtags([tea, cat, '泡茶参数', '品茶录', '喝茶日常']) }
  }

  if (styleId === 'data') {
    const titles = ['「' + tea + '」审评数据一览', '「' + tea + '」审评结果', '「' + tea + '」评测数据']
    const ps = []
    ps.push('「' + tea + '」' + cat + (ware ? ' · ' + ware : '') + '。')
    ps.push('📋 参数：' + paramLine + '。')
    if (rating > 0) ps.push('⭐ 综合评分：' + stars(rating) + ' ' + rating + ' / 5。')
    if (scoreItems) ps.push('📐 强度：' + scoreItems + '。')
    if (as.length) ps.push('香气：' + as.join('、') + '。')
    if (ts.length) ps.push('滋味：' + ts.join('、') + '。')
    if (lq) ps.push('汤色：' + lqTxt + '。')
    if (leaf.length) ps.push('叶底：' + leaf.join('、') + '。')
    return { title: titles[v], paragraphs: ps, hashtags: hashtags([tea, cat, '茶叶审评', '品茶录', '喝茶日常']) }
  }

  // 默认测评笔记
  const titles = ['「' + tea + '」冲泡评测 · 参数与结果', '「' + tea + '」评测记录 · 参数与结果', '「' + tea + '」冲泡报告 · 数据记录']
  const ps = []
  ps.push('📋 冲泡参数：' + paramLine + '。')
  if (as.length) ps.push('🌸 香气：' + as.join('、') + '。')
  if (ts.length) ps.push('👅 滋味：' + ts.join('、') + '。')
  if (lq) ps.push('🍵 汤色：' + lqTxt + '。')
  if (leaf.length) ps.push('🍃 叶底：' + leaf.join('、') + '。')
  if (rating > 0) ps.push('⭐ 综合评分：' + stars(rating) + ' ' + rating + ' / 5。')
  if (scoreItems) ps.push('📐 审评强度：' + scoreItems + '。')
  if (note) ps.push('✍️ 总评：' + note)
  return { title: titles[v], paragraphs: ps, hashtags: hashtags([tea, cat, '品茶录', '喝茶日常', '茶叶测评']) }
}

// 分享卡片主题（canvas 用的配色）
const THEMES = [
  { id: 'paper', name: '米纸', bg: '#f8f2e4', bgTop: '#fffaf0', ink: '#2b2a26', sub: '#8a8576', accent: '#4a6b4f', chip: '#efe6d0', line: '#e2d8c0', soft: '#f1ead8' },
  { id: 'green', name: '茶山', bg: '#e9f0e3', bgTop: '#f3f7ee', ink: '#2b362b', sub: '#5d6f5e', accent: '#38543c', chip: '#dbe6d2', line: '#c6d5bd', soft: '#dde8d5' },
  { id: 'moon', name: '月夜', bg: '#2e2b26', bgTop: '#3a352c', ink: '#f3ead8', sub: '#b3a88e', accent: '#c9a86a', chip: '#3d382f', line: '#4a4438', soft: '#38342c' }
]

// 茶类所属家族的颜色（用于卡片上的小点缀）
function familyColor(code) {
  const fam = getCategory(code).family
  const FAM = { lv: '#6b8f4e', bai: '#b9b19a', huang: '#c9a43c', qing: '#4f7c6e', hong: '#a8452f', hei: '#5a4636' }
  return FAM[fam] || '#4a6b4f'
}

// 香气 / 滋味词 → 颜色（风味轮大类 / 滋味分组）
function tagColor(name) {
  const loc = F.locate(name)
  if (loc) return loc.color
  for (const g of F.TASTES) if (g.tags.indexOf(name) >= 0) return g.color
  return ''
}

module.exports = { setPending, consumePending, STYLES, THEMES, buildCopy, stars, aromas, tastes, liquor, familyColor, tagColor }
