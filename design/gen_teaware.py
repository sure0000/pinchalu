"""生成计时页的茶具搭配样品插画（SVG），输出到 assets/teaware/。

用法：python3 design/gen_teaware.py
只用基础图形（path / ellipse / rect），小程序 image 组件可直接显示。
"""
import os

W, H = 600, 360
BASE = 282  # 茶盘上沿，器物底部落在这条线上
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'teaware')

INK = '#5b4a3a'
LINE = 'stroke-linejoin="round" stroke-linecap="round"'


def f(v):
    return ('%.1f' % v).rstrip('0').rstrip('.')


def P(d, fill, stroke=INK, sw=2.2, extra=''):
    return '<path d="%s" fill="%s" stroke="%s" stroke-width="%s" %s %s/>' % (d, fill, stroke, sw, LINE, extra)


def E(cx, cy, rx, ry, fill, stroke=INK, sw=2.2, extra=''):
    return '<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" stroke="%s" stroke-width="%s" %s/>' % (
        f(cx), f(cy), f(rx), f(ry), fill, stroke, sw, extra)


def frame(body, tray='#7a5a42', tray_top='#93725a'):
    return '\n'.join([
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (W, H, W, H),
        '<rect width="%d" height="%d" rx="28" fill="#f3ecdf"/>' % (W, H),
        # 远山淡影
        '<path d="M0 210 Q90 150 170 190 T330 170 T480 185 T600 160 L600 360 L0 360 Z" fill="#e9e0cf"/>',
        # 茶盘
        '<rect x="34" y="%d" width="532" height="26" rx="10" fill="%s"/>' % (BASE, tray),
        '<rect x="34" y="%d" width="532" height="7" rx="3.5" fill="%s"/>' % (BASE, tray_top),
        '<rect x="60" y="%d" width="480" height="10" rx="5" fill="#5e4532" opacity="0.5"/>' % (BASE + 30),
        body,
        '</svg>'
    ])


def steam(cx, top, s=1.0):
    out = []
    for dx, h in ((-14, 46), (2, 60), (18, 42)):
        x = cx + dx * s
        d = 'M%s %s q-8 -%s 0 -%s t0 -%s' % (f(x), f(top), f(h * s / 4), f(h * s / 2), f(h * s / 2))
        out.append('<path d="%s" fill="none" stroke="#b8ab95" stroke-width="2.4" opacity="0.7" %s/>' % (d, LINE))
    return ''.join(out)


def gaiwan(cx, by, s=1.0, body='#fbfaf5', band='#6f8f86'):
    top = by - 92 * s
    o = [E(cx, by - 5 * s, 74 * s, 11 * s, body)]  # 托
    bowl = 'M%s %s Q%s %s %s %s L%s %s Q%s %s %s %s Z' % (
        f(cx - 64 * s), f(top), f(cx - 60 * s), f(by - 22 * s), f(cx - 24 * s), f(by - 12 * s),
        f(cx + 24 * s), f(by - 12 * s), f(cx + 60 * s), f(by - 22 * s), f(cx + 64 * s), f(top))
    o.append(P(bowl, body))
    o.append(P('M%s %s Q%s %s %s %s' % (f(cx - 60 * s), f(top + 22 * s), f(cx), f(top + 34 * s), f(cx + 60 * s), f(top + 22 * s)),
               'none', band, 2.6))
    o.append(E(cx, top, 64 * s, 9 * s, body))
    o.append(P('M%s %s Q%s %s %s %s Z' % (f(cx - 56 * s), f(top + 1), f(cx), f(top - 46 * s), f(cx + 56 * s), f(top + 1)), body))
    o.append(P('M%s %s Q%s %s %s %s' % (f(cx - 38 * s), f(top - 12 * s), f(cx), f(top - 30 * s), f(cx + 38 * s), f(top - 12 * s)),
               'none', band, 2.2))
    o.append(E(cx, top - 36 * s, 14 * s, 5 * s, body))
    o.append('<rect x="%s" y="%s" width="%s" height="%s" rx="3" fill="%s" stroke="%s" stroke-width="2.2"/>' % (
        f(cx - 10 * s), f(top - 46 * s), f(20 * s), f(10 * s), body, INK))
    return ''.join(o), top - 46 * s


