const xhs = require('../../utils/xhs')
const fmt = require('../../utils/format')
const F = require('../../config/flavor')
const db = require('../../utils/db')

// 卡片尺寸（逻辑像素，按 3:4 设计，750×1000）
const CW = 750
const CH = 1000

// 生成一整套图：主图 + 风味轮 + 每一泡 + 香气与滋味雷达 + 评分总评
// 每张图对应“本场汇总”里的一个模块，不跨模块混排；每一泡用汇总页列表样式（一页放不下则分页）。
function buildSlides(brew, steepsPages) {
  const slides = [
    { id: 'cover', label: '主图' },
    { id: 'wheel', label: '风味轮' }
  ]
  ;(steepsPages || []).forEach((group, i) => {
    slides.push({ id: 'steeps', steeps: group, label: steepsPages.length > 1 ? '每一泡 · ' + (i + 1) : '每一泡' })
  })
  slides.push({ id: 'radar', label: '香气与滋味' })
  slides.push({ id: 'rating', label: '评分与总评' })
  return slides
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function rgba(hex, a) {
  const n = parseInt(String(hex).slice(1), 16)
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'
}

function wrap(ctx, text, maxW) {
  const out = []
  let line = ''
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW) {
      if (line) out.push(line)
      line = ch
    } else {
      line += ch
    }
  }
  if (line) out.push(line)
  return out
}

function truncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text
  let s = text
  while (s.length && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1)
  return s + '…'
}

function drawChips(ctx, items, x, y, maxW, theme, cap) {
  items = (items || []).slice(0, cap || 6)
  if (!items.length) return y
  let cx = x
  let cy = y
  const lineH = 60
  const chipH = 48
  items.forEach((name, i) => {
    const color = xhs.tagColor(name) || theme.accent
    ctx.font = '26px sans-serif'
    const w = ctx.measureText(name).width + 42
    if (i > 0 && cx + w > x + maxW) {
      cx = x
      cy += lineH
    }
    rr(ctx, cx, cy, w, chipH, 24)
    ctx.fillStyle = theme.chip
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx + 24, cy + chipH / 2, 9, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.fillStyle = theme.ink
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.font = '26px sans-serif'
    ctx.fillText(name, cx + 40, cy + chipH / 2 + 1)
    cx += w + 14
  })
  return cy + lineH
}

function drawFooter(ctx, t) {
  // 右下角水印
  ctx.fillStyle = t.sub
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.font = '24px sans-serif'
  ctx.fillText('品茶录', CW - 56, CH - 48)
}

// 评审图通用画框：背景、左侧色条、标题、分隔线、底部品牌
function slideFrame(ctx, t, title) {
  bg(ctx, t)
  ctx.fillStyle = t.ink
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = 'bold 44px sans-serif'
  ctx.fillText(title, 56, 96)
  ctx.strokeStyle = t.line
  ctx.beginPath()
  ctx.moveTo(56, 140)
  ctx.lineTo(CW - 56, 140)
  ctx.stroke()
  drawFooter(ctx, t)
}

function emptyMsg(ctx, t, text) {
  ctx.fillStyle = t.sub
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '28px sans-serif'
  ctx.fillText(text, CW / 2, 500)
}

// 渐变背景 + 装饰圆
function bg(ctx, t) {
  const g = ctx.createLinearGradient(0, 0, 0, CH)
  g.addColorStop(0, t.bgTop || t.bg)
  g.addColorStop(1, t.bg)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, CW, CH)
  ctx.fillStyle = rgba(t.accent, 0.06)
  ctx.beginPath()
  ctx.arc(CW - 60, 60, 130, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = rgba(t.accent, 0.05)
  ctx.beginPath()
  ctx.arc(60, CH - 60, 150, 0, Math.PI * 2)
  ctx.fill()
}

