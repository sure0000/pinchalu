const db = require('../../utils/db')
const B = require('../../utils/brew')
const V = require('../../utils/voice')
const fmt = require('../../utils/format')
const { CATEGORIES, CLASSES, getCategory, getSourceType } = require('../../config/teaConfig')
const C = require('../../utils/chadao')
const W = require('../../config/teaware')
const MW = require('../../config/wares')
const M = require('../../config/music')

const app = getApp()
const VOL = 0.5 // 配乐音量；出汤提示时临时压低
const PREFS = 'brewPrefs' // { ware: { 茶类: 茶具套组 id }, myWare: { 茶类: [器柜茶器 id] }, music: { 茶类: 曲目 id }, musicOff }
const ROLES = ['main', 'fair', 'cup'] // 计时页可选的三样：主泡器、公道杯、品茗杯
const FIT_WATER = ['gaiwan', 'hu', 'glass'] // 这几种主泡器按容量定水量

function wareItem(w, i, score) {
  return {
    id: w._id,
    name: w.name,
    kind: MW.getKind(w.kind).code,
    material: w.material || '',
    src: db.coverOf(w),
    cap: w.capacityMl ? w.capacityMl + 'ml' : '',
    capacityMl: w.capacityMl || 0,
    sub: MW.wareSub(w),
    rec: i === 0 && score >= 2
  }
}

// 从某款茶进来：这款茶的说明（复用茶详情的字段，空的不显示）
function teaRows(tea) {
  const st = getSourceType(tea.sourceType)
  const rows = [
    { k: '品种', v: tea.variety },
    { k: '产地', v: tea.origin },
    { k: '年份', v: tea.year ? tea.year + ' 年' : '' },
    { k: st ? st.label : '出处', v: [tea.sourceName, st && st.name].filter(Boolean).join(' · ') },
    { k: '备注', v: tea.note }
  ]
  return rows.filter(r => r.v)
}

function prefs() {
  try {
    return wx.getStorageSync(PREFS) || {}
  } catch (e) {
    return {}
  }
}

function savePrefs(patch) {
  try {
    wx.setStorageSync(PREFS, Object.assign(prefs(), patch))
  } catch (e) {}
}

