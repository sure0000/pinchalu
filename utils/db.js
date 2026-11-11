// 数据层：云数据库读写 + 本地缓存 + 离线待同步队列。
// 云数据库四个集合：teas / wares / brews / tags，权限均为“仅创建者可读写”，前端直连。
// 茶的照片存云存储：tea-photos/ 大图、tea-photos-thumbs/ 小图；teas.photos 存大图 fileID、teas.photoThumbs 存对应小图（第一张为封面）。
// 内存里的时间一律是毫秒时间戳；写云端时转 Date，读回来再转毫秒。
// config/env.js 的 USE_CLOUD 为 false 时，云数据库 / 云存储换成本地模拟（utils/localCloud.js），其余逻辑不变。
const { USE_CLOUD } = require('../config/env')
const localCloud = require('./localCloud')
const image = require('./image')
const cloud = () => (USE_CLOUD ? wx.cloud : localCloud)

const K = {
  teas: 'teasCache',
  wares: 'waresCache',
  tags: 'customTagsCache',
  tagQueue: 'pendingTags',
  queue: 'pendingBrews',
  active: 'activeBrew',
  brews: 'brewsCache_',
  recent: 'recentBrewsCache',
  recentAt: 'recentBrewsAt'
}
const PAGE = 20 // 小程序端单次 get 最多 20 条
const TEA_DATES = ['lastBrewedAt', 'acquiredAt', 'createdAt', 'updatedAt']
const WARE_DATES = ['acquiredAt', 'createdAt', 'updatedAt']
const BREW_DATES = ['startedAt', 'endedAt', 'createdAt', 'updatedAt']

const local = {
  get(key, def) {
    try {
      const v = wx.getStorageSync(key)
      return v === '' || v == null ? def : v
    } catch (e) {
      return def
    }
  },
  set(key, val) {
    try {
      wx.setStorageSync(key, val)
    } catch (e) {}
  },
  remove(key) {
    try {
      wx.removeStorageSync(key)
    } catch (e) {}
  }
}

let _db
function db() {
  if (!_db) _db = cloud().database()
  return _db
}

const ms = v => (v ? +new Date(v) : 0)
const isLocalId = id => typeof id === 'string' && id.indexOf('local_') === 0

function normTea(t) {
  return Object.assign({}, t, {
    photos: t.photos || [],
    photoThumbs: t.photoThumbs || [],
    shelves: t.shelves || [],
    lastBrewedAt: ms(t.lastBrewedAt),
    acquiredAt: ms(t.acquiredAt),
    createdAt: ms(t.createdAt),
    updatedAt: ms(t.updatedAt)
  })
}

function normBrew(b) {
  return Object.assign({}, b, {
    voices: (b.voices || []).map(v => Object.assign({ fileIDs: [] }, v)),
    startedAt: ms(b.startedAt),
    endedAt: ms(b.endedAt),
    createdAt: ms(b.createdAt),
    updatedAt: ms(b.updatedAt)
  })
}

// 内存对象 → 云端文档：去掉 _id/_openid 与 undefined，日期字段转 Date
function toCloud(obj, dateKeys) {
  const base = JSON.parse(JSON.stringify(obj))
  const out = {}
  Object.keys(base).forEach(k => {
    if (k === '_id' || k === '_openid') return
    out[k] = dateKeys.indexOf(k) >= 0 && base[k] ? new Date(base[k]) : base[k]
  })
  return out
}

// 分页取全部（单次最多 20 条）。buildQuery 每次返回新的查询。
async function fetchAll(buildQuery) {
  const out = []
  for (let skip = 0; ; skip += PAGE) {
    const res = await buildQuery().skip(skip).limit(PAGE).get()
    out.push(...res.data)
    if (res.data.length < PAGE) break
  }
  return out
}

/* ---------------- 茶 ---------------- */

function sortTeas(teas) {
  return teas.slice().sort((a, b) => (b.lastBrewedAt || 0) - (a.lastBrewedAt || 0) || (b.createdAt || 0) - (a.createdAt || 0))
}

function cachedTeas() {
  return local.get(K.teas, [])
}

function patchTeaCache(id, patch) {
  local.set(K.teas, sortTeas(cachedTeas().map(t => (t._id === id ? Object.assign({}, t, patch) : t))))
}

async function listTeas() {
  const rows = await fetchAll(() => db().collection('teas').orderBy('createdAt', 'desc').orderBy('_id', 'desc'))
  const teas = sortTeas(rows.map(normTea))
  local.set(K.teas, teas)
  return teas
}

async function getTea(id) {
  try {
    const r = await db().collection('teas').doc(id).get()
    return normTea(r.data)
  } catch (e) {
    return cachedTeas().find(t => t._id === id) || null
  }
}

