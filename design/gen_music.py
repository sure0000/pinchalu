"""合成计时页配乐：宫商角徵羽五调各一首古琴风小品（原创旋律，40–60 秒，可循环），输出 assets/music/*.m4a。

用法：python3 design/gen_music.py   （需要 numpy 和 ffmpeg）
音色是加法合成的近似：按音带吟猱、走手音（不重新拨弦的滑音），泛音用钟声般的纯音，末尾散音收束，再加一点混响。
旋律按五声调式随机生成，固定随机种子，每次生成结果一致。
"""
import os
import subprocess
import tempfile
import wave

import numpy as np

SR = 22050
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'music')
GONG = 53  # 宫音 = F3（MIDI 53），近古琴正调
STEPS = [0, 2, 4, 7, 9]  # 宫 商 角 徵 羽

# id, 调式主音（第几级）, 速度 bpm, 随机种子
TRACKS = [
    ('gong', 0, 56, 11),
    ('shang', 1, 60, 23),
    ('jue', 2, 66, 37),
    ('zhi', 3, 63, 41),
    ('yu', 4, 52, 59),
]


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12.0)


def scale(lo=41, hi=81):
    """F2..A5 范围内的五声音阶 MIDI 列表"""
    out = []
    for octave in range(-2, 4):
        for s in STEPS:
            m = GONG + 12 * octave + s
            if lo <= m <= hi:
                out.append(m)
    return sorted(out)


def pluck(freqs, dur, vel=1.0):
    """按音：freqs 为逐样本频率曲线（可含滑音），返回 dur 秒的波形"""
    n = len(freqs)
    t = np.arange(n) / SR
    phase = 2 * np.pi * np.cumsum(freqs) / SR
    f0 = freqs[0]
    tau = 2.2 * (220.0 / f0) ** 0.35  # 低音余韵更长
    y = np.zeros(n)
    for k, a in enumerate([1.0, 0.55, 0.32, 0.2, 0.12, 0.08, 0.05, 0.03], start=1):
        if f0 * k > SR / 2.2:
            break
        y += a * np.sin(k * phase * (1 + 0.0004 * (k - 1))) * np.exp(-t * (1 + 0.9 * (k - 1)) / tau)
    attack = np.minimum(1, t / 0.004)
    noise = np.random.randn(n) * np.exp(-t / 0.012) * 0.08
    noise = np.convolve(noise, np.ones(6) / 6, mode='same')
    return (y * attack + noise) * vel


def harmonic(f, dur, vel=0.6):
    """泛音：清亮如钟"""
    n = int(dur * SR)
    t = np.arange(n) / SR
    env = np.minimum(1, t / 0.003) * np.exp(-t / 1.4)
    return vel * env * (np.sin(2 * np.pi * f * t) + 0.18 * np.sin(4 * np.pi * f * t) + 0.05 * np.sin(6 * np.pi * f * t))


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def freq_curve(m_from, m_to, n, glide, vib, walk=None):
    """从 m_from 起音（若与 m_to 不同则先滑过去），之后按 vib 加吟猱；
    walk=(at秒, 目标音) 为走手音：不重新拨弦，在 at 时滑到目标音"""
    t = np.arange(n) / SR
    g = smooth(t / glide) if glide > 0 else np.ones(n)
    midi = m_from + (m_to - m_from) * g
    if walk:
        midi = midi + (walk[1] - m_to) * smooth((t - walk[0]) / 0.22)
    if vib:
        depth, rate = vib
        ramp = np.clip((t - 0.25) / 0.4, 0, 1) * np.exp(-np.maximum(0, t - 0.65) / 1.5)
        midi = midi + depth * ramp * np.sin(2 * np.pi * rate * t)
    return 440.0 * 2 ** ((midi - 69) / 12.0)


def melody(rng, notes, tonic_idx, phrases, start_idx, end_idxs, beats):
    """在 notes（音阶索引列表）上做小步随机游走，每句落在指定音上"""
    out = []
    cur = start_idx
    for p in range(phrases):
        length = int(rng.integers(5, 9))
        for i in range(length - 1):
            step = int(rng.choice([-3, -2, -1, 1, 2, 3], p=[0.05, 0.12, 0.33, 0.33, 0.12, 0.05]))
            cur = int(np.clip(cur + step, tonic_idx - 3, tonic_idx + 6))
            out.append((cur, float(rng.choice(beats))))
        end = end_idxs[p % len(end_idxs)]
        out.append((end, float(rng.choice([3, 4]))))
        cur = end
    return out