def glass_cup(cx, by, s=1.0, liquor='#d7e3a2', leaf='#7d9c4c'):
    h, wt, wb = 172 * s, 40 * s, 32 * s
    top = by - h
    o = []
    liquid_top = top + 30 * s
    o.append(P('M%s %s L%s %s L%s %s L%s %s Z' % (f(cx - wt + 3), f(liquid_top), f(cx - wb + 3), f(by - 4), f(cx + wb - 3), f(by - 4),
                                                 f(cx + wt - 3), f(liquid_top)), liquor, 'none', 0, 'opacity="0.75"'))
    # 立在水中的芽叶
    for i, (dx, dy, rot) in enumerate(((-14, 40, -8), (6, 62, 10), (-4, 92, -4), (14, 112, 14), (-16, 128, -16), (2, 30, 4))):
        o.append('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" transform="rotate(%s %s %s)" opacity="0.9"/>' % (
            f(cx + dx * s), f(liquid_top + dy * s), f(3.6 * s), f(13 * s), leaf, rot, f(cx + dx * s), f(liquid_top + dy * s)))
    o.append(P('M%s %s L%s %s L%s %s L%s %s Z' % (f(cx - wt), f(top), f(cx - wb), f(by), f(cx + wb), f(by), f(cx + wt), f(top)),
               '#ffffff', '#9fb0ab', 2.4, 'fill-opacity="0.25"'))
    o.append(E(cx, liquid_top, wt - 3, 5 * s, liquor, '#a9b78a', 1.4, 'opacity="0.9"'))
    o.append(E(cx, top, wt, 6 * s, 'none', '#9fb0ab', 2.4))
    o.append(P('M%s %s L%s %s' % (f(cx - wt + 10 * s), f(top + 16 * s), f(cx - wb + 9 * s), f(by - 18 * s)), 'none', '#ffffff', 4, 'opacity="0.8"'))
    return ''.join(o), top


def pitcher(cx, by, s=1.0, liquor='#e0b366'):
    h, w = 100 * s, 36 * s
    top = by - h
    lt = top + 36 * s
    o = [P('M%s %s L%s %s Q%s %s %s %s L%s %s Q%s %s %s %s L%s %s Z' % (
        f(cx - w + 2), f(lt), f(cx - w + 2), f(by - 10 * s), f(cx - w + 2), f(by - 2), f(cx - w + 12 * s), f(by - 2),
        f(cx + w - 12 * s), f(by - 2), f(cx + w - 2), f(by - 2), f(cx + w - 2), f(by - 10 * s), f(cx + w - 2), f(lt)),
        liquor, 'none', 0, 'opacity="0.8"')]
    body = 'M%s %s L%s %s L%s %s Q%s %s %s %s L%s %s Q%s %s %s %s L%s %s Z' % (
        f(cx - w - 14 * s), f(top - 4 * s), f(cx - w), f(top + 14 * s), f(cx - w), f(by - 10 * s), f(cx - w), f(by), f(cx - w + 12 * s), f(by),
        f(cx + w - 12 * s), f(by), f(cx + w), f(by), f(cx + w), f(by - 10 * s), f(cx + w), f(top))
    o.append(P(body, '#ffffff', '#9fb0ab', 2.4, 'fill-opacity="0.28"'))
    o.append(P('M%s %s Q%s %s %s %s' % (f(cx + w), f(top + 16 * s), f(cx + w + 26 * s), f(top + 34 * s), f(cx + w), f(top + 66 * s)),
               'none', '#9fb0ab', 4))
    o.append(E(cx, lt, w - 2, 4 * s, liquor, '#c69a52', 1.2))
    o.append(P('M%s %s L%s %s' % (f(cx - w + 9 * s), f(top + 22 * s), f(cx - w + 9 * s), f(by - 14 * s)), 'none', '#ffffff', 4, 'opacity="0.8"'))
    return ''.join(o), top


def cup(cx, by, s=1.0, body='#fbfaf5', liquor='#e0b366', band=None):
    top = by - 34 * s
    o = [P('M%s %s Q%s %s %s %s L%s %s Q%s %s %s %s Z' % (
        f(cx - 27 * s), f(top), f(cx - 24 * s), f(by - 6 * s), f(cx - 11 * s), f(by),
        f(cx + 11 * s), f(by), f(cx + 24 * s), f(by - 6 * s), f(cx + 27 * s), f(top)), body)]
    if band:
        o.append(P('M%s %s Q%s %s %s %s' % (f(cx - 24 * s), f(top + 11 * s), f(cx), f(top + 16 * s), f(cx + 24 * s), f(top + 11 * s)),
                   'none', band, 2))
    o.append(E(cx, top, 27 * s, 5.5 * s, body))
    o.append(E(cx, top + 1.5 * s, 22 * s, 3.8 * s, liquor, 'none', 0))
    return ''.join(o)


