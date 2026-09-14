"""Unit tests for the pure media-library helpers."""
import sqlite3
from datetime import datetime

import pytest

from media_library_service import (
    IMAGE_EXTENSIONS,
    LIKE_ESCAPE,
    MAX_TAG_LENGTH,
    VIDEO_EXTENSIONS,
    _UNSUPPORTED_EXTENSIONS,
    build_object_key,
    build_search_text,
    build_thumbnail_key,
    detect_media_type,
    normalize_tags,
    parse_tag_input,
    search_pattern,
    tag_filter_pattern,
    unsupported_hint,
    validate_tags,
)


def _like(haystack: str, result) -> bool:
    """Evaluate a LIKE match through real SQLite, not Python `in`.

    `pattern.strip("%") in text` exercises str.__contains__, which is
    structurally incapable of catching wildcard semantics (a stray '%' or '_'
    in the tag) — that is exactly how the wildcard hole slipped through.
    `result` is the (pattern, escape) pair tag_filter_pattern/search_pattern
    return.
    """
    pattern, escape = result
    conn = sqlite3.connect(":memory:")
    try:
        return bool(conn.execute(
            "SELECT ? LIKE ? ESCAPE ?", (haystack, pattern, escape)
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
    assert _like(text, tag_filter_pattern("gaza"))
    # 'gaz' is a prefix of 'gaza' but is not itself a tag
    assert not _like(text, tag_filter_pattern("gaz"))


def test_tag_filter_pattern_returns_none_for_an_empty_tag():
    assert tag_filter_pattern("   ") is None


def test_tag_filter_pattern_returns_the_required_escape_char():
    pattern, escape = tag_filter_pattern("gaza")
    assert escape == LIKE_ESCAPE


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
    assert not _like(text, tag_filter_pattern("gaza"))
    assert not _like(text, tag_filter_pattern("evil"))


def test_normalize_tags_drops_a_tag_that_is_only_the_delimiter():
    assert normalize_tags(["|", "gaza"]) == ["gaza"]


def test_normalize_tags_still_dedupes_after_stripping_the_delimiter():
    assert normalize_tags(["gaza|evil", "gaza evil"]) == ["gaza evil"]


def test_detect_media_type_rejects_svg_by_content_type():
    assert detect_media_type("logo.svg", "image/svg+xml") is None


def test_detect_media_type_rejects_svg_by_extension_fallback():
    assert detect_media_type("logo.svg", None) is None


# --- content-type allow-lists, not a deny-list ------------------------------

def test_detect_media_type_rejects_svg_with_a_charset_parameter():
    assert detect_media_type("logo.svg", "image/svg+xml; charset=utf-8") is None


def test_detect_media_type_rejects_svg_with_trailing_whitespace():
    assert detect_media_type("logo.svg", "image/svg+xml ") is None


def test_detect_media_type_matches_a_content_type_with_a_parameter():
    assert detect_media_type("logo.png", "image/png; charset=utf-8") == "image"


def test_detect_media_type_rejects_an_unlisted_image_subtype():
    assert detect_media_type("icon.ico", "image/x-icon") is None


# --- LIKE metacharacters are escaped, verified through real LIKE -----------

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


# --- the delimiter is stripped from the free-text fields too ---------------

def test_build_search_text_strips_the_delimiter_from_filename_title_description():
    text = build_search_text("a.jpg", "x |gaza| y", None, ["water"])
    assert not _like(text, tag_filter_pattern("gaza"))
    assert _like(text, tag_filter_pattern("water"))


# --- non-string tags are skipped, not coerced -------------------------------

def test_normalize_tags_skips_non_string_entries():
    assert normalize_tags([None, 5, "gaza"]) == ["gaza"]


# --- validate_tags: %, _, \ are allowed (escaping already neutralises them) -

def test_validate_tags_returns_no_problems_for_clean_tags():
    assert validate_tags(["gaza", "water-well"]) == []


def test_validate_tags_accepts_a_percent_sign():
    assert validate_tags(["50%-off"]) == []


def test_validate_tags_accepts_an_underscore():
    assert validate_tags(["water_well"]) == []


def test_validate_tags_accepts_a_backslash():
    assert validate_tags(["gaza\\"]) == []


def test_validate_tags_returns_no_problems_for_none():
    assert validate_tags(None) == []


def test_validate_tags_rejects_a_tag_containing_the_delimiter():
    assert validate_tags(["gaza|evil"]) != []


def test_validate_tags_rejects_a_tag_over_the_length_limit():
    assert validate_tags(["g" * 65]) != []


def test_validate_tags_rejects_too_many_distinct_tags():
    assert validate_tags([f"tag{i}" for i in range(26)]) != []


def test_validate_tags_rejects_a_non_string_entry():
    assert validate_tags([5]) != []


def test_validate_tags_non_string_message_quotes_the_real_value_not_a_stringification():
    # repr(raw), not repr(str(raw)): None must read as None, not the
    # stringified word "none" that normalize_tags deliberately avoids.
    assert validate_tags([None])[0] == "Tag None must be text."


def test_validate_tags_non_string_message_does_not_imply_the_value_is_text():
    # "Tag '5' must be text." would misleadingly suggest the *string* "5" is
    # the problem; the int 5 should read unquoted, as the int it is.
    assert validate_tags([5])[0] == "Tag 5 must be text."


# --- validate_tags validates the normalized form ----------------------------

def test_validate_tags_accepts_a_tag_that_normalizes_under_the_length_limit():
    # 62 real characters once the surrounding whitespace is stripped.
    assert validate_tags(["   " + "g" * 62 + "   "]) == []


def test_validate_tags_accepts_tags_that_dedupe_under_the_max():
    assert validate_tags(["gaza"] * 26) == []


def test_validate_tags_rejects_a_whitespace_only_tag():
    # normalize_tags would silently drop this; validate_tags must not let it
    # through quietly.
    assert validate_tags(["   "]) != []


def test_validate_tags_truncates_a_very_long_echoed_tag():
    problems = validate_tags(["g" * 100_000])
    assert problems != []
    assert len(problems[0]) < MAX_TAG_LENGTH + 100


# --- search_pattern: the same safe primitive for free-text search ----------

def test_search_pattern_returns_none_for_empty_input():
    assert search_pattern(None) is None
    assert search_pattern("") is None
    assert search_pattern("   ") is None


def test_search_pattern_lowercases_the_query():
    assert _like("well opening in rafah", search_pattern("RAFAH"))


def test_search_pattern_does_not_let_percent_match_everything():
    assert not _like("well opening", search_pattern("%"))


def test_search_pattern_does_not_let_underscore_act_as_a_wildcard():
    assert not _like("abc", search_pattern("a_c"))


def test_search_pattern_finds_a_literal_percent_in_the_haystack():
    assert _like("50% off today", search_pattern("%"))


# --- free-win camera formats -------------------------------------------------

def test_detect_media_type_accepts_3gp_by_content_type():
    assert detect_media_type("clip.3gp", "video/3gpp") == "video"
    assert detect_media_type("clip.3gp", "video/3gpp2") == "video"


def test_detect_media_type_accepts_3gp_by_extension_fallback():
    assert detect_media_type("clip.3GP", "application/octet-stream") == "video"


def test_detect_media_type_accepts_m4v():
    assert detect_media_type("clip.m4v", "video/x-m4v") == "video"


def test_detect_media_type_accepts_the_image_jpg_alias():
    assert detect_media_type("whatever.bin", "image/jpg") == "image"


def test_detect_media_type_accepts_the_bmp_alias():
    assert detect_media_type("whatever.bin", "image/x-ms-bmp") == "image"


def test_detect_media_type_accepts_ogv_by_extension_fallback():
    assert detect_media_type("clip.ogv", "application/octet-stream") == "video"


def test_build_object_key_keeps_the_3gp_extension():
    key = build_object_key(7, "clip.3gp", now=datetime(2026, 3, 14))
    assert key.endswith(".3gp")


# --- recognised-but-unsupported formats get a specific message -------------

def test_unsupported_hint_names_heic_by_content_type():
    assert "HEIC" in unsupported_hint("IMG_0001.HEIC", "image/heic")


def test_unsupported_hint_names_heic_by_extension_fallback():
    assert "HEIC" in unsupported_hint("IMG_0001.heic", None)


def test_unsupported_hint_names_avif():
    assert "AVIF" in unsupported_hint("photo.avif", "image/avif")


def test_unsupported_hint_returns_none_for_a_supported_format():
    assert unsupported_hint("photo.jpg", "image/jpeg") is None


def test_unsupported_hint_returns_none_for_a_wholly_unrecognised_format():
    assert unsupported_hint("notes.pdf", "application/pdf") is None


def test_detect_media_type_still_returns_none_for_heic():
    # unsupported_hint explains *why*; detect_media_type still refuses it.
    assert detect_media_type("IMG_0001.HEIC", "image/heic") is None


def test_unsupported_hint_cannot_raise_on_a_missing_hint_entry(monkeypatch):
    # _UNSUPPORTED_EXTENSIONS and UNSUPPORTED_HINTS are hand-maintained in
    # parallel; simulate the drift by pointing an extension at a content type
    # with no hint text and confirm this degrades to None, not a KeyError.
    monkeypatch.setitem(_UNSUPPORTED_EXTENSIONS, ".xyz", "image/does-not-exist")
    assert unsupported_hint("weird.xyz", None) is None


def test_supported_and_unsupported_extensions_stay_disjoint():
    # When HEIC gets real support, ".heic" has to leave
    # _UNSUPPORTED_EXTENSIONS as it enters IMAGE_EXTENSIONS -- this is what
    # catches the drift if that move is forgotten.
    supported = set(IMAGE_EXTENSIONS) | set(VIDEO_EXTENSIONS)
    unsupported = set(_UNSUPPORTED_EXTENSIONS)
    assert supported & unsupported == set()


# --- parse_tag_input: the naive-split fix -----------------------------------

def test_parse_tag_input_returns_empty_list_for_empty_string():
    assert parse_tag_input("") == []


def test_parse_tag_input_returns_empty_list_for_none():
    assert parse_tag_input(None) == []


def test_parse_tag_input_drops_a_trailing_comma():
    assert parse_tag_input("gaza,water,") == ["gaza", "water"]


def test_parse_tag_input_keeps_both_entries_around_spaces():
    result = parse_tag_input("  gaza , water ")
    assert len(result) == 2
    assert result[0].strip() == "gaza"
    assert result[1].strip() == "water"


def test_parse_tag_input_returns_empty_list_for_only_commas():
    assert parse_tag_input(",,,") == []


def test_a_tagless_upload_passes_validation():
    # This is the bug this round fixes: "".split(",") is [""], and
    # validate_tags([""]) used to reject a photo uploaded with no tags at
    # all -- the common case, and the primary flow of the whole feature.
    assert validate_tags(parse_tag_input("")) == []


def test_a_trailing_comma_does_not_fail_validation():
    assert validate_tags(parse_tag_input("gaza,water,")) == []
