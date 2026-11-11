// 云开发环境 ID。正式版写死，留空则使用当前开发者工具选中的环境（DYNAMIC_CURRENT_ENV）。
// USE_CLOUD：false 为原型阶段的本地模式（数据存本机，见 utils/localCloud.js），不需要开通云开发；
// 改成 true 即切回云数据库 + 云存储。切到云端后首次启动会把本机的本地模式数据搬上云（utils/migrate.js）。
// MOCK_DATA：本地模式下首次启动写入一柜演示茶和冲泡记录（utils/mock.js），云端模式下不生效。
module.exports = {
  ENV_ID: 'cloud1-d8g1uyjpxfd6dbd7f',
  USE_CLOUD: true,
  MOCK_DATA: false
}
