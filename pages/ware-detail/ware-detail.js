const db = require('../../utils/db')
const image = require('../../utils/image')
const fmt = require('../../utils/format')
const W = require('../../config/wares')
const { CLASSES, getCategory, getSourceType } = require('../../config/teaConfig')

function infoRows(w) {
  const st = getSourceType(w.sourceType)
  const rows = [
    { k: '器型', v: W.getKind(w.kind).name + ' · ' + W.ROLES[W.getKind(w.kind).role] },
    { k: '材质', v: w.material ? W.getMaterial(w.material).name : '' },
    { k: '容量', v: w.capacityMl ? w.capacityMl + ' ml' : '' },
    { k: '作者', v: w.maker },
    { k: st ? st.label : '出处', v: [w.sourceName, st && st.name].filter(Boolean).join(' · ') },
    { k: '入手', v: w.acquiredAt ? fmt.date(w.acquiredAt) : '' },
    { k: '备注', v: w.note }
  ]
  return rows.filter(r => r.v)
}

Page({
  data: { loaded: false, ware: null, rows: [], fits: [], stats: [], teas: [] },

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
    const w = await db.getWare(this.id)
    if (!w) {
      wx.showToast({ title: '这件茶器已删除', icon: 'none' })
      return setTimeout(() => wx.navigateBack(), 800)
    }
    wx.setNavigationBarTitle({ title: w.name })
    if (w.photos && w.photos.length) {
      w.photos = await Promise.all(w.photos.map(p => image.localSrc(p)))
    }
    this.setData({
      loaded: true,
      ware: w,
      kind: W.getKind(w.kind).code,
      rows: infoRows(w),
      fits: CLASSES.filter(c => (w.forClasses || []).indexOf(c.code) >= 0).map(c => c.name)
    })

    // 用它泡过的：从最近 100 场冲泡里统计
    const brews = (await db.listRecentBrews()).filter(b => (b.wareIds || []).indexOf(this.id) >= 0)
    const teas = db.cachedTeas()
    const n = {}
    brews.forEach(b => {
      const key = b.teaId || 'cat:' + b.category
      n[key] = (n[key] || 0) + 1
    })
    const top = Object.keys(n)
      .sort((a, b) => n[b] - n[a])
      .slice(0, 5)
      .map(key => {
        const tea = teas.find(t => t._id === key)
        const name = tea ? tea.name : key.indexOf('cat:') === 0 ? getCategory(key.replace('cat:', '')).name : '已删除的茶'
        return { key, id: tea ? tea._id : '', name, n: n[key] }
      })
    const last = brews.reduce((m, b) => Math.max(m, b.startedAt), 0)
    this.setData({
      stats: [
        { v: brews.length, k: '最近用过' },
        { v: top.length, k: '泡过几款' },
        { v: last ? fmt.date(last) : '—', k: '最近一次' }
      ],
      teas: top
    })
  },

  previewPhoto(e) {
    const photos = this.data.ware.photos
    wx.previewImage({ urls: photos, current: photos[e.currentTarget.dataset.i] })
  },

  openTea(e) {
    const id = e.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: '/pages/tea-detail/tea-detail?id=' + id })
  },

  brew() {
    wx.navigateTo({ url: '/pages/timer/timer?wareId=' + this.id })
  },

  edit() {
    wx.navigateTo({ url: '/pages/ware-edit/ware-edit?id=' + this.id })
  }
})
