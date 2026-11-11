// 语音品茶记录：录音 + 云端转写 + 从语音文本里抽取风味词 + 补全提醒。
//
// 微信官方“同声传译”插件已下架，语音转文字改走自建云函数：
//   录音（wx.getRecorderManager）→ 上传到云存储 → 云函数 asr 调腾讯云一句话识别 → 返回文字。
// 云函数未部署 / 转写失败 / 本地模式时，onText 返回空字符串，界面会提示手动补写这段说了什么。
const F = require('../config/flavor')
const { USE_CLOUD } = require('../config/env')
const localCloud = require('./localCloud')

const MAX_MS = 60000 // 单段最长 60 秒（腾讯云一句话识别的上限）

// 云端用 wx.cloud，本地模式用 localCloud（上传/保存的文件都能回放）
const cloudApi = () => (USE_CLOUD ? wx.cloud : localCloud)

// 创建录音控制器：按“泡”分段录音（每泡内部每 MAX_MS 自动切段避免超过一句话识别上限），
// 只有调用 stop() 时才把所有泡的片段一起转写并回调 onText。handlers：
//   onStatus('idle' | 'recording' | 'recognizing')
//   onText(results)  每泡一个 [{ text, fileIDs }]（转写不可用时 text 为空字符串，fileIDs 保留供回放）
//   onProgress(done, total)  转写进度（第 done / total 泡）
//   onError(msg)
function createRecorder(handlers) {
  const h = handlers || {}
  let status = 'idle'
  let rec = null
  let chunks = [] // 已完成且已上传保存的片段：[{ fileID, steep, saved }]
  let steep = 0 // 当前泡（0 起）
  let pendingCut = false // 切泡信号
  let finalizing = false
  let paused = false
  let timer = null
  let finalizeTimer = null

  const clearTimer = () => {
    clearTimeout(timer)
    timer = null
  }
  const clearFinalize = () => {
    clearTimeout(finalizeTimer)
    finalizeTimer = null
  }
  const setStatus = s => {
    status = s
    h.onStatus && h.onStatus(s)
  }

  // 把积累的所有片段按泡分组转写，最终回调一次 onText
  const finish = () => {
    clearFinalize()
    setStatus('recognizing')
    // 先等所有片段都上传保存完（上传在 onStop 时就开始了），再按泡识别
    Promise.all(chunks.map(c => c.saved))
      .then(() => groupChunks(chunks))
      .then(groups => {
        chunks = []
        return transcribeGroups(groups, (done, total) => h.onProgress && h.onProgress(done, total))
      })
      .then(results => {
        setStatus('idle')
        h.onText && h.onText(results)
      })
      .catch(() => {
        setStatus('idle')
        h.onText && h.onText([])
      })
  }

  const startChunk = () => {
    if (status !== 'recording' || finalizing || paused) return
    clearTimer()
    try {
      rec.start({
        duration: MAX_MS,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: 'mp3'
      })
    } catch (e) {
      setStatus('idle')
      h.onError && h.onError('录音启动失败')
      return
    }
    // 兜底：duration 到了但 onStop 没触发时手动停（仍属于继续录下一段）
    timer = setTimeout(() => {
      if (status === 'recording' && !finalizing && !paused) {
        try { rec.stop() } catch (e) {}
      }
    }, MAX_MS + 800)
  }

  const onChunkEnd = file => {
    clearTimer()
    if (file) {
      // 录音 temp 文件可能很快被清理，立刻上传保存，后续识别用保存后的 fileID
      const item = { fileID: '', steep, saved: saveAudio(file) }
      item.saved.then(id => {
        item.fileID = id || ''
      })
      chunks.push(item)
    }
    if (pendingCut) {
      steep++
      pendingCut = false
    }
    if (finalizing) {
      finalizing = false
      finish()
    } else if (paused) {
      setStatus('idle')
    } else if (status === 'recording') {
      // 一段到 MAX_MS：无缝接续下一段，界面始终是“正在录音”
      setTimeout(startChunk, 100)
    }
  }

  function initRec() {
    if (rec) return
    rec = wx.getRecorderManager()
    rec.onStop = res => onChunkEnd(res && res.tempFilePath)
    rec.onError = res => {
      clearTimer()
      if (finalizing) {
        finalizing = false
        finish()
      } else if (status === 'recording' && !paused) {
        setTimeout(startChunk, 300)
      } else {
        setStatus('idle')
        chunks = []
        h.onError && h.onError((res && res.errMsg) || '录音失败')
      }
    }
  }

  function start() {
    if (status !== 'idle') return
    initRec()
    chunks = []
    steep = 0
    pendingCut = false
    finalizing = false
    paused = false
    setStatus('recording')
    startChunk()
  }

  // 切到下一泡：当前段归当前泡，后续录音归下一泡
  function cut() {
    if (status !== 'recording') {
      steep++
      pendingCut = false
      return
    }
    pendingCut = true
    clearTimer()
    try { rec.stop() } catch (e) {}
  }

  // 暂停（如切后台）：只停当前段，不转写，回来可 resume 继续录
  function pause() {
    if (status !== 'recording') return
    paused = true
    clearTimer()
    try { rec.stop() } catch (e) {}
    setTimeout(() => {
      if (status === 'recording' && paused) setStatus('idle')
    }, 800)
  }

  function resume() {
    if (status !== 'idle') return
    initRec()
    paused = false
    setStatus('recording')
    startChunk()
  }

  // 结束：停当前段并把所有泡的片段一起转写
  function stop() {
    clearTimer()
    if (status === 'recording') {
      finalizing = true
      paused = false
      try { rec.stop() } catch (e) {}
      finalizeTimer = setTimeout(() => {
        if (finalizing) {
          finalizing = false
          finish()
        }
      }, 3000)
    } else if (chunks.length) {
      finish()
    } else {
      setStatus('idle')
      h.onText && h.onText([])
    }
  }

  function destroy() {
    clearTimer()
    clearFinalize()
    finalizing = false
    paused = false
    pendingCut = false
    chunks = []
    if (rec) {
      try { rec.stop() } catch (e) {}
    }
    status = 'idle'
  }

  return {
    start,
    cut,
    pause,
    resume,
    stop,
    destroy,
    hasAudio: () => chunks.length > 0,
    isIdle: () => status === 'idle',
    isRecording: () => status === 'recording'
  }
}