async function createTea(data) {
  const now = Date.now()
  const doc = toCloud(Object.assign({}, data, { createdAt: now, updatedAt: now }), TEA_DATES)
  const r = await db().collection('teas').add({ data: doc })
  const tea = normTea(Object.assign({ _id: r._id }, doc))
  local.set(K.teas, sortTeas([tea].concat(cachedTeas())))
  return tea
}

async function updateTea(id, patch) {
  const full = Object.assign({}, patch, { updatedAt: Date.now() })
  await db().collection('teas').doc(id).update({ data: toCloud(full, TEA_DATES) })
  patchTeaCache(id, full)
}

async function deleteTea(id, photos, thumbs) {
  // 冲泡记录不级联删除，teaId 保留；大图和小图一并删除
  await db().collection('teas').doc(id).remove()
  local.set(K.teas, cachedTeas().filter(t => t._id !== id))
  deletePhotos((photos || []).concat(thumbs || []))
}

/* ---------------- 茶器（器柜） ---------------- */

function normWare(w) {
  return Object.assign({}, w, {
    photos: w.photos || [],
    photoThumbs: w.photoThumbs || [],
    forClasses: w.forClasses || [],
    acquiredAt: ms(w.acquiredAt),
    createdAt: ms(w.createdAt),
    updatedAt: ms(w.updatedAt)
  })
}

const sortWares = list => list.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

function cachedWares() {
  return local.get(K.wares, [])
}

async function listWares() {
  const rows = await fetchAll(() => db().collection('wares').orderBy('createdAt', 'desc').orderBy('_id', 'desc'))
  const wares = sortWares(rows.map(normWare))
  local.set(K.wares, wares)
  return wares
}

async function getWare(id) {
  try {
    const r = await db().collection('wares').doc(id).get()
    return normWare(r.data)
  } catch (e) {
    return cachedWares().find(w => w._id === id) || null
  }
}

async function createWare(data) {
  const now = Date.now()
  const doc = toCloud(Object.assign({}, data, { createdAt: now, updatedAt: now }), WARE_DATES)
  const r = await db().collection('wares').add({ data: doc })
  const ware = normWare(Object.assign({ _id: r._id }, doc))
  local.set(K.wares, sortWares([ware].concat(cachedWares())))
  return ware
}

async function updateWare(id, patch) {
  const full = Object.assign({}, patch, { updatedAt: Date.now() })
  await db().collection('wares').doc(id).update({ data: toCloud(full, WARE_DATES) })
  local.set(K.wares, cachedWares().map(w => (w._id === id ? Object.assign({}, w, full) : w)))
}

async function deleteWare(id, photos, thumbs) {
  // 冲泡记录里的 wareIds 保留，显示时找不到就略过
  await db().collection('wares').doc(id).remove()
  local.set(K.wares, cachedWares().filter(w => w._id !== id))
  deletePhotos((photos || []).concat(thumbs || []))
}

/* ---------------- 茶的照片（云存储） ---------------- */

// 已上传（云端 fileID / 本地模式下已保存的文件）
const isCloudFile = p => typeof p === 'string' && (p.indexOf('cloud://') === 0 || (!USE_CLOUD && localCloud.isLocalFile(p)))

// 上传一张到云存储，返回 fileID
async function uploadOne(filePath, dir) {
  const ext = (filePath.match(/\.\w+$/) || ['.jpg'])[0]
  const cloudPath = dir + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext
  const r = await cloud().uploadFile({ cloudPath, filePath })
  return r.fileID
}

// 上传照片：每张生成大图（photos）与小图（thumbs）两版，返回 { photos, thumbs }。任一张失败即抛错。
// 已是 fileID 的原样返回；thumbMap 为 { 大图fileID: 小图fileID }，编辑时用来给旧图补上原小图。
async function uploadPhotos(paths, thumbMap) {
  const photos = []
  const thumbs = []
  const map = thumbMap || {}
  for (const p of paths) {
    if (isCloudFile(p)) {
      photos.push(p)
      thumbs.push(map[p] || p)
      continue
    }
    const largePath = await image.large(p)
    const thumbPath = await image.thumb(p)
    const big = await uploadOne(largePath, 'tea-photos')
    const small = await uploadOne(thumbPath, 'tea-photos-thumbs')
    photos.push(big)
    thumbs.push(small)
  }
  return { photos, thumbs }
}

// 封面：优先用缩略图，旧数据没有缩略图时退回大图
function coverOf(x) {
  const thumbs = x.photoThumbs || []
  const photos = x.photos || []
  return (thumbs.length ? thumbs : photos)[0] || ''
}

