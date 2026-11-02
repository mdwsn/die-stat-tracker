"""Draws Dice Tracker's app icons (a die showing five) as PNG files.

Run:  python3 tools/make-icons.py      (writes into icons/)
Uses only Python's standard library, so there is nothing to install.
Every edge is supersampled 4x4 so curves come out smooth.
"""
import os, struct, zlib

INK = (9, 9, 11)          # matches --fg in app.css
PIP = (250, 250, 250)
PIPS = [(0.28, 0.28), (0.72, 0.28), (0.5, 0.5), (0.28, 0.72), (0.72, 0.72)]
PIP_R = 0.085
SS = 4                    # samples per pixel, per axis


def png(path, size, pixels):
    raw = b''.join(b'\x00' + bytes(pixels[y * size * 4:(y + 1) * size * 4]) for y in range(size))
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(raw, 9)))
        f.write(chunk(b'IEND', b''))


def inside_rounded(x, y, radius):
    # unit square with rounded corners
    cx = min(max(x, radius), 1 - radius)
    cy = min(max(y, radius), 1 - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def draw(size, corner, face):
    """corner: corner radius of the tile (0 = full square).
       face:   share of the tile the five pips are laid out in (1 = whole tile)."""
    px = bytearray(size * size * 4)
    pips = [(0.5 + (x - 0.5) * face, 0.5 + (y - 0.5) * face) for x, y in PIPS]
    r2 = (PIP_R * face) ** 2
    for j in range(size):
        for i in range(size):
            tile = pip = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = (i + (sx + 0.5) / SS) / size
                    y = (j + (sy + 0.5) / SS) / size
                    if corner == 0 or inside_rounded(x, y, corner):
                        tile += 1
                        if any((x - a) ** 2 + (y - b) ** 2 <= r2 for a, b in pips):
                            pip += 1
            n = SS * SS
            if tile:
                t = pip / tile
                o = (j * size + i) * 4
                for c in range(3):
                    px[o + c] = round(INK[c] * (1 - t) + PIP[c] * t)
                px[o + 3] = round(255 * tile / n)
    return px


def main():
    out = os.path.join(os.path.dirname(__file__), '..', 'icons')
    os.makedirs(out, exist_ok=True)
    jobs = [
        ('icon-192.png', 192, 0.22, 1.0),           # installed-app icon
        ('icon-512.png', 512, 0.22, 1.0),
        ('icon-maskable-512.png', 512, 0, 0.72),     # Android crops these; keep pips in the safe middle
        ('apple-touch-icon.png', 180, 0, 1.0),       # iPhone home screen; iOS rounds the corners itself
        ('favicon-32.png', 32, 0.22, 1.0),           # browser tab
    ]
    for name, size, corner, face in jobs:
        png(os.path.join(out, name), size, draw(size, corner, face))
        print('wrote icons/' + name)


if __name__ == '__main__':
    main()
