// 云函数：语音转文字（腾讯云一句话识别）。
// 客户端把录音上传到云存储后，传入 fileID；这里下载音频 → base64 → 调 ASR → 返回文字。
//
// 部署步骤：
//   1. 开通腾讯云「语音识别 ASR」服务；
//   2. 在云函数配置里加环境变量 TENCENT_SECRET_ID / TENCENT_SECRET_KEY（建议用子账号，只授权 ASR）；
//   3. 右键本目录「上传并部署：云端安装依赖」。
const cloud = require('wx-server-sdk')
const tencentcloud = require('tencentcloud-sdk-nodejs-asr')
const AsrClient = tencentcloud.asr.v20190614.Client

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async event => {
  const { fileID } = event || {}
  if (!fileID) return { text: '' }

  const secretId = process.env.TENCENT_SECRET_ID
  const secretKey = process.env.TENCENT_SECRET_KEY
  if (!secretId || !secretKey) return { text: '' }

  let buf
  try {
    const dl = await cloud.downloadFile({ fileID })
    buf = dl.fileContent
  } catch (e) {
    return { text: '' }
  }
  if (!buf || !buf.length) return { text: '' }

  const client = new AsrClient({
    credential: { secretId, secretKey },
    region: 'ap-guangzhou',
    profile: { httpProfile: { endpoint: 'asr.tencentcloudapi.com' } }
  })

  try {
    const resp = await client.SentenceRecognition({
      ProjectId: 0,
      SubServiceType: 2, // 一句话识别
      EngSerViceType: '16k_zh', // 16kHz 中文普通话
      SourceType: 1, // 1 = 直接传音频数据
      VoiceFormat: 'mp3',
      UsrAudioKey: String(Date.now()),
      Data: buf.toString('base64'),
      DataLen: buf.length
    })
    return { text: (resp && resp.Result) || '' }
  } catch (e) {
    return { text: '' }
  }
}
