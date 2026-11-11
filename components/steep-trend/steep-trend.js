const F = require('../../config/flavor')

// 逐泡滋味变化：上部为每一泡的滋味标签时间轴，下部为八项滋味强度（甜/鲜爽/醇厚/回甘/生津/喉韵/苦/涩）逐泡折线图。
// 苦、涩用暖色，其余用茶绿；纵轴 0–5 分，横轴为泡数，能看出“前几泡苦涩 → 后几泡转甜醇”的走势。
// steeps = [{ n, tastes?, review? }]，全为空时显示空态。
const TASTE_COLOR = {}
F.TASTES.forEach(g => g.tags.forEach(t => (TASTE_COLOR[t] = g.color)))

const MAX = 5

Component({
  options: { styleIsolation: 'apply-shared' },

  properties: {
    steeps: { type: Array, value: [] }
  },

  data: {
    dims: [],
    cols: [],
    series: {},
    timeline: [],
    empty: true,
    showChart: false
  },

  observers: {
    steeps() {
      this.render()
    }
  },

  lifetimes: {
    attached() {
      this.render()
    },
    ready() {
      this.drawChart()
    },
    detached() {
      clearTimeout(this._retry)
    }
  },

  methods: {
    render() {
      const steeps = (this.data.steeps || []).slice().sort((a, b) => a.n - b.n)
      const dims = F.TREND_NAMES.map(d => ({ key: d.key, name: d.name, color: F.trendColor(d.key) }))
      const series = {}
      dims.forEach(d => {
        series[d.key] = steeps.map(s => (s.review && s.review.scores && s.review.scores[d.key]) || 0)
      })
      const timeline = steeps.map(s => ({
        n: s.n,
        chips: (s.tastes || []).map(name => ({ name, color: TASTE_COLOR[name] || '#a9a397' }))
      }))
      const hasScores = steeps.some(s => s.review && Object.keys(s.review.scores || {}).length)
      const hasTastes = steeps.some(s => (s.tastes || []).length)
      this.setData(
        {
          dims,
          cols: steeps.map(s => ({ n: s.n })),
          series,
          timeline,
          empty: !(hasScores || hasTastes),
          showChart: hasScores
        },
        () => this.drawChart()
      )
    },

    drawChart() {
      if (!this.data.showChart) return
      this.createSelectorQuery()
        .select('#trend')
        .fields({ node: true, size: true })
        .exec(res => {
          if (!res || !res[0] || !res[0].node) return
          if (!res[0].width || !res[0].height) {
            clearTimeout(this._retry)
            this._retry = setTimeout(() => this.drawChart(), 60)
            return
          }
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio) || 2
          canvas.width = res[0].width * dpr
          canvas.height = res[0].height * dpr
          ctx.scale(dpr, dpr)
          this.paint(ctx, res[0].width, res[0].height)
        })
    },

    paint(ctx, w, h) {
      const { dims, cols, series } = this.data
      const N = cols.length
      const padL = 26
      const padR = 10
      const padT = 12
      const padB = 26
      const pw = w - padL - padR
      const ph = h - padT - padB
      const x = i => (N <= 1 ? padL + pw / 2 : padL + (pw * i) / (N - 1))
      const y = v => padT + ph * (1 - Math.max(0, Math.min(MAX, v)) / MAX)

      ctx.clearRect(0, 0, w, h)
      ctx.lineWidth = 1
      ctx.font = '10px sans-serif'

      // 横向网格 + 纵轴刻度（0–5）
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      for (let v = 0; v <= MAX; v++) {
        const gy = y(v)
        ctx.strokeStyle = v === 0 ? '#d8cfbd' : '#ece5d6'
        ctx.beginPath()
        ctx.moveTo(padL, gy)
        ctx.lineTo(w - padR, gy)
        ctx.stroke()
        ctx.fillStyle = '#b3ad9f'
        ctx.fillText(String(v), padL - 6, gy)
      }

      // 横轴泡数
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      cols.forEach((c, i) => {
        ctx.fillStyle = '#b3ad9f'
        ctx.fillText(String(c.n), x(i), padT + ph + 8)
      })

      // 每一条滋味强度折线
      dims.forEach(d => {
        const vals = series[d.key] || []
        if (!vals.some(v => v > 0)) return
        ctx.strokeStyle = d.color
        ctx.lineWidth = 2
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.beginPath()
        cols.forEach((c, i) => {
          const px = x(i)
          const py = y(vals[i] || 0)
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        })
        ctx.stroke()

        // 打点（只标有分的泡）
        ctx.fillStyle = d.color
        cols.forEach((c, i) => {
          if (!(vals[i] > 0)) return
          ctx.beginPath()
          ctx.arc(x(i), y(vals[i]), 2.5, 0, Math.PI * 2)
          ctx.fill()
        })
      })
    }
  }
})
