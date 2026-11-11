const db = require('../../utils/db')
const C = require('../../utils/chadao')
const S = require('../../utils/shelf')
const B = require('../../utils/batch')
const G = require('../../utils/grid')
const { CATEGORIES, getCategory, getSourceType } = require('../../config/teaConfig')

// 缺的茶类：点灰格新建时预选的茶类
const FAMILY_CATEGORY = {}
CATEGORIES.forEach(c => {
  if (c.family && !FAMILY_CATEGORY[c.family]) FAMILY_CATEGORY[c.family] = c.code
})

const recent = (a, b) => (b.lastBrewedAt || 0) - (a.lastBrewedAt || 0) || (b.createdAt || 0) - (a.createdAt || 0)

// 搜索范围：茶名 / 产地 / 品种 / 出处 / 分组 / 备注 / 年份 / 茶类
function haystack(t) {
  const st = getSourceType(t.sourceType)
  return [t.name, t.origin, t.variety, t.sourceName, st && st.name, (t.shelves || []).join(' '), t.note, t.year, getCategory(t.category).name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function teaItem(t, mode) {
  const fam = C.FAMILIES[getCategory(t.category).family]
  return {
    key: t._id,
    id: t._id,
    name: t.name,
    src: db.coverOf(t),
    color: fam ? fam.color : '#8a8576',
    shape: (fam && fam.shape) || 'can',
    gray: !!t.finished,
    badge: t.finished ? '喝完' : '',
    caption: t.name,
    sub: S.subOf(t, mode)
  }
}

// 灰格“缺”：cat 为点开新建时预选的茶类
function missingItem(f, name, cat) {
  return { key: 'missing_' + cat, cat, name, src: '', color: '', shape: C.FAMILIES[f].shape || 'can', gray: true, badge: '缺', caption: '添一款' }
}

Page(Object.assign({}, G, {
  data: {
    loaded: false,
    total: 0,
    keyword: '',
    modes: S.MODES,
    mode: 'all',
    sections: [],
    empty: false,
    picking: false, // 批量管理：点格子勾选
    picked: {}, // { _id: true }
    pickedCount: 0,
    allPicked: false,
    pickedDone: false // 选中的都已喝完：底栏显示“放回茶柜”
  },

  onLoad() {
    this.initGrid({
      modeKey: 'cabinetMode',
      doneField: 'finished',
      doneOnText: '已标记喝完',
      doneOffText: '已放回茶柜',
      unitName: '款茶',
      removeText: '这些茶的冲泡记录会保留，但将显示为“已删除的茶”。'
    })
  },

  cachedAll() {
    return db.cachedTeas()
  },

  fetchAll() {
    return db.listTeas()
  },

  listAll() {
    return this.teas || []
  },

  updateItem(id, patch) {
    return db.updateTea(id, patch)
  },

  removeItem(tea) {
    return db.deleteTea(tea._id, tea.photos, tea.photoThumbs)
  },

  // sections: [{ key, title, countText, items, add }]
  render(teas) {
    this.teas = teas
    const kw = this.data.keyword.trim().toLowerCase()
    const mode = this.data.mode
    const list = kw ? teas.filter(t => haystack(t).indexOf(kw) >= 0) : teas
    let sections
    if (mode !== 'all') {
      sections = S.groupTeas(list, mode)
        .filter(g => g.teas.length || !kw)
        .map(g => {
          const items = g.teas.map(t => teaItem(t, mode))
          // 品类下某类一款在柜的都没有：放灰格“缺”
          if (g.cls && !g.on) items.unshift(missingItem(getCategory(g.cls.cat).family, g.cls.name, g.cls.cat))
          return {
            key: g.key,
            title: g.title,
            countText: g.teas.length ? g.teas.length + ' 款' + (g.done ? ' · ' + g.done + ' 款喝完' : '') : '还没有',
            items
          }
        })
    } else if (kw) {
      sections = [{ key: 'all', items: list.slice().sort((a, b) => !!a.finished - !!b.finished || recent(a, b)).map(t => teaItem(t, mode)) }]
    } else {
      // 像书架一样一格格摆：按六大茶类依次排，在柜的在前、喝完的灰着排在后；
      // 某类一款在柜的都没有时，在它的位置放一个灰色“缺”格
      const items = []
      C.FAMILY_ORDER.concat(['']).forEach(f => {
        const group = teas.filter(t => (getCategory(t.category).family || '') === f)
        const on = group.filter(t => !t.finished).sort(recent)
        if (f && !on.length) items.push(missingItem(f, C.FAMILIES[f].name, FAMILY_CATEGORY[f]))
        items.push(...on.map(t => teaItem(t, mode)), ...group.filter(t => t.finished).sort(recent).map(t => teaItem(t, mode)))
      })
      sections = [{ key: 'all', items, add: true }]
    }
    // 批量管理时只留茶，不放灰格和“添茶入柜”
    if (this.data.picking) sections = sections.map(s => Object.assign({}, s, { items: s.items.filter(i => i.id), add: false })).filter(s => s.items.length)
    this.visibleIds = B.visibleIds(sections)
    this.setData({ loaded: true, total: teas.length, sections, empty: !!kw && !list.length })
    if (this.data.picking) this.setPicked(this.data.picked)
  },

  onTap(e) {
    const { id, cat } = e.currentTarget.dataset
    if (this.data.picking) return id && this.pick(id)
    const url = cat ? '/pages/tea-edit/tea-edit?category=' + cat : '/pages/tea-detail/tea-detail?id=' + id
    wx.navigateTo({ url, fail: err => wx.showToast({ title: '打开失败：' + err.errMsg, icon: 'none' }) })
  },

  // 长按：快捷泡茶 / 标记喝完 / 调整分组
  onLongPress(e) {
    if (this.data.picking) return
    const id = e.currentTarget.dataset.id
    const tea = id && (this.teas || []).find(t => t._id === id)
    if (!tea) return
    wx.showActionSheet({
      itemList: ['泡这款', tea.finished ? '放回茶柜' : '标记为已喝完', '编辑信息 / 分组'],
      success: async r => {
        if (r.tapIndex === 0) return wx.navigateTo({ url: '/pages/timer/timer?teaId=' + tea._id })
        if (r.tapIndex === 2) return wx.navigateTo({ url: '/pages/tea-edit/tea-edit?id=' + tea._id })
        try {
          await db.updateTea(tea._id, { finished: !tea.finished })
          this.render(db.cachedTeas())
        } catch (err) {
          wx.showToast({ title: '网络不可用，未能保存', icon: 'none' })
        }
      }
    })
  },

  newTea() {
    wx.navigateTo({ url: '/pages/tea-edit/tea-edit' })
  },

  /* ---------- 批量管理（骨架在 utils/grid.js；这里只保留茶特有的“加入分组”） ---------- */

  // 加入分组：常用的几个分组直接选（操作菜单最多 6 项），或新建一个
  batchShelf() {
    const teas = this.pickedItems()
    if (!teas.length) return
    const names = S.allShelves(this.listAll()).slice(0, 5)
    wx.showActionSheet({
      itemList: names.concat(['新建分组…']),
      success: r => {
        if (r.tapIndex < names.length) return this.addShelf(teas, names[r.tapIndex])
        wx.showModal({
          title: '新建分组',
          editable: true,
          placeholderText: '如：口粮茶、待客、办公室',
          success: m => {
            const name = (m.content || '').trim().slice(0, 10)
            if (m.confirm && name) this.addShelf(teas, name)
          }
        })
      }
    })
  },

  async addShelf(teas, name) {
    const todo = teas.filter(t => (t.shelves || []).indexOf(name) < 0)
    if (!todo.length) return wx.showToast({ title: '都已在“' + name + '”里', icon: 'none' })
    await B.run(todo, t => this.updateItem(t._id, { shelves: (t.shelves || []).concat([name]) }), '已加入“' + name + '”')
    this.render(this.cachedAll())
  }
}))