// 居中一排“关键词贴纸”
function centerChips(ctx, items, cy, theme, cap) {
  items = (items || []).slice(0, cap || 3)
  if (!items.length) return
  const chipH = 46
  const gap = 14
  ctx.font = '24px sans-serif'
  const widths = items.map(name => ctx.measureText(name).width + 46)
  const total = widths.reduce((s, w, i) => s + w + (i ? gap : 0), 0)
  let cx = CW / 2 - total / 2
  items.forEach((name, i) => {
    const color = xhs.tagColor(name) || theme.accent
    const w = widths[i]
    rr(ctx, cx, cy, w, chipH, 23)
    ctx.fillStyle = theme.chip
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx + 20, cy + chipH / 2, 7, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.fillStyle = theme.ink
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.font = '24px sans-serif'
    ctx.fillText(name, cx + 34, cy + chipH / 2 + 1)
    cx += w + gap
  })
}


/* ---------------- 各张图画法 ---------------- */

function drawCup(ctx, cx, cy, color, soup, s) {
  s = s || 1
  // 杯身（倒梯形）
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(cx - 62 * s, cy - 26 * s)
  ctx.lineTo(cx + 62 * s, cy - 26 * s)
  ctx.lineTo(cx + 46 * s, cy + 32 * s)
  ctx.lineTo(cx - 46 * s, cy + 32 * s)
  ctx.closePath()
  ctx.fill()
  // 杯口
  ctx.beginPath()
  ctx.ellipse(cx, cy - 26 * s, 62 * s, 15 * s, 0, 0, Math.PI * 2)
  ctx.fillStyle = rgba(color, 0.85)
  ctx.fill()
  // 茶汤
  ctx.beginPath()
  ctx.ellipse(cx, cy - 26 * s, 50 * s, 11 * s, 0, 0, Math.PI * 2)
  ctx.fillStyle = soup || '#e9c96a'
  ctx.fill()
  // 底座
  ctx.fillStyle = rgba('#2b2a26', 0.22)
  ctx.fillRect(cx - 16 * s, cy + 32 * s, 32 * s, 6 * s)
}

function drawSteam(ctx, cx, y, color, s) {
  s = s || 1
  ctx.strokeStyle = color
  ctx.lineWidth = 5 * s
  ctx.lineCap = 'round'
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath()
    ctx.moveTo(cx + i * 30 * s, y)
    ctx.bezierCurveTo(cx + i * 30 * s - 12 * s, y - 26 * s, cx + i * 30 * s + 12 * s, y - 46 * s, cx + i * 30 * s, y - 66 * s)
    ctx.stroke()
  }
}

// 主图使用照片背景时的配色：暖白文字 + 柔和金色点缀，优雅且易读
function photoTheme(t) {
  return {
    id: t.id,
    name: t.name,
    bg: t.bg,
    bgTop: t.bgTop,
    soft: t.soft,
    ink: '#fff7e6',
    sub: 'rgba(255,247,230,0.92)',
    line: 'rgba(255,247,230,0.4)',
    chip: 'rgba(255,247,230,0.18)',
    accent: '#eec87c'
  }
}

