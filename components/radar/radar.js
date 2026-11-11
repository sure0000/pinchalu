// 审评雷达图：dims 为各轴名称，values 为对应强度（0–max）。纯 CSS：clip-path 多边形 + 旋转的细线。
const SPAN = 0.74 // 满分落在半径的 74% 处，外面留给轴名

Component({
  properties: {
    dims: { type: Array, value: [] },
    values: { type: Array, value: [] },
    max: { type: Number, value: 5 },
    size: { type: Number, value: 380 }, // rpx
    color: { type: String, value: '#4a6b4f' }
  },

  data: { rings: [], spokes: [], area: '', dots: [], labels: [], empty: true },

  observers: {
    'dims, values, max'() {
      this.render()
    }
  },

  methods: {
    render() {
      const n = this.data.dims.length
      if (n < 3) return
      const max = this.data.max
      const pt = (i, frac) => {
        const t = (i / n) * 2 * Math.PI
        return { x: 50 + 50 * frac * Math.sin(t), y: 50 - 50 * frac * Math.cos(t) }
      }
      const poly = frac => 'polygon(' + this.data.dims.map((d, i) => {
        const p = pt(i, frac)
        return p.x.toFixed(2) + '% ' + p.y.toFixed(2) + '%'
      }).join(', ') + ')'
      const vals = this.data.dims.map((d, i) => Math.max(0, Math.min(max, Number(this.data.values[i]) || 0)))
      const rings = []
      for (let l = max; l >= 1; l--) rings.push({ l, clip: poly((l / max) * SPAN), alt: l % 2 === 0 })
      const area =
        'polygon(' +
        vals.map((v, i) => {
          const p = pt(i, Math.max(0.04, (v / max) * SPAN))
          return p.x.toFixed(2) + '% ' + p.y.toFixed(2) + '%'
        }).join(', ') +
        ')'
      this.setData({
        rings,
        spokes: this.data.dims.map((d, i) => ({ i, rot: 180 + (i * 360) / n })),
        area,
        dots: vals.map((v, i) => Object.assign({ i, on: v > 0 }, pt(i, (v / max) * SPAN))),
        labels: this.data.dims.map((d, i) => Object.assign({ i, name: d, v: vals[i] ? vals[i] % 1 ? vals[i].toFixed(1) : vals[i] : '' }, pt(i, 0.9))),
        empty: !vals.some(v => v > 0)
      })
    }
  }
})
