const db = require('../../utils/db')
const B = require('../../utils/brew')
const fmt = require('../../utils/format')
const C = require('../../utils/chadao')
const R = require('../../utils/recommend')
const { CATEGORIES, getCategory } = require('../../config/teaConfig')

const WEEK = '日一二三四五六'

// 时辰时间轴：每格显示钟点与该时辰宜饮的茶类
const SLOTS = C.SHICHEN.map(s => ({ key: s.key, range: s.range, famName: C.FAMILIES[s.family].name, color: C.FAMILIES[s.family].color }))

// 缺的茶类：点灰格新建时预选的茶类
const FAMILY_CATEGORY = {}
CATEGORIES.forEach(c => {
  if (c.family && !FAMILY_CATEGORY[c.family]) FAMILY_CATEGORY[c.family] = c.code
})

function teaItem(p) {
  const t = p.tea
  const f = getCategory(t.category).family
  const fam = C.FAMILIES[f]
  return {
    key: t._id,
    fam: f,
    id: t._id,
    name: t.name,
    src: db.coverOf(t),
    color: fam ? fam.color : '#8a8576',
    shape: (fam && fam.shape) || 'can',
    reason: p.reason,
    effect: fam ? fam.effect : '',
    meta: (p.tags || []).concat([t.lastBrewedAt ? '上次 ' + fmt.date(t.lastBrewedAt) : '还没泡过']).join(' · ')
  }
}

function missingItem(f) {
  const fam = C.FAMILIES[f]
  return { key: 'missing_' + f, family: f, fam: f, name: fam.name, shape: fam.shape || 'can', gray: true, badge: '缺', reason: '茶柜里还没有', effect: fam.effect }
}

// 近期喝过的一条记录：把冲泡记录（只含 teaId / category / startedAt / rating）接到茶名上
function recentRow(b, teas, i) {
  const tea = b.teaId ? teas.find(t => t._id === b.teaId) : null
  const cat = getCategory(b.category)
  const fam = C.FAMILIES[cat.family]
  return {
    key: (b.teaId || 'cat') + '_' + b.startedAt + '_' + i,
    id: b.teaId || '',
    category: b.category,
    name: tea ? tea.name : (b.teaId ? '已删除的茶' : cat.name),
    catName: cat.name,
    dateText: fmt.date(b.startedAt) + ' ' + fmt.time(b.startedAt),
    stars: b.rating ? fmt.stars(b.rating) : '',
    color: fam ? fam.color : '#a9a397'
  }
}

function dateText(now) {
  const d = new Date(now)
  return d.getMonth() + 1 + '月' + d.getDate() + '日 · 周' + WEEK[d.getDay()]
}