// 照片铺满 750×1000（aspectFill），叠加更实的中部遮罩保证文字对比度
function drawPhotoBg(ctx, img) {
  const iw = img.width || CW
  const ih = img.height || CH
  const scale = Math.max(CW / iw, CH / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(img, (CW - dw) / 2, (CH - dh) / 2, dw, dh)
  const g = ctx.createLinearGradient(0, 0, 0, CH)
  g.addColorStop(0, 'rgba(0,0,0,0.55)')
  g.addColorStop(0.32, 'rgba(0,0,0,0.3)')
  g.addColorStop(0.7, 'rgba(0,0,0,0.36)')
  g.addColorStop(1, 'rgba(0,0,0,0.72)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, CW, CH)
}

function drawCover(ctx, t, brew, meta, photo) {
  if (photo) {
    drawPhotoBg(ctx, photo)
    t = photoTheme(t)
    // 柔和阴影，让暖白文字在亮/暗照片上都能清晰阅读
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 6
    ctx.shadowOffsetY = 1
  } else {
    bg(ctx, t)
  }

  // 顶部：左上角品牌 + 右上角装饰小杯
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = t.sub
  ctx.font = '22px sans-serif'
  ctx.fillText('品 茶 录', 56, 74)
  const soup = F.liquorColor(xhs.liquor(brew)) || '#e9c96a'
  drawCup(ctx, 640, 168, xhs.familyColor(brew.category), soup, 0.55)
  drawSteam(ctx, 640, 136, t.accent, 0.55)

  ctx.textAlign = 'center'

  // 大标题：一眼看出是“评测”
  ctx.fillStyle = t.ink
  ctx.font = 'bold 92px sans-serif'
  ctx.fillText('茶叶测评', CW / 2, 250)
  ctx.fillStyle = t.accent
  rr(ctx, CW / 2 - 64, 282, 128, 8, 4)
  ctx.fill()

  // 分隔线（去掉副标题后上移）
  ctx.strokeStyle = t.line
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(160, 330)
  ctx.lineTo(CW - 160, 330)
  ctx.stroke()

  // 茶名
  const name = meta.teaName || '这款茶'
  let size = 54
  ctx.font = 'bold ' + size + 'px sans-serif'
  const maxNameW = CW - 120
  while (ctx.measureText(name).width > maxNameW && size > 34) {
    size -= 2
    ctx.font = 'bold ' + size + 'px sans-serif'
  }
  ctx.fillStyle = t.ink
  ctx.fillText(name, CW / 2, 396)

  // 茶类 · 日期
  const metaLine = [meta.categoryName, fmt.date(brew.startedAt)].filter(Boolean).join(' · ')
  ctx.fillStyle = t.sub
  ctx.font = '26px sans-serif'
  ctx.fillText(metaLine, CW / 2, 446)

  // 评分
  if (brew.rating > 0) {
    ctx.fillStyle = '#d9a441'
    ctx.font = '36px sans-serif'
    ctx.fillText(xhs.stars(brew.rating), CW / 2, 504)
    ctx.fillStyle = t.sub
    ctx.font = '24px sans-serif'
    ctx.fillText('综合评分 ' + brew.rating + ' / 5', CW / 2, 540)
  }

  // 关键词（最多 3 个，一排）
  const keys = xhs.aromas(brew).concat(xhs.tastes(brew)).slice(0, 3)
  centerChips(ctx, keys, brew.rating > 0 ? 590 : 516, t, 3)

  // 参数一行（重置对齐，避免受关键词贴纸影响）
  const paramsLine = '投茶 ' + (brew.leafG || 0) + 'g · 水 ' + (brew.waterMl || 0) + 'ml · ' + (brew.tempC || 0) + '°C · ' + ((brew.steeps || []).length || 1) + ' 泡'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = t.sub
  ctx.font = '26px sans-serif'
  ctx.fillText(paramsLine, CW / 2, 678)

  // 汤色 + 叶底
  const lq = xhs.liquor(brew)
  const clarity = (brew.review && brew.review.clarity) || ''
  const leaf = (brew.review && brew.review.leaf) || []
  let extraY = 728
  if (lq) {
    const lqc = F.liquorColor(lq) || t.accent
    ctx.font = '24px sans-serif'
    const lqTxt = lq + (clarity ? ' · ' + clarity : '')
    const tw = ctx.measureText('汤色 ' + lqTxt).width + 34
    const sx = CW / 2 - tw / 2
    ctx.beginPath()
    ctx.arc(sx + 11, extraY - 8, 8, 0, Math.PI * 2)
    ctx.fillStyle = lqc
    ctx.fill()
    ctx.fillStyle = t.sub
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = '24px sans-serif'
    ctx.fillText('汤色 ' + lqTxt, sx + 28, extraY)
    extraY += 42
  }
  if (leaf.length) {
    ctx.fillStyle = t.sub
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.font = '24px sans-serif'
    ctx.fillText(truncate(ctx, '叶底 ' + leaf.join('、'), CW - 120), CW / 2, extraY)
  }

  drawFooter(ctx, t)
}

// 香气风味轮：外圈亚类、内圈大类、中心显示已选数（对照 flavor-wheel 组件）
function drawFlavorWheel(ctx, cx, cy, R, brew) {
  const sel = brew.tags || []
  const bg = '#fffdf8'
  const IN_R = 0.56
  const HOLE_R = 0.25
  const GAP = 0.6
  const wheel = F.mergeWheel(db.cachedCustomTags())
  const subs = []
  wheel.forEach(c => c.subs.forEach(s => subs.push({ c, s })))
  const step = 360 / subs.length
  const has = s => s.tags.some(t => sel.indexOf(t.name) >= 0)
  const rad = d => ((d - 90) * Math.PI) / 180

  // 白色底盘，让扇区间的白缝与汇总页一致
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.fillStyle = bg
  ctx.fill()

  // 外圈亚类扇区（带白缝）
  subs.forEach((x, i) => {
    const lit = has(x.s)
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, R, rad(i * step + GAP / 2), rad((i + 1) * step - GAP / 2))
    ctx.closePath()
    ctx.fillStyle = F.mix(x.c.color, lit ? 0.22 : 0.8, bg)
    ctx.fill()
  })

  // 内圈大类扇区（带白缝）
  let idx = 0
  wheel.forEach(c => {
    const start = idx
    c.subs.forEach(() => idx++)
    const end = idx
    const lit = subs.slice(start, end).some(x => has(x.s))
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, R * IN_R, rad(start * step + GAP / 2), rad(end * step - GAP / 2))
    ctx.closePath()
    ctx.fillStyle = F.mix(c.color, lit ? 0 : 0.72, bg)
    ctx.fill()
  })

  // 内外圈之间的白缝 + 中心留白
  ctx.beginPath()
  ctx.arc(cx, cy, R * IN_R, 0, Math.PI * 2)
  ctx.strokeStyle = bg
  ctx.lineWidth = 6
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, R * HOLE_R, 0, Math.PI * 2)
  ctx.fillStyle = bg
  ctx.fill()
  ctx.strokeStyle = bg
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.fillStyle = '#38543c'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 40px serif'
  ctx.fillText(String(sel.length || '香'), cx, cy - 10)
  ctx.fillStyle = '#8a8576'
  ctx.font = '18px sans-serif'
  ctx.fillText(sel.length ? '已选' : '点扇区', cx, cy + 22)

  // 大类标签（横写）
  let startIdx = 0
  wheel.forEach(c => {
    const endIdx = startIdx + c.subs.length
    const lit = subs.slice(startIdx, endIdx).some(x => has(x.s))
    const mid = ((startIdx + endIdx) / 2) * step
    const ang = (mid * Math.PI) / 180
    const r = R * (HOLE_R + IN_R) / 2
    ctx.fillStyle = lit ? '#fff' : 'rgba(43,42,38,0.4)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 22px sans-serif'
    ctx.fillText(c.name, cx + r * Math.sin(ang), cy - r * Math.cos(ang))
    startIdx = endIdx
  })

  // 亚类标签（全部沿半径方向写，左半边转 180° 保持正着读）
  subs.forEach((x, i) => {
    const lit = has(x.s)
    const mid = (i + 0.5) * step
    const ang = (mid * Math.PI) / 180
    const r = R * (IN_R + 1) / 2
    const rot = ((mid < 180 ? mid - 90 : mid + 90) * Math.PI) / 180
    ctx.save()
    ctx.translate(cx + r * Math.sin(ang), cy - r * Math.cos(ang))
    ctx.rotate(rot)
    ctx.fillStyle = lit ? '#fff' : 'rgba(43,42,38,0.4)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '20px sans-serif'
    ctx.fillText(x.s.name, 0, 0)
    ctx.restore()
  })
}

