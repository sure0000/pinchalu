const db = require('../../utils/db')
const fmt = require('../../utils/format')
const F = require('../../config/flavor')
const V = require('../../utils/voice')
const AI = require('../../utils/ai')
const xhs = require('../../utils/xhs')
const { getCategory } = require('../../config/teaConfig')

// 本页三种模式：
//   active 计时结束后的整场汇总（数据来自本地进行中状态，保存时写云端）
//   manual 在茶详情页手动补记（不经过计时）
//   edit   编辑已保存的记录
function unionTags(steeps) {
  const out = []
  steeps.forEach(s => (s.tags || []).forEach(t => out.indexOf(t) < 0 && out.push(t)))
  return out
}

Page({
  data: {
    ready: false,
    mode: '',
    brew: null,
    teaName: '',
    categoryName: '',
    unsynced: false,
    dateText: '',
    dateValue: '',
    steepRows: [],
    sheetShow: false,
    sheetTitle: '',
    sheetTags: [],
    sheetTastes: [],
    sheetReview: {},
    sheetNote: '',
    trendSteeps: [],
    wareText: '', // 本场用的茶器（器柜里的名字）
    voices: [],
    suggest: [],
    voiceOpen: false,
    playingId: '',
    voiceEdit: false,
    voiceSpeaker: '',
    voiceText: '',
    aiBusy: false,
    aiStatus: '',
    // 步进流程：计时结束（active）先看 AI 总结与原文（voice），再下一步填写专业评测（review）；
    // 手动补记 / 编辑已有记录不步进，整页展示。
    stepped: false,
    step: 'voice'
  },

  async onLoad(options) {
    const mode = options.mode
    this.mode = mode
    let brew
    if (mode === 'active') {
      const a = db.loadActive()
      if (!a) return wx.navigateBack()
      brew = {
        teaId: a.teaId,
        category: a.category,
        source: 'timer',
        startedAt: a.startedAt,
        endedAt: a.endedAt || Date.now(),
        leafG: a.leafG,
        waterMl: a.waterMl,
        tempC: a.tempC,
        steeps: a.steeps.map(s => Object.assign({}, s)),
        tags: unionTags(a.steeps),
        wareIds: a.wareIds || [],
        review: {},
        rating: 0,
        note: '',
        voices: (a.voices || []).slice()
      }
    } else if (mode === 'manual') {
      const tea = await db.getTea(options.teaId)
      if (!tea) return wx.navigateBack()
      const c = getCategory(tea.category)
      const now = Date.now()
      brew = {
        teaId: tea._id,
        category: tea.category,
        source: 'manual',
        startedAt: now,
        endedAt: now,
        leafG: c.leafG,
        waterMl: c.waterMl,
        tempC: c.tempC,
        steeps: [{ n: 1 }],
        tags: [],
        wareIds: [],
        review: {},
        rating: 0,
        note: '',
        voices: []
      }
    } else {
      this.id = options.id
      try {
        brew = await db.getBrew(options.id)
      } catch (e) {}
      if (!brew) {
        wx.showToast({ title: '记录读取失败，请检查网络', icon: 'none' })
        return setTimeout(() => wx.navigateBack(), 1200)
      }
      brew.rating = brew.rating || 0
      brew.note = brew.note || ''
      brew.tags = brew.tags || []
      brew.wareIds = brew.wareIds || []
      brew.review = brew.review || {}
      brew.voices = brew.voices || []
    }
    this.brew = brew
    this.brew.voices = this.brew.voices || []
    // 计时结束进来的：直接展示 AI 整理总评，原文与录音默认收起
    this.noteAuto = !!(mode === 'active' && this.brew.voices.length)
    this.aiStatus = mode === 'active' && this.brew.voices.length
      ? (AI.available() ? '正在用 AI 整理…' : 'AI 未开通，已按原文拼接')
      : ''
    this.origTeaId = brew.teaId
    wx.setNavigationBarTitle({ title: { active: '本场汇总', manual: '补记一条冲泡', edit: '编辑记录' }[mode] })

    this.teaOptions = db.cachedTeas().filter(t => t.category === brew.category)
    if (brew.teaId) {
      const tea = (await db.getTea(brew.teaId)) || null
      this.teaName = tea ? tea.name : '已删除的茶'
    } else {
      this.teaName = '未关联具体的茶'
    }
    const wares = await db.listWares().catch(() => db.cachedWares())
    if (mode === 'active') this.aggregateOverall()
    this.sync()
    this.setData({
      wareText: brew.wareIds.map(id => (wares.find(w => w._id === id) || {}).name).filter(Boolean).join(' · ')
    })
    this.setData({
      ready: true,
      mode,
      unsynced: !!brew.unsynced,
      categoryName: getCategory(brew.category).name,
      stepped: mode === 'active',
      step: mode === 'active' ? 'voice' : 'review',
      // 计时结束先展示录音的 AI 总结与原文，所以原文默认展开
      voiceOpen: mode === 'active' && this.brew.voices.length > 0
    })
    if (mode === 'active' && this.brew.voices.length) this.maybeAutoAI()
  },

  // 把内存里的 brew 同步到界面
  sync() {
    const b = this.brew
    this.setData({
      brew: b,
      teaName: this.teaName,
      dateText: fmt.date(b.startedAt),
      dateValue: fmt.dateValue(b.startedAt),
      steepRows: b.source === 'manual' ? [] : b.steeps.map(s => {
        const r = s.review || {}
        return {
          n: s.n,
          dur: fmt.duration(s.seconds),
          tags: (s.tags || []).join('、'),
          tastes: (s.tastes || []).join('、'),
          note: s.note || '',
          liquor: r.liquor || '',
          liquorColor: F.liquorColor(r.liquor),
          scored: Object.keys(r.scores || {}).length
        }
      }),
      trendSteeps: b.steeps || [],
      voices: b.voices || [],
      suggest: this.mode === 'active' ? V.detectMissing(b, b.voices || []) : [],
      aiStatus: this.aiStatus || ''
    })
  },

  // 把每一泡的专业审评汇总成整场审评（汤色/清亮度取最常见，强度取各泡平均）；叶底只在整场层面，保留不动
  aggregateOverall() {
    const agg = F.aggregateSteepReviews(this.brew.steeps)
    const leaf = (this.brew.review && this.brew.review.leaf) || []
    this.brew.review = Object.assign({}, agg)
    if (leaf.length) this.brew.review.leaf = leaf
  },

  // 编辑模式下按每泡审评重新汇总整场
  reaggregate() {
    this.aggregateOverall()
    this.sync()
  },

  /* ---------- 步进：AI 总结与原文 → 专业评测卡 ---------- */

  goReview() {
    this.setData({ step: 'review' })
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },

  goVoice() {
    this.setData({ step: 'voice' })
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },

  /* ---------- 表单 ---------- */

  onParam(e) {
    this.brew[e.currentTarget.dataset.key] = e.detail.value
    this.sync()
  },

  onCount(e) {
    const n = e.detail.value
    const steeps = this.brew.steeps
    while (steeps.length < n) steeps.push({ n: steeps.length + 1 })
    steeps.length = n
    this.sync()
  },

  onDate(e) {
    const d = fmt.withDateValue(this.brew.startedAt, e.detail.value)
    this.brew.endedAt += d - this.brew.startedAt
    this.brew.startedAt = d
    this.sync()
  },

  onTags(e) {
    this.brew.tags = e.detail.value
    this.sync()
  },

  onReview(e) {
    this.brew.review = e.detail.value
    this.sync()
  },

  setRating(e) {
    const v = Number(e.currentTarget.dataset.v)
    this.brew.rating = this.brew.rating === v ? 0 : v
    this.sync()
  },

  onNote(e) {
    this.brew.note = e.detail.value
    this.noteAuto = false
  },

  // 生成小红书文案 / 图片：把当前记录塞给分享页
  shareBrew() {
    xhs.setPending({
      brew: this.brew,
      teaName: this.teaName,
      categoryName: getCategory(this.brew.category).name,
      wareText: this.data.wareText
    })
    wx.navigateTo({ url: '/pages/share/share' })
  },

  pickTea() {
    // 微信 actionSheet 最多 6 项：留 1 项给“不关联”，同茶类最多列最近 5 款
    const options = this.teaOptions.slice(0, 5)
    const names = ['不关联具体的茶'].concat(options.map(t => t.name))
    wx.showActionSheet({
      itemList: names,
      success: res => {
        const tea = res.tapIndex ? options[res.tapIndex - 1] : null
        this.brew.teaId = tea ? tea._id : ''
        this.teaName = tea ? tea.name : '未关联具体的茶'
        this.sync()
      }
    })
  },

  /* ---------- 每泡笔记 ---------- */

  editSteep(e) {
    const s = this.brew.steeps.find(x => x.n === Number(e.currentTarget.dataset.n))
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
    const s = this.brew.steeps.find(x => x.n === this.noteN)
    if (!s) {
      this.setData({ sheetShow: false })
      return
    }
    const { tags, tastes, review, note } = e.detail
    if (tags.length) s.tags = tags
    else delete s.tags
    if (tastes.length) s.tastes = tastes
    else delete s.tastes
    if (review && Object.keys(review).length) s.review = review
    else delete s.review
    if (note) s.note = note
    else delete s.note
    // 新增的泡内标签并入整场标签
    tags.forEach(t => this.brew.tags.indexOf(t) < 0 && this.brew.tags.push(t))
    this.sync()
    this.setData({ sheetShow: false })
  },

  /* ---------- 语音评论与评鉴建议 ---------- */

  // 点评鉴建议里的方向，滚动到对应表单区块
  scrollToMissing(e) {
    const key = e.currentTarget.dataset.key
    const map = {
      aroma: 'sec-aroma',
      taste: this.brew.steeps.length ? 'sec-steeps' : 'sec-review',
      liquor: 'sec-review',
      aftertaste: 'sec-review',
      leaf: 'sec-review',
      rating: 'sec-rating'
    }
    const id = map[key]
    if (id) wx.pageScrollTo({ selector: '#' + id, duration: 300 })
  },

  openVoiceEdit(e) {
    const v = this.brew.voices.find(x => x.id === e.currentTarget.dataset.id)
    if (!v) return
    this.voiceEditId = v.id
    this.setData({ voiceEdit: true, voiceSpeaker: v.speaker, voiceText: v.text })
  },

  closeVoiceEdit() {
    this.setData({ voiceEdit: false })
  },

  onVoiceSpeaker(e) {
    this.setData({ voiceSpeaker: e.detail.value })
  },

  onVoiceText(e) {
    this.setData({ voiceText: e.detail.value })
  },

  saveVoiceEdit() {
    const v = this.brew.voices.find(x => x.id === this.voiceEditId)
    if (v) {
      v.speaker = this.data.voiceSpeaker.trim() || '茶友'
      v.text = this.data.voiceText.trim()
    }
    this.setData({ voiceEdit: false })
    this.sync()
  },

  removeVoice() {
    this.brew.voices = this.brew.voices.filter(x => x.id !== this.voiceEditId)
    this.setData({ voiceEdit: false })
    this.sync()
  },

  /* ---------- AI 整理总评 ---------- */

  aiExtra() {
    return {
      teaName: this.teaName,
      categoryName: getCategory(this.brew.category).name,
      tags: this.brew.tags,
      review: this.brew.review,
      rating: this.brew.rating
    }
  },

  // 进汇总页后自动整理：只生成总评（每一泡只保留文字总结，不再自动生成专业评审）
  maybeAutoAI() {
    const voices = this.brew.voices || []
    if (!voices.length) return
    if (!AI.available()) {
      this.brew.note = V.buildOverall(voices)
      this.aiStatus = 'AI 未开通，已按原文拼接'
      this.sync()
      return
    }
    this.aiStatus = '正在用 AI 整理…'
    this.sync()
    AI.summarize(voices, this.aiExtra()).then(sum => {
      if (sum && sum.text) {
        if (this.noteAuto) {
          this.brew.note = sum.text
          this.aiStatus = '已用 AI 整理（混元 hy3）'
        } else {
          this.aiStatus = 'AI 已整理，点「用 AI 整理总评」可覆盖当前总评'
        }
      } else if (!this.brew.note) {
        this.brew.note = V.buildOverall(voices)
        this.aiStatus = 'AI 暂不可用，已按原文拼接'
      } else {
        this.aiStatus = 'AI 暂不可用，已保留当前总评'
      }
      this.sync()
    })
  },

  async aiSummarize() {
    if (this.aiBusy) return
    const voices = this.brew.voices || []
    if (!voices.length) return wx.showToast({ title: '还没有语音评论', icon: 'none' })
    if (!AI.available()) return wx.showToast({ title: '当前环境不支持 AI，请升级基础库或开通云开发 AI', icon: 'none' })
    this.aiBusy = true
    this.aiStatus = '正在用 AI 整理…'
    this.setData({ aiBusy: true })
    wx.showLoading({ title: 'AI 整理中', mask: true })
    const sum = await AI.summarize(voices, this.aiExtra())
    wx.hideLoading()
    this.aiBusy = false
    this.setData({ aiBusy: false })
    if (sum && sum.text) {
      this.brew.note = sum.text
      this.noteAuto = true
      this.aiStatus = '已用 AI 整理（混元 hy3）'
    } else {
      this.brew.note = V.buildOverall(voices)
      this.noteAuto = true
      this.aiStatus = 'AI 暂不可用，已按原文拼接'
    }
    this.sync()
    wx.showToast({ title: this.aiStatus, icon: 'none' })
  },

  /* ---------- 原文与录音回放 ---------- */

  toggleVoice() {
    this.setData({ voiceOpen: !this.data.voiceOpen })
  },

  async playVoice(e) {
    const fileID = e.currentTarget.dataset.fileid
    if (!fileID) return
    if (this.audioCtx) {
      this.audioCtx.stop()
      this.audioCtx.destroy()
      this.audioCtx = null
      if (this.data.playingId === fileID) {
        this.setData({ playingId: '' })
        return
      }
    }
    this.setData({ playingId: fileID })
    try {
      const src = await this.audioSrc(fileID)
      if (!src) throw new Error('no src')
      const ctx = wx.createInnerAudioContext()
      ctx.src = src
      ctx.obeyMuteSwitch = false
      const clear = () => this.setData({ playingId: '' })
      ctx.onEnded(clear)
      ctx.onError(clear)
      ctx.onStop(clear)
      ctx.play()
      this.audioCtx = ctx
    } catch (e) {
      this.setData({ playingId: '' })
      wx.showToast({ title: '录音加载失败', icon: 'none' })
    }
  },

  audioSrc(fileID) {
    if (fileID.indexOf('cloud://') === 0) {
      return new Promise((resolve, reject) => {
        wx.cloud.getTempFileURL({
          fileList: [fileID],
          success: r => {
            const item = r.fileList && r.fileList[0]
            resolve(item && item.tempFileURL ? item.tempFileURL : '')
          },
          fail: reject
        })
      })
    }
    return Promise.resolve(fileID)
  },

  stopVoice() {
    if (this.audioCtx) {
      try { this.audioCtx.stop() } catch (e) {}
      try { this.audioCtx.destroy() } catch (e) {}
      this.audioCtx = null
    }
    this.setData({ playingId: '' })
  },

  onUnload() {
    this.stopVoice()
  },

  /* ---------- 保存 / 删除 / 放弃 ---------- */

  payload() {
    const b = this.brew
    return {
      teaId: b.teaId || '',
      category: b.category,
      source: b.source,
      startedAt: b.startedAt,
      endedAt: b.endedAt,
      leafG: b.leafG,
      waterMl: b.waterMl,
      tempC: b.tempC,
      steeps: b.steeps,
      tags: b.tags,
      wareIds: b.wareIds || [],
      review: b.review || {},
      rating: b.rating || 0, // 0 表示未评分
      note: (b.note || '').trim(),
      voices: b.voices || []
    }
  },

  async save() {
    if (this.saving) return
    this.saving = true
    wx.showLoading({ title: '保存中', mask: true })
    try {
      if (this.mode === 'edit') {
        await db.updateBrew(this.id, this.payload(), this.origTeaId)
        wx.hideLoading()
        wx.showToast({ title: '已保存', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 600)
      } else {
        const r = await db.saveBrew(this.payload())
        wx.hideLoading()
        wx.showToast({ title: r.synced ? '已保存' : '已保存，联网后自动同步', icon: r.synced ? 'success' : 'none', duration: 1500 })
        if (this.mode === 'active') {
          db.clearActive()
          setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 1000)
        } else {
          setTimeout(() => wx.navigateBack(), 1000)
        }
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败，请检查网络后重试', icon: 'none' })
      this.saving = false
    }
  },

  remove() {
    wx.showModal({
      title: '删除这条记录？',
      content: '删除后无法恢复。',
      confirmText: '删除',
      confirmColor: '#b3402f',
      success: async r => {
        if (!r.confirm) return
        try {
          const fileIDs = (this.brew.voices || []).reduce((a, v) => a.concat(v.fileIDs || []), [])
          await db.deleteBrew(this.id, this.origTeaId, fileIDs)
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 600)
        } catch (e) {
          wx.showToast({ title: '删除失败，请检查网络后重试', icon: 'none' })
        }
      }
    })
  },

  discard() {
    wx.showModal({
      title: '放弃本场记录？',
      content: '这一场的冲泡与笔记都不会保存。',
      confirmText: '放弃',
      confirmColor: '#b3402f',
      success: r => {
        if (!r.confirm) return
        // 已上传的录音文件一并删除（尽力而为）
        const fileIDs = (this.brew.voices || []).reduce((a, v) => a.concat(v.fileIDs || []), [])
        db.deletePhotos(fileIDs)
        db.clearActive()
        wx.reLaunch({ url: '/pages/index/index' })
      }
    })
  }
})
