// 泡茶配乐：宫商角徵羽五调各一首古琴风小品，计时中循环播放。
// 曲子由 design/gen_music.py 用程序合成，是原创旋律，不是对某首传世古曲的演奏，可放心随包发布。
// 想换成正版录音的古曲（如《流水》《平沙落雁》），把 src 改成云存储 fileID 或 https 地址即可。
const TRACKS = [
  { id: 'gong', name: '松风', mode: '宫调', mood: '平和舒缓', src: '/assets/music/gong.m4a' },
  { id: 'shang', name: '秋水', mode: '商调', mood: '清朗疏淡', src: '/assets/music/shang.m4a' },
  { id: 'jue', name: '春山', mode: '角调', mood: '清新明快', src: '/assets/music/jue.m4a' },
  { id: 'zhi', name: '暖阳', mode: '徵调', mood: '明亮温暖', src: '/assets/music/zhi.m4a' },
  { id: 'yu', name: '夜泊', mode: '羽调', mood: '幽静深远', src: '/assets/music/yu.m4a' }
]

// 茶类 → 默认曲目：清新的茶配角调，岩茶配松风，熟普配夜泊……只是默认，可随时换
const BY_CATEGORY = {
  lvcha: 'jue',
  huangcha: 'jue',
  baicha: 'shang',
  hongcha: 'zhi',
  yancha: 'gong',
  dancong: 'zhi',
  heicha: 'yu',
  shengpu: 'gong',
  shupu: 'yu'
}

function getTrack(id) {
  return TRACKS.find(t => t.id === id) || null
}

function defaultTrack(category) {
  return getTrack(BY_CATEGORY[category] || 'gong')
}

module.exports = { TRACKS, getTrack, defaultTrack }
