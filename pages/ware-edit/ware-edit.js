const db = require('../../utils/db')
const fmt = require('../../utils/format')
const W = require('../../config/wares')
const { CLASSES, SOURCE_TYPES, getSourceType } = require('../../config/teaConfig')

const MAX_PHOTOS = 6
const form = require('../../utils/editForm')

Page(Object.assign({}, form, {
  data: {
    kinds: W.KINDS,
    materials: W.MATERIALS,
    sourceTypes: SOURCE_TYPES,
    maxPhotos: MAX_PHOTOS,
    today: fmt.dateValue(Date.now()),
    isEdit: false,
    name: '',
    kind: '',
    material: '',
    capacity: '',
    maker: '', // 作者 / 窑口
    note: '',
    photos: [], // 已上传的 fileID 或本地临时路径（保存时上传），第一张为封面
    sourceType: '',
    sourceName: '',
    sourceLabel: '商家',
    sourceHint: '店铺 / 卖家 / 赠送人',
    acquired: '',
    classOptions: [], // 宜泡：[{ code, name, on }]
    retired: false // 收起不用：器柜里灰着排在后，计时页不再列出
  },

  async onLoad(options) {
    this.id = options.id || ''
    this.forClasses = []
    this.setData({ isEdit: !!this.id, kind: options.kind || '' })
    wx.setNavigationBarTitle({ title: this.id ? '编辑茶器' : '添置茶器' })
    this.renderClasses()
    if (!this.id) return
    const w = await db.getWare(this.id)
    if (!w) return wx.navigateBack()
    this.origPhotos = (w.photos || []).slice()
    this.origThumbs = (w.photoThumbs || []).slice()
    this.forClasses = (w.forClasses || []).slice()
    const st = getSourceType(w.sourceType)
    this.setData({
      name: w.name,
      kind: w.kind || '',
      material: w.material || '',
      capacity: w.capacityMl ? String(w.capacityMl) : '',
      maker: w.maker || '',
      note: w.note || '',
      photos: this.origPhotos.slice(),
      sourceType: w.sourceType || '',
      sourceName: w.sourceName || '',
      sourceLabel: st ? st.label : '商家',
      sourceHint: st ? st.hint : this.data.sourceHint,
      acquired: w.acquiredAt ? fmt.dateValue(w.acquiredAt) : '',
      retired: !!w.retired
    })
    this.renderClasses()
  },

  renderClasses() {
    this.setData({ classOptions: CLASSES.map(c => ({ code: c.code, name: c.name, on: this.forClasses.indexOf(c.code) >= 0 })) })
  },

  pickKind(e) {
    const kind = e.currentTarget.dataset.code
    const patch = { kind }
    // 玻璃杯默认就是玻璃
    if (kind === 'glass' && !this.data.material) patch.material = 'glass'
    this.setData(patch)
  },

  pickMaterial(e) {
    const code = e.currentTarget.dataset.code
    this.setData({ material: this.data.material === code ? '' : code })
  },

  toggleClass(e) {
    const code = e.currentTarget.dataset.code
    const i = this.forClasses.indexOf(code)
    if (i >= 0) this.forClasses.splice(i, 1)
    else this.forClasses.push(code)
    this.renderClasses()
  },

  toggleRetired(e) {
    this.setData({ retired: e.detail.value })
  },

  async save() {
    const d = this.data
    const name = d.name.trim()
    if (!name) return wx.showToast({ title: '请填写名称', icon: 'none' })
    if (!d.kind) return wx.showToast({ title: '请选择器型', icon: 'none' })
    let capacityMl = 0
    if (d.capacity.trim()) {
      capacityMl = Number(d.capacity)
      if (!Number.isInteger(capacityMl) || capacityMl < 10 || capacityMl > 3000) return wx.showToast({ title: '容量填 10–3000 的整数', icon: 'none' })
    }
    // 可选字段为空时不写入
    const data = { name, kind: d.kind }
    if (d.material) data.material = d.material
    if (capacityMl) data.capacityMl = capacityMl
    if (d.maker.trim()) data.maker = d.maker.trim()
    if (d.note.trim()) data.note = d.note.trim()
    if (d.sourceType) data.sourceType = d.sourceType
    if (d.sourceName.trim()) data.sourceName = d.sourceName.trim()
    if (d.acquired) data.acquiredAt = fmt.withDateValue(Date.now(), d.acquired)
    if (this.forClasses.length) data.forClasses = CLASSES.map(c => c.code).filter(c => this.forClasses.indexOf(c) >= 0)
    if (d.retired) data.retired = true

    wx.showLoading({ title: '保存中', mask: true })
    try {
      const thumbMap = {}
      ;(this.origPhotos || []).forEach((p, i) => { thumbMap[p] = (this.origThumbs || [])[i] || p })
      const { photos, thumbs } = await db.uploadPhotos(d.photos, thumbMap)
      if (photos.length) data.photos = photos
      if (thumbs.length) data.photoThumbs = thumbs
      if (this.id) {
        await db.updateWare(
          this.id,
          Object.assign({ material: '', capacityMl: 0, maker: '', note: '', photos: [], photoThumbs: [], sourceType: '', sourceName: '', acquiredAt: 0, forClasses: [], retired: false }, data)
        )
        db.deletePhotos((this.origPhotos || []).filter(p => photos.indexOf(p) < 0).concat((this.origThumbs || []).filter(p => thumbs.indexOf(p) < 0)))
      } else {
        await db.createWare(data)
      }
      wx.hideLoading()
      wx.navigateBack()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '网络不可用，保存失败', icon: 'none' })
    }
  },

  remove() {
    wx.showModal({
      title: '删除这件茶器？',
      content: '用过它的冲泡记录会保留，只是不再显示这件器。',
      confirmText: '删除',
      confirmColor: '#b3402f',
      success: async r => {
        if (!r.confirm) return
        try {
          await db.deleteWare(this.id, this.origPhotos, this.origThumbs)
          wx.reLaunch({ url: '/pages/wares/wares' })
        } catch (e) {
          wx.showToast({ title: '删除失败，请检查网络', icon: 'none' })
        }
      }
    })
  }
}))
