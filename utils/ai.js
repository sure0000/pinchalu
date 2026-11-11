// 用微信云开发内置的大模型整理总评（wx.cloud.extend.AI，无需自己申请 key）。
// 默认用混元 hy3：256K 上下文、生文模型，属于「小程序成长计划」免费额度覆盖的模型。
// 未开通 / 调用失败 / 免费额度耗尽时返回 null，由调用方回退到“按说话人拼接”的方式。
const MODEL = 'hy3'

function available() {
  try {
    return !!(wx.cloud && wx.cloud.extend && wx.cloud.extend.AI && wx.cloud.extend.AI.createModel)
  } catch (e) {
    return false
  }
}

// 把多人的评论 + 已填的结构化记录整理成一段整体评论。
// 成功返回 { text }，失败返回 null。
async function summarize(voices, extra) {
  if (!available()) return null
  const list = (voices || []).filter(v => v && String(v.text || '').trim())
  if (!list.length) return null
  const lines = list.map(v => (v.speaker || '茶友') + '：' + v.text.trim())
  const prompt = [
    '你是茶道品鉴记录助手。下面是一场茶会中，多个人对同一款茶的语音评论（已转成文字）。',
    '请把大家的评论整理成一段通顺、简洁的整体评论，按「香气 / 滋味 / 汤色 / 回甘与韵味 / 叶底 / 总体印象」分段归纳；',
    '只写大家实际谈到的内容，没谈到的方面直接省略，不要编造；保留关键描述词（如兰花香、回甘快、汤色金黄等），不要啰嗦。',
    '',
    '【多人评论】',
    lines.join('\n'),
    '',
    '【已填的结构化记录，可能为空】',
    buildStructured(extra) || '（无）'
  ].join('\n')

  try {
    const model = wx.cloud.extend.AI.createModel('cloudbase')
    const res = await model.generateText({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }]
    })
    const text = res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content
    return text ? { text: String(text).trim() } : null
  } catch (e) {
    console.warn('[ai] 整理失败：', e)
    return null
  }
}

// 生成格式化、专业化的评审内容（按小标题分段，供汇总页“专业评审”展示）
async function review(voices, extra) {
  if (!available()) return null
  const list = (voices || []).filter(v => v && String(v.text || '').trim())
  if (!list.length) return null
  const lines = list.map(v => (v.speaker || '茶友') + '：' + v.text.trim())
  const prompt = [
    '你是茶叶专业审评员。根据大家的品茶评论和已填的结构化记录，写一份专业评审。',
    '请严格按下面的小标题分段输出：',
    '【香气】【滋味】【汤色】【回甘与韵味】【叶底】【总体评价】',
    '要求：使用专业审评术语（可参考 GB/T 23776、GB/T 14487 的风格）；只写大家实际谈到的内容，没谈到的小标题写「未提及」；不要编造；语言简洁、格式整齐。',
    '',
    '【多人评论】',
    lines.join('\n'),
    '',
    '【已填的结构化记录，可能为空】',
    buildStructured(extra) || '（无）'
  ].join('\n')

  try {
    const model = wx.cloud.extend.AI.createModel('cloudbase')
    const res = await model.generateText({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }]
    })
    const text = res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content
    return text ? { text: String(text).trim() } : null
  } catch (e) {
    console.warn('[ai] 生成专业评审失败：', e)
    return null
  }
}

function buildStructured(extra) {
  const b = extra || {}
  const parts = []
  if (b.teaName) parts.push('茶名：' + b.teaName)
  if (b.categoryName) parts.push('茶类：' + b.categoryName)
  const tags = (b.tags || []).join('、')
  if (tags) parts.push('香气（已选）：' + tags)
  const r = b.review || {}
  const arr = []
  if (r.liquor) arr.push('汤色：' + r.liquor)
  if (r.clarity) arr.push('清亮度：' + r.clarity)
  if (r.leaf && r.leaf.length) arr.push('叶底：' + r.leaf.join('、'))
  if (r.scores && Object.keys(r.scores).length) arr.push('强度评分：' + JSON.stringify(r.scores))
  if (arr.length) parts.push('专业审评：' + arr.join('；'))
  if (b.rating) parts.push('评分：' + b.rating + ' 星')
  return parts.join('\n')
}

module.exports = { available, summarize, review }
