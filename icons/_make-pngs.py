"""Generate cleanup-bin PNG icons. Standalone — run only when icons need refresh.

Produces:
  - icons/icon-48.png  (48x48, thin-stroke bin)
  - icons/icon-96.png  (96x96, thin-stroke bin)

The SVGs (broom-{mono,dark,light}.svg) are the source of truth for toolbar
and popup rendering. These PNGs are only used by the manifest `icons` field
(about:addons grid + AMO listing). We trace the same shapes with Pillow
primitives so the PNGs visually match the SVG.

Coordinates use the SVG's 24x24 viewBox, scaled to the output resolution.
We render at 4x then downsample for cleaner antialiasing.
"""
from PIL import Image, ImageDraw
from pathlib import Path

OUT = Path(__file__).parent
COLOR = (12, 12, 13, 255)  # Firefox Photon ink
STROKE_VB = 1.2            # stroke-width in 24-unit viewBox

# Bin outline in the 24x24 viewBox.
# We approximate the noun-project icon: trapezoid body + lid with handle +
# inner swoosh. Rounded corners are skipped at this small size; the eye
# fills them in.

# (x, y) polygon points - bin body outer outline
BIN_BODY = [
    (4.0, 13.0), (20.0, 13.0), (21.0, 21.0), (3.0, 21.0),
]
# Lid bar (rectangle outline)
LID_RECT = (4.0, 11.0, 20.0, 13.0)  # x0, y0, x1, y1
# Handle on top of lid (rounded "U" shape — drawn as polyline)
HANDLE = [
    (10.0, 11.0), (10.0, 6.0), (10.5, 5.0), (12.0, 4.5),
    (13.5, 5.0), (14.0, 6.0), (14.0, 11.0),
]
# Inner swoosh (small triangle/tick)
SWOOSH = [
    (6.2, 20.0), (7.5, 17.0), (9.0, 20.0),
]


def draw_bin(size: int, dst: Path):
    # Supersample 4x for smoother antialiasing
    SS = 4
    canvas = size * SS
    img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = canvas / 24.0
    stroke = max(1, int(round(STROKE_VB * s)))

    def scale(pts):
        return [(int(round(x * s)), int(round(y * s))) for x, y in pts]

    # Bin body — closed polygon outline
    body = scale(BIN_BODY)
    d.line(body + [body[0]], fill=COLOR, width=stroke, joint="curve")
    # Lid rectangle
    x0, y0, x1, y1 = LID_RECT
    lid = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    lid_px = scale(lid)
    d.line(lid_px + [lid_px[0]], fill=COLOR, width=stroke, joint="curve")
    # Handle polyline
    d.line(scale(HANDLE), fill=COLOR, width=stroke, joint="curve")
    # Swoosh
    sw = scale(SWOOSH)
    d.line(sw + [sw[0]], fill=COLOR, width=stroke, joint="curve")

    # Downsample to target size with LANCZOS for crisp edges
    final = img.resize((size, size), Image.LANCZOS)
    final.save(dst, "PNG")


if __name__ == "__main__":
    draw_bin(48, OUT / "icon-48.png")
    draw_bin(96, OUT / "icon-96.png")
    print("generated icon-48.png, icon-96.png")
