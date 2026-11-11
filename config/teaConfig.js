// 茶类默认冲泡参数（PRD 初始建议值），后续按需调整。
// code 与 teas.category / brews.category 一一对应。
// family：所属六大茶类（lv 绿 / bai 白 / huang 黄 / qing 青 / hong 红 / hei 黑），供时令推荐用（见 utils/chadao.js）。
// 生普的归类有争议（晒青毛茶近绿茶，传统上随普洱归黑茶），这里按传统归黑茶。
// cls：茶柜“品类”分组用的类（六大茶类 + 普洱），不填即同 family；普洱（生普、熟普）单列。
const CATEGORIES = [
  { code: 'lvcha', name: '绿茶', family: 'lv', leafG: 4, waterMl: 150, tempC: 85, firstSec: 30, stepSec: 10 },
  { code: 'baicha', name: '白茶', family: 'bai', leafG: 5, waterMl: 120, tempC: 90, firstSec: 20, stepSec: 10 },
  { code: 'huangcha', name: '黄茶', family: 'huang', leafG: 4, waterMl: 150, tempC: 85, firstSec: 30, stepSec: 10 },
  { code: 'hongcha', name: '红茶', family: 'hong', leafG: 5, waterMl: 120, tempC: 90, firstSec: 15, stepSec: 5 },
  { code: 'yancha', name: '岩茶', family: 'qing', leafG: 8, waterMl: 110, tempC: 100, firstSec: 10, stepSec: 5 },
  { code: 'dancong', name: '单丛', family: 'qing', leafG: 7, waterMl: 110, tempC: 100, firstSec: 8, stepSec: 5 },
  { code: 'heicha', name: '黑茶', family: 'hei', leafG: 7, waterMl: 110, tempC: 100, firstSec: 10, stepSec: 5 },
  { code: 'shengpu', name: '生普', family: 'hei', cls: 'puer', leafG: 7, waterMl: 110, tempC: 100, firstSec: 10, stepSec: 5 },
  { code: 'shupu', name: '熟普', family: 'hei', cls: 'puer', leafG: 7, waterMl: 110, tempC: 100, firstSec: 10, stepSec: 5 }
]

// 茶柜“品类”：六大茶类 + 普洱。cat 为点灰格“缺”新建时预选的茶类
const CLASSES = [
  { code: 'lv', name: '绿茶', cat: 'lvcha' },
  { code: 'bai', name: '白茶', cat: 'baicha' },
  { code: 'huang', name: '黄茶', cat: 'huangcha' },
  { code: 'qing', name: '青茶', cat: 'yancha' },
  { code: 'hong', name: '红茶', cat: 'hongcha' },
  { code: 'hei', name: '黑茶', cat: 'heicha' },
  { code: 'puer', name: '普洱', cat: 'shengpu' }
]

const classOf = code => {
  const c = getCategory(code)
  return CLASSES.find(x => x.code === (c.cls || c.family)) || null
}

function getCategory(code) {
  return CATEGORIES.find(c => c.code === code) || { code, name: '未知茶类', family: '', leafG: 5, waterMl: 120, tempC: 95, firstSec: 15, stepSec: 5 }
}

// 茶的来源方式（teas.sourceType），sourceName 的标签和提示语随之变化；茶柜“商家”分组按 sourceName
const SOURCE_TYPES = [
  { code: 'buy', name: '自购', label: '商家', hint: '店铺 / 卖家，如：武夷山某茶厂' },
  { code: 'gift', name: '茶友赠', label: '赠送人', hint: '谁送的，如：老王' },
  { code: 'event', name: '茶会 / 活动', label: '活动', hint: '活动名，如：秋季茶博会' },
  { code: 'other', name: '其他', label: '出处', hint: '说明一下来源' }
]

function getSourceType(code) {
  return SOURCE_TYPES.find(s => s.code === code) || null
}

module.exports = { CATEGORIES, getCategory, CLASSES, classOf, SOURCE_TYPES, getSourceType }
