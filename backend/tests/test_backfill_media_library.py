"""Backfill of pre-existing S3 objects into media_assets."""
import pytest

from models import MediaAsset


@pytest.fixture
def fake_listing(monkeypatch):
    listing = {
        "images/": [
            {"key": "images/hero.jpg", "size": 1000, "last_modified": None},
            {"key": "images/hero_thumb.jpg", "size": 50, "last_modified": None},
        ],
        "videos/": [
            {"key": "videos/story.mp4", "size": 9000, "last_modified": None},
        ],
    }
    monkeypatch.setattr(
        "scripts.backfill_media_library.list_files",
        lambda prefix: listing.get(prefix, []),
    )


def test_backfill_imports_existing_objects_as_public_and_unassigned(db_session, fake_listing):
    from scripts.backfill_media_library import backfill

    created = backfill(db_session)
    assert created == 2

    assets = db_session.query(MediaAsset).order_by(MediaAsset.object_key).all()
    assert [a.object_key for a in assets] == ["images/hero.jpg", "videos/story.mp4"]
    assert all(a.status == "public" for a in assets)
    assert all(a.owner_id is None for a in assets)


def test_backfill_skips_generated_thumbnails(db_session, fake_listing):
    from scripts.backfill_media_library import backfill

    backfill(db_session)
    keys = [a.object_key for a in db_session.query(MediaAsset).all()]
    assert "images/hero_thumb.jpg" not in keys


def test_backfill_sets_a_searchable_filename(db_session, fake_listing):
    from scripts.backfill_media_library import backfill

    backfill(db_session)
    asset = db_session.query(MediaAsset).filter(MediaAsset.object_key == "images/hero.jpg").one()
    assert asset.filename == "hero.jpg"
    assert "hero.jpg" in asset.search_text
    assert asset.media_type == "image"


def test_backfill_is_idempotent(db_session, fake_listing):
    from scripts.backfill_media_library import backfill

    assert backfill(db_session) == 2
    assert backfill(db_session) == 0
    assert db_session.query(MediaAsset).count() == 2