// 把已保存的片段按泡分组：[{ fileID, steep }] → [[fileID, ...], [fileID, ...]]
function groupChunks(chunks) {
  const out = []
  chunks.forEach(c => {
    while (out.length <= c.steep) out.push([])
    if (c.fileID) out[c.steep].push(c.fileID)
  })
  return out
}

// 一泡的多个已保存 fileID → 识别并返回 { text, fileIDs }
async function transcribeGroup(fileIDs) {
  const texts = []
  const out = []
  for (const id of fileIDs || []) {
    const text = await recognize(id)
    texts.push(text || '')
    if (id) out.push(id)
  }
  return { text: texts.join('').trim(), fileIDs: out }
}

// 多泡转写，返回 [{ text, fileIDs }]（每泡一个）；onProgress(done, total) 用于报进度
async function transcribeGroups(groups, onProgress) {
  const out = []
  const total = (groups || []).length
  for (let i = 0; i < total; i++) {
    out.push(await transcribeGroup(groups[i]))
    onProgress && onProgress(i + 1, total)
  }
  return out
}

// 保存录音：云端上传到 voices/，本地模式存到用户目录；返回可回放的 fileID / 本地路径
async function saveAudio(filePath) {
  if (!filePath) return ''
  try {
    const up = await cloudApi().uploadFile({
      cloudPath: 'voices/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.mp3',
      filePath
    })
    return up.fileID
  } catch (e) {
    console.warn('[voice] 保存录音失败：', e)
    return ''
  }
}

// 录音 fileID → 文字。USE_CLOUD 且已部署云函数 asr 时可用，否则返回空字符串。
async function recognize(fileID) {
  if (!USE_CLOUD || !fileID) return ''
  try {
    const res = await wx.cloud.callFunction({ name: 'asr', data: { fileID } })
    const r = res && res.result
    return r && r.text ? String(r.text).trim() : ''
  } catch (e) {
    console.warn('[voice] 转写失败（未部署云函数 asr / 未配 ASR 密钥 / 网络），将手动补写：', e)
    return ''
  }
}

