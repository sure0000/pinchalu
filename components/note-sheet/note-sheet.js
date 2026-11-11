// “记一笔”半屏面板：风味轮上选这一泡的香气 + 滋味变化 + 专业审评（汤色/清亮度/十项强度）+ 一句话，各项均可留空。
Component({
  options: { styleIsolation: 'apply-shared' },

  properties: {
    show: Boolean,
    title: String,
    tags: { type: Array, value: [] },
    tastes: { type: Array, value: [] },
    review: { type: Object, value: {} },
    note: String
  },

  data: { curTags: [], curTastes: [], curReview: {}, curNote: '' },

  observers: {
    show(show) {
      if (show) {
        this.setData({
          curTags: (this.data.tags || []).slice(),
          curTastes: (this.data.tastes || []).slice(),
          curReview: Object.assign({}, this.data.review || {}),
          curNote: this.data.note || ''
        })
      }
    }
  },

  methods: {
    noop() {},
    close() {
      this.triggerEvent('close')
    },
    onTags(e) {
      this.setData({ curTags: e.detail.value })
    },
    onTastes(e) {
      this.setData({ curTastes: e.detail.value })
    },
    onReview(e) {
      this.setData({ curReview: e.detail.value })
    },
    onNote(e) {
      this.setData({ curNote: e.detail.value })
    },
    save() {
      this.triggerEvent('save', { tags: this.data.curTags, tastes: this.data.curTastes, review: this.data.curReview, note: this.data.curNote.trim() })
    }
  }
})
