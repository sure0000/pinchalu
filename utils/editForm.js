// 茶 / 茶器编辑页共用的表单方法：照片选择与编辑、来源、入手日期。
// 两个页面都提供这些 data 字段：photos、maxPhotos、sourceType、sourceName、sourceLabel、sourceHint、acquired。
const db = require('./db')
const { getSourceType } = require('../config/teaConfig')

module.exports = {
  onInput(e) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value })
  },

  pickSource(e) {
    const code = e.currentTarget.dataset.code
    const next = this.data.sourceType === code ? '' : code
    const st = getSourceType(next)
    this.setData({ sourceType: next, sourceHint: st ? st.hint : '店铺 / 卖家 / 赠送人', sourceLabel: st ? st.label : '商家' })
  },

  pickAcquired(e) {
    this.setData({ acquired: e.detail.value })
  },

  clearAcquired() {
    this.setData({ acquired: '' })
  },

  addPhoto() {
    const max = this.data.maxPhotos
    const left = max - this.data.photos.length
    if (left <= 0) return
    wx.chooseMedia({
      count: left,
      mediaType: ['image'],
      sizeType: ['original'],
      sourceType: ['album', 'camera'],
      success: res => {
        this.setData({ photos: this.data.photos.concat(res.tempFiles.map(f => f.tempFilePath)).slice(0, max) })
      }
    })
  },

  previewPhoto(e) {
    const photos = this.data.photos
    wx.previewImage({ urls: photos, current: photos[e.currentTarget.dataset.i] })
  },

  removePhoto(e) {
    const photos = this.data.photos.slice()
    photos.splice(e.currentTarget.dataset.i, 1)
    this.setData({ photos })
  },

  // 编辑照片（裁剪 / 旋转 / 涂鸦等）：云端照片先下载成临时文件
  async editPhoto(e) {
    const i = e.currentTarget.dataset.i
    const src = this.data.photos[i]
    if (!src) return
    wx.showLoading({ title: '处理中', mask: true })
    let local = src
    try {
      local = await db.downloadPhoto(src)
    } catch (err) {
      wx.hideLoading()
      return wx.showToast({ title: '图片下载失败', icon: 'none' })
    }
    wx.hideLoading()
    wx.editImage({
      src: local,
      success: res => {
        const photos = this.data.photos.slice()
        photos[i] = res.tempFilePath
        this.setData({ photos })
      },
      fail: () => wx.showToast({ title: '无法编辑该图片', icon: 'none' })
    })
  },

  // 设为封面：移到第一张
  makeCover(e) {
    const photos = this.data.photos.slice()
    const [p] = photos.splice(e.currentTarget.dataset.i, 1)
    this.setData({ photos: [p].concat(photos) })
  }
}