// 风味轮单独一张：只画风味轮模块（本场香气标签），布局与汇总页一致
function drawWheelContent(ctx, t, brew) {
  const sel = (brew.tags || []).slice()
  const R = 258
  const wheelTop = 176
  drawFlavorWheel(ctx, CW / 2, wheelTop + R, R, brew)

  if (sel.length) {
    // 已选香气标签放到风味轮下方
    const labelY = wheelTop + R * 2 + 34
    ctx.fillStyle = t.sub
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = '22px sans-serif'
    ctx.fillText('已 选 香 气', 56, labelY)
    drawChips(ctx, sel, 56, labelY + 10, CW - 112, t, 8)
  } else {
    ctx.fillStyle = t.sub
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '26px sans-serif'
    ctx.fillText('本场还没有记录香气，可在汇总页风味轮上点选', CW / 2, 820)
  }
}

// 汤色点（同汇总页 .slq：汤色 + 白内环 + 米色外圈）
function drawLiquorDot(ctx, cx, cy, color) {
  ctx.beginPath()
  ctx.arc(cx, cy, 15, 0, Math.PI * 2)
  ctx.fillStyle = '#e4dccb'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, 13, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, 10, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 4
  ctx.stroke()
}

// 该泡的审评明细（香气/甜度/醇厚等，0–5 分）在条目里展开描述，替代头部的“N 项”
function steepScoreText(review) {
  const scores = (review && review.scores) || {}
  const items = F.DIMS.filter(d => scores[d.key] > 0).map(d => d.name + ' ' + scores[d.key])
  return items.length ? '评 · ' + items.join(' · ') : ''
}

