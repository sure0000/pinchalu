const F = require('../../config/flavor')

// 滋味选择器：按“分组 → 描述词”展示，点选多选（记录每一泡的滋味变化，与香气风味轮分开）。
// value 为选中的滋味描述词数组，选中变化时触发 change { value }。
Component({
  options: { styleIsolation: 'apply-shared' },

  properties: {
    value: { type: Array, value: [] }
  },

  data: { groups: [] },

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
    render() {
      const sel = this.data.value || []
      this.setData({
        groups: F.TASTES.map(g => ({
          name: g.name,
          color: g.color,
          tags: g.tags.map(name => ({ name, on: sel.indexOf(name) >= 0 }))
        }))
      })
    },

    toggle(e) {
      const name = e.currentTarget.dataset.name
      const sel = (this.data.value || []).slice()
      const i = sel.indexOf(name)
      if (i >= 0) sel.splice(i, 1)
      else sel.push(name)
      this.triggerEvent('change', { value: sel })
    }
  }
})