def teapot(cx, by, s=1.0, body='#8a5a3e', light='#a97556', dark='#5f3b27'):
    h, w = 92 * s, 78 * s
    top = by - h
    o = []
    # 壶嘴
    o.append(P('M%s %s Q%s %s %s %s L%s %s Q%s %s %s %s Z' % (
        f(cx - w + 8 * s), f(by - 50 * s), f(cx - w - 30 * s), f(by - 52 * s), f(cx - w - 40 * s), f(top + 6 * s),
        f(cx - w - 28 * s), f(top + 2 * s), f(cx - w - 18 * s), f(by - 40 * s), f(cx - w + 10 * s), f(by - 26 * s)), body))
    # 把
    o.append(P('M%s %s C%s %s %s %s %s %s' % (f(cx + w - 10 * s), f(top + 22 * s), f(cx + w + 46 * s), f(top + 10 * s),
                                             f(cx + w + 46 * s), f(by - 18 * s), f(cx + w - 8 * s), f(by - 22 * s)), 'none', dark, 9 * s))
    o.append(P('M%s %s C%s %s %s %s %s %s' % (f(cx + w - 10 * s), f(top + 22 * s), f(cx + w + 46 * s), f(top + 10 * s),
                                             f(cx + w + 46 * s), f(by - 18 * s), f(cx + w - 8 * s), f(by - 22 * s)), 'none', body, 5 * s))
    # 壶身
    o.append(P('M%s %s Q%s %s %s %s Q%s %s %s %s Q%s %s %s %s Q%s %s %s %s Z' % (
        f(cx - w * 0.62), f(top + 10 * s), f(cx - w - 6 * s), f(top + 18 * s), f(cx - w), f(by - 40 * s),
        f(cx - w + 6 * s), f(by - 2), f(cx), f(by - 2), f(cx + w - 6 * s), f(by - 2), f(cx + w), f(by - 40 * s),
        f(cx + w + 6 * s), f(top + 18 * s), f(cx + w * 0.62), f(top + 10 * s)), body))
    o.append(P('M%s %s Q%s %s %s %s' % (f(cx - w * 0.7), f(top + 30 * s), f(cx - w * 0.82), f(by - 40 * s), f(cx - w * 0.6), f(by - 18 * s)),
               'none', light, 5 * s, 'opacity="0.8"'))
    # 盖与钮
    o.append(E(cx, top + 10 * s, w * 0.62, 9 * s, body))
    o.append(P('M%s %s Q%s %s %s %s Z' % (f(cx - w * 0.46), f(top + 9 * s), f(cx), f(top - 16 * s), f(cx + w * 0.46), f(top + 9 * s)), body))
    o.append(E(cx, top - 12 * s, 10 * s, 7 * s, body))
    return ''.join(o), top - 18 * s


def boat(cx, by, s=1.0, body='#d8cfbe'):
    # 茶船：承壶的浅盘
    return P('M%s %s Q%s %s %s %s L%s %s Q%s %s %s %s Z' % (
        f(cx - 110 * s), f(by - 30 * s), f(cx - 104 * s), f(by), f(cx - 70 * s), f(by),
        f(cx + 70 * s), f(by), f(cx + 104 * s), f(by), f(cx + 110 * s), f(by - 30 * s)), body) + E(cx, by - 30 * s, 110 * s, 12 * s, '#e9e2d4')


def round_tray(cx, by, s=1.0):
    return E(cx, by - 6 * s, 96 * s, 20 * s, '#d8cfbe') + E(cx, by - 10 * s, 88 * s, 16 * s, '#e9e2d4', INK, 1.4)


def canister(cx, by, s=1.0, body='#4f6f5a'):
    top = by - 92 * s
    o = ['<rect x="%s" y="%s" width="%s" height="%s" rx="8" fill="%s" stroke="%s" stroke-width="2.2"/>' % (
        f(cx - 36 * s), f(top + 18 * s), f(72 * s), f(92 * s - 18 * s), body, INK)]
    o.append('<rect x="%s" y="%s" width="%s" height="%s" rx="6" fill="#c9a43c" stroke="%s" stroke-width="2.2"/>' % (
        f(cx - 39 * s), f(top), f(78 * s), f(24 * s), INK))
    o.append('<rect x="%s" y="%s" width="%s" height="%s" rx="4" fill="#f3ecdf" opacity="0.9"/>' % (
        f(cx - 18 * s), f(top + 40 * s), f(36 * s), f(36 * s)))
    # 标签上画一片茶叶（不用 text，避免 image 组件里字体缺失）
    o.append(P('M%s %s Q%s %s %s %s Q%s %s %s %s Z' % (f(cx - 10 * s), f(top + 68 * s), f(cx - 10 * s), f(top + 46 * s), f(cx + 10 * s), f(top + 46 * s),
                                                    f(cx + 10 * s), f(top + 68 * s), f(cx - 10 * s), f(top + 68 * s)), '#6b8f4e', INK, 1.4))
    o.append(P('M%s %s L%s %s' % (f(cx - 8 * s), f(top + 66 * s), f(cx + 7 * s), f(top + 49 * s)), 'none', INK, 1.2))
    return ''.join(o)