// 每一泡条目高度（供分页测量，与 drawSteepEntry 排版一致）
function steepEntryHeight(ctx, s) {
  ctx.font = '26px sans-serif'
  let h = 44
  const rows = []
  if ((s.tags || []).length) rows.push('香 · ' + (s.tags || []).join('、'))
  if ((s.tastes || []).length) rows.push('味 · ' + (s.tastes || []).join('、'))
  const scoreLine = steepScoreText(s.review || {})
  if (scoreLine) rows.push(scoreLine)
  const note = String(s.note || '').trim()
  if (note) rows.push(note)
  rows.forEach(r => { h += 44 * wrap(ctx, r, CW - 112).length + 8 })
  if (!rows.length) h += 8
  h += 44 // 与下一泡的间距
  return h
}

// 该泡是否有值得展示的内容（无内容且无时长的空泡不入“每一泡”图）
function steepHasContent(s) {
  return !!(s.tags || []).length || !!(s.tastes || []).length || !!String(s.note || '').trim() ||
    !!(s.review && (Object.keys(s.review.scores || {}).length || s.review.liquor || s.review.clarity)) ||
    !!s.seconds
}

// 每一泡条目：样式与“本场汇总”的每一泡一致（第 N 泡 + 时长/汤色点 + 香/味/审评明细/备注）
function drawSteepEntry(ctx, t, s, y) {
  const review = s.review || {}
  const tags = (s.tags || []).slice()
  const tastes = (s.tastes || []).slice()
  const note = String(s.note || '').trim()
  const dur = s.seconds ? fmt.duration(s.seconds) : ''
  const liquor = review.liquor || ''
  const TEAD = '#38543c'
  const MUTED = '#8a8576'

  // 头部行：左“第 N 泡”，右“时长 · 汤色点”
  ctx.fillStyle = t.ink
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = 'bold 30px sans-serif'
  ctx.fillText('第 ' + s.n + ' 泡', 56, y)

  let rx = CW - 56
  ctx.textAlign = 'right'
  if (liquor) {
    drawLiquorDot(ctx, rx - 15, y - 11, F.liquorColor(liquor) || t.accent)
    rx -= 30 + 16
  }
  if (dur) {
    ctx.fillStyle = MUTED
    ctx.font = '24px sans-serif'
    ctx.fillText(dur, rx, y)
  }

  // 香 / 味 / 审评明细 / 备注
  let yy = y + 44
  const rows = []
  if (tags.length) rows.push({ text: '香 · ' + tags.join('、'), color: TEAD })
  if (tastes.length) rows.push({ text: '味 · ' + tastes.join('、'), color: TEAD })
  const scoreLine = steepScoreText(review)
  if (scoreLine) rows.push({ text: scoreLine, color: '#d9a441' })
  if (note) rows.push({ text: note, color: MUTED })
  rows.forEach(r => {
    ctx.font = '26px sans-serif'
    const wrapped = wrap(ctx, r.text, CW - 112)
    ctx.fillStyle = r.color
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    wrapped.forEach((w, i) => ctx.fillText(w, 56, yy + i * 44))
    yy += wrapped.length * 44 + 8
  })
  if (!rows.length) yy += 8

  // 与下一泡之间留出间距（不画横线）
  yy += 44
  return yy
}

