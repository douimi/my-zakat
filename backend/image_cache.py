"""
In-memory LRU cache for S3 image downloads and on-the-fly resizing.
Eliminates repeated S3 round-trips and serves right-sized images.
"""
import io
import hashlib
from collections import OrderedDict
from threading import Lock
from typing import Optional, Tuple
from PIL import Image

# Cache configuration
MAX_CACHE_SIZE_MB = 256  # Max total cache size in MB
MAX_CACHE_ENTRIES = 500  # Max number of cached items

_cache: OrderedDict[str, Tuple[bytes, str]] = OrderedDict()  # key -> (data, content_type)
_cache_size = 0  # Current cache size in bytes
_lock = Lock()


def _evict_if_needed(incoming_size: int) -> None:
    """Evict oldest entries until there's room for incoming_size bytes."""
    global _cache_size
    max_bytes = MAX_CACHE_SIZE_MB * 1024 * 1024
    while _cache and (_cache_size + incoming_size > max_bytes or len(_cache) >= MAX_CACHE_ENTRIES):
        _, (evicted_data, _) = _cache.popitem(last=False)
        _cache_size -= len(evicted_data)


def cache_get(key: str) -> Optional[Tuple[bytes, str]]:
    """Get item from cache, moving it to end (most recently used)."""
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    return None


def cache_put(key: str, data: bytes, content_type: str) -> None:
    """Put item into cache, evicting old items if necessary."""
    global _cache_size
    with _lock:
        if key in _cache:
            old_data, _ = _cache.pop(key)
            _cache_size -= len(old_data)
        _evict_if_needed(len(data))
        _cache[key] = (data, content_type)
        _cache_size += len(data)


def make_cache_key(object_key: str, width: Optional[int] = None, fmt: Optional[str] = None) -> str:
    """Build a cache key from object_key + optional resize params."""
    parts = [object_key]
    if width:
        parts.append(f"w{width}")
    if fmt:
        parts.append(fmt)
    return "|".join(parts)


def resize_image(
    image_data: bytes,
    target_width: int,
    output_format: str = "JPEG",
) -> Tuple[bytes, str]:
    """
    Resize an image to target_width (maintaining aspect ratio) and return
    (resized_bytes, content_type).
    """
    img = Image.open(io.BytesIO(image_data))

    # Convert to RGB if needed for JPEG/WebP output
    if output_format in ("JPEG", "WEBP") and img.mode in ("RGBA", "LA", "P"):
        rgb = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        rgb.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
        img = rgb
    elif img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")

    # Only downscale, never upscale
    orig_w, orig_h = img.size
    if orig_w > target_width:
        ratio = target_width / orig_w
        new_h = int(orig_h * ratio)
        img = img.resize((target_width, new_h), Image.Resampling.LANCZOS)

    buf = io.BytesIO()
    save_kwargs = {"optimize": True}

    if output_format == "JPEG":
        save_kwargs["quality"] = 82
        content_type = "image/jpeg"
    elif output_format == "WEBP":
        save_kwargs["quality"] = 80
        content_type = "image/webp"
    elif output_format == "PNG":
        content_type = "image/png"
    else:
        save_kwargs["quality"] = 82
        content_type = "image/jpeg"
        output_format = "JPEG"

    img.save(buf, format=output_format, **save_kwargs)
    return buf.getvalue(), content_type


def compute_etag(data: bytes) -> str:
    """Compute a short ETag from image bytes."""
    return hashlib.md5(data).hexdigest()[:16]
