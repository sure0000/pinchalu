const db = require('../../utils/db')
const image = require('../../utils/image')
const fmt = require('../../utils/format')
const C = require('../../utils/chadao')
const F = require('../../config/flavor')
const xhs = require('../../utils/xhs')
const { getCategory, getSourceType } = require('../../config/teaConfig')

// 信息行：[{ k, v }]，空的不显示
function infoRows(tea) {
  const st = getSourceType(tea.sourceType)
  const rows = [
    { k: '品种', v: tea.variety },
    { k: '产地', v: tea.origin },
    { k: '年份', v: tea.year ? tea.year + ' 年' : '' },
    { k: st ? st.label : '出处', v: [tea.sourceName, st && st.name].filter(Boolean).join(' · ') },
    { k: '入手', v: tea.acquiredAt ? fmt.date(tea.acquiredAt) : '' },
    { k: '备注', v: tea.note }
  ]
  return rows.filter(r => r.v)
}

// 各场冲泡里出现最多的风味，取前 8 个
function topTags(brews, custom) {
  const n = {}
  brews.forEach(b => (b.tags || []).forEach(t => (n[t] = (n[t] || 0) + 1)))
  return Object.keys(n)
    .sort((a, b) => n[b] - n[a])
    .slice(0, 8)
    .map(name => {
      const loc = F.locate(name, custom)
      return { name, n: n[name], color: loc ? loc.color : '#a9a397' }
    })
}

// 风味画像：审评十项取各场平均（只算打了分的场次），香型按风味轮大类计数，汤色取最常见的
function profile(brews, custom) {
  const sum = {}
  const cnt = {}
  let reviewed = 0
  const liquor = {}
  brews.forEach(b => {
    const r = b.review || {}
    const sc = r.scores || {}
    if (Object.keys(sc).length) reviewed++
    Object.keys(sc).forEach(k => {
      sum[k] = (sum[k] || 0) + sc[k]
      cnt[k] = (cnt[k] || 0) + 1
    })
    if (r.liquor) liquor[r.liquor] = (liquor[r.liquor] || 0) + 1
  })
  const fam = {}
  brews.forEach(b =>
    (b.tags || []).forEach(t => {
      const loc = F.locate(t, custom)
      if (loc) fam[loc.cat] = (fam[loc.cat] || 0) + 1
    })
  )
  const famMax = Math.max(0, ...Object.keys(fam).map(k => fam[k]))
  const lq = Object.keys(liquor).sort((a, b) => liquor[b] - liquor[a])[0] || ''
  return {
    reviewed,
    radar: F.DIMS.map(d => (cnt[d.key] ? Math.round((sum[d.key] / cnt[d.key]) * 10) / 10 : 0)),
    families: F.WHEEL.filter(c => fam[c.name]).map(c => ({ name: c.name, color: c.color, n: fam[c.name], pct: Math.round((fam[c.name] / famMax) * 100) })).sort((a, b) => b.n - a.n),
    liquor: lq,
    liquorColor: F.liquorColor(lq)
  }
}

Page({
  data: {
    loaded: false,
    tea: null,
    categoryName: '',
    cover: {},
    dimNames: F.DIMS.map(d => d.name),
    profile: null,
    rows: [],
    stats: [],
    flavors: [],
    brews: []
  },

  onLoad(options) {
    this.id = options.id
  },

  onShow() {
    this.load().catch(() => {
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loaded: true })
    })
  },

  async load() {
    const tea = await db.getTea(this.id)
    if (!tea) {
      wx.showToast({ title: '这款茶已删除', icon: 'none' })
      return setTimeout(() => wx.navigateBack(), 800)
    }
    wx.setNavigationBarTitle({ title: tea.name })
    if (tea.photos && tea.photos.length) {
      tea.photos = await Promise.all(tea.photos.map(p => image.localSrc(p)))
    }
    const cat = getCategory(tea.category)
    const fam = C.FAMILIES[cat.family]
    // 先把茶的信息显示出来，冲泡记录随后补上
    this.setData({
      loaded: true,
      tea,
      categoryName: cat.name + (fam && fam.name !== cat.name ? ' · ' + fam.name : ''),
      cover: { color: fam ? fam.color : '#8a8576', shape: (fam && fam.shape) || 'can', effect: fam ? fam.effect : '' },
      rows: infoRows(tea)
    })

    const brews = await db.listBrews(this.id)
    const custom = db.cachedCustomTags()
    const wares = await db.listWares().catch(() => db.cachedWares())
    this.rawBrews = brews
    this.wares = wares
    const rated = brews.filter(b => b.rating > 0)
    const avg = rated.length ? (rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(1) : ''
    const steeps = brews.reduce((s, b) => s + (b.steeps || []).length, 0)
    this.setData({
      stats: [
        { v: brews.length, k: '冲泡场次' },
        { v: steeps, k: '累计泡数' },
        { v: avg || '—', k: rated.length ? '平均评分' : '暂无评分' },
        { v: brews.length ? fmt.date(brews[0].startedAt) : '—', k: '最近一次' }
      ],
      flavors: topTags(brews, custom),
      profile: profile(brews, custom),
      brews: brews.map(b => ({
        _id: b._id,
        unsynced: !!b.unsynced,
        dateText: fmt.date(b.startedAt) + ' ' + fmt.time(b.startedAt),
        params: b.leafG + 'g / ' + b.waterMl + 'ml / ' + b.tempC + '°C',
        count: (b.steeps || []).length + ' 泡',
        manual: b.source === 'manual',
        stars: b.rating ? fmt.stars(b.rating) : '',
        tags: (b.tags || []).slice(0, 4),
        liquor: (b.review && b.review.liquor) || '',
        liquorColor: F.liquorColor(b.review && b.review.liquor),
        wareText: (b.wareIds || []).map(id => (wares.find(w => w._id === id) || {}).name).filter(Boolean)[0] || '',
        note: (b.note || '').split('\n')[0]
      }))
    })
  },

  previewPhoto(e) {
    const photos = this.data.tea.photos
    wx.previewImage({ urls: photos, current: photos[e.currentTarget.dataset.i] })
  },

  brew() {
    wx.navigateTo({ url: '/pages/timer/timer?teaId=' + this.id })
  },

  addManual() {
    wx.navigateTo({ url: '/pages/summary/summary?mode=manual&teaId=' + this.id })
  },

  editTea() {
    wx.navigateTo({ url: '/pages/tea-edit/tea-edit?id=' + this.id })
  },

  openBrew(e) {
    wx.navigateTo({ url: '/pages/summary/summary?mode=edit&id=' + e.currentTarget.dataset.id })
  },

  // 从冲泡记录列表直接生成小红书文案 / 图片
  shareBrew(e) {
    const id = e.currentTarget.dataset.id
    const b = (this.rawBrews || []).find(x => x._id === id)
    if (!b) return
    const wareText = (b.wareIds || []).map(wid => ((this.wares || []).find(w => w._id === wid) || {}).name).filter(Boolean).join(' · ')
    xhs.setPending({
      brew: b,
      teaName: this.data.tea.name,
      categoryName: getCategory(b.category).name,
      wareText
    })
    wx.navigateTo({ url: '/pages/share/share' })
  }
})
