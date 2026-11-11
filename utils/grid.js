// 茶柜 / 器柜两个格子页共用的骨架：分组切换、搜索、批量管理（勾选 / 全选 / 标记 / 删除）。
//
// 页面 onLoad 里调用 this.initGrid(config)：
//   modeKey      分组方式的本机存储键
//   doneField    标记“喝完 / 收起”的字段名（finished / retired）
//   doneOnText   批量标记“已完成”的提示文案
//   doneOffText  批量“放回 / 拿出”的提示文案
//   unitName     数量单位（款茶 / 件茶器）
//   removeText   删除确认说明
//
// 页面还需提供这些方法：
//   cachedAll()          本地缓存里的完整列表
//   fetchAll()           从数据层拉取完整列表（返回 Promise）
//   listAll()            当前内存里的完整列表（this.teas / this.wares）
//   updateItem(id, patch)  更新一条
//   removeItem(item)      删除一条
//   render(list)          页面自己的渲染方法（会设置 this.visibleIds）
const B = require('./batch')

module.exports = {
  initGrid(config) {
    this.grid = config
    this.setData({ mode: this.readMode() })
  },

  readMode() {
    try {
      const m = wx.getStorageSync(this.grid.modeKey)
      return this.data.modes.some(x => x.key === m) ? m : 'all'
    } catch (e) {
      return 'all'
    }
  },

  onShow() {
    this.render(this.cachedAll())
    this.fetchAll()
      .then(list => this.render(list))
      .catch(() => this.setData({ loaded: true }))
  },

  pickMode(e) {
    const mode = e.currentTarget.dataset.key
    if (mode === this.data.mode) return
    this.setData({ mode })
    try {
      wx.setStorageSync(this.grid.modeKey, mode)
    } catch (err) {}
    this.render(this.listAll())
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value })
    this.render(this.listAll())
  },

  clearSearch() {
    this.setData({ keyword: '' })
    this.render(this.listAll())
  },

  toggleManage() {
    const picking = !this.data.picking
    this.setData({ picking, picked: {}, pickedCount: 0, allPicked: false, pickedDone: false })
    B.setTabBar(!picking) // 底栏批量操作占住 tabBar 的位置
    this.render(this.listAll())
  },

  setPicked(picked) {
    const list = this.listAll()
    const p = B.picks(picked, list, this.visibleIds || [])
    p.pickedDone = !!p.pickedCount && list.every(x => !p.picked[x._id] || x[this.grid.doneField])
    this.setData(p)
  },

  pick(id) {
    this.setPicked(Object.assign({}, this.data.picked, { [id]: !this.data.picked[id] }))
  },

  pickAll() {
    this.setPicked(B.toggleAll(this.data.picked, this.visibleIds || [], this.data.allPicked))
  },

  pickedItems() {
    return this.listAll().filter(x => this.data.picked[x._id])
  },

  // 批量标记喝完 / 收起（或反向放回 / 拿出）
  async batchToggleDone() {
    const items = this.pickedItems()
    if (!items.length) return
    const done = !this.data.pickedDone
    await B.run(
      items,
      x => this.updateItem(x._id, { [this.grid.doneField]: done }),
      done ? this.grid.doneOnText : this.grid.doneOffText
    )
    this.render(this.cachedAll())
  },

  batchRemove() {
    const items = this.pickedItems()
    if (!items.length) return
    wx.showModal({
      title: '删除选中的 ' + items.length + ' ' + this.grid.unitName + '？',
      content: this.grid.removeText,
      confirmText: '删除',
      confirmColor: '#b3402f',
      success: async r => {
        if (!r.confirm) return
        const fail = await B.run(items, x => this.removeItem(x), '已删除 ' + items.length + ' ' + this.grid.unitName)
        if (fail) this.render(this.cachedAll())
        else {
          this.render(this.cachedAll())
          this.toggleManage()
        }
      }
    })
  }
}