def render(track):
    name, mode, bpm, seed = track
    rng = np.random.default_rng(seed)
    np.random.seed(seed)
    notes = scale()
    beat = 60.0 / bpm
    # 主音在第三个八度附近
    tonic = GONG + STEPS[mode]
    while tonic < 55:
        tonic += 12
    ti = notes.index(tonic)
    total = 42.0
    buf = np.zeros(int((total + 30) * SR))

    def put(sig, at):
        i = int(at * SR)
        if i >= len(buf):
            return
        j = min(len(buf), i + len(sig))
        buf[i:j] += sig[: j - i]

    t = 0.6
    # 起：低音散音 + 主音
    put(pluck(np.full(int(5 * SR), hz(tonic - 12)), 5, 0.7), t)
    t += 2 * beat

    def play_line(line, t, octave=0, kind='press'):
        prev = None
        for idx, b in line:
            m = notes[min(len(notes) - 1, idx)] + octave
            d = b * beat
            if kind == 'harm':
                put(harmonic(hz(m), d + 2.5), t)
            else:
                n = int((d + 2.8) * SR)
                r = rng.random()
                if b >= 3 and r < 0.4:
                    # 长音走手：拨后在半拍处滑到下方邻音
                    i = notes.index(m - octave) if (m - octave) in notes else 1
                    fc = freq_curve(m, m, n, 0, None, (d * 0.45, notes[max(0, i - 1)] + octave))
                elif prev is not None and r < 0.22 and abs(prev - m) <= 5:
                    fc = freq_curve(prev, m, n, 0.16, None)  # 上 / 下滑入
                elif r < 0.55 and b >= 2:
                    fc = freq_curve(m, m, n, 0, (0.18 if r < 0.4 else 0.35, 4.5 if r < 0.4 else 2.6))  # 吟 / 猱
                else:
                    fc = freq_curve(m, m, n, 0, None)
                put(pluck(fc, d, 0.9 if b >= 2 else 0.75), t)
            prev = m
            t += d * (1 + rng.uniform(-0.06, 0.08))  # 散板的松紧
        return t

    a = melody(rng, notes, ti, 2, ti, [ti + 2, ti], [1, 1, 2, 1.5, 0.5])
    t = play_line(a, t)
    t += beat
    # 承：泛音段，高八度
    b = melody(rng, notes, ti, 1, ti + 2, [ti + 3], [1, 1, 1.5, 2])
    t = play_line(b, t, 12, 'harm')
    t += beat
    # 转合：再回按音，落在主音
    c = melody(rng, notes, ti, 2, ti + 3, [ti + 1, ti], [1, 2, 1, 0.5, 1.5])
    while t + sum(x[1] for x in c) * beat > total - 5 and len(c) > 6:
        c = c[1:]
    t = play_line(c, t)
    # 收：散音主音与五度
    put(pluck(np.full(int(5 * SR), hz(tonic - 12)), 5, 0.6), t)
    put(pluck(np.full(int(5 * SR), hz(tonic - 5)), 5, 0.45), t + 0.06)
    end = min(len(buf) / SR, t + 4.5)

    y = buf[: int(end * SR)]
    # 混响：指数衰减的噪声脉冲响应，FFT 卷积
    ir_n = int(1.8 * SR)
    ir_t = np.arange(ir_n) / SR
    ir = np.random.randn(ir_n) * np.exp(-ir_t / 0.45)
    ir = np.convolve(ir, np.ones(8) / 8, mode='same')
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(y) + ir_n)))
    wet = np.fft.irfft(np.fft.rfft(y, size) * np.fft.rfft(ir, size), size)[: len(y)]
    y = y + 0.28 * wet / (np.max(np.abs(wet)) + 1e-9) * np.max(np.abs(y))
    # 首尾淡入淡出，便于循环
    fade = int(1.5 * SR)
    y[-fade:] *= np.linspace(1, 0, fade)
    y[: int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))
    y = y / np.max(np.abs(y)) * 0.85
    return y


def write(name, y):
    os.makedirs(OUT, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as fh:
        path = fh.name
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((y * 32767).astype(np.int16).tobytes())
    dst = os.path.join(OUT, name + '.m4a')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-c:a', 'aac', '-b:a', '32k', '-ac', '1', dst], check=True)
    os.remove(path)
    return dst


def main():
    for tr in TRACKS:
        y = render(tr)
        print(tr[0], '%.1fs' % (len(y) / SR), write(tr[0], y))


if __name__ == '__main__':
    main()
