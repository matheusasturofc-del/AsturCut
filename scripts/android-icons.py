# Gera os ícones e a tela de abertura do app Android a partir de build/icon.png
# uso: python3 scripts/android-icons.py
import os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
src = Image.open(os.path.join(ROOT, 'build', 'icon.png')).convert('RGBA')
BG = (20, 20, 22, 255)

def gradient(size):
    w, h = size
    g = Image.new('RGBA', size)
    px = g.load()
    a, b = (28, 207, 220), (91, 43, 255)
    for y in range(h):
        for x in range(w):
            t = (x / max(1, w - 1) + y / max(1, h - 1)) / 2
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,)
    return g

# só o desenho branco do logo (o "A" e os traços)
mark = Image.new('RGBA', src.size, (0, 0, 0, 0))
sp, mp = src.load(), mark.load()
for y in range(src.height):
    for x in range(src.width):
        r, g, b, al = sp[x, y]
        m = min(r, g, b)
        if m > 150 and al > 0:
            mp[x, y] = (255, 255, 255, min(255, int((m - 150) / 105 * 255 * al / 255)))
mark = mark.crop(mark.getbbox())

DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for d, k in DENS.items():
    folder = os.path.join(RES, 'mipmap-' + d)
    os.makedirs(folder, exist_ok=True)
    # ícone adaptável: fundo em degradê + logo branco dentro da área segura
    fg_size = int(108 * k)
    fg = Image.new('RGBA', (fg_size, fg_size), (0, 0, 0, 0))
    target = int(54 * k)
    m = mark.copy(); m.thumbnail((target, target), Image.LANCZOS)
    fg.alpha_composite(m, ((fg_size - m.width) // 2 + int(2 * k), (fg_size - m.height) // 2))
    fg.save(os.path.join(folder, 'ic_launcher_foreground.png'))
    gradient((fg_size, fg_size)).save(os.path.join(folder, 'ic_launcher_background.png'))
    # ícones antigos (Android 7)
    s = int(48 * k)
    src.resize((s, s), Image.LANCZOS).save(os.path.join(folder, 'ic_launcher.png'))
    rnd = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    mask = Image.new('L', (s, s), 0); ImageDraw.Draw(mask).ellipse((0, 0, s - 1, s - 1), fill=255)
    full = gradient((s, s)); mm = mark.copy(); mm.thumbnail((int(s * .55), int(s * .55)), Image.LANCZOS)
    full.alpha_composite(mm, ((s - mm.width) // 2, (s - mm.height) // 2))
    rnd.paste(full, (0, 0), mask)
    rnd.save(os.path.join(folder, 'ic_launcher_round.png'))

# telas de abertura: fundo escuro com o ícone no centro
for root, dirs, files in os.walk(RES):
    for f in files:
        if f == 'splash.png':
            p = os.path.join(root, f)
            w, h = Image.open(p).size
            img = Image.new('RGBA', (w, h), BG)
            s = int(min(w, h) * 0.22)
            ic = src.resize((s, s), Image.LANCZOS)
            img.alpha_composite(ic, ((w - s) // 2, (h - s) // 2))
            img.convert('RGB').save(p, optimize=True)
print('ok')