Page({
  data: {
    loaded: false,
    pending: 0,
    dateText: '',
    season: null, // { term, label, text }
    slots: SLOTS,
    slot: '', // 时间轴当前查看的时辰
    nowSlot: '',
    slotInfo: null, // { name, range, text, note }
    deck: [], // 最适宜那一类的茶，左右滑动挑一款
    deckName: '',
    cur: 0,
    tiles: [], // 其他类的备选 + 缺的应时 / 应季茶类（灰格）
    recentList: [], // 近期喝过的记录
    note: '' // 今天已喝几种、夜里少饮
  },

  onLoad() {
    this.checkActive()
  },

  onShow() {
    // 每次回到首页都切回当前时辰
    const now = Date.now()
    const nowSlot = R.slotOf(now)
    const s = C.seasonOf(now)
    this.setData({
      nowSlot,
      slot: nowSlot,
      dateText: dateText(now),
      season: { term: s.term, label: s.transition ? s.name + ' · 换季' : s.name, text: s.text }
    })
    const migrating = getApp().globalData.migrating
    if (migrating) {
      wx.showLoading({ title: '本机数据搬上云', mask: true })
      migrating.then(ok => {
        wx.hideLoading()
        if (!ok) wx.showToast({ title: '本机数据还没搬完，下次打开接着搬', icon: 'none', duration: 3000 })
        this.refresh()
      })
      return
    }
    this.refresh()
  },

  refresh() {
    // 先显示本地缓存，再刷新
    this.recent = db.cachedRecentBrews()
    this.render(db.cachedTeas())
    this.load()
    db.listRecentBrews().then(list => {
      this.recent = list
      this.renderPicks()
    })
    db.flushQueue().then(n => {
      if (n) this.load()
      else this.setData({ pending: db.pendingCount() })
    })
  },

  async load() {
    try {
      this.render(await db.listTeas())
    } catch (e) {
      this.setData({ loaded: true })
    }
  },

  render(teas) {
    this.teaList = teas
    this.setData({ loaded: true, pending: db.pendingCount() })
    this.renderPicks()
  },

  renderPicks() {
    const now = Date.now()
    const teas = this.teaList || []
    const recent = this.recent || []
    const slot = C.getShichen(this.data.slot)
    const season = C.seasonOf(now)
    const ranked = R.recommend(teas, recent, slot.key, now, teas.length).map(teaItem)

    // 应时 / 应季的茶类茶柜里没有：灰格加“缺”角标，点了就去添
    const have = {}
    teas.filter(t => !t.finished).forEach(t => (have[getCategory(t.category).family] = true))
    let missing = [slot.family, season.family].filter((f, i, arr) => arr.indexOf(f) === i && !have[f]).map(missingItem)
    // 最适宜的那一类：茶柜里这一类的茶按推荐顺序排成一组，左右滑动挑；茶柜空着时放最该添的那类
    let deck = []
    if (ranked.length) deck = ranked.filter(p => p.fam === ranked[0].fam)
    else if (missing.length) deck = [missing.shift()]
    const fam = deck.length ? deck[0].fam : ''
    missing = missing.filter(m => m.fam !== fam)

    const kinds = Object.keys(R.todayKinds(recent, now)).length
    const notes = []
    if (kinds) notes.push('今天已喝 ' + kinds + ' 种' + (kinds >= C.DAILY_KINDS ? '，一日不宜超过三种，续这几款吧' : ''))
    if (slot.note && this.data.slot === this.data.nowSlot) notes.push(slot.note)
    const recentList = recent.slice().sort((a, b) => b.startedAt - a.startedAt).slice(0, 6).map((b, i) => recentRow(b, teas, i))
    this.setData({
      slotInfo: { name: slot.name, range: slot.range, text: slot.text },
      deck,
      deckName: fam ? C.FAMILIES[fam].name : '',
      cur: 0,
      tiles: ranked.filter(p => p.fam !== fam).slice(0, 2).concat(missing),
      recentList,
      note: notes.join('；')
    })
  },

  pickSlot(e) {
    this.setData({ slot: e.currentTarget.dataset.key })
    this.renderPicks()
  },

  onSwipe(e) {
    this.setData({ cur: e.detail.current })
  },

  onDeck(e) {
    this.open(this.data.deck[e.currentTarget.dataset.i])
  },

  onTile(e) {
    this.open(this.data.tiles[e.currentTarget.dataset.i])
  },

  // 茶：直接开泡；缺的茶类：去添一款
  open(it) {
    if (!it) return
    if (it.family) return wx.navigateTo({ url: '/pages/tea-edit/tea-edit?category=' + FAMILY_CATEGORY[it.family] })
    wx.navigateTo({ url: '/pages/timer/timer?teaId=' + it.id })
  },

  // 上次中途退出：提示继续或结束
  checkActive() {
    const a = db.loadActive()
    if (!a) return
    const name = a.teaName || getCategory(a.category).name
    wx.showModal({
      title: '有一场未结束的冲泡',
      content: name + ' · 已完成 ' + a.steeps.length + ' 泡',
      confirmText: '继续',
      cancelText: '结束',
      success: res => {
        if (res.confirm) {
          wx.navigateTo({ url: a.endedAt ? '/pages/summary/summary?mode=active' : '/pages/timer/timer' })
          return
        }
        if (!a.steeps.length) {
          db.clearActive()
          return
        }
        if (!a.endedAt) {
          B.finish(a, Date.now())
          db.saveActive(a)
        }
        wx.navigateTo({ url: '/pages/summary/summary?mode=active' })
      }
    })
  },

  retrySync() {
    wx.showLoading({ title: '同步中' })
    db.flushQueue().then(() => {
      wx.hideLoading()
      this.load()
    })
  },

  goTimer() {
    wx.navigateTo({ url: '/pages/timer/timer' })
  },

  // 近期喝过：有关联茶的看详情；只选过茶类的就切到该类再泡
  openRecent(e) {
    const it = this.data.recentList[e.currentTarget.dataset.i]
    if (!it) return
    if (it.id) return wx.navigateTo({ url: '/pages/tea-detail/tea-detail?id=' + it.id })
    wx.setStorageSync('lastCategory', it.category)
    wx.navigateTo({ url: '/pages/timer/timer' })
  },

  // 长按看详情（缺的茶类没有详情）
  goTea(e) {
    const id = e.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: '/pages/tea-detail/tea-detail?id=' + id })
  }
})