// 录音文件 → 保存并转写，返回 { text, fileID }（保留 fileID 供回放）
async function transcribe(filePath) {
  const fileID = await saveAudio(filePath)
  const text = await recognize(fileID)
  return { text, fileID }
}

/* ---------------- 文本抽取与整理 ---------------- */

const ALL_TAGS = []
F.WHEEL.forEach(c => c.subs.forEach(s => s.tags.forEach(t => {
  if (ALL_TAGS.indexOf(t) < 0) ALL_TAGS.push(t)
})))
const ALL_TASTES = []
F.TASTES.forEach(g => g.tags.forEach(t => {
  if (ALL_TASTES.indexOf(t) < 0) ALL_TASTES.push(t)
}))
const ALL_LIQUORS = F.LIQUORS.map(l => l.name)
const ALL_CLARITY = F.CLARITY.slice()
const ALL_LEAF = F.LEAF.slice()

// 从一段文字里找出出现的香气词 / 滋味词 / 汤色词 / 清亮度词 / 叶底词
function scan(text) {
  const t = String(text || '').replace(/\s+/g, '')
  return {
    tags: ALL_TAGS.filter(w => t.indexOf(w) >= 0),
    tastes: ALL_TASTES.filter(w => t.indexOf(w) >= 0),
    liquor: ALL_LIQUORS.filter(w => t.indexOf(w) >= 0),
    clarity: ALL_CLARITY.filter(w => t.indexOf(w) >= 0),
    leaf: ALL_LEAF.filter(w => t.indexOf(w) >= 0)
  }
}

// 把多人的评论整理成一段整体评论（按说话人逐条列出，可再编辑）
function buildOverall(voices) {
  const list = (voices || [])
    .map(v => ({ speaker: (v && v.speaker) || '茶友', text: ((v && v.text) || '').trim() }))
    .filter(v => v.text)
    .filter((v, i, arr) => arr.findIndex(x => x.text === v.text) === i)
  if (!list.length) return ''
  return list.map(v => v.speaker + '：' + v.text).join('\n')
}

// 补全提醒：结合语音文本与已填的结构化记录，返回还没谈到的方面
// [{ key, name }]，key 对应汇总页的各个区块
function detectMissing(brew, voices) {
  const b = brew || {}
  const vs = voices || []
  const text = vs.map(v => v.text || '').join('')
  const acc = { tags: [], tastes: [], liquor: [], clarity: [], leaf: [] }
  vs.forEach(v => {
    const s = scan(v.text)
    Object.keys(acc).forEach(k => (acc[k] = acc[k].concat(s[k])))
  })
  const steeps = b.steeps || []
  const review = b.review || {}
  const scores = review.scores || {}

  const aroma = (b.tags || []).length > 0 || acc.tags.length > 0 || /香/.test(text)
  const taste = steeps.some(s => (s.tastes || []).length) || acc.tastes.length > 0 ||
    !!scores.sweet || !!scores.umami || !!scores.body || !!scores.bitter || !!scores.astringent ||
    /味|口感|甜|苦|涩|醇|滑|鲜/.test(text)
  const liquor = !!review.liquor || acc.liquor.length > 0 || /汤色|汤|金黄|红|黄绿|明亮|橙/.test(text)
  const aftertaste = !!scores.huigan || !!scores.shengjin || !!scores.houyun || /回甘|生津|喉韵|余韵|韵味/.test(text)
  const leaf = (review.leaf || []).length > 0 || acc.leaf.length > 0 || /叶底/.test(text)
  const rating = (b.rating || 0) > 0

  return [
    { key: 'aroma', name: '香气', done: aroma },
    { key: 'taste', name: '滋味', done: taste },
    { key: 'liquor', name: '汤色', done: liquor },
    { key: 'aftertaste', name: '回甘与韵味', done: aftertaste },
    { key: 'leaf', name: '叶底', done: leaf },
    { key: 'rating', name: '评分', done: rating }
  ].filter(d => !d.done).map(d => ({ key: d.key, name: d.name }))
}

module.exports = { createRecorder, transcribe, scan, buildOverall, detectMissing }
