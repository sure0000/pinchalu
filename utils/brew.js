// 进行中冲泡的状态机。纯函数（时间由调用方传入），不依赖 wx，便于测试。
//
// active = {
//   teaId, teaName, category, leafG, waterMl, tempC, stepSec,
//   startedAt, endedAt,              // 毫秒时间戳，endedAt 为 0 表示未结束
//   steeps: [{ n, seconds, tags?, tastes?, note? }],   // 已出汤的各泡（香气 tags / 滋味 tastes / 一句话 note）
//   cur: { n, seconds, status, endAt, remainMs } // 当前泡
// }
// cur.status: idle 待开始 | running 倒计时 | paused 暂停 | done 已到时（出汤）
//
// 倒计时不逐秒累减：running 时只存结束时间戳 endAt，显示用 endAt - now 计算，
// 切后台再回来重算即可，不会停在离开时的读数。
const fmt = require('./format')

const MIN_SECONDS = 5

function createActive(o) {
  return {
    teaId: o.tea ? o.tea._id : '',
    teaName: o.tea ? o.tea.name : '',
    category: o.category,
    leafG: o.leafG,
    waterMl: o.waterMl,
    tempC: o.tempC,
    stepSec: o.stepSec,
    startedAt: o.now,
    endedAt: 0,
    steeps: [],
    cur: { n: 1, seconds: o.firstSec, status: 'idle', endAt: 0, remainMs: 0 }
  }
}

function start(a, now) {
  const c = a.cur
  if (c.status !== 'idle') return
  c.status = 'running'
  c.endAt = now + c.seconds * 1000
}

function pause(a, now) {
  const c = a.cur
  if (c.status !== 'running') return
  c.remainMs = Math.max(0, c.endAt - now)
  c.status = 'paused'
}

function resume(a, now) {
  const c = a.cur
  if (c.status !== 'paused') return
  c.endAt = now + c.remainMs
  c.status = 'running'
}

// 手动加减秒数（待开始 / 倒计时 / 暂停时可用）
function adjust(a, deltaSec) {
  const c = a.cur
  if (c.status === 'done') return
  const next = Math.max(MIN_SECONDS, c.seconds + deltaSec)
  const real = next - c.seconds
  c.seconds = next
  if (c.status === 'running') c.endAt += real * 1000
  if (c.status === 'paused') c.remainMs = Math.max(0, c.remainMs + real * 1000)
}

// 到时检测：running 且已过 endAt → 记入 steeps 并进入 done。发生状态切换返回 true。
function settle(a, now) {
  const c = a.cur
  if (c.status !== 'running' || now < c.endAt) return false
  c.status = 'done'
  if (!a.steeps.some(s => s.n === c.n)) a.steeps.push({ n: c.n, seconds: c.seconds })
  return true
}

// 下一泡：时长 = 本泡时长 + 递增（岩茶 10 → 15 → 20 → 25）
function next(a) {
  const c = a.cur
  if (c.status !== 'done') return
  a.cur = { n: c.n + 1, seconds: c.seconds + a.stepSec, status: 'idle', endAt: 0, remainMs: 0 }
}

// 结束本场：未出汤的当前泡不计入
function finish(a, now) {
  settle(a, now)
  a.endedAt = now
}

function remainingMs(c, now) {
  if (c.status === 'running') return Math.max(0, c.endAt - now)
  if (c.status === 'paused') return c.remainMs
  if (c.status === 'done') return 0
  return c.seconds * 1000
}

const TEXT = {
  idle: ['准备就绪', '开始'],
  running: ['冲泡中', '暂停'],
  paused: ['已暂停', '继续'],
  done: ['出汤！', '下一泡']
}

// 供界面展示的只读视图
function view(a, now) {
  const c = a.cur
  const remain = remainingMs(c, now)
  let text = TEXT[c.status][0]
  if (c.status === 'done') {
    const over = Math.floor((now - c.endAt) / 1000)
    if (over > 0) text = '出汤！已到时 ' + over + ' 秒'
  }
  let pct = 0
  if (c.status === 'done') pct = 100
  else if (c.status !== 'idle') pct = Math.round((1 - remain / (c.seconds * 1000)) * 100)
  return {
    n: c.n,
    status: c.status,
    seconds: c.seconds,
    clock: fmt.clock(Math.ceil(remain / 1000)),
    text,
    mainText: TEXT[c.status][1],
    pct: Math.max(0, Math.min(100, pct)),
    locked: c.status === 'running' || c.status === 'paused',
    done: a.steeps.length
  }
}

module.exports = { createActive, start, pause, resume, adjust, settle, next, finish, view }
