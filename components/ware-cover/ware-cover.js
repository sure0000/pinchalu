// 器柜里的一格：木格里立着一件茶器。有照片时照片铺满格子；没有照片按器型画剪影（纯 CSS），按材质着色。
// kind 器型（config/wares.js 的 KINDS，另有 add 末尾的“＋”格）；material 材质；cap 左上角小字（容量）。
// gray 为灰色态（收起不用），badge 为右上角标。
const W = require('../../config/wares')
const image = require('../../utils/image')

Component({
  properties: {
    kind: { type: String, value: 'gaiwan' },
    material: { type: String, value: '' },
    src: { type: String, value: '' },
    cap: { type: String, value: '' },
    gray: { type: Boolean, value: false },
    badge: { type: String, value: '' }
  },
  data: { color: '#a9a397', mclass: '', localSrc: '' },
  observers: {
    src(v) {
      if (!v) return this.setData({ localSrc: '' })
      image.localSrc(v).then(p => {
        if (this.data.src === v) this.setData({ localSrc: p })
      })
    },
    material(code) {
      const m = W.getMaterial(code)
      this.setData({ color: m.color, mclass: m.glass ? 'm-glass' : m.light ? 'm-light' : '' })
    }
  }
})