// 尽力删除，失败不影响主流程（去重，避免大图小图指向同一文件时重复删）
function deletePhotos(fileIDs) {
  const list = Array.from(new Set((fileIDs || []).filter(isCloudFile)))
  if (list.length) cloud().deleteFile({ fileList: list }).catch(() => {})
}

// 取图片可编辑的本地路径：云端 fileID 先下载成临时文件，本地路径原样返回
async function downloadPhoto(p) {
  if (USE_CLOUD && typeof p === 'string' && p.indexOf('cloud://') === 0) {
    const r = await cloud().downloadFile({ fileID: p })
    return r.tempFilePath
  }
  return p
}

// 按该茶最新一条冲泡重算冗余字段 lastBrewedAt / lastRating，供首页排序和卡片展示
async function refreshTeaStats(teaId) {
  if (!teaId) return
  try {
    const r = await db().collection('brews').where({ teaId }).orderBy('startedAt', 'desc').limit(1).get()
    const last = r.data[0]
    const _ = db().command
    await db()
      .collection('teas')
      .doc(teaId)
      .update({
        data: {
          lastBrewedAt: last ? last.startedAt : _.remove(),
          lastRating: last && last.rating ? last.rating : _.remove()
        }
      })
    patchTeaCache(teaId, { lastBrewedAt: last ? ms(last.startedAt) : 0, lastRating: last && last.rating ? last.rating : 0 })
  } catch (e) {}
}

/* ---------------- 冲泡记录 ---------------- */

const pendingBrews = () => local.get(K.queue, [])
// 冲泡有增删改时作废“最近冲泡”缓存，首页下次进入会重新拉取
const touchRecent = () => local.remove(K.recentAt)
const pendingCount = () => pendingBrews().length + local.get(K.tagQueue, []).length

function sortBrews(list) {
  return list.slice().sort((a, b) => b.startedAt - a.startedAt)
}

async function listBrews(teaId) {
  const key = K.brews + teaId
  let synced
  try {
    const rows = await fetchAll(() => db().collection('brews').where({ teaId }).orderBy('startedAt', 'desc').orderBy('_id', 'desc'))
    synced = rows.map(normBrew)
    local.set(key, synced)
  } catch (e) {
    synced = local.get(key, [])
  }
  const pend = pendingBrews()
    .filter(b => b.teaId === teaId)
    .map(b => Object.assign({}, b, { unsynced: true }))
  return sortBrews(synced.concat(pend))
}

async function getBrew(id) {
  if (isLocalId(id)) {
    const b = pendingBrews().find(x => x._id === id)
    return b ? Object.assign({}, b, { unsynced: true }) : null
  }
  const r = await db().collection('brews').doc(id).get()
  return normBrew(r.data)
}

// 保存一场冲泡。云端写失败（断网）时进入本地待同步队列，永不抛错。
async function saveBrew(brew) {
  const now = Date.now()
  const data = Object.assign({}, brew, { createdAt: now, updatedAt: now })
  delete data._id
  let r
  try {
    r = await db().collection('brews').add({ data: toCloud(data, BREW_DATES) })
  } catch (e) {
    const id = 'local_' + now + '_' + Math.floor(Math.random() * 10000)
    local.set(K.queue, pendingBrews().concat([Object.assign({ _id: id }, data)]))
    return { id, synced: false }
  }
  touchRecent()
  await refreshTeaStats(data.teaId)
  return { id: r._id, synced: true }
}

// 编辑已保存的记录。云端记录离线时会抛错，由调用方提示。
async function updateBrew(id, patch, oldTeaId) {
  if (isLocalId(id)) {
    local.set(
      K.queue,
      pendingBrews().map(b => (b._id === id ? Object.assign({}, b, patch, { updatedAt: Date.now() }) : b))
    )
    return
  }
  const full = Object.assign({}, patch, { updatedAt: Date.now() })
  await db().collection('brews').doc(id).update({ data: toCloud(full, BREW_DATES) })
  touchRecent()
  const ids = [oldTeaId, patch.teaId].filter((x, i, arr) => x && arr.indexOf(x) === i)
  for (const teaId of ids) await refreshTeaStats(teaId)
}

async function deleteBrew(id, teaId, fileIDs) {
  if (isLocalId(id)) {
    local.set(K.queue, pendingBrews().filter(b => b._id !== id))
    deletePhotos(fileIDs) // 一并删除录音文件（尽力而为，失败不影响）
    return
  }
  await db().collection('brews').doc(id).remove()
  touchRecent()
  deletePhotos(fileIDs) // 一并删除录音文件（尽力而为，失败不影响）
  await refreshTeaStats(teaId)
}

