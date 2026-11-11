// 茶柜里的一只茶叶罐：有照片时照片印在罐身上，没有照片按茶类着色、贴一张竖排茶名的纸签。
// shape：can 金属茶叶罐 | jar 陶罐（普洱、黑茶常用）。gray 为灰色态（缺的茶类 / 已喝完），
// badge 为右上角标，seal 为罐身右下的朱印（首页“泡”）。kind：tea 茶 | add 末尾的“＋”格。
const image = require('../../utils/image')

Component({
  properties: {
    kind: { type: String, value: 'tea' },
    shape: { type: String, value: 'can' },
    name: { type: String, value: '' },
    src: { type: String, value: '' },
    color: { type: String, value: '#8a8576' },
    gray: { type: Boolean, value: false },
    badge: { type: String, value: '' },
    seal: { type: String, value: '' }
  },
  data: { chars: [], localSrc: '' },
  observers: {
    src(v) {
      if (!v) return this.setData({ localSrc: '' })
      image.localSrc(v).then(p => {
        if (this.data.src === v) this.setData({ localSrc: p })
      })
    },
    name(v) {
      // 竖排最多 5 行，逐字成行（不依赖 writing-mode）；连续的数字 / 字母合成一行横排，如“2015”。
      // 行数越多字越小，拉丁串越长字越小，避免超出纸签 / 罐身。
      const raw = ((v || '').match(/[A-Za-z0-9]+|\S/g) || []).slice(0, 5)
      const n = raw.length
      const hanSize = n <= 2 ? 34 : n === 3 ? 30 : n === 4 ? 26 : 22
      const chars = raw.map(t => {
        const latin = /^[A-Za-z0-9]/.test(t)
        const s = latin ? Math.max(12, 20 - (t.length - 1) * 2) : hanSize
        return { t, latin, s }
      })
      this.setData({ chars })
    }
  }
})
