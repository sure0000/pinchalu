const pad = n => (n < 10 ? '0' + n : '' + n)

// 秒 → mm:ss
function clock(sec) {
  const s = Math.max(0, Math.round(sec))
  return pad(Math.floor(s / 60)) + ':' + pad(s % 60)
}

// 秒 → “20秒” / “1分5秒”
function duration(sec) {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (!m) return s + '秒'
  return s ? m + '分' + s + '秒' : m + '分'
}

// 毫秒时间戳 → “10月29日”（非当年带年份）
function date(ms) {
  const d = new Date(ms)
  const md = d.getMonth() + 1 + '月' + d.getDate() + '日'
  const thisYear = new Date().getFullYear()
  return d.getFullYear() === thisYear ? md : d.getFullYear() + '年' + md
}

// 毫秒时间戳 → “14:05”
function time(ms) {
  const d = new Date(ms)
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}

// 毫秒时间戳 → “YYYY-MM-DD”，供 picker 使用
function dateValue(ms) {
  const d = new Date(ms)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

// 用 “YYYY-MM-DD” 替换 baseMs 的日期部分，保留时分秒
function withDateValue(baseMs, value) {
  const p = value.split('-').map(Number)
  const d = new Date(baseMs)
  d.setFullYear(p[0], p[1] - 1, p[2])
  return +d
}

function stars(n) {
  n = Math.max(0, Math.min(5, Math.round(n || 0)))
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}

module.exports = { clock, duration, date, time, dateValue, withDateValue, stars }
