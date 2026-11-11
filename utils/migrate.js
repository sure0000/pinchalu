// 一次性搬家：原型阶段本地模式（utils/localCloud.js）存在本机的茶器、茶、自定义描述词、冲泡记录，切到云端后首次启动写进云数据库。
// 演示数据（_id 以 mock_ 开头）也照搬。逐条写，每写成一条就记下“本地 _id → 云端 _id”，中途断网下次打开接着搬，不会重复。
// 照片是本机用户目录里的文件，上传云存储换成 fileID，文件已不在的略过；冲泡记录的 teaId / wareIds 换成云端 _id；
// 茶的 lastBrewedAt / lastRating 按本机冲泡记录重算（演示数据写入时没有算）。
// 全部搬完后删掉本地库，清掉含本地 _id 的缓存，待同步队列、进行中冲泡、器柜茶器偏好里的 _id 一并换掉。照片原文件留在本机不删。
const db = require('./db')

const SRC = 'localdb_'
const MAP = 'migrateMap'
const ORDER = ['wares', 'teas', 'tags', 'brews'] // 先茶器和茶，冲泡记录才换得了 _id
const K = db.KEYS

const get = (key, def) => {
  try {
    const v = wx.getStorageSync(key)
    return v === '' || v == null ? def : v
  } catch (e) {
    return def
  }
}
const set = (key, val) => {
  try {
    wx.setStorageSync(key, val)
  } catch (e) {}
}
const remove = key => {
  try {
    wx.removeStorageSync(key)
  } catch (e) {}
}

const needed = () => ORDER.some(name => get(SRC + name, []).length)

function fileExists(p) {
  try {
    wx.getFileSystemManager().accessSync(p)
    return true
  } catch (e) {
    return false
  }
}

// 每款茶最近一场冲泡
function latestByTea(brews) {
  const out = {}
  brews.forEach(b => {
    if (b.teaId && (!out[b.teaId] || b.startedAt > out[b.teaId].startedAt)) out[b.teaId] = b
  })
  return out
}

// 本地记录 → 云端文档（照片另传）
function toDoc(name, r, map, latest) {
  if (name === 'tags') return { group: r.group, name: r.name, createdAt: new Date(r.createdAt || Date.now()) }
  const doc = Object.assign({}, r)
  if (name === 'teas') {
    const last = latest[r._id]
    delete doc.lastBrewedAt
    delete doc.lastRating
    if (last) doc.lastBrewedAt = last.startedAt
    if (last && last.rating) doc.lastRating = last.rating
  }
  if (name === 'brews') {
    if (doc.teaId) doc.teaId = map[doc.teaId] || doc.teaId
    if (doc.wareIds) doc.wareIds = doc.wareIds.map(id => map[id] || id)
  }
  return db.toCloud(doc, db.DATES[name])
}

// 搬完后把本机其余地方存着的本地 _id 换成云端 _id，清掉旧缓存和本地库
function finish(map) {
  const id = x => (x && map[x]) || x
  const ids = list => (list || []).map(id)
  set(
    K.queue,
    get(K.queue, []).map(b => Object.assign({}, b, { teaId: id(b.teaId), wareIds: ids(b.wareIds) }))
  )
  const active = db.loadActive()
  if (active) db.saveActive(Object.assign({}, active, { teaId: id(active.teaId), wareIds: ids(active.wareIds) }))
  const prefs = get('brewPrefs', null) // 计时页的器柜茶器偏好 { myWare: { 茶类: [茶器 _id] } }
  if (prefs && prefs.myWare) {
    Object.keys(prefs.myWare).forEach(c => (prefs.myWare[c] = ids(prefs.myWare[c])))
    set('brewPrefs', prefs)
  }
  let keys = []
  try {
    keys = wx.getStorageInfoSync().keys
  } catch (e) {}
  keys.filter(k => k.indexOf(K.brews) === 0 || k.indexOf(SRC) === 0).forEach(remove)
  ;[K.teas, K.wares, K.tags, K.recent, K.recentAt, 'mockSeeded', MAP].forEach(remove)
}

// 返回 true 表示全部搬完；失败（多半是断网）返回 false，已搬的记在本机，下次接着搬
async function run() {
  const map = get(MAP, {})
  const latest = latestByTea(get(SRC + 'brews', []))
  try {
    for (const name of ORDER) {
      for (const r of get(SRC + name, [])) {
        if (map[r._id]) continue
        const doc = toDoc(name, r, map, latest)
        if (doc.photos && doc.photos.length) {
          const kept = doc.photos.filter(p => p.indexOf('cloud://') === 0 || fileExists(p))
          const up = await db.uploadPhotos(kept)
          doc.photos = up.photos
          doc.photoThumbs = up.thumbs
        }
        const res = await db.collection(name).add({ data: doc })
        map[r._id] = res._id
        set(MAP, map)
      }
    }
  } catch (e) {
    console.error('migrate', e)
    return false
  }
  finish(map)
  return true
}

module.exports = { needed, run }
