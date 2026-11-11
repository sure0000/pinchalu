const { ENV_ID, USE_CLOUD, MOCK_DATA } = require('./config/env')
const db = require('./utils/db')
const migrate = require('./utils/migrate')

App({
  globalData: {
    // tea-edit（计时页内新建茶）写入，timer 页 onShow 时消费
    selectedTeaId: '',
    // 本机数据搬上云进行中（utils/migrate.js），首页等它结束再加载
    migrating: null
  },

  onLaunch() {
    if (USE_CLOUD) {
      wx.cloud.init({
        env: ENV_ID || wx.cloud.DYNAMIC_CURRENT_ENV,
        traceUser: false
      })
      if (migrate.needed()) {
        this.globalData.migrating = migrate.run().then(ok => {
          this.globalData.migrating = null
          return ok
        })
      }
    } else if (MOCK_DATA) {
      require('./utils/mock').seed()
    }
    Promise.resolve(this.globalData.migrating).then(() => db.flushQueue())
  }
})