// “每一泡”一张（一页放不下自动分页）：按汇总页列表样式连续排列
function drawSteepsContent(ctx, t, steeps) {
  let y = 190
  ;(steeps || []).forEach(s => { y = drawSteepEntry(ctx, t, s, y) })
}

// 香气与滋味雷达图 + 十项评分明细（来自整场专业审评模块）
function drawRadarContent(ctx, t, brew) {
  const scores = (brew.review && brew.review.scores) || {}
  const dims = F.DIMS
  const vals = dims.map(d => scores[d.key] || 0)
  if (!vals.some(v => v > 0)) return emptyMsg(ctx, t, '本场还没有香气与滋味评分')

  const cx = CW / 2
  const cy = 400
  const R = 210
  const n = dims.length
  const SPAN = 0.78
  const pt = (i, frac) => {
    const a = (i / n) * Math.PI * 2
    return { x: cx + R * frac * Math.sin(a), y: cy - R * frac * Math.cos(a) }
  }

  // 网格环 1–5
  for (let l = 5; l >= 1; l--) {
    ctx.beginPath()
    dims.forEach((d, i) => {
      const p = pt(i, (l / 5) * SPAN)
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
    })
    ctx.closePath()
    ctx.strokeStyle = l === 5 ? t.line : rgba(t.line, 0.6)
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // 辐条
  dims.forEach((d, i) => {
    const p = pt(i, SPAN)
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(p.x, p.y)
    ctx.strokeStyle = rgba(t.line, 0.7)
    ctx.lineWidth = 1
    ctx.stroke()
  })

  // 数值多边形 + 点
  ctx.beginPath()
  dims.forEach((d, i) => {
    const v = Math.max(0.04, (vals[i] || 0) / 5)
    const p = pt(i, v * SPAN)
    i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
  })
  ctx.closePath()
  ctx.fillStyle = rgba(t.accent, 0.32)
  ctx.fill()
  ctx.strokeStyle = t.accent
  ctx.lineWidth = 2
  ctx.stroke()
  dims.forEach((d, i) => {
    if (vals[i] > 0) {
      const p = pt(i, (vals[i] / 5) * SPAN)
      ctx.beginPath()
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
      ctx.fillStyle = t.accent
      ctx.fill()
    }
  })

  // 轴标签：名称 + 分值
  dims.forEach((d, i) => {
    const p = pt(i, 1.04)
    ctx.fillStyle = t.ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '22px sans-serif'
    ctx.fillText(d.name, p.x, p.y - 8)
    if (vals[i] > 0) {
      ctx.fillStyle = t.accent
      ctx.font = '20px sans-serif'
      ctx.fillText(String(vals[i]), p.x, p.y + 16)
    }
  })

  // 评分明细（0–5 分）
  let y = 650
  ctx.fillStyle = t.sub
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = '22px sans-serif'
  ctx.fillText('评 分 明 细 · 0–5 分', 56, y)
  y += 30
  dims.forEach((d, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = 56 + col * 330
    const yy = y + row * 34
    ctx.fillStyle = t.ink
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = '24px sans-serif'
    ctx.fillText(d.name, x, yy + 16)
    for (let k = 1; k <= 5; k++) {
      ctx.beginPath()
      ctx.arc(x + 92 + (k - 1) * 26, yy + 12, 7, 0, Math.PI * 2)
      ctx.fillStyle = k <= Math.round(vals[i]) ? t.accent : t.chip
      ctx.fill()
    }
    ctx.fillStyle = t.sub
    ctx.font = '22px sans-serif'
    ctx.fillText(vals[i] > 0 ? String(vals[i]) : '—', x + 92 + 5 * 26 + 8, yy + 16)
  })
}

function drawRatingContent(ctx, t, brew) {
  let y = 250

  // 评分标题
  ctx.fillStyle = t.sub
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = '22px sans-serif'
  ctx.fillText('评 分', 56, y)

  // 星标（与上方标题拉开间距，避免重叠）
  y += 76
  ctx.fillStyle = '#d9a441'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = '56px sans-serif'
  ctx.fillText(xhs.stars(brew.rating), 56, y)
  ctx.fillStyle = t.sub
  ctx.font = '26px sans-serif'
  ctx.fillText(brew.rating > 0 ? (brew.rating + ' / 5 分') : '未评分', 56 + 340, y)
  y += 90

  // 总评
  ctx.fillStyle = t.sub
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = '22px sans-serif'
  ctx.fillText('总 评', 56, y)
  y += 34
  const note = String(brew.note || '').trim()
  if (note) {
    ctx.fillStyle = t.ink
    ctx.font = '28px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    const lines = wrap(ctx, note, CW - 112).slice(0, 8)
    lines.forEach((ln, i) => {
      ctx.fillText(ln, 56, y + i * 44)
    })
  } else {
    ctx.fillStyle = t.sub
    ctx.font = '28px sans-serif'
    ctx.fillText('未记录总评', 56, y)
  }
}

Page({
  data: {
    ready: false,
    styles: xhs.STYLES.map(s => s.name),
    styleIndex: 0,
    themes: xhs.THEMES.map(t => t.name),
    themeIndex: 0,
    slideLabels: [],
    slideIndex: 0,
    title: '',
    paragraphs: [],
    hashtags: '',
    copyText: '',
    images: [],
    coverPhoto: '',
    generating: false,
    saving: false
  },

  onLoad() {
    const data = xhs.consumePending()
    if (!data || !data.brew) {
      wx.showToast({ title: '没有可分享的记录', icon: 'none' })
      return setTimeout(() => wx.navigateBack(), 800)
    }
    this.brew = data.brew
    this.meta = {
      teaName: data.teaName || '这款茶',
      categoryName: data.categoryName || '',
      wareText: data.wareText || ''
    }
    this.setData({ ready: true }, () => {
      this.applyCopy(0)
      this.generate()
    })
  },

  applyCopy(styleIndex) {
    const style = xhs.STYLES[styleIndex]
    const c = xhs.buildCopy(this.brew, this.meta, style.id, this.variant || 0)
    const copyText = c.title + '\n\n' + c.paragraphs.join('\n') + '\n\n' + c.hashtags.join(' ')
    this.setData({
      styleIndex,
      title: c.title,
      paragraphs: c.paragraphs,
      hashtags: c.hashtags.join(' '),
      copyText
    })
  },

  pickStyle(e) {
    this.variant = 0
    this.applyCopy(Number(e.currentTarget.dataset.i))
  },

  changeCopy() {
    this.variant = ((this.variant || 0) + 1) % 3
    this.applyCopy(this.data.styleIndex)
  },

  pickTheme(e) {
    this.setData({ themeIndex: Number(e.currentTarget.dataset.i) }, () => this.generate())
  },

  pickCoverPhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        const f = res.tempFiles && res.tempFiles[0]
        if (!f || !f.tempFilePath) return
        this.setData({ coverPhoto: f.tempFilePath }, () => this.generate())
      }
    })
  },

  clearCoverPhoto() {
    this.setData({ coverPhoto: '' }, () => this.generate())
  },

  previewCover() {
    if (this.data.coverPhoto) {
      wx.previewImage({ urls: [this.data.coverPhoto] })
    }
  },

  onSlide(e) {
    this.setData({ slideIndex: e.detail.current })
  },

  copyAll() {
    wx.setClipboardData({
      data: this.data.copyText,
      success: () => wx.showToast({ title: '文案已复制', icon: 'success' })
    })
  },

  previewImage() {
    if (this.data.images.length) {
      wx.previewImage({ urls: this.data.images, current: this.data.images[this.data.slideIndex] })
    }
  },

  saveCurrent() {
    const p = this.data.images[this.data.slideIndex]
    if (!p) return
    this.saveOne(p)
  },

  saveAll() {
    const list = this.data.images.filter(Boolean)
    if (!list.length) return
    this.saveSeq(list)
  },

  saveOne(filePath) {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: e => this.onSaveFail(e)
    })
  },

  async saveSeq(list) {
    if (this.data.saving) return
    this.setData({ saving: true })
    for (let i = 0; i < list.length; i++) {
      try {
        await new Promise((resolve, reject) => {
          wx.saveImageToPhotosAlbum({ filePath: list[i], success: resolve, fail: reject })
        })
      } catch (e) {
        this.setData({ saving: false })
        return this.onSaveFail(e)
      }
    }
    this.setData({ saving: false })
    wx.showToast({ title: '已保存 ' + list.length + ' 张', icon: 'success' })
  },

  onSaveFail(e) {
    if (e.errMsg && e.errMsg.indexOf('auth') >= 0) {
      wx.showModal({
        title: '需要相册权限',
        content: '请在设置中允许保存图片到相册',
        confirmText: '去设置',
        success: r => r.confirm && wx.openSetting()
      })
    } else {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  /* ---------- 生成整套图片 ---------- */

  dpr() {
    return (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 2
  },

  loadImage(canvas, src) {
    return new Promise((resolve, reject) => {
      const img = canvas.createImage()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('image load failed'))
      img.src = src
    })
  },

  canvasNode() {
    return new Promise((resolve, reject) => {
      this.createSelectorQuery()
        .select('#shareCanvas')
        .fields({ node: true })
        .exec(res => {
          if (res && res[0] && res[0].node) resolve(res[0].node)
          else reject(new Error('canvas not ready'))
        })
    })
  },

  exportOne(canvas) {
    return new Promise(resolve => {
      wx.canvasToTempFilePath({
        canvas,
        fileType: 'png',
        success: r => resolve(r.tempFilePath),
        fail: () => resolve('')
      })
    })
  },

  async generate() {
    if (!this.data.ready) return
    if (this._generating) return
    this._generating = true
    this.setData({ generating: true, images: [] })
    try {
      const canvas = await this.canvasNode()
      const theme = xhs.THEMES[this.data.themeIndex]
      const dpr = this.dpr()

      // 主图背景：支持用拍摄/相册照片替换，加载失败则回退到默认底色
      let coverImg = null
      if (this.data.coverPhoto) {
        try {
          coverImg = await this.loadImage(canvas, this.data.coverPhoto)
        } catch (e) {
          coverImg = null
        }
      }

      // “每一泡”按内容区高度分页（样式同本场汇总的每一泡列表）
      const measCtx = canvas.getContext('2d')
      const steeps = (this.brew.steeps || []).slice().sort((a, b) => a.n - b.n).filter(steepHasContent)
      const MAXH = 640
      const pages = []
      let page = []
      let used = 0
      steeps.forEach(s => {
        const h = steepEntryHeight(measCtx, s)
        if (page.length && used + h > MAXH) {
          pages.push(page)
          page = []
          used = 0
        }
        page.push(s)
        used += h
      })
      if (page.length) pages.push(page)

      const slides = buildSlides(this.brew, pages)
      this.slides = slides
      this.setData({ slideLabels: slides.map(s => s.label) })
      const paths = []
      for (let i = 0; i < slides.length; i++) {
        canvas.width = CW * dpr
        canvas.height = CH * dpr
        const ctx = canvas.getContext('2d')
        ctx.scale(dpr, dpr)
        this.drawSlide(i, ctx, theme, coverImg)
        paths.push(await this.exportOne(canvas))
      }
      this.setData({ images: paths.filter(Boolean), generating: false, slideIndex: 0 })
    } catch (e) {
      this.setData({ generating: false })
    }
    this._generating = false
  },

  drawSlide(i, ctx, t, coverImg) {
    const s = this.slides[i]
    if (s.id === 'cover') return drawCover(ctx, t, this.brew, this.meta, coverImg)
    if (s.id === 'steeps') {
      slideFrame(ctx, t, '每一泡')
      return drawSteepsContent(ctx, t, s.steeps)
    }
    const conf = {
      wheel: '香气 · 风味轮',
      radar: '香气与滋味',
      rating: '评分与总评'
    }[s.id]
    slideFrame(ctx, t, conf)
    if (s.id === 'wheel') drawWheelContent(ctx, t, this.brew)
    else if (s.id === 'radar') drawRadarContent(ctx, t, this.brew)
    else drawRatingContent(ctx, t, this.brew)
  }
})
