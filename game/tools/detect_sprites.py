"""Find sprites on magenta-background sheets and write numbered debug previews.

Usage: python detect_sprites.py
Output: game/tools/out/<sheet>.components.json and <sheet>.debug.png
"""
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SHEETS_DIR = ROOT / "generated" / "sprites"
OUT_DIR = Path(__file__).resolve().parent / "out"

MIN_AREA = 40
MERGE_RADIUS = 6


def background_mask(rgb: np.ndarray) -> np.ndarray:
    corners = np.concatenate([
        rgb[:8, :8].reshape(-1, 3), rgb[:8, -8:].reshape(-1, 3),
        rgb[-8:, :8].reshape(-1, 3), rgb[-8:, -8:].reshape(-1, 3),
    ])
    bg = np.median(corners, axis=0)
    dist = np.sqrt(((rgb.astype(np.float32) - bg) ** 2).sum(axis=2))
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    magenta_like = (r - g > 110) & (b - g > 60) & (g < 90)
    return (dist < 70) | magenta_like


def dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(radius):
        grown = out.copy()
        grown[1:] |= out[:-1]
        grown[:-1] |= out[1:]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def label(mask: np.ndarray):
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    boxes = []
    current = 0
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if labels[y0, x0]:
            continue
        current += 1
        q = deque([(y0, x0)])
        labels[y0, x0] = current
        minx = maxx = x0
        miny = maxy = y0
        while q:
            y, x = q.popleft()
            minx, maxx = min(minx, x), max(maxx, x)
            miny, maxy = min(miny, y), max(maxy, y)
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = current
                    q.append((ny, nx))
        boxes.append((current, int(minx), int(miny), int(maxx), int(maxy)))
    return labels, boxes


def components(sheet: Path):
    """Return (rgb, foreground mask, label map, sorted component list)."""
    rgb = np.asarray(Image.open(sheet).convert("RGB"))
    fg = ~background_mask(rgb)
    labels, boxes = label(dilate(fg, MERGE_RADIUS))

    comps = []
    for lab, x0, y0, x1, y1 in boxes:
        area = int(fg[y0:y1 + 1, x0:x1 + 1].sum())
        if area < MIN_AREA:
            continue
        comps.append({"label": lab, "x": x0, "y": y0, "w": x1 - x0 + 1, "h": y1 - y0 + 1, "area": area})

    comps.sort(key=lambda c: (round((c["y"] + c["h"] / 2) / 40), c["x"]))
    for i, c in enumerate(comps):
        c["id"] = i
    return rgb, fg, labels, comps


def process(sheet: Path):
    rgb, _, _, comps = components(sheet)
    debug = Image.fromarray(rgb)
    draw = ImageDraw.Draw(debug)
    for c in comps:
        draw.rectangle([c["x"], c["y"], c["x"] + c["w"] - 1, c["y"] + c["h"] - 1], outline=(0, 255, 0))
        draw.text((c["x"] + 2, c["y"] + 1), str(c["id"]), fill=(255, 255, 0))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    debug.save(OUT_DIR / f"{sheet.stem}.debug.png")
    (OUT_DIR / f"{sheet.stem}.components.json").write_text(json.dumps(comps, indent=1))
    print(f"{sheet.name}: {len(comps)} components")


if __name__ == "__main__":
    for path in sorted(SHEETS_DIR.glob("*.jpg")):
        process(path)
