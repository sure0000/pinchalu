// 茶柜、器柜的批量管理：对选中的每一项依次执行 fn（逐条写，免得本机缓存互相覆盖），
// 期间显示加载框，完成后提示结果。返回失败的条数（多半是断网）。
async function run(list, fn, doneText) {
  wx.showLoading({ title: '处理中', mask: true })
  let fail = 0
  for (const x of list) {
    try {
      await fn(x)
    } catch (e) {
      fail++
    }
  }
  wx.hideLoading()
  wx.showToast({ title: fail ? fail + ' 项没保存上，请检查网络' : doneText || '已完成', icon: 'none' })
  return fail
}

// 勾选状态：只留还在的项；visible 为当前显示的项，用来判断是否已全选
function picks(picked, list, visible) {
  const map = {}
  list.filter(x => picked[x._id]).forEach(x => (map[x._id] = true))
  return { picked: map, pickedCount: Object.keys(map).length, allPicked: !!visible.length && visible.every(id => map[id]) }
}

// 当前显示的项的 _id（同一项可能出现在多个分组里）
function visibleIds(sections) {
  const ids = {}
  sections.forEach(s => s.items.forEach(i => i.id && (ids[i.id] = true)))
  return Object.keys(ids)
}

// 全选 / 取消全选只动当前显示的项，搜索前勾的其他项不受影响
function toggleAll(picked, visible, allPicked) {
  const map = Object.assign({}, picked)
  visible.forEach(id => (map[id] = !allPicked))
  return map
}

function setTabBar(show) {
  const opt = { animation: false, fail() {} }
  show ? wx.showTabBar(opt) : wx.hideTabBar(opt)
}

module.exports = { run, picks, visibleIds, toggleAll, setTabBar }
