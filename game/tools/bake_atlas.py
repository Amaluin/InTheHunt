"""Cut selected sprites from the generated sheets and pack them into one atlas.

Usage: python bake_atlas.py
Output: game/assets/atlas.png and game/js/atlas.js (window.ATLAS = {name: [x, y, w, h]})

Sprite ids come from detect_sprites.py debug previews (game/tools/out/*.debug.png).
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

from detect_sprites import SHEETS_DIR, components, dilate

GAME_DIR = Path(__file__).resolve().parents[1]
TEXTURES_DIR = SHEETS_DIR.parent / "textures"
ATLAS_W = 1024
PAD = 1
# Sheets drawn for the original 320x240 field get enlarged for the 480x270 field.
LEGACY_SCALE = 1.25
NEW_SHEETS = {"PH", "TP", "TU"}

SHEETS = {
    "P": "sprites-player-nereid-01",
    "DA": "sprites-player-destroyed-a",
    "DB": "sprites-player-destroyed-b",
    "E1": "sprites-enemies-das",
    "E2": "sprites-enemies-das-2",
    "U1": "sprites-enemies-underwater",
    "U2": "sprites-enemies-underwater-2",
    "FX": "sprites-projectiles-pickups",
    "PR": "sprites-props-pickups",
    "PH": "player-sub-hd",
    "TP": "sprites-terrain-pieces",
    "TU": "sprites-enemies-turrets",
}

# name: (source file, tile height, rgb multiplier, mirror vertically too)
TEXTURES = {
    "tex_rock": ("tex-rock.jpg", 192, (0.95, 0.95, 1.0), True),
    "tex_metal": ("tex-metal.jpg", 192, (0.8, 0.82, 0.85), True),
    "tex_ice": ("tex-ice.jpg", 160, (0.52, 0.62, 0.72), True),
    "bg_ice": ("bg-far-ice.jpg", 230, (0.85, 0.9, 0.95), False),
    "bg_refinery": ("bg-far-refinery.jpg", 230, (0.8, 0.85, 0.85), False),
}


def seq(prefix, sheet, ids, scale, flip=False):
    return {f"{prefix}_{i}": (sheet, cid, scale, flip) for i, cid in enumerate(ids)}


# name: (sheet, component id, scale, flip horizontally so it faces left)
MANIFEST = {
    **seq("player_idle", "P", [0, 1, 2, 3], 0.25),
    **seq("player_move", "P", [4, 6, 7, 8], 0.25),
    **seq("player_death_a", "DA", [5, 6, 7, 2, 8, 9], 0.23),
    **seq("player_death_b", "DB", [8, 9, 4, 5, 6, 7], 0.23),
    **seq("debris", "DA", [11, 12, 13, 14, 15, 16, 17], 0.1),

    "fx_flash": ("DB", 13, 0.3, False),
    "fx_fireball": ("DB", 14, 0.3, False),
    "fx_ring": ("DB", 15, 0.3, False),
    "fx_smoke": ("E1", 23, 0.3, False),
    "fx_boom_a": ("E1", 24, 0.3, False),
    "fx_boom_b": ("E1", 26, 0.25, False),
    **seq("fx_spark", "FX", [28, 29], 0.18),
    **seq("bubble_column", "DB", [27, 28], 0.25),
    "bubble_big": ("PR", 43, 0.08, False),
    "bubble_mid": ("PR", 44, 0.08, False),

    "torpedo": ("FX", 1, 0.14, False),
    "depth_charge": ("FX", 6, 0.12, False),
    "enemy_torpedo": ("U1", 0, 0.2, False),
    "enemy_orb": ("FX", 9, 0.14, True),
    "enemy_bomb": ("FX", 10, 0.14, False),
    "heli_bomb": ("E2", 11, 0.22, True),

    "capsule_hmg": ("FX", 11, 0.16, False),
    "capsule_wave": ("FX", 12, 0.16, False),
    "capsule_spread": ("FX", 14, 0.16, False),
    **seq("orb_red", "FX", [15, 16], 0.12),
    "orb_gold": ("FX", 17, 0.12, False),

    **seq("drone", "E1", [0, 1, 2], 0.22, True),
    **seq("mine", "E1", [5, 7, 9], 0.2),
    **seq("jet", "E1", [10, 11, 12], 0.25, True),
    **seq("hunter", "E1", [15, 16, 17], 0.25, True),
    **seq("heli", "E2", [0, 2], 0.24, True),
    **seq("gunboat", "E2", [8, 9, 10], 0.24, True),
    **seq("angler", "U1", [2, 3], 0.24),
    **seq("manta", "U1", [9, 10], 0.2),
    **seq("divers", "U1", [12, 13], 0.2),
    **seq("torpsub", "U1", [22, 23], 0.2),
    **seq("squid", "U1", [28, 29], 0.2),
    **seq("crawler", "U2", [1, 2], 0.24),
    **seq("eel", "U2", [4, 6], 0.2),
    **seq("jelly", "U2", [9, 10], 0.2),
    **seq("crab", "U2", [13, 14], 0.22),
    **seq("carrier", "U2", [17, 18], 0.56),

    "tank": ("PR", 1, 0.3, False),
    "pipe_straight": ("PR", 8, 0.35, False),
    "pipe_elbow": ("PR", 4, 0.35, False),
    "pipe_valve": ("PR", 5, 0.35, False),
    "lamp": ("PR", 6, 0.18, False),
    "container": ("PR", 7, 0.3, False),
    "ice_chunk": ("PR", 9, 0.35, False),
    "ice_cracked": ("PR", 10, 0.35, False),
    "ice_breaking": ("PR", 11, 0.35, False),
    "floe_small": ("PR", 18, 0.35, False),
    "floe_big": ("PR", 19, 0.35, False),
    "tower": ("PR", 15, 0.5, False),
    "rock": ("PR", 21, 0.3, False),
    "coral": ("PR", 25, 0.3, False),
    **seq("weed", "PR", [22, 26, 23], 0.3),
    "wreck": ("PR", 27, 0.4, False),
    "debris_big": ("PR", 24, 0.35, False),
    "chain": ("PR", 28, 0.3, False),
    "relay": ("PR", 32, 0.3, False),
    "relay_dead": ("PR", 35, 0.3, False),

    # Extra enemies from existing sheets
    **seq("destroyer", "E2", [13, 14, 15], 0.26, True),
    **seq("transport", "E2", [4, 6], 0.24, True),
    "transport_drop": ("E2", 5, 0.24, True),
    **seq("barge", "E1", [20, 21, 22], 0.24, True),
    **seq("minisub", "E2", [19, 21], 0.16, True),
    "driller": ("E2", 23, 0.2, True),
    "walker": ("E1", 27, 0.22, True),

    # New sheets, already sized for 480x270
    "player_hd": ("PH", 0, 0.07, False),
    **seq("turret_floor", "TU", [0, 1, 2], 0.2, True),
    **seq("turret_ceil", "TU", [4, 5], 0.2),
    "missile": ("TU", 6, 0.14, False),
    **seq("silo", "TU", [7, 8, 9], 0.2),
    **seq("urchin", "TU", [10, 11], 0.17),
    **seq("hatch", "TU", [14, 15, 16], 0.22, True),
    "rock_coral": ("TP", 0, 0.36, False),
    "kelp_big": ("TP", 1, 0.32, False),
    "rock_spire": ("TP", 2, 0.36, False),
    "rock_mound": ("TP", 3, 0.36, False),
    "ceil_rock_a": ("TP", 4, 0.4, False),
    "ceil_rock_b": ("TP", 5, 0.4, False),
    "ceil_ice_a": ("TP", 6, 0.38, False),
    "ceil_ice_b": ("TP", 7, 0.36, False),
    "ruin_tank": ("TP", 8, 0.34, False),
    "ruin_platform": ("TP", 10, 0.36, False),
    "ruin_container": ("TP", 11, 0.32, False),
    "ruin_pipes": ("TP", 9, 0.32, False),
    "anemone": ("TP", 12, 0.16, False),
    "tubeworms": ("TP", 13, 0.16, False),
    "barrel": ("TP", 14, 0.14, False),
    "urchins": ("TP", 15, 0.15, False),
    "starfish": ("TP", 16, 0.14, False),
}


def cut(rgb, fg, labels, comp, scale, flip):
    x, y, w, h = comp["x"], comp["y"], comp["w"], comp["h"]
    region = labels[y:y + h, x:x + w] == comp["label"]
    alpha = fg[y:y + h, x:x + w] & region
    # Drop the 1px magenta-tinted fringe left by JPEG compression.
    alpha &= ~dilate(~alpha, 1)
    rgba = np.dstack([rgb[y:y + h, x:x + w], (alpha * 255).astype(np.uint8)])
    img = Image.fromarray(rgba, "RGBA")
    if flip:
        img = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)

    tw, th = max(1, round(w * scale)), max(1, round(h * scale))
    small = img.convert("RGBa").resize((tw, th), Image.Resampling.BOX).convert("RGBA")
    arr = np.asarray(small).copy()
    arr[..., 3] = np.where(arr[..., 3] >= 110, 255, 0)
    out = Image.fromarray(arr, "RGBA")
    bbox = out.getbbox()
    return out.crop(bbox) if bbox else out


def pack(sprites):
    order = sorted(sprites, key=lambda n: -sprites[n].height)
    rects, x, y, shelf_h = {}, 0, 0, 0
    for name in order:
        im = sprites[name]
        if x + im.width + PAD > ATLAS_W:
            x, y, shelf_h = 0, y + shelf_h + PAD, 0
        rects[name] = (x, y, im.width, im.height)
        x += im.width + PAD
        shelf_h = max(shelf_h, im.height)
    height = y + shelf_h
    atlas = Image.new("RGBA", (ATLAS_W, height), (0, 0, 0, 0))
    for name, (rx, ry, _, _) in rects.items():
        atlas.paste(sprites[name], (rx, ry))
    return atlas, rects


def bake_texture(name, src, height, mult, mirror_v):
    img = Image.open(TEXTURES_DIR / src).convert("RGB")
    width = round(img.width * height / img.height)
    img = img.resize((width, height), Image.Resampling.BOX)
    arr = np.asarray(img).astype(np.float32) * np.array(mult, dtype=np.float32)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    # Mirroring makes the tile wrap without seams.
    row = Image.new("RGB", (width * 2, height))
    row.paste(img, (0, 0))
    row.paste(img.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (width, 0))
    if mirror_v:
        tile = Image.new("RGB", (width * 2, height * 2))
        tile.paste(row, (0, 0))
        tile.paste(row.transpose(Image.Transpose.FLIP_TOP_BOTTOM), (0, height))
        row = tile
    row.save(GAME_DIR / "assets" / f"{name}.png")


def main():
    cache = {}
    sprites = {}
    for name, (sheet_key, cid, scale, flip) in MANIFEST.items():
        if sheet_key not in cache:
            cache[sheet_key] = components(SHEETS_DIR / f"{SHEETS[sheet_key]}.jpg")
        rgb, fg, labels, comps = cache[sheet_key]
        if sheet_key not in NEW_SHEETS:
            scale *= LEGACY_SCALE
        sprites[name] = cut(rgb, fg, labels, comps[cid], scale, flip)

    (GAME_DIR / "assets").mkdir(parents=True, exist_ok=True)
    for name, args in TEXTURES.items():
        bake_texture(name, *args)

    atlas, rects = pack(sprites)
    (GAME_DIR / "assets").mkdir(parents=True, exist_ok=True)
    atlas.save(GAME_DIR / "assets" / "atlas.png")
    (GAME_DIR / "js").mkdir(parents=True, exist_ok=True)
    js = "window.ATLAS = " + json.dumps({k: list(v) for k, v in sorted(rects.items())}) + ";\n"
    (GAME_DIR / "js" / "atlas.js").write_text(js)
    print(f"atlas {atlas.width}x{atlas.height}, {len(rects)} sprites")


if __name__ == "__main__":
    main()
