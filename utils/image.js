// 图片处理与本地缓存：
// 1) 上传前压缩：每张照片生成“大图”和“小图（缩略图）”两版，封面 / 列表用小图，详情 / 预览用大图。
// 2) 云端图片下载一次后存到本地用户目录，之后优先读本地文件，不再重复下载。
const { USE_CLOUD } = require('../config/env')

const THUMB_W = 240 // 小图（缩略图）宽，等比缩放
const LARGE_W = 1080 // 大图宽，超过才缩小
const THUMB_Q = 80
const LARGE_Q = 82
const CACHE_KEY = 'imgCache' // { fileID: 本地路径 }

const fs = () => wx.getFileSystemManager()

function cacheMap() {
  try {
    return wx.getStorageSync(CACHE_KEY) || {}
  } catch (e) {
    return {}
  }
}
function saveCache(map) {
  try {
    wx.setStorageSync(CACHE_KEY, map)
  } catch (e) {}
}

// 等比压缩到指定宽度（只缩小、不放大），返回临时文件路径；任何失败都退回原图，不阻断保存。
function resize(src, maxWidth, quality) {
  return new Promise(resolve => {
    wx.getImageInfo({
      src,
      success: info => {
        const params = { src, quality }
        if (maxWidth && info.width > maxWidth) params.compressedWidth = maxWidth
        wx.compressImage(
          Object.assign(params, {
            success: r => resolve(r.tempFilePath),
            fail: () => resolve(src)
          })
        )
      },
      fail: () => resolve(src)
    })
  })
}

const thumb = src => resize(src, THUMB_W, THUMB_Q)
const large = src => resize(src, LARGE_W, LARGE_Q)

const isCloud = p => typeof p === 'string' && p.indexOf('cloud://') === 0

// 取可直接显示的本地路径：本地路径原样返回；云端 fileID 先查缓存，没有再下载并落盘，下次直接用。
async function localSrc(src) {
  if (!src || !isCloud(src)) return src
  const map = cacheMap()
  const hit = map[src]
  if (hit) {
    try {
      fs().accessSync(hit)
      return hit
    } catch (e) {}
  }

  // fileID 做短哈希，稳定命名 + 保留扩展名
  let seed = 0
  for (let i = 0; i < src.length; i++) seed = (seed * 31 + src.charCodeAt(i)) >>> 0
  const ext = (src.match(/\.\w+$/) || [''])[0]
  const dest = wx.env.USER_DATA_PATH + '/img-' + seed.toString(36) + ext

  try {
    fs().accessSync(dest)
    map[src] = dest
    saveCache(map)
    return dest
  } catch (e) {}

  try {
    const r = await wx.cloud.downloadFile({ fileID: src })
    await new Promise((resolve, reject) => {
      fs().copyFile({ srcPath: r.tempFilePath, destPath: dest, success: resolve, fail: reject })
    })
    map[src] = dest
    saveCache(map)
    return dest
  } catch (e) {
    return src // 下载 / 落盘失败就退回 fileID，交给 <image> 直接加载
  }
}

module.exports = { thumb, large, localSrc, THUMB_W, LARGE_W, THUMB_Q, LARGE_Q }
