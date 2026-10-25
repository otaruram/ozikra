import math
from PIL import Image, ImageDraw

def render_logo(size=512):
    # Create RGBA canvas
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Scale factor from 32x32 coordinate space to size
    s = size / 32.0

    # Draw rounded background square
    bg_radius = int(6 * s)
    draw.rounded_rectangle([0, 0, size, size], radius=bg_radius, fill=(9, 9, 11, 255))

    # Outer tactical hex shield
    # points="16,2 29,8 29,20 16,30 3,20 3,8"
    hex_points = [
        (16 * s, 2 * s),
        (29 * s, 8 * s),
        (29 * s, 20 * s),
        (16 * s, 30 * s),
        (3 * s, 20 * s),
        (3 * s, 8 * s)
    ]
    
    stroke_w = max(1, int(2.2 * s))
    draw.polygon(hex_points, outline=(255, 255, 255, 255), width=stroke_w)

    # Inner radar circle (radius 6 at 16,16)
    cx, cy = 16 * s, 16 * s
    r = 6 * s
    radar_w = max(1, int(1.5 * s))
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255, 230), width=radar_w)

    # Crosshair tick lines
    line_w = max(1, int(1.5 * s))
    # Top: 16,6 -> 16,10
    draw.line([(16 * s, 6 * s), (16 * s, 10 * s)], fill=(255, 255, 255, 255), width=line_w)
    # Bottom: 16,22 -> 16,26
    draw.line([(16 * s, 22 * s), (16 * s, 26 * s)], fill=(255, 255, 255, 255), width=line_w)
    # Left: 6,16 -> 10,16
    draw.line([(6 * s, 16 * s), (10 * s, 16 * s)], fill=(255, 255, 255, 255), width=line_w)
    # Right: 22,16 -> 26,16
    draw.line([(22 * s, 16 * s), (26 * s, 16 * s)], fill=(255, 255, 255, 255), width=line_w)

    # Center glowing green core dot (radius 2.5)
    r_core = 2.6 * s
    draw.ellipse([cx - r_core, cy - r_core, cx + r_core, cy + r_core], fill=(34, 197, 94, 255))

    return img

def main():
    master = render_logo(size=512)

    # 1. apple-touch-icon.png (180x180)
    apple_icon = master.resize((180, 180), Image.Resampling.LANCZOS)
    apple_icon.save("fe/public/apple-touch-icon.png", "PNG")
    print("Saved fe/public/apple-touch-icon.png")

    # 2. favicon.png (32x32)
    fav_32 = master.resize((32, 32), Image.Resampling.LANCZOS)
    fav_32.save("fe/public/favicon.png", "PNG")
    print("Saved fe/public/favicon.png")

    # 3. favicon.ico (multi-resolution: 16, 32, 48)
    fav_16 = master.resize((16, 16), Image.Resampling.LANCZOS)
    fav_48 = master.resize((48, 48), Image.Resampling.LANCZOS)
    fav_32.save("fe/public/favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print("Saved fe/public/favicon.ico")

if __name__ == "__main__":
    main()
