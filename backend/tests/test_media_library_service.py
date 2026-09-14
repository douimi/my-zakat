"""Unit tests for the pure media-library helpers."""
import sqlite3
from datetime import datetime

import pytest

from media_library_service import (
    LIKE_ESCAPE,
    build_object_key,
    build_search_text,
    build_thumbnail_key,
    detect_media_type,
    normalize_tags,
    tag_filter_pattern,
    validate_tags,
)


def _like(haystack: str, pattern: str) -> bool:
    """Evaluate a LIKE match through real SQLite, not Python `in`.

    `pattern.strip("%") in text` exercises str.__contains__, which is
    structurally incapable of catching wildcard semantics (a stray '%' or '_'
    in the tag) — that is exactly how the wildcard hole slipped through.
    """
    conn = sqlite3.connect(":memory:")
    try:
        return bool(conn.execute(
            "SELECT ? LIKE ? ESCAPE ?", (haystack, pattern, LIKE_ESCAPE)
        ).fetchone()[0])
    finally:
        conn.close()


def test_normalize_tags_lowercases_strips_and_dedupes():
    assert normalize_tags(["  Gaza ", "gaza", "Water-Well", ""]) == ["gaza", "water-well"]


def test_normalize_tags_handles_none():
    assert normalize_tags(None) == []


def test_build_search_text_lowercases_every_part():
    text = build_search_text("IMG_4821.JPG", "Well Opening", "In Rafah", ["Gaza"])
    assert "img_4821.jpg" in text
    assert "well opening" in text
    assert "in rafah" in text


def test_build_search_text_wraps_tags_in_delimiters():
    text = build_search_text("a.jpg", None, None, ["gaza", "water-well"])
    assert "|gaza|water-well|" in text


def test_build_search_text_tolerates_empty_input():
    assert build_search_text(None, None, None, None) == ""


def test_tag_filter_pattern_matches_only_the_whole_tag():
    text = build_search_text("a.jpg", None, None, ["gaza", "water-well"])
    assert tag_filter_pattern("gaza").strip("%") in text
    # 'gaz' is a prefix of 'gaza' but is not itself a tag
    assert tag_filter_pattern("gaz").strip("%") not in text


def test_tag_filter_pattern_returns_none_for_an_empty_tag():
    assert tag_filter_pattern("   ") is None


def test_detect_media_type_prefers_the_content_type():
    assert detect_media_type("whatever.bin", "image/png") == "image"
    assert detect_media_type("whatever.bin", "video/mp4") == "video"


def test_detect_media_type_falls_back_to_the_extension():
    assert detect_media_type("photo.JPEG", "application/octet-stream") == "image"
    assert detect_media_type("clip.MOV", "application/octet-stream") == "video"


def test_detect_media_type_returns_none_for_unsupported_files():
    assert detect_media_type("notes.pdf", "application/pdf") is None


def test_build_object_key_is_namespaced_dated_and_random():
    now = datetime(2026, 3, 14, 12, 0, 0)
    key = build_object_key(7, "My Photo.JPG", now=now)
    assert key.startswith("workspaces/7/2026/03/")
    assert key.endswith(".jpg")
    # The uploaded filename must not survive into the key
    assert "my photo" not in key.lower()
    assert key != build_object_key(7, "My Photo.JPG", now=now)


def test_build_object_key_drops_a_hostile_extension():
    now = datetime(2026, 3, 14)
    key = build_object_key(7, "evil.../../x", now=now)
    assert ".." not in key
    assert key.startswith("workspaces/7/2026/03/")


def test_build_thumbnail_key_sits_beside_the_object():
    key = "workspaces/7/2026/03/abc123.mp4"
    assert build_thumbnail_key(key) == "workspaces/7/2026/03/abc123_thumb.jpg"


def test_build_thumbnail_key_handles_a_key_without_an_extension():
    assert build_thumbnail_key("workspaces/7/2026/03/abc123") == "workspaces/7/2026/03/abc123_thumb.jpg"


def test_build_object_key_rejects_a_traversal_owner_id():
    with pytest.raises(ValueError):
        build_object_key("7/../../other-owner", "x.jpg", now=datetime(2026, 3, 14))


def test_build_object_key_rejects_a_negative_owner_id():
    with pytest.raises(ValueError):
        build_object_key(-1, "x.jpg", now=datetime(2026, 3, 14))


def test_build_object_key_rejects_a_zero_owner_id():
    with pytest.raises(ValueError):
        build_object_key(0, "x.jpg", now=datetime(2026, 3, 14))


def test_build_object_key_rejects_a_bool_owner_id():
    with pytest.raises(ValueError):
        build_object_key(True, "x.jpg", now=datetime(2026, 3, 14))


