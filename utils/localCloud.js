// 原型阶段的本地后端：用本地存储模拟云数据库、用本地文件模拟云存储。
// 只实现 utils/db.js 用到的那部分接口，形状与 wx.cloud 一致，切回云端只需改 config/env.js 的 USE_CLOUD。
//   database().collection(name)
//     .where({ k: v }) .orderBy(k, dir) .field({ k: true }) .skip(n) .limit(n) .get()
//     .doc(id).get() / .update({ data }) / .remove()
//     .add({ data })
//   database().command.remove()
//   uploadFile({ cloudPath, filePath }) / deleteFile({ fileList })
// 日期（Date）一律存成毫秒时间戳；db.js 读回时本来就会转成毫秒。

const PREFIX = 'localdb_'
const REMOVE = { __localRemove: true }

const load = name => {
  try {
    return wx.getStorageSync(PREFIX + name) || []
  } catch (e) {
    return []
  }
}
const save = (name, rows) => wx.setStorageSync(PREFIX + name, rows)

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

// Date → 毫秒，其余原样（深拷贝）
function plain(v) {
  if (v instanceof Date) return +v
  if (Array.isArray(v)) return v.map(plain)
  if (v && typeof v === 'object') {
    const out = {}
    Object.keys(v).forEach(k => (out[k] = plain(v[k])))
    return out
  }
  return v
}

function compare(a, b) {
  if (a === b) return 0
  if (a == null) return -1
  if (b == null) return 1
  return a < b ? -1 : 1
}

class Query {
  constructor(name, opts) {
    this.name = name
    this.opts = Object.assign({ where: null, order: [], fields: null, skip: 0, limit: 20 }, opts)
  }
  next(patch) {
    return new Query(this.name, Object.assign({}, this.opts, patch))
  }
  where(cond) {
    return this.next({ where: cond })
  }
  orderBy(key, dir) {
    return this.next({ order: this.opts.order.concat([[key, dir === 'desc' ? -1 : 1]]) })
  }
  field(fields) {
    return this.next({ fields })
  }
  skip(n) {
    return this.next({ skip: n })
  }
  limit(n) {
    return this.next({ limit: n })
  }
  async get() {
    const o = this.opts
    let rows = load(this.name)
    if (o.where) rows = rows.filter(r => Object.keys(o.where).every(k => r[k] === o.where[k]))
    if (o.order.length) {
      rows = rows.slice().sort((a, b) => {
        for (const [k, d] of o.order) {
          const c = compare(a[k], b[k])
          if (c) return c * d
        }
        return 0
      })
    }
    rows = rows.slice(o.skip, o.skip + o.limit)
    if (o.fields) {
      rows = rows.map(r => {
        const out = { _id: r._id }
        Object.keys(o.fields).forEach(k => o.fields[k] && k in r && (out[k] = r[k]))
        return out
      })
    }
    return { data: plain(rows) }
  }
}

class Collection extends Query {
  constructor(name) {
    super(name)
  }
  async add({ data }) {
    const _id = newId()
    save(this.name, load(this.name).concat([Object.assign(plain(data), { _id })]))
    return { _id }
  }
  doc(id) {
    const name = this.name
    const find = () => load(name).find(r => r._id === id)
    return {
      async get() {
        const r = find()
        if (!r) throw new Error('document.get:fail document not exists')
        return { data: plain(r) }
      },
      async update({ data }) {
        if (!find()) throw new Error('document.update:fail document not exists')
        save(
          name,
          load(name).map(r => {
            if (r._id !== id) return r
            const next = Object.assign({}, r)
            Object.keys(data).forEach(k => {
              if (data[k] && data[k].__localRemove) delete next[k]
              else next[k] = plain(data[k])
            })
            return next
          })
        )
        return { stats: { updated: 1 } }
      },
      async remove() {
        save(name, load(name).filter(r => r._id !== id))
        return { stats: { removed: 1 } }
      }
    }
  }
}

function database() {
  return {
    collection: name => new Collection(name),
    command: { remove: () => REMOVE }
  }
}

/* ---------------- 文件：存到小程序本地用户目录 ---------------- */

const fs = () => wx.getFileSystemManager()

function uploadFile({ cloudPath, filePath }) {
  const name = cloudPath.replace(/\//g, '-')
  return new Promise((resolve, reject) => {
    fs().saveFile({
      tempFilePath: filePath,
      filePath: wx.env.USER_DATA_PATH + '/' + name,
      success: r => resolve({ fileID: r.savedFilePath }),
      fail: reject
    })
  })
}

function deleteFile({ fileList }) {
  fileList.forEach(p => {
    try {
      fs().unlinkSync(p)
    } catch (e) {}
  })
  return Promise.resolve({ fileList: fileList.map(fileID => ({ fileID, status: 0 })) })
}

// 是否已是本地保存过的照片（不需再“上传”）
const isLocalFile = p => typeof p === 'string' && p.indexOf(wx.env.USER_DATA_PATH + '/') === 0

module.exports = { database, uploadFile, deleteFile, isLocalFile }
