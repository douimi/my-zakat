"""Report content rows holding a direct S3/MinIO URL rather than a proxy URL.

Every such row would 404 the moment the bucket stops being publicly readable, so
this must report nothing before the public-read policy is removed.

    docker compose exec backend python -m scripts.audit_direct_s3_urls
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import SessionLocal
from models import (
    Event, GalleryItem, Program, ProgramCategory, Setting, SlideshowSlide,
    Story, Testimonial,
)
from s3_service import S3_BUCKET_NAME

# (model, label, [columns that can hold a media URL])
TARGETS = [
    (GalleryItem, "gallery_items", ["media_filename", "thumbnail_url"]),
    (Story, "stories", ["image_filename", "video_filename"]),
    (Testimonial, "testimonials", ["image", "video_filename"]),
    (Event, "events", ["image"]),
    (Program, "programs", ["image_url", "video_filename"]),
    (ProgramCategory, "program_categories", ["image_url", "video_filename"]),
    (SlideshowSlide, "slideshow_slides", ["image_url", "image_filename"]),
    (Setting, "settings", ["value"]),
]


def _is_direct_s3_url(value) -> bool:
    if not isinstance(value, str) or not value.startswith(("http://", "https://")):
        return False
    if "/api/uploads/" in value or "/api/media-library/" in value:
        return False
    return S3_BUCKET_NAME in value or ":9000" in value


def audit(db) -> list:
    findings = []
    for model, label, columns in TARGETS:
        for row in db.query(model).all():
            for column in columns:
                value = getattr(row, column, None)
                if _is_direct_s3_url(value):
                    findings.append({
                        "table": label,
                        "id": getattr(row, "id", getattr(row, "key", "?")),
                        "column": column,
                        "value": value,
                    })
    return findings


def main() -> None:
    db = SessionLocal()
    try:
        findings = audit(db)
        if not findings:
            print("Clean: no direct S3 URLs found. Safe to remove the public-read policy.")
            return
        print(f"Found {len(findings)} direct S3 URL(s). Fix these before locking the bucket:")
        for finding in findings:
            print(f"  {finding['table']}#{finding['id']}.{finding['column']} = {finding['value']}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
