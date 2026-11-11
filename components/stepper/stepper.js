Component({
  properties: {
    label: String,
    unit: String,
    value: { type: Number, value: 0 },
    step: { type: Number, value: 1 },
    min: { type: Number, value: 0 },
    max: { type: Number, value: 9999 },
    disabled: Boolean
  },

  methods: {
    dec() {
      this.change(-this.data.step)
    },
    inc() {
      this.change(this.data.step)
    },
    change(delta) {
      if (this.data.disabled) return
      // 规避 0.5 累加的浮点误差
      const v = Math.round((this.data.value + delta) * 100) / 100
      const clamped = Math.max(this.data.min, Math.min(this.data.max, v))
      if (clamped !== this.data.value) this.triggerEvent('change', { value: clamped })
    }
  }
})
