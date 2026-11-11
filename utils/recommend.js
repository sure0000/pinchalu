// 推荐“此刻喝什么茶”。纯函数（时间由调用方传入），不依赖 wx，便于测试。
//
// 输入：
//   teas   —— 茶柜里的茶（需 _id / name / category / lastBrewedAt / lastRating / finished）
//   brews  —— 最近的冲泡 [{ teaId, category, startedAt, rating }]
// 以时令为主、个人习惯为辅（时令规则见 utils/chadao.js）：
//   应时   茶类合不合这个时辰
//   应季   茶类合不合当下季节（季节之交宜黄茶）
//   习惯   这款茶在该时辰被泡过多少次（按 30 天半衰期衰减）
//   评分   平均评分高的加分
//   调剂   刚喝过的降权；高分但久未喝、从没泡过的加分；今天已喝满三种时，优先续喝今天喝过的
// 已喝完的茶不推荐。
const C = require('./chadao')
const { getCategory } = require('../config/teaConfig')

const HOUR = 3600 * 1000
const DAY = 24 * HOUR
const HALF_LIFE = 30 * DAY

const decay = (age, half) => Math.pow(0.5, Math.max(0, age) / half)
const round1 = x => Math.round(x * 10) / 10

// 今天喝过的茶：{ key: true }，key 为 teaId（只选了茶类时为 cat:茶类）
function todayKinds(brews, now) {
  const start = C.dayStart(now)
  const out = {}
  brews.forEach(b => {
    if (b.startedAt >= start && b.startedAt <= now) out[b.teaId || 'cat:' + b.category] = true
  })
  return out
}

// 返回该时辰排好序的推荐 [{ tea, score, reason, tags }]
function recommend(teas, brews, slotKey, now, limit) {
  const list = teas.filter(t => !t.finished)
  if (!list.length) return []
  const slot = C.getShichen(slotKey)
  const season = C.seasonOf(now)
  const today = todayKinds(brews, now)
  const kinds = Object.keys(today).length
  const full = kinds >= C.DAILY_KINDS

  const teaSlot = {} // 该茶在该时辰的加权次数
  const teaSlotN = {} // 该茶在该时辰的实际次数（用于文案）
  const last = {} // 该茶最近一次冲泡（含待同步）
  const ratings = {} // 该茶的评分列表
  brews.forEach(b => {
    if (b.startedAt > (last[b.teaId] || 0)) last[b.teaId] = b.startedAt
    if (b.rating > 0) (ratings[b.teaId] = ratings[b.teaId] || []).push(b.rating)
    if (C.shichenOf(b.startedAt) !== slot.key) return
    teaSlot[b.teaId] = (teaSlot[b.teaId] || 0) + decay(now - b.startedAt, HALF_LIFE)
    teaSlotN[b.teaId] = (teaSlotN[b.teaId] || 0) + 1
  })
  const maxTea = Math.max(0, ...list.map(t => teaSlot[t._id] || 0))

  const scored = list.map(t => {
    const family = getCategory(t.category).family
    const lastAt = Math.max(t.lastBrewedAt || 0, last[t._id] || 0)
    const rs = ratings[t._id]
    const avg = rs ? rs.reduce((s, r) => s + r, 0) / rs.length : t.lastRating || 0

    // 各部分得分 + 对应文案，最后取贡献最大的作为推荐理由
    const parts = []
    const tags = []
    const tf = C.timeFit(family, slot)
    if (tf) parts.push([2 * tf, tf === 1 ? slot.text : '白茶不拘时辰，24 小时皆可'])
    if (tf === 1) tags.push('应时')
    const sf = C.seasonFit(family, season)
    if (sf) parts.push([1.5 * sf, sf === 1 ? season.text : family === season.baseFamily ? season.baseText : '白茶四季皆宜'])
    if (sf === 1) tags.push('应季')

    if (maxTea) parts.push([1 * ((teaSlot[t._id] || 0) / maxTea), (teaSlotN[t._id] || 0) >= 2 ? '你常在' + slot.name + '泡它（近来 ' + teaSlotN[t._id] + ' 次）' : ''])
    if (avg) parts.push([0.8 * ((avg - 3) / 2), avg >= 4 ? '你给它打过 ' + round1(avg) + ' 星' : ''])

    if (full) {
      // 一日不过三种：今天喝过的续一续，没喝过的明天再说
      if (today[t._id]) parts.push([1.5, '今天已喝 ' + kinds + ' 种，续一款喝过的'])
      else parts.push([-2, ''])
    } else if (!lastAt) {
      parts.push([0.4, '还没泡过，尝个鲜'])
    } else {
      const since = now - lastAt
      if (since < 4 * HOUR) parts.push([-3, '']) // 刚喝过，换一款
      else if (since < DAY) parts.push([-0.6, ''])
      else if (avg >= 4 && since >= 21 * DAY) parts.push([0.6 * Math.min(1, since / (60 * DAY)) + 0.3, '好喝但已 ' + Math.floor(since / DAY) + ' 天没泡了'])
    }

    const score = parts.reduce((s, p) => s + p[0], 0)
    const top = parts.filter(p => p[1] && p[0] > 0).sort((a, b) => b[0] - a[0])[0]
    return { tea: t, score, reason: top ? top[1] : '换换口味', tags }
  })

  return scored
    .sort((a, b) => b.score - a.score || (b.tea.lastRating || 0) - (a.tea.lastRating || 0))
    .slice(0, limit || 3)
}

module.exports = { SLOTS: C.SHICHEN, slotOf: C.shichenOf, todayKinds, recommend }