let flushing = false
// 重试待同步的冲泡与自定义标签，返回本次同步成功的冲泡条数
async function flushQueue() {
  if (flushing) return 0
  flushing = true
  let n = 0
  try {
    await flushTags()
    for (const item of pendingBrews()) {
      try {
        await db().collection('brews').add({ data: toCloud(item, BREW_DATES) })
      } catch (e) {
        break
      }
      local.set(K.queue, pendingBrews().filter(b => b._id !== item._id))
      touchRecent()
      n++
      await refreshTeaStats(item.teaId)
    }
  } catch (e) {
  } finally {
    flushing = false
  }
  return n
}

/* ---------------- 最近冲泡（首页推荐用） ---------------- */

const RECENT_MAX = 100 // 最多取最近 100 场，够看出时段习惯
const RECENT_TTL = 10 * 60 * 1000 // 无增删改时 10 分钟内不重复拉取
const RECENT_FIELDS = { teaId: true, category: true, startedAt: true, rating: true, wareIds: true }

const slimBrew = b => ({ teaId: b.teaId, category: b.category, startedAt: ms(b.startedAt), rating: b.rating || 0, wareIds: b.wareIds || [] })

// 已同步的走本地缓存，再合并待同步队列
function cachedRecentBrews() {
  return local.get(K.recent, []).concat(pendingBrews().map(slimBrew))
}

async function listRecentBrews() {
  if (Date.now() - local.get(K.recentAt, 0) > RECENT_TTL) {
    try {
      const rows = []
      for (let skip = 0; skip < RECENT_MAX; skip += PAGE) {
        const res = await db().collection('brews').orderBy('startedAt', 'desc').field(RECENT_FIELDS).skip(skip).limit(PAGE).get()
        rows.push(...res.data)
        if (res.data.length < PAGE) break
      }
      local.set(K.recent, rows.map(slimBrew))
      local.set(K.recentAt, Date.now())
    } catch (e) {}
  }
  return cachedRecentBrews()
}

/* ---------------- 自定义标签 ---------------- */

function mergeTags(a, b) {
  const out = []
  a.concat(b).forEach(t => {
    if (!out.some(x => x.group === t.group && x.name === t.name)) out.push({ group: t.group, name: t.name })
  })
  return out
}

function cachedCustomTags() {
  return mergeTags(local.get(K.tags, []), local.get(K.tagQueue, []))
}

async function listCustomTags() {
  try {
    const rows = await fetchAll(() => db().collection('tags').orderBy('_id', 'asc'))
    local.set(K.tags, rows.map(t => ({ group: t.group, name: t.name })))
  } catch (e) {}
  return cachedCustomTags()
}

async function addCustomTag(group, name) {
  if (!cachedCustomTags().some(t => t.group === group && t.name === name)) {
    try {
      await db().collection('tags').add({ data: { group, name, createdAt: new Date() } })
      local.set(K.tags, local.get(K.tags, []).concat([{ group, name }]))
    } catch (e) {
      local.set(K.tagQueue, local.get(K.tagQueue, []).concat([{ group, name }]))
    }
  }
  return cachedCustomTags()
}

async function flushTags() {
  for (const t of local.get(K.tagQueue, [])) {
    try {
      await db().collection('tags').add({ data: { group: t.group, name: t.name, createdAt: new Date() } })
    } catch (e) {
      return
    }
    local.set(K.tagQueue, local.get(K.tagQueue, []).filter(x => !(x.group === t.group && x.name === t.name)))
    local.set(K.tags, local.get(K.tags, []).concat([t]))
  }
}

/* ---------------- 进行中的冲泡（仅本地） ---------------- */

const loadActive = () => local.get(K.active, null)
const saveActive = a => local.set(K.active, a)
const clearActive = () => local.remove(K.active)

module.exports = {
  // 给 utils/migrate.js（本地模式数据搬上云）用
  KEYS: K,
  DATES: { teas: TEA_DATES, wares: WARE_DATES, brews: BREW_DATES },
  toCloud,
  collection: name => db().collection(name),
  cachedTeas,
  listTeas,
  cachedWares,
  listWares,
  getWare,
  createWare,
  updateWare,
  deleteWare,
  getTea,
  createTea,
  updateTea,
  deleteTea,
  uploadPhotos,
  coverOf,
  deletePhotos,
  downloadPhoto,
  listBrews,
  getBrew,
  saveBrew,
  updateBrew,
  deleteBrew,
  flushQueue,
  pendingCount,
  cachedRecentBrews,
  listRecentBrews,
  cachedCustomTags,
  listCustomTags,
  addCustomTag,
  loadActive,
  saveActive,
  clearActive
}
