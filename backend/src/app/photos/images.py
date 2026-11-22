"""Turning an uploaded photo into the two JPEGs we keep (a large one for room pages, a thumbnail for cards).

Every upload is decoded and saved again, never stored as sent: that drops hidden data such as the GPS
position phones add, and anything that isn't really a photo fails to decode.
"""

import io
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD_BYTES = 15 * 1024 * 1024
# Well above any phone camera (a 200 MP photo is 200 million); stops "decompression bombs", tiny files that
# expand into huge images.
MAX_PIXELS = 120_000_000
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
LARGE_SIDE = 1600
THUMB_SIDE = 640


class PhotoError(ValueError):
    """The upload isn't a photo we can use; the message is shown to the admin."""


@dataclass(frozen=True)
class ProcessedPhoto:
    large: bytes
    thumb: bytes
    width: int
    height: int


def _jpeg(image: Image.Image, side: int, quality: int) -> tuple[bytes, Image.Image]:
    copy = image.copy()
    copy.thumbnail((side, side), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    # No exif/icc arguments, so none of the original's metadata is written.
    copy.save(out, "JPEG", quality=quality, optimize=True, progressive=True)
    return out.getvalue(), copy


def process_photo(data: bytes) -> ProcessedPhoto:
    if not data:
        raise PhotoError("That file is empty. Choose a photo.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise PhotoError("That photo is too large. Use one under 15 MB.")
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format not in ALLOWED_FORMATS:
                raise PhotoError("Use a JPEG, PNG or WebP photo.")
            width, height = image.size
            if width * height > MAX_PIXELS:
                raise PhotoError("That photo is too large. Use one under 15 MB.")
            image.load()
            # Phones often save photos sideways with a note to turn them; apply it before dropping the note.
            upright = ImageOps.exif_transpose(image)
            if upright.mode in ("RGBA", "LA", "P"):
                rgba = upright.convert("RGBA")
                flat = Image.new("RGB", rgba.size, (255, 255, 255))
                flat.paste(rgba, mask=rgba.getchannel("A"))
                upright = flat
            else:
                upright = upright.convert("RGB")
    except PhotoError:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError, ValueError) as e:
        raise PhotoError(
            "That file couldn't be read as a photo. Use a JPEG, PNG or WebP photo "
            "(on a Mac, iPhone HEIC photos can be exported as JPEG from Photos)."
        ) from e
    large, large_image = _jpeg(upright, LARGE_SIDE, 82)
    thumb, _ = _jpeg(upright, THUMB_SIDE, 78)
    return ProcessedPhoto(large=large, thumb=thumb, width=large_image.width, height=large_image.height)