def test_build_object_key_accepts_a_normal_positive_owner_id():
    key = build_object_key(7, "x.jpg", now=datetime(2026, 3, 14))
    assert key.startswith("workspaces/7/2026/03/")


def test_normalize_tags_strips_the_delimiter_so_it_cannot_answer_two_filters():
    text = build_search_text("a.jpg", None, None, ["gaza|evil"])
    assert tag_filter_pattern("gaza").strip("%") not in text
    assert tag_filter_pattern("evil").strip("%") not in text


def test_normalize_tags_drops_a_tag_that_is_only_the_delimiter():
    assert normalize_tags(["|", "gaza"]) == ["gaza"]


def test_normalize_tags_still_dedupes_after_stripping_the_delimiter():
    assert normalize_tags(["gaza|evil", "gaza evil"]) == ["gaza evil"]


def test_detect_media_type_rejects_svg_by_content_type():
    assert detect_media_type("logo.svg", "image/svg+xml") is None


def test_detect_media_type_rejects_svg_by_extension_fallback():
    assert detect_media_type("logo.svg", None) is None


# --- Fix A: content-type allow-lists, not a deny-list -----------------------

def test_detect_media_type_rejects_svg_with_a_charset_parameter():
    assert detect_media_type("logo.svg", "image/svg+xml; charset=utf-8") is None


def test_detect_media_type_rejects_svg_with_trailing_whitespace():
    assert detect_media_type("logo.svg", "image/svg+xml ") is None


def test_detect_media_type_matches_a_content_type_with_a_parameter():
    assert detect_media_type("logo.png", "image/png; charset=utf-8") == "image"


def test_detect_media_type_rejects_an_unlisted_image_subtype():
    assert detect_media_type("icon.ico", "image/x-icon") is None


# --- Fix B: LIKE metacharacters are escaped, verified through real LIKE -----

def test_tag_filter_pattern_matches_the_tag_through_real_like():
    text = build_search_text("a.jpg", None, None, ["gaza"])
    assert _like(text, tag_filter_pattern("gaza"))


def test_tag_filter_pattern_does_not_let_underscore_act_as_a_wildcard():
    text = build_search_text("a.jpg", None, None, ["gaza"])
    # 'gaz_' with '_' as a LIKE wildcard would match 'gaza'; escaped, it must not.
    assert not _like(text, tag_filter_pattern("gaz_"))


def test_tag_filter_pattern_does_not_let_percent_enumerate_every_tag():
    text = build_search_text("a.jpg", None, None, ["gaza"])
    # '%' as a bare LIKE wildcard would match any tagged text; escaped, it must not.
    assert not _like(text, tag_filter_pattern("%"))


def test_tag_filter_pattern_matches_a_tag_containing_a_literal_percent_only_itself():
    text_with_percent = build_search_text("a.jpg", None, None, ["50%-off"])
    text_without = build_search_text("a.jpg", None, None, ["50x-off"])
    pattern = tag_filter_pattern("50%-off")
    assert _like(text_with_percent, pattern)
    assert not _like(text_without, pattern)


# --- Fix C: the delimiter is stripped from the free-text fields too --------

def test_build_search_text_strips_the_delimiter_from_filename_title_description():
    text = build_search_text("a.jpg", "x |gaza| y", None, ["water"])
    assert not _like(text, tag_filter_pattern("gaza"))
    assert _like(text, tag_filter_pattern("water"))


# --- Fix E: non-string tags are skipped, not coerced -----------------------

def test_normalize_tags_skips_non_string_entries():
    assert normalize_tags([None, 5, "gaza"]) == ["gaza"]


# --- Fix F: validate_tags is the write-path gate ----------------------------

def test_validate_tags_returns_no_problems_for_clean_tags():
    assert validate_tags(["gaza", "water-well"]) == []


def test_validate_tags_returns_none_problems_for_none():
    assert validate_tags(None) == []


def test_validate_tags_rejects_a_tag_containing_the_delimiter():
    assert validate_tags(["gaza|evil"]) != []


def test_validate_tags_rejects_a_tag_containing_percent():
    assert validate_tags(["50%off"]) != []


def test_validate_tags_rejects_a_tag_containing_underscore():
    assert validate_tags(["gaz_a"]) != []


def test_validate_tags_rejects_a_tag_containing_a_backslash():
    assert validate_tags(["gaza\\"]) != []


def test_validate_tags_rejects_a_tag_over_the_length_limit():
    assert validate_tags(["g" * 65]) != []


def test_validate_tags_rejects_too_many_tags():
    assert validate_tags([f"tag{i}" for i in range(26)]) != []


def test_validate_tags_rejects_a_non_string_entry():
    assert validate_tags([5]) != []
