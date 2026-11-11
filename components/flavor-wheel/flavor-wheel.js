const db = require('../../utils/db')
const F = require('../../config/flavor')

// 香气风味轮：内圈大类、外圈亚类，点扇区看该亚类的描述词，点描述词多选；可在当前亚类下新增自定义描述词。
// value 为选中的描述词数组（与旧的风味标签同一字段），选中变化时触发 change { value }。
// 轮盘用两层 conic-gradient 画，点按位置换算成角度和半径来判断点中了哪一格。
const SIZE = 560 // 轮盘直径（rpx）
const R = SIZE / 2
const IN_R = 0.56 // 内外圈分界（相对半径）
const HOLE_R = 0.25 // 中心留白
const GAP = 0.6 // 扇区间的白缝（度）

Component({
  options: { styleIsolation: 'apply-shared' },

  properties: {
    value: { type: Array, value: [] }
  },

  data: {
    size: SIZE,
    outerGrad: '',
    innerGrad: '',
    subLabels: [],
    catLabels: [],
    focus: { cat: 0, sub: 0 },
    focusName: '',
    focusColor: '',
    current: [],
    picked: [],
    selCount: 0,
    adding: false,
    newName: ''
  },

  observers: {
    value() {
      this.render()
    }
  },

  lifetimes: {
    attached() {
      this.custom = db.cachedCustomTags()
      this.wheel = F.mergeWheel(this.custom)
      this.render()
      db.listCustomTags().then(custom => {
        this.custom = custom
        this.wheel = F.mergeWheel(custom)
        this.render()
      })
    }
  },

  methods: {
    // 扇区：每个亚类等分一圈，大类跨它的亚类
    sectors() {
      const subs = []
      this.wheel.forEach((c, ci) => c.subs.forEach((s, si) => subs.push({ ci, si, c, s })))
      const step = 360 / subs.length
      subs.forEach((x, i) => {
        x.a = i * step
        x.b = (i + 1) * step
      })
      return subs
    },

    render() {
      if (!this.wheel) return
      const sel = this.data.value || []
      const f = this.data.focus
      const subs = this.sectors()
      const has = s => s.tags.some(t => sel.indexOf(t.name) >= 0)
      const bg = '#fffdf8'
      const stops = list => list.map(x => `${bg} ${x.a}deg, ${bg} ${x.a + GAP / 2}deg, ${x.col} ${x.a + GAP / 2}deg, ${x.col} ${x.b - GAP / 2}deg, ${bg} ${x.b - GAP / 2}deg, ${bg} ${x.b}deg`).join(', ')

      const outer = subs.map(x => {
        const on = x.ci === f.cat && x.si === f.sub
        const k = on ? 0 : has(x.s) ? 0.22 : 0.62
        return { a: x.a, b: x.b, col: F.mix(x.c.color, k), on, dark: k < 0.3 }
      })
      const cats = this.wheel.map((c, ci) => {
        const mine = subs.filter(x => x.ci === ci)
        const lit = ci === f.cat || mine.some(x => has(x.s))
        return { a: mine[0].a, b: mine[mine.length - 1].b, col: F.mix(c.color, lit ? 0 : 0.5), dark: lit }
      })

      // 标签位置：亚类沿半径方向写（左半边转 180° 保持正着读），大类横写
      const pos = (deg, r) => {
        const t = (deg * Math.PI) / 180
        return { x: R + r * R * Math.sin(t), y: R - r * R * Math.cos(t) }
      }
      const subLabels = subs.map((x, i) => {
        const mid = (x.a + x.b) / 2
        const p = pos(mid, (IN_R + 1) / 2)
        return { key: x.c.name + x.s.name, name: x.s.name, x: p.x, y: p.y, rot: mid < 180 ? mid - 90 : mid + 90, dark: outer[i].dark }
      })
      const catLabels = cats.map((x, ci) => {
        const p = pos((x.a + x.b) / 2, (HOLE_R + IN_R) / 2)
        return { key: this.wheel[ci].name, name: this.wheel[ci].name, x: p.x, y: p.y, dark: x.dark }
      })

      const cat = this.wheel[f.cat]
      const sub = cat.subs[f.sub]
      this.setData({
        outerGrad: stops(outer),
        innerGrad: stops(cats),
        subLabels,
        catLabels,
        focusName: cat.name + ' · ' + sub.name,
        focusColor: cat.color,
        current: sub.tags.map(t => ({ name: t.name, custom: t.custom, on: sel.indexOf(t.name) >= 0 })),
        picked: sel.map(name => {
          const loc = F.locate(name, this.custom)
          return { name, color: loc ? loc.color : '#a9a397' }
        }),
        selCount: sel.length
      })
    },

    // 点轮盘：换算成相对圆心的角度（顶上为 0°，顺时针）和半径
    onWheel(e) {
      const t = (e.changedTouches && e.changedTouches[0]) || e.detail
      const cx = t.clientX != null ? t.clientX : t.x
      const cy = t.clientY != null ? t.clientY : t.y
      this.createSelectorQuery()
        .select('.fw-wheel')
        .boundingClientRect(rect => {
          if (!rect) return
          const half = rect.width / 2
          const dx = cx - (rect.left + half)
          const dy = cy - (rect.top + half)
          const r = Math.sqrt(dx * dx + dy * dy) / half
          if (r < HOLE_R || r > 1) return
          const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
          const subs = this.sectors()
          const hit = subs.find(x => deg >= x.a && deg < x.b)
          if (!hit) return
          // 点内圈的大类：落到该大类的第一个亚类（已在这个大类里就保持不动）
          const focus = r >= IN_R ? { cat: hit.ci, sub: hit.si } : { cat: hit.ci, sub: hit.ci === this.data.focus.cat ? this.data.focus.sub : 0 }
          this.setData({ focus, adding: false })
          this.render()
        })
        .exec()
    },

    emit(value) {
      this.triggerEvent('change', { value })
    },

    toggle(e) {
      const name = e.currentTarget.dataset.name
      const sel = (this.data.value || []).slice()
      const i = sel.indexOf(name)
      if (i >= 0) sel.splice(i, 1)
      else sel.push(name)
      this.emit(sel)
    },

    remove(e) {
      const name = e.currentTarget.dataset.name
      this.emit((this.data.value || []).filter(t => t !== name))
    },

    openAdd() {
      this.setData({ adding: true, newName: '' })
    },

    cancelAdd() {
      this.setData({ adding: false })
    },

    onNewName(e) {
      this.setData({ newName: e.detail.value })
    },

    async confirmAdd() {
      const name = this.data.newName.trim()
      if (!name) return
      const f = this.data.focus
      const custom = await db.addCustomTag(this.wheel[f.cat].subs[f.sub].name, name)
      this.custom = custom
      this.wheel = F.mergeWheel(custom)
      this.setData({ adding: false, newName: '' })
      const sel = (this.data.value || []).slice()
      if (sel.indexOf(name) < 0) {
        sel.push(name)
        this.emit(sel)
      } else this.render()
    }
  }
})
