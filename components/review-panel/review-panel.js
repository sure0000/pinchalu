const F = require('../../config/flavor')

// 专业审评：汤色、清亮度、十项强度（0–5，带实时雷达图）、叶底。全部可留空。
// value = { liquor, clarity, scores: { aroma, lasting, ... }, leaf: [] }，改动时触发 change { value }。
// mode = full 整场（含雷达图与叶底）| steep 单泡（只记汤色 / 清亮度 / 强度，供“记一笔”里逐泡评审）
const LEVELS = [1, 2, 3, 4, 5]

Component({
  options: { styleIsolation: 'apply-shared' },

  properties: {
    value: { type: Object, value: {} },
    mode: { type: String, value: 'full' }
  },

  data: {
    levels: LEVELS,
    dimNames: F.DIMS.map(d => d.name),
    steep: false,
    liquors: [],
    clarity: [],
    rows: [],
    leaf: [],
    radar: []
  },

  observers: {
    value() {
      this.render()
    }
  },

  lifetimes: {
    attached() {
      this.render()
    }
  },

  methods: {
    cur() {
      const v = this.data.value || {}
      return { liquor: v.liquor || '', clarity: v.clarity || '', scores: Object.assign({}, v.scores), leaf: (v.leaf || []).slice() }
    },

    render() {
      const v = this.cur()
      this.setData({
        steep: this.data.mode === 'steep',
        liquors: F.LIQUORS.map(l => ({ name: l.name, color: l.color, on: l.name === v.liquor })),
        clarity: F.CLARITY.map(name => ({ name, on: name === v.clarity })),
        rows: F.DIMS.map(d => ({ key: d.key, name: d.name, v: v.scores[d.key] || 0 })),
        leaf: F.LEAF.map(name => ({ name, on: v.leaf.indexOf(name) >= 0 })),
        radar: F.DIMS.map(d => v.scores[d.key] || 0)
      })
    },

    emit(v) {
      // 空的项不存
      const out = {}
      if (v.liquor) out.liquor = v.liquor
      if (v.clarity) out.clarity = v.clarity
      const scores = {}
      Object.keys(v.scores).forEach(k => v.scores[k] > 0 && (scores[k] = v.scores[k]))
      if (Object.keys(scores).length) out.scores = scores
      if (v.leaf.length) out.leaf = v.leaf
      this.triggerEvent('change', { value: out })
    },

    pickLiquor(e) {
      const v = this.cur()
      const name = e.currentTarget.dataset.name
      v.liquor = v.liquor === name ? '' : name
      this.emit(v)
    },

    pickClarity(e) {
      const v = this.cur()
      const name = e.currentTarget.dataset.name
      v.clarity = v.clarity === name ? '' : name
      this.emit(v)
    },

    // 点第 n 个点：强度设为 n；再点当前值清零
    setScore(e) {
      const v = this.cur()
      const { key, n } = e.currentTarget.dataset
      v.scores[key] = v.scores[key] === n ? 0 : n
      this.emit(v)
    },

    toggleLeaf(e) {
      const v = this.cur()
      const name = e.currentTarget.dataset.name
      const i = v.leaf.indexOf(name)
      if (i >= 0) v.leaf.splice(i, 1)
      else v.leaf.push(name)
      this.emit(v)
    }
  }
})