Page({
  data: {
    phase: 'setup', // setup 选茶与参数 | brew 计时中
    categories: CATEGORIES,
    teas: [],
    teaList: [],
    teaId: '',
    fixedTea: false, // 从某款茶进来：锁定这款茶，不再选茶类/我的茶
    teaInfo: null, // 这款茶的说明（名称/茶类/品性/产地等）
    category: '',
    leafG: 0,
    waterMl: 0,
    tempC: 0,
    firstSec: 0,
    teaName: '',
    categoryName: '',
    view: {},
    steepChips: [],
    canNote: false,
    sheetShow: false,
    sheetTitle: '',
    sheetTags: [],
    sheetTastes: [],
    sheetReview: {},
    sheetNote: '',
    // 茶具搭配与配乐
    wares: [],
    ware: null,
    wareTip: '',
    wareShow: false,
    // 器柜里的茶器：按适配程度排序，第一件够合适时标“荐”
    roles: ROLES.map(key => ({ key, name: MW.ROLES[key] })),
    myWares: { main: [], fair: [], cup: [] },
    wareSel: { main: '', fair: '', cup: '' },
    combo: [], // 器柜推荐组合：主泡器 / 公道杯 / 品茗杯各取最适配的一件
    hasMyWares: false, // 器柜里有没有可搭配的茶器
    myWareText: '', // 本场选用的茶器名，计时中显示
    mainWare: null,
    tracks: M.TRACKS,
    track: null, // null 表示不放配乐
    musicId: 'off',
    playing: false,
    // 语音记录：开泡后默认自动录音，把多人评论分段转成文字
    voiceAuto: true,
    voices: [],
    voiceStatus: 'idle', // idle | recording | recognizing
    voicePartial: '',
    voiceProgress: '',
    voiceSec: 0
  },

  onLoad(options) {
    this.fixedTeaId = options.teaId || ''
    // 器柜可能还没打开过，拉一次再刷新茶器列表
    db.listWares().then(() => this.applyMyWares(this.curCategory(), this.active ? this.active.wareIds || [] : undefined), () => {})
    const a = db.loadActive()
    if (a && a.endedAt) {
      wx.redirectTo({ url: '/pages/summary/summary?mode=active' })
      return
    }
    if (a) {
      this.active = a
      this.enterBrew()
      return
    }
    const teas = db.cachedTeas()
    const fixed = this.fixedTeaId ? teas.find(t => t._id === this.fixedTeaId) : null
    // 从器柜“用它泡茶”进来：先选上这件器，茶类取它标的第一个宜泡
    this.presetWare = options.wareId || ''
    const pw = this.presetWare && db.cachedWares().find(w => w._id === this.presetWare)
    let category = fixed ? fixed.category : ''
    if (!category && pw && (pw.forClasses || []).length) {
      const cls = CLASSES.find(c => c.code === pw.forClasses[0])
      if (cls) category = cls.cat
    }
    if (!category) category = wx.getStorageSync('lastCategory') || CATEGORIES[0].code
    this.setData({ teas })
    if (fixed) this.setFixedTea(fixed)
    else this.setData({ teaId: '' })
    this.applyDefaults(category)
    db.listTeas().then(list => {
      this.setData({ teas: list })
      if (this.fixedTeaId) {
        const t = list.find(x => x._id === this.fixedTeaId)
        if (t) this.setFixedTea(t)
        this.applyDefaults(t ? t.category : this.data.category)
      } else {
        this.applyDefaults(this.data.category)
      }
    }, () => {})
  },

  onShow() {
    // 从“添置茶器”回来：刷新器柜列表
    if (this.data.phase === 'setup' && this.shown) this.applyMyWares(this.data.category)
    this.shown = true
    if (this.data.phase === 'setup') {
      // 从“新建茶”回来：选中刚建的茶
      const id = app.globalData.selectedTeaId
      if (id) {
        app.globalData.selectedTeaId = ''
        const teas = db.cachedTeas()
        const tea = teas.find(t => t._id === id)
        if (tea) {
          this.setData({ teas, teaId: tea._id })
          this.applyDefaults(tea.category)
        }
      }
    } else if (this.active) {
      this.keepOn(true)
      this.startTicker()
      // 从后台回来继续自动录音（切后台时只暂停，回来接着录）
      clearTimeout(this.voiceResumeTimer)
      this.voiceResumeTimer = setTimeout(() => {
        if (this.data.voiceAuto && !this.flushResolve && (!this.recorder || this.recorder.isIdle())) {
          this.resumeVoice()
        }
      }, 500)
    }
    if (this.musicResume) this.playMusic()
    this.musicResume = false
  },

  onHide() {
    this.stopTicker()
    // 离开页面或切后台时暂停配乐，回来再续上
    this.musicResume = this.musicOn
    if (this.music && this.musicOn) this.music.pause()
    // 正在录音时切后台：只暂停（不转写），回来接着录
    if (this.recorder && this.recorder.isRecording()) {
      this.recorder.pause()
    }
  },

  onUnload() {
    this.stopTicker()
    this.keepOn(false)
    this.destroyVoice()
    if (this.audio) this.audio.destroy()
    clearTimeout(this.duckTimer)
    if (this.music) this.music.destroy()
    this.music = null
  },

  /* ---------- 开泡前：选茶与参数 ---------- */

  applyDefaults(code) {
    const c = getCategory(code)
    this.setData({
      category: code,
      leafG: c.leafG,
      waterMl: c.waterMl,
      tempC: c.tempC,
      firstSec: c.firstSec,
      // 已喝完的茶（茶柜里标记 finished）不再出现在选茶列表，除非正是当前选中的那款
      teaList: this.data.teas.filter(t => t.category === code && (!t.finished || t._id === this.data.teaId))
    })
    this.applyExtras(code)
  },

  // 从某款茶进来：锁定这款茶并展示它的说明
  setFixedTea(tea) {
    const cat = getCategory(tea.category)
    const fam = C.FAMILIES[cat.family]
    this.setData({
      fixedTea: true,
      teaId: tea._id,
      category: tea.category,
      teaInfo: {
        name: tea.name,
        src: db.coverOf(tea),
        color: fam ? fam.color : '#8a8576',
        shape: (fam && fam.shape) || 'can',
        gray: !!tea.finished,
        categoryName: cat.name + (fam && fam.name !== cat.name ? ' · ' + fam.name : ''),
        effect: fam ? fam.effect : '',
        rows: teaRows(tea)
      }
    })
  },

  // “换一款”：回到茶类 + 我的茶的完整选择
  switchTea() {
    this.fixedTeaId = ''
    this.setData({ fixedTea: false, teaId: '', teaInfo: null })
    this.applyDefaults(this.data.category)
  },

  /* ---------- 茶具搭配与配乐 ---------- */

  curCategory() {
    return this.active ? this.active.category : this.data.category
  },

  // 按茶类取茶具与配乐：显式传入的（进行中冲泡里存的）优先，其次本地偏好，最后用默认
  applyExtras(code, wareId, musicId, myIds) {
    const p = prefs()
    const w = W.waresOf(code)
    const wid = wareId || (p.ware || {})[code]
    const mid = musicId || (p.musicOff ? 'off' : (p.music || {})[code])
    const track = mid === 'off' ? null : M.getTrack(mid) || M.defaultTrack(code)
    this.setData({
      wares: w.sets,
      wareTip: w.tip,
      ware: w.sets.find(s => s.id === wid) || w.sets[0],
      track,
      musicId: track ? track.id : 'off'
    })
    this.applyMyWares(code, myIds)
    // 试听中换了茶类：跟着换曲
    if (this.musicOn) this.playMusic()
  },

  // 器柜里的茶器：ids 为进行中冲泡里存的；否则用该茶类上次的选择；都没有时每样选最合适的一件
  applyMyWares(code, ids) {
    const saved = ids || (prefs().myWare || {})[code] || null
    const all = db.cachedWares().filter(w => !w.retired || (saved || []).indexOf(w._id) >= 0 || w._id === this.presetWare)
    const myWares = {}
    const wareSel = {}
    ROLES.forEach(role => {
      const list = all
        .filter(w => MW.getKind(w.kind).role === role)
        .map(w => ({ w, s: MW.fitScore(w, code) }))
        .sort((a, b) => b.s - a.s)
        .map((x, i) => wareItem(x.w, i, x.s))
      myWares[role] = list
      const preset = list.find(x => x.id === this.presetWare)
      if (preset) wareSel[role] = preset.id
      else if (saved) wareSel[role] = (list.find(x => saved.indexOf(x.id) >= 0) || {}).id || ''
      else wareSel[role] = list.length ? list[0].id : ''
    })
    // 器柜推荐组合：主泡器 / 公道杯 / 品茗杯各取最适配的一件
    let combo = ROLES.map(role => {
      const w = myWares[role][0]
      return w ? Object.assign({}, w, { role, roleName: MW.ROLES[role] }) : null
    }).filter(Boolean)
    this.setData({ myWares, wareSel, combo, hasMyWares: !!(myWares.main.length || myWares.fair.length || myWares.cup.length) })
    this.syncMyWares()
    this.fitWater(false)
  },

  // 一键选用器柜推荐组合
  useCombo() {
    const wareSel = {}
    this.data.combo.forEach(w => { wareSel[w.role] = w.id })
    this.setData({ wareSel })
    this.syncMyWares()
    const ids = this.selectedWareIds()
    savePrefs({ myWare: Object.assign({}, prefs().myWare, { [this.curCategory()]: ids }) })
    this.closeWare()
    this.fitWater(false)
  },

  syncMyWares() {
    const { myWares, wareSel } = this.data
    const picked = ROLES.map(r => myWares[r].find(x => x.id === wareSel[r])).filter(Boolean)
    this.setData({ mainWare: myWares.main.find(x => x.id === wareSel.main) || null, myWareText: picked.map(x => x.name).join(' · ') })
  },

  selectedWareIds() {
    const s = this.data.wareSel
    return ROLES.map(r => s[r]).filter(Boolean)
  },

  // 开泡前：主泡器是盖碗 / 壶 / 玻璃杯且填了容量，水量就按容量来
  fitWater(toast) {
    const m = this.data.mainWare
    if (this.active || !m || FIT_WATER.indexOf(m.kind) < 0 || m.capacityMl < 30 || m.capacityMl > 500) return
    if (this.data.waterMl === m.capacityMl) return
    this.setData({ waterMl: m.capacityMl })
    if (toast) wx.showToast({ title: '水量按容量设为 ' + m.capacityMl + 'ml', icon: 'none' })
  },

  pickMyWare(e) {
    const { role, id } = e.currentTarget.dataset
    const wareSel = Object.assign({}, this.data.wareSel, { [role]: this.data.wareSel[role] === id ? '' : id })
    this.presetWare = ''
    this.setData({ wareSel })
    this.syncMyWares()
    const ids = this.selectedWareIds()
    savePrefs({ myWare: Object.assign({}, prefs().myWare, { [this.curCategory()]: ids }) })
    if (this.active) {
      this.active.wareIds = ids
      this.persist()
    } else if (role === 'main') {
      this.fitWater(true)
    }
  },

  newWare() {
    wx.navigateTo({ url: '/pages/ware-edit/ware-edit' })
  },

  pickWare(e) {
    const ware = W.getWare(e.currentTarget.dataset.id)
    if (!ware) return
    const code = this.curCategory()
    savePrefs({ ware: Object.assign({}, prefs().ware, { [code]: ware.id }) })
    this.setData({ ware })
    if (this.active) {
      this.active.wareId = ware.id
      this.persist()
    }
  },

  openWare() {
    this.setData({ wareShow: true })
  },

  closeWare() {
    this.setData({ wareShow: false })
  },

  noop() {},

  onPickMusic(e) {
    this.pickMusic(e.currentTarget.dataset.id, this.musicOn)
  },

  // id 为曲目或 'off'；play 为 true 时选完立即播放
  pickMusic(id, play) {
    const code = this.curCategory()
    const track = id === 'off' ? null : M.getTrack(id)
    if (track) savePrefs({ musicOff: false, music: Object.assign({}, prefs().music, { [code]: track.id }) })
    else savePrefs({ musicOff: true })
    this.setData({ track, musicId: track ? track.id : 'off' })
    if (this.active) {
      this.active.music = track ? track.id : 'off'
      this.persist()
    }
    if (track && play) this.playMusic()
    else if (!track) this.stopMusic()
  },

  // 开泡前试听
  togglePreview() {
    if (this.musicOn) this.stopMusic()
    else this.playMusic()
  },

  // 计时中：暂停 / 播放 / 换曲
  musicMenu() {
    const d = this.data
    const items = [this.musicOn ? '暂停配乐' : '播放配乐'].concat(
      M.TRACKS.map(t => (t.id === d.musicId ? '✓ ' : '') + t.name + ' · ' + t.mode + '（' + t.mood + '）')
    )
    wx.showActionSheet({
      itemList: items,
      success: r => {
        if (r.tapIndex > 0) return this.pickMusic(M.TRACKS[r.tapIndex - 1].id, true)
        if (this.musicOn) return this.pauseMusic()
        if (!d.track) return this.pickMusic(M.defaultTrack(this.curCategory()).id, true)
        this.playMusic()
      }
    })
  },

  ensureMusic() {
    if (!this.music) {
      const m = wx.createInnerAudioContext()
      m.loop = true
      m.volume = VOL
      m.onPlay(() => this.setData({ playing: true }))
      m.onPause(() => this.setData({ playing: false }))
      m.onStop(() => this.setData({ playing: false }))
      m.onError(() => {
        this.musicOn = false
        this.setData({ playing: false })
      })
      this.music = m
    }
    return this.music
  },

  playMusic() {
    const t = this.data.track
    if (!t) return this.stopMusic()
    const m = this.ensureMusic()
    if (this.musicSrc !== t.src) {
      this.musicSrc = t.src
      m.src = t.src
    }
    this.musicOn = true
    m.play()
  },

  pauseMusic() {
    this.musicOn = false
    if (this.music) this.music.pause()
  },

  stopMusic() {
    this.musicOn = false
    if (this.music) this.music.stop()
  },

  pickCategory(e) {
    const code = e.currentTarget.dataset.code
    const tea = this.data.teas.find(t => t._id === this.data.teaId)
    if (tea && tea.category !== code) this.setData({ teaId: '' })
    this.applyDefaults(code)
  },

  pickTea(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ teaId: this.data.teaId === id ? '' : id })
  },

  newTea() {
    wx.navigateTo({ url: '/pages/tea-edit/tea-edit?lite=1&category=' + this.data.category })
  },

  // 只影响本场，不改默认值
  onSetupParam(e) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value })
  },

  startBrew() {
    const d = this.data
    const now = Date.now()
    this.active = B.createActive({
      tea: d.teas.find(t => t._id === d.teaId),
      category: d.category,
      leafG: d.leafG,
      waterMl: d.waterMl,
      tempC: d.tempC,
      firstSec: d.firstSec,
      stepSec: getCategory(d.category).stepSec,
      now
    })
    B.start(this.active, now)
    // 本场的搭配参考与配乐记在进行中状态里（不写进记录）；器柜茶器 wareIds 会随记录保存
    this.active.wareId = d.ware ? d.ware.id : ''
    this.active.wareIds = this.selectedWareIds() // 器柜里选用的茶器，会写进冲泡记录
    this.active.music = d.musicId
    this.active.voices = []
    this.active.voiceAuto = d.voiceAuto
    wx.setStorageSync('lastCategory', d.category)
    this.persist()
    this.enterBrew()
  },

  /* ---------- 计时中 ---------- */

  enterBrew() {
    const a = this.active
    this.setData({
      phase: 'brew',
      teaName: a.teaName || '未关联具体的茶',
      categoryName: getCategory(a.category).name,
      leafG: a.leafG,
      waterMl: a.waterMl,
      tempC: a.tempC,
      voices: a.voices || [],
      voiceAuto: a.voiceAuto !== false
    })
    wx.setNavigationBarTitle({ title: a.teaName || getCategory(a.category).name })
    this.applyExtras(a.category, a.wareId, a.music, a.wareIds || [])
    if (this.data.track) this.playMusic()
    this.keepOn(true)
    this.refreshSteeps()
    this.startTicker()
    // 开泡即自动开始语音记录
    if (this.data.voiceAuto) this.startVoice()
  },

  keepOn(on) {
    wx.setKeepScreenOn({ keepScreenOn: on })
  },

  persist() {
    db.saveActive(this.active)
  },

  startTicker() {
    this.stopTicker()
    this.tick()
    this.ticker = setInterval(() => this.tick(), 200)
  },

  stopTicker() {
    clearInterval(this.ticker)
    this.ticker = null
  },

  // 每 200ms 用“结束时间 − 当前时间”刷新；onShow 时立即重算，所以切后台不丢时间
  tick() {
    const a = this.active
    if (!a) return
    const now = Date.now()
    if (B.settle(a, now)) {
      this.persist()
      this.refreshSteeps()
      this.alert()
    }
    const v = B.view(a, now)
    const old = this.data.view
    if (v.clock !== old.clock || v.text !== old.text || v.status !== old.status || v.pct !== old.pct || v.seconds !== old.seconds || v.n !== old.n) {
      this.setData({ view: v })
    }
    if (this.data.voiceStatus === 'recording' && this.voiceStartAt) {
      const sec = Math.floor((now - this.voiceStartAt) / 1000)
      if (sec !== this.data.voiceSec) this.setData({ voiceSec: sec })
    }
  },

  alert() {
    wx.vibrateLong()
    // 出汤提示时把配乐压低几秒
    if (this.music && this.musicOn) {
      this.music.volume = 0.12
      clearTimeout(this.duckTimer)
      this.duckTimer = setTimeout(() => {
        if (this.music) this.music.volume = VOL
      }, 2500)
    }
    if (!this.audio) {
      this.audio = wx.createInnerAudioContext()
      this.audio.obeyMuteSwitch = false
      this.audio.src = '/assets/beep.wav'
    }
    this.audio.stop()
    this.audio.play()
  },

  refreshSteeps() {
    const a = this.active
    this.setData({
      canNote: a.steeps.length > 0,
      steepChips: a.steeps.map(s => ({
        n: s.n,
        text: fmt.duration(s.seconds),
        noted: !!(s.note || (s.tags && s.tags.length) || (s.tastes && s.tastes.length) || (s.review && Object.keys(s.review).length))
      }))
    })
  },

  onMain() {
    const a = this.active
    const now = Date.now()
    if (B.settle(a, now)) {
      // 点击瞬间刚好到时：按到时处理，不再暂停
      this.persist()
      this.refreshSteeps()
      this.alert()
      this.tick()
      return
    }
    const s = a.cur.status
    if (s === 'idle') B.start(a, now)
    else if (s === 'running') B.pause(a, now)
    else if (s === 'paused') B.resume(a, now)
    else if (s === 'done') {
      B.next(a)
      this.cutVoice() // 进入下一泡：切一段录音
    }
    this.persist()
    this.tick()
  },

  adjust(e) {
    B.adjust(this.active, Number(e.currentTarget.dataset.delta))
    this.persist()
    this.tick()
  },

  // 泡与泡之间改参数，只影响本场
  onBrewParam(e) {
    const key = e.currentTarget.dataset.key
    this.active[key] = e.detail.value
    this.persist()
    this.setData({ [key]: e.detail.value })
  },

  /* ---------- 记一笔 ---------- */

  openNote() {
    const steeps = this.active.steeps
    const s = steeps[steeps.length - 1]
    if (!s) return
    this.noteN = s.n
    this.setData({
      sheetShow: true,
      sheetTitle: '第 ' + s.n + ' 泡 · ' + fmt.duration(s.seconds),
      sheetTags: s.tags || [],
      sheetTastes: s.tastes || [],
      sheetReview: s.review || {},
      sheetNote: s.note || ''
    })
  },

  closeNote() {
    this.setData({ sheetShow: false })
  },

  saveNote(e) {
    const s = this.active.steeps.find(x => x.n === this.noteN)
    if (s) {
      const { tags, tastes, review, note } = e.detail
      if (tags.length) s.tags = tags
      else delete s.tags
      if (tastes.length) s.tastes = tastes
      else delete s.tastes
      if (review && Object.keys(review).length) s.review = review
      else delete s.review
      if (note) s.note = note
      else delete s.note
      this.persist()
      this.refreshSteeps()
    }
    this.setData({ sheetShow: false })
  },

  /* ---------- 语音记录 ---------- */

  onVoiceAuto(e) {
    this.setData({ voiceAuto: e.detail.value })
  },

  ensureRecorder() {
    if (this.recorder) return this.recorder
    this.recorder = V.createRecorder({
      onStatus: s => this.setData({ voiceStatus: s }),
      onText: results => this.onVoiceText(results),
      onProgress: (done, total) => this.onVoiceProgress(done, total),
      onError: msg => this.onVoiceError(msg)
    })
    return this.recorder
  },

  // 开泡后自动开始录音：每泡一段，只有结束本场时才统一转写
  startVoice() {
    if (!this.active || this.data.phase !== 'brew' || this.active.endedAt) return
    const r = this.ensureRecorder()
    if (!r.isIdle()) return
    this.voiceStartAt = Date.now()
    this.setData({ voicePartial: '', voiceProgress: '', voiceSec: 0, voiceStatus: 'recording' })
    r.start()
  },

  // 从后台回来继续录音（接着当前泡继续）
  resumeVoice() {
    if (!this.active || this.data.phase !== 'brew' || this.active.endedAt) return
    const r = this.ensureRecorder()
    if (!r.isIdle()) return
    if (!this.voiceStartAt) this.voiceStartAt = Date.now()
    this.setData({ voicePartial: '', voiceStatus: 'recording' })
    r.resume()
  },

  // 下一泡：切一段录音，录音秒数从 0 重新计
  cutVoice() {
    if (this.recorder) {
      this.recorder.cut()
      this.voiceStartAt = Date.now()
      this.setData({ voiceSec: 0 })
    }
  },

  // 结束本场时的最终转写结果：results = [{ text, fileIDs }]（每泡一个）
  onVoiceText(results) {
    wx.hideLoading()
    this.setData({ voiceStatus: 'idle', voicePartial: '', voiceProgress: '' })
    const dur = this.voiceStartAt ? Date.now() - this.voiceStartAt : 0
    this.voiceStartAt = 0
    const a = this.active
    const list = results || []
    const voices = []
    list.forEach((r, i) => {
      const n = i + 1
      const text = (r.text || '').trim()
      const files = r.fileIDs || []
      const s = a.steeps.find(x => x.n === n)
      if (s) {
        s.voiceText = text
        s.voiceFileIDs = files
      }
      if (text || files.length) {
        voices.push({ id: 'v' + Date.now() + '_' + i, speaker: '第 ' + n + ' 泡', text, durationMs: 0, fileIDs: files })
      }
    })
    a.voices = voices
    this.persist()
    this.setData({ voices })
    const done = () => {
      if (this.flushResolve) {
        const resolve = this.flushResolve
        this.flushResolve = null
        this.flushDur = 0
        resolve()
      }
    }
    if (!voices.length && dur > 0) {
      // 全部没转出文字：手动补写整场
      this.askText().then(manual => {
        if (manual) {
          const s = a.steeps[0]
          if (s) {
            s.voiceText = manual
            s.voiceFileIDs = (list[0] && list[0].fileIDs) || []
          }
          a.voices = [{ id: 'v' + Date.now(), speaker: '整场', text: manual, durationMs: dur, fileIDs: (list[0] && list[0].fileIDs) || [] }]
          this.persist()
          this.setData({ voices: a.voices })
        }
        done()
      })
      return
    }
    done()
  },

  onVoiceError(msg) {
    wx.hideLoading()
    this.setData({ voiceStatus: 'idle', voicePartial: '', voiceProgress: '' })
    this.voiceStartAt = 0
    if (this.flushResolve) {
      const resolve = this.flushResolve
      this.flushResolve = null
      this.flushDur = 0
      resolve()
    } else {
      wx.showToast({ title: msg, icon: 'none' })
    }
  },

  onVoiceProgress(done, total) {
    const text = '正在转写第 ' + done + '/' + total + ' 泡'
    this.setData({ voiceProgress: text })
    wx.showLoading({ title: text, mask: true })
  },

  askText() {
    return new Promise(resolve => {
      wx.showModal({
        title: '这段说了什么？',
        editable: true,
        placeholderText: '没听清时可手动补写（可留空）',
        confirmText: '记下',
        cancelText: '留空',
        success: res => resolve(res.confirm ? ((res.content || '').trim()) : ''),
        fail: () => resolve('')
      })
    })
  },

  // 结束时把正在录的收尾并统一转写（转写多段需要时间，给足兜底）
  flushVoice() {
    return new Promise(resolve => {
      const r = this.recorder
      if (!r || (!r.isRecording() && !r.hasAudio())) return resolve()
      this.flushResolve = resolve
      this.flushDur = this.voiceStartAt ? Date.now() - this.voiceStartAt : 0
      r.stop()
      setTimeout(() => {
        if (this.flushResolve) {
          this.flushResolve()
          this.flushResolve = null
          this.flushDur = 0
        }
      }, 60000)
    })
  },

  destroyVoice() {
    if (this.recorder) {
      this.recorder.destroy()
      this.recorder = null
    }
    this.setData({ voiceStatus: 'idle', voicePartial: '', voiceProgress: '' })
  },

  /* ---------- 结束 ---------- */

  onEnd() {
    const a = this.active
    B.settle(a, Date.now())
    if (!a.steeps.length) {
      wx.showModal({
        title: '还没有完成任何一泡',
        content: '现在退出不会保存记录。',
        confirmText: '退出',
        success: r => {
          if (!r.confirm) return
          this.destroyVoice()
          db.clearActive()
          this.active = null
          this.stopTicker()
          if (getCurrentPages().length > 1) wx.navigateBack()
          else wx.reLaunch({ url: '/pages/index/index' })
        }
      })
      return
    }
    wx.showModal({
      title: '结束本场冲泡？',
      content: '已完成 ' + a.steeps.length + ' 泡，接下来会转写语音，先看到文字内容，再整理成总评。',
      success: async r => {
        if (!r.confirm) return
        B.finish(a, Date.now())
        this.persist()
        this.stopTicker()
        wx.showLoading({ title: '正在转写…', mask: true })
        await this.flushVoice()
        wx.hideLoading()
        wx.redirectTo({ url: '/pages/summary/summary?mode=active' })
      }
    })
  }
})
