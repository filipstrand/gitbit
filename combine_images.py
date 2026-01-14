from PIL import Image, ImageOps, ImageDraw

def add_rounded_corners(img, radius):
    mask = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0) + img.size, radius, fill=255)
    img.putalpha(mask)
    return img

def combine():
    # Load images
    a = Image.open("media/raw_screenshot.png").convert("RGBA")
    logo = Image.open("media/logo.png").convert("RGBA")
    
    # Background color sampled from a.png
    bg_color = (20, 20, 20, 255)
    
    # Create a rounded frame for a.png with balanced space
    padding_x = 40
    padding_top = 40
    padding_bottom = 40 # Reduced from 80 to make the chin smaller
    
    frame_size = (a.size[0] + padding_x * 2, a.size[1] + padding_top + padding_bottom)
    frame = Image.new("RGBA", frame_size, (0, 0, 0, 0))
    
    # Draw the rounded rectangle frame
    draw = ImageDraw.Draw(frame)
    frame_radius = 60
    draw.rounded_rectangle((0, 0) + frame_size, frame_radius, fill=bg_color)
    
    # Paste a.png onto the frame
    a_rounded = add_rounded_corners(a, 10)
    frame.paste(a_rounded, (padding_x, padding_top), a_rounded)
    
    # Scale logo (no rotation)
    logo_scaled = logo.copy()
    logo_scaled.thumbnail((650, 650), Image.LANCZOS)
    
    # Calculate final canvas size with padding
    canvas_padding = 200
    logo_overlap_x = logo_scaled.size[0] // 2
    logo_overlap_y = logo_scaled.size[1] // 2
    
    total_width = frame.size[0] + logo_overlap_x + (canvas_padding * 2)
    total_height = frame.size[1] + logo_overlap_y + (canvas_padding * 2)
    
    canvas = Image.new("RGBA", (total_width, total_height), (0, 0, 0, 0))
    
    # Paste window/frame
    window_x = canvas_padding
    window_y = canvas_padding + logo_overlap_y
    canvas.paste(frame, (window_x, window_y), frame)
    
    # Paste logo
    # Positioned at the top right of the frame
    logo_x = window_x + frame.size[0] - logo_overlap_x
    logo_y = window_y - logo_overlap_y
    canvas.paste(logo_scaled, (logo_x, logo_y), logo_scaled)
    
    # Crop to content plus a uniform padding
    bbox = canvas.getbbox()
    if bbox:
        canvas = canvas.crop(bbox)
        final_padding = 100
        new_size = (canvas.size[0] + final_padding * 2, canvas.size[1] + final_padding * 2)
        final_canvas = Image.new("RGBA", new_size, (0, 0, 0, 0))
        final_canvas.paste(canvas, (final_padding, final_padding), canvas)
        canvas = final_canvas

    # Save result
    output_path = "/Users/filipstrand/Desktop/combined_transparent.png"
    canvas.save(output_path, "PNG")
    print(f"Saved combined image to {output_path}")

if __name__ == "__main__":
    combine()
