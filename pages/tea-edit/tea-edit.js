const db = require('../../utils/db')
const fmt = require('../../utils/format')
const S = require('../../utils/shelf')
const { CATEGORIES, SOURCE_TYPES, getSourceType } = require('../../config/teaConfig')

const app = getApp()
const MAX_PHOTOS = 6
const form = require('../../utils/editForm')

Page(Object.assign({}, form, {
  data: {
    categories: CATEGORIES,
    sourceTypes: SOURCE_TYPES,
    maxPhotos: MAX_PHOTOS,
    today: fmt.dateValue(Date.now()),
    isEdit: false,
    lite: false, // 计时页内新建：只要名称和茶类
    name: '',
    category: '',
    origin: '',
    variety: '',
    year: '',
    note: '',
    photos: [], // fileID（已上传）或本地临时路径（保存时上传），第一张为封面
    sourceType: '',
    sourceName: '',
    sourceLabel: '商家',
    sourceHint: '店铺 / 卖家 / 赠送人',
    acquired: '', // YYYY-MM-DD
    shelves: [], // 自定义分组（选中的）
    shelfOptions: [], // [{ name, on }]：所有茶用过的分组 + 本次新建的
    finished: false // 已喝完：移到茶柜的“已喝完”，不再推荐
  },

  async onLoad(options) {
    this.id = options.id || ''
    const lite = options.lite === '1'
    this.setData({ isEdit: !!this.id, lite, category: options.category || '' })
    wx.setNavigationBarTitle({ title: this.id ? '编辑茶' : '新建茶' })
    this.knownShelves = S.allShelves(db.cachedTeas())
    this.renderShelves()
    if (!this.id) return
    const tea = await db.getTea(this.id)
    if (!tea) return wx.navigateBack()
    this.origPhotos = (tea.photos || []).slice()
    this.origThumbs = (tea.photoThumbs || []).slice()
    const st = getSourceType(tea.sourceType)
    this.setData({
      photos: this.origPhotos.slice(),
      sourceType: tea.sourceType || '',
      sourceName: tea.sourceName || '',
      sourceHint: st ? st.hint : this.data.sourceHint,
      sourceLabel: st ? st.label : '商家',
      acquired: tea.acquiredAt ? fmt.dateValue(tea.acquiredAt) : '',
      name: tea.name,
      category: tea.category,
      origin: tea.origin || '',
      variety: tea.variety || '',
      shelves: (tea.shelves || []).slice(),
      year: tea.year ? String(tea.year) : '',
      note: tea.note || '',
      finished: !!tea.finished
    })
    this.renderShelves()
  },

  renderShelves() {
    const on = this.data.shelves
    const names = this.knownShelves.concat(on.filter(s => this.knownShelves.indexOf(s) < 0))
    this.setData({ shelfOptions: names.map(name => ({ name, on: on.indexOf(name) >= 0 })) })
  },

  toggleShelf(e) {
    const name = e.currentTarget.dataset.name
    const on = this.data.shelves
    this.setData({ shelves: on.indexOf(name) >= 0 ? on.filter(s => s !== name) : on.concat([name]) })
    this.renderShelves()
  },

  addShelf() {
    wx.showModal({
      title: '新建分组',
      editable: true,
      placeholderText: '如：口粮茶、待客、办公室',
      success: r => {
        const name = (r.content || '').trim().slice(0, 10)
        if (!r.confirm || !name) return
        if (this.knownShelves.indexOf(name) < 0) this.knownShelves.push(name)
        if (this.data.shelves.indexOf(name) < 0) this.setData({ shelves: this.data.shelves.concat([name]) })
        this.renderShelves()
      }
    })
  },

  pickCategory(e) {
    this.setData({ category: e.currentTarget.dataset.code })
  },

  toggleFinished(e) {
    this.setData({ finished: e.detail.value })
  },

  async save() {
    const d = this.data
    const name = d.name.trim()
    if (!name) return wx.showToast({ title: '请填写茶名', icon: 'none' })
    if (!d.category) return wx.showToast({ title: '请选择茶类', icon: 'none' })
    let year = null
    if (d.year.trim()) {
      year = Number(d.year)
      if (!Number.isInteger(year) || year < 1000 || year > 2100) return wx.showToast({ title: '年份格式不对', icon: 'none' })
    }
    // 可选字段为空时不写入，避免出现空值字段
    const data = { name, category: d.category }
    if (d.origin.trim()) data.origin = d.origin.trim()
    if (d.variety.trim()) data.variety = d.variety.trim()
    if (d.shelves.length) data.shelves = d.shelves
    if (year) data.year = year
    if (d.note.trim()) data.note = d.note.trim()
    if (d.sourceType) data.sourceType = d.sourceType
    if (d.sourceName.trim()) data.sourceName = d.sourceName.trim()
    if (d.acquired) data.acquiredAt = fmt.withDateValue(Date.now(), d.acquired)
    if (d.finished) data.finished = true

    wx.showLoading({ title: '保存中', mask: true })
    try {
      const thumbMap = {}
      ;(this.origPhotos || []).forEach((p, i) => { thumbMap[p] = (this.origThumbs || [])[i] || p })
      const { photos, thumbs } = await db.uploadPhotos(d.photos, thumbMap)
      if (photos.length) data.photos = photos
      if (thumbs.length) data.photoThumbs = thumbs
      let id = this.id
      if (id) {
        // 编辑：清空的可选字段要显式置空
        await db.updateTea(id, Object.assign({ origin: '', variety: '', shelves: [], year: 0, note: '', photos: [], photoThumbs: [], sourceType: '', sourceName: '', acquiredAt: 0, finished: false }, data))
        db.deletePhotos((this.origPhotos || []).filter(p => photos.indexOf(p) < 0).concat((this.origThumbs || []).filter(p => thumbs.indexOf(p) < 0)))
      } else {
        id = (await db.createTea(data))._id
      }
      wx.hideLoading()
      if (d.lite) app.globalData.selectedTeaId = id
      wx.navigateBack()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '网络不可用，保存失败', icon: 'none' })
    }
  },

  remove() {
    wx.showModal({
      title: '删除这款茶？',
      content: '这款茶的冲泡记录会保留，但将显示为“已删除的茶”。',
      confirmText: '删除',
      confirmColor: '#b3402f',
      success: async r => {
        if (!r.confirm) return
        try {
          await db.deleteTea(this.id, this.origPhotos, this.origThumbs)
          wx.reLaunch({ url: '/pages/cabinet/cabinet' })
        } catch (e) {
          wx.showToast({ title: '删除失败，请检查网络', icon: 'none' })
        }
      }
    })
  }
}))