def scoop(cx, by, s=1.0):
    return P('M%s %s Q%s %s %s %s L%s %s Q%s %s %s %s Z' % (
        f(cx - 50 * s), f(by - 6 * s), f(cx - 46 * s), f(by - 18 * s), f(cx - 20 * s), f(by - 16 * s),
        f(cx + 48 * s), f(by - 10 * s), f(cx + 52 * s), f(by - 2), f(cx + 40 * s), f(by - 2)), '#b48a5c')


def stove_kettle(cx, by, s=1.0):
    o = []
    st = by - 70 * s
    # 炉
    o.append(P('M%s %s L%s %s L%s %s L%s %s Z' % (f(cx - 56 * s), f(st), f(cx - 66 * s), f(by), f(cx + 66 * s), f(by), f(cx + 56 * s), f(st)), '#a07a5c'))
    o.append(P('M%s %s Q%s %s %s %s Z' % (f(cx - 22 * s), f(by - 8 * s), f(cx), f(by - 54 * s), f(cx + 22 * s), f(by - 8 * s)), '#3d2b20'))
    o.append(P('M%s %s Q%s %s %s %s Q%s %s %s %s Z' % (f(cx - 12 * s), f(by - 10 * s), f(cx - 10 * s), f(by - 30 * s), f(cx), f(by - 40 * s),
                                                    f(cx + 12 * s), f(by - 26 * s), f(cx + 12 * s), f(by - 10 * s)), '#e8833a', '#c25a24', 1.6))
    o.append(E(cx, st, 58 * s, 8 * s, '#8a6650'))
    # 陶壶
    pot, top = teapot(cx, st - 2, 0.82 * s, body='#6e5848', light='#8d7563', dark='#4a3a2f')
    o.append(pot)
    # 提梁
    o.append(P('M%s %s Q%s %s %s %s' % (f(cx - 40 * s), f(top + 30 * s), f(cx), f(top - 50 * s), f(cx + 40 * s), f(top + 30 * s)),
               'none', '#3d2b20', 4))
    return ''.join(o), top - 20 * s


def save(name, svg):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name + '.svg'), 'w') as fh:
        fh.write(svg)


def main():
    # 玻璃杯直泡（绿茶 / 黄茶）
    a, t = glass_cup(200, BASE)
    b, _ = glass_cup(300, BASE, 0.86, liquor='#e4e6a8', leaf='#93a95a')
    save('glass', frame(a + b + steam(200, t - 8) + canister(430, BASE) + scoop(520, BASE, 0.8)))

    # 白瓷盖碗
    g, t = gaiwan(165, BASE)
    p, _ = pitcher(320, BASE)
    cups = ''.join(cup(x, BASE, 1, band='#6f8f86') for x in (420, 482, 544))
    save('gaiwan', frame(g + steam(165, t - 6) + p + cups))

    # 紫砂壶
    g, t = teapot(165, BASE)
    p, _ = pitcher(332, BASE, liquor='#b9733c')
    cups = ''.join(cup(x, BASE, 1, body='#a9c5b0', liquor='#a8642e') for x in (424, 486, 548))
    save('zisha', frame(g + steam(165, t - 4) + p + cups))

    # 朱泥小壶 · 功夫茶
    g, t = teapot(140, BASE - 8, 0.78, body='#b0503a', light='#cf7458', dark='#7e3424')
    p, _ = pitcher(310, BASE, 0.9, liquor='#d29a4a')
    tray = round_tray(470, BASE)
    ruo = cup(438, BASE - 14, 0.72, liquor='#d29a4a') + cup(502, BASE - 14, 0.72, liquor='#d29a4a') + cup(470, BASE - 2, 0.72, liquor='#d29a4a')
    save('zhuni', frame(boat(140, BASE) + g + steam(140, t - 4, 0.8) + p + tray + ruo))

    # 围炉煮茶
    k, t = stove_kettle(135, BASE)
    p, _ = pitcher(300, BASE, liquor='#b9733c')
    cups = ''.join(cup(x, BASE, 1.05, body='#8a6a52', liquor='#9c4a24') for x in (400, 460, 520))
    save('boil', frame(k + steam(135, t) + p + cups))


if __name__ == '__main__':
    main()
