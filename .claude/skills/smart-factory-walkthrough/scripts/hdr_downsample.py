"""Downsample a Radiance .hdr (RLE RGBE) 2x and write a flat (uncompressed) RGBE file three.js RGBELoader can read.
Usage: python3 -I hdr_downsample.py in_1k.hdr out.hdr"""
import sys, numpy as np
src, dst = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
i = b.index(b'\n\n') + 2; j = b.index(b'\n', i); d = b[i:j].decode().split(); H, W = int(d[1]), int(d[3]); p = j + 1
img = np.zeros((H, W, 4), np.uint8)
for y in range(H):
    assert b[p] == 2 and b[p + 1] == 2, 'expects new-style RLE scanlines'; p += 4
    for c in range(4):
        x = 0
        while x < W:
            n = b[p]; p += 1
            if n > 128: n -= 128; img[y, x:x + n, c] = b[p]; p += 1
            else: img[y, x:x + n, c] = np.frombuffer(b[p:p + n], np.uint8); p += n
            x += n
f = np.where(img[..., 3:4] > 0, np.ldexp(1.0, img[..., 3:4].astype(int) - 136), 0)
rgb = (img[..., :3].astype(np.float32) * f).reshape(H // 2, 2, W // 2, 2, 3).mean(axis=(1, 3))
m = rgb.max(axis=2); mant, e = np.frexp(m)
sc = np.where(m > 1e-32, mant * 256.0 / np.maximum(m, 1e-32), 0)
out = np.zeros((H // 2, W // 2, 4), np.uint8)
out[..., :3] = np.clip(rgb * sc[..., None], 0, 255).astype(np.uint8); out[..., 3] = np.where(m > 1e-32, e + 128, 0)
# a flat scanline must not start with bytes 2,2,<128 (RGBELoader would treat it as RLE)
bad = (out[:, 0, 0] == 2) & (out[:, 0, 1] == 2) & (out[:, 0, 2] < 128); out[bad, 0, 0] = 3
open(dst, 'wb').write(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n' + f'-Y {H // 2} +X {W // 2}\n'.encode() + out.tobytes())
print(f'{W}x{H} -> {W // 2}x{H // 2}')
