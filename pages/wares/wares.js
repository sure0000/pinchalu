const db = require('../../utils/db')
const S = require('../../utils/shelf')
const B = require('../../utils/batch')
const G = require('../../utils/grid')
const W = require('../../config/wares')
const { getSourceType } = require('../../config/teaConfig')

// 搜索范围：名称 / 器型 / 材质 / 商家 / 作者窑口 / 备注
function haystack(w) {
  const st = getSourceType(w.sourceType)
  return [w.name, W.getKind(w.kind).name, W.getMaterial(w.material).name, w.sourceName, st && st.name, w.maker, w.note]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function wareItem(w, mode) {
  return {
    key: w._id,
    id: w._id,
    kind: W.getKind(w.kind).code,
    material: w.material || '',
    src: db.coverOf(w),
    cap: w.capacityMl ? w.capacityMl + 'ml' : '',
    gray: !!w.retired,
    badge: w.retired ? '收起' : '',
    caption: w.name,
    sub: S.wareSubOf(w, mode)
  }
}

Page(Object.assign({}, G, {
  data: {
    loaded: false,
    total: 0,
    keyword: '',
    modes: S.WARE_MODES,
    mode: 'all',
    sections: [],
    empty: false,
    picking: false, // 批量管理：点格子勾选
    picked: {}, // { _id: true }
    pickedCount: 0,
    allPicked: false,
    pickedDone: false // 选中的都已收起：底栏显示“拿出来用”
  },

  onLoad() {
    this.initGrid({
      modeKey: 'waresMode',
      doneField: 'retired',
      doneOnText: '已收起',
      doneOffText: '已拿出来',
      unitName: '件茶器',
      removeText: '用过它们的冲泡记录会保留，只是不再显示这些器。'
    })
  },

  cachedAll() {
    return db.cachedWares()
  },

  fetchAll() {
    return db.listWares()
  },

  listAll() {
    return this.wares || []
  },

  updateItem(id, patch) {
    return db.updateWare(id, patch)
  },

  removeItem(ware) {
    return db.deleteWare(ware._id, ware.photos, ware.photoThumbs)
  },

  // 和茶柜一样一格格摆；“全部”按器型排，收起不用的灰着排在后
  render(wares) {
    this.wares = wares
    const kw = this.data.keyword.trim().toLowerCase()
    const mode = this.data.mode
    const list = kw ? wares.filter(w => haystack(w).indexOf(kw) >= 0) : wares
    const sections = S.groupWares(list, mode).map(g => ({
      key: g.key,
      title: g.title,
      countText: g.wares.length + ' 件' + (g.done ? ' · ' + g.done + ' 件收起' : ''),
      items: g.wares.map(w => wareItem(w, mode)),
      add: mode === 'all'
    }))
    this.visibleIds = B.visibleIds(sections)
    this.setData({ loaded: true, total: wares.length, sections, empty: !!kw && !list.length })
    if (this.data.picking) this.setPicked(this.data.picked)
  },

  onTap(e) {
    if (this.data.picking) return this.pick(e.currentTarget.dataset.id)
    wx.navigateTo({ url: '/pages/ware-detail/ware-detail?id=' + e.currentTarget.dataset.id })
  },

  // 长按：用它泡茶 / 收起或拿出来 / 编辑
  onLongPress(e) {
    if (this.data.picking) return
    const ware = (this.wares || []).find(w => w._id === e.currentTarget.dataset.id)
    if (!ware) return
    wx.showActionSheet({
      itemList: ['用它泡茶', ware.retired ? '拿出来用' : '收起不用', '编辑'],
      success: async r => {
        if (r.tapIndex === 0) return wx.navigateTo({ url: '/pages/timer/timer?wareId=' + ware._id })
        if (r.tapIndex === 2) return wx.navigateTo({ url: '/pages/ware-edit/ware-edit?id=' + ware._id })
        try {
          await db.updateWare(ware._id, { retired: !ware.retired })
          this.render(db.cachedWares())
        } catch (err) {
          wx.showToast({ title: '网络不可用，未能保存', icon: 'none' })
        }
      }
    })
  },

  newWare() {
    wx.navigateTo({ url: '/pages/ware-edit/ware-edit' })
  },

  /* 批量管理（勾选 / 全选 / 收起 / 删除）的骨架在 utils/grid.js */
}))
