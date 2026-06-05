"""Stories router with manager/admin approval workflow.

- Public: only sees stories that are active AND not pending approval.
- Manager: can create / edit / delete their own stories. Anything they create or
  edit lands in pending state and is hidden from the public until an admin
  approves it.
- Admin: full access. Can approve pending stories, edit anyone's story, etc.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import os
from datetime import datetime

from database import get_db
from models import Story, User
from schemas import StoryResponse
from auth_utils import get_current_admin, get_current_manager_or_admin
from s3_service import upload_file, delete_file, generate_object_key, extract_object_key_from_url
from media_processing import compress_video, generate_video_thumbnail, should_compress_video

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────

def _is_admin(user: User) -> bool:
    return getattr(user, "role", None) == "admin" or user.is_admin


def _can_edit_story(user: User, story: Story) -> bool:
    """Admin can edit anything; manager can only edit their own."""
    if _is_admin(user):
        return True
    return story.created_by_user_id == user.id


def _delete_video_asset(video_value: str) -> None:
    """Best-effort cleanup of a stored video (S3 URL or local filename)."""
    if not video_value:
        return
    if video_value.startswith(("http://", "https://")):
        try:
            object_key = extract_object_key_from_url(video_value)
            if object_key:
                delete_file(object_key)
        except Exception as e:
            print(f"Warning: could not delete video from S3: {e}")
    else:
        local_path = os.path.join("uploads/stories", video_value)
        if os.path.exists(local_path):
            try:
                os.remove(local_path)
            except Exception as e:
                print(f"Warning: could not delete local video {local_path}: {e}")


# ─────────────────────────────────────────────────────────────────────
# Public endpoints
# ─────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[StoryResponse])
async def get_stories(
    skip: int = 0,
    limit: int = 100,
    active_only: bool = True,
    featured_only: bool = False,
    db: Session = Depends(get_db),
):
    """Public listing — hides pending-approval stories."""
    query = db.query(Story).filter(Story.is_pending_approval == False)  # noqa: E712
    if active_only:
        query = query.filter(Story.is_active == True)  # noqa: E712
    if featured_only:
        query = query.filter(Story.is_featured == True)  # noqa: E712
    return query.offset(skip).limit(limit).all()


@router.get("/admin/list", response_model=List[StoryResponse])
async def list_stories_for_staff(
    skip: int = 0,
    limit: int = 200,
    pending_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    """Admin/manager listing.

    - Admin sees every story.
    - Manager sees every approved story plus their own (including pending ones).
    """
    query = db.query(Story)
    if not _is_admin(current_user):
        # manager: approved (not pending) OR their own
        query = query.filter(
            (Story.is_pending_approval == False) |  # noqa: E712
            (Story.created_by_user_id == current_user.id)
        )
    if pending_only:
        query = query.filter(Story.is_pending_approval == True)  # noqa: E712
    return query.order_by(Story.id.desc()).offset(skip).limit(limit).all()


@router.get("/{story_id}", response_model=StoryResponse)
async def get_story(story_id: int, db: Session = Depends(get_db)):
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story or story.is_pending_approval:
        raise HTTPException(status_code=404, detail="Story not found")
    return story


# ─────────────────────────────────────────────────────────────────────
# Create / update / delete (admin or manager)
# ─────────────────────────────────────────────────────────────────────

@router.post("/", response_model=StoryResponse)
async def create_story(
    title: str = Form(...),
    summary: str = Form(...),
    content: str = Form(...),
    image_filename: Optional[str] = Form(None),
    video_filename: Optional[str] = Form(None),
    video: Optional[UploadFile] = File(None),
    is_active: bool = Form(True),
    is_featured: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    final_video_filename = None
    if video_filename and video_filename.strip():
        final_video_filename = video_filename.strip()

    if video and video.filename:
        if not video.content_type.startswith('video/'):
            raise HTTPException(status_code=400, detail="File must be a video")

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(video.filename)[1]
        filename = f"{timestamp}_{title.replace(' ', '_')}{file_extension}"
        content_bytes = await video.read()

        if should_compress_video(video.content_type):
            content_bytes = compress_video(content_bytes)

        try:
            object_key = generate_object_key("videos", filename)
            s3_url = upload_file(
                file_content=content_bytes,
                object_key=object_key,
                content_type=video.content_type,
                metadata={"original_filename": video.filename, "type": "story_video"},
            )
            final_video_filename = s3_url

            thumbnail_data = generate_video_thumbnail(content_bytes)
            if thumbnail_data and not image_filename:
                thumbnail_filename = f"{timestamp}_{title.replace(' ', '_')}_thumb.jpg"
                thumbnail_key = generate_object_key("images", thumbnail_filename)
                thumbnail_url = upload_file(
                    file_content=thumbnail_data,
                    object_key=thumbnail_key,
                    content_type="image/jpeg",
                    metadata={"original_filename": filename, "type": "video_thumbnail", "parent_video": object_key},
                )
                image_filename = thumbnail_url
        except Exception as e:
            import traceback
            print(f"Failed to upload story video to S3: {e}")
            print(traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"Failed to upload video to S3. Error: {e}")

    # Manager-authored stories require admin approval before going live.
    pending = not _is_admin(current_user)

    db_story = Story(
        title=title,
        summary=summary,
        content=content,
        image_filename=image_filename if image_filename else None,
        video_filename=final_video_filename,
        is_active=is_active,
        is_featured=is_featured,
        is_pending_approval=pending,
        created_by_user_id=current_user.id,
    )
    db.add(db_story)
    db.commit()
    db.refresh(db_story)
    return db_story


@router.put("/{story_id}", response_model=StoryResponse)
async def update_story(
    story_id: int,
    title: str = Form(...),
    summary: str = Form(...),
    content: str = Form(...),
    image_filename: Optional[str] = Form(None),
    video_filename: Optional[str] = Form(None),
    video: Optional[UploadFile] = File(None),
    remove_video: Optional[bool] = Form(False),
    is_active: bool = Form(True),
    is_featured: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    if not _can_edit_story(current_user, story):
        raise HTTPException(status_code=403, detail="You can only edit stories you created")

    # Video handling --------------------------------------------------
    if remove_video:
        if story.video_filename:
            _delete_video_asset(story.video_filename)
        story.video_filename = None
    elif video_filename and video_filename.strip() and not (video and video.filename):
        if story.video_filename and story.video_filename != video_filename.strip():
            _delete_video_asset(story.video_filename)
        story.video_filename = video_filename.strip()
    elif video and video.filename:
        if not video.content_type.startswith('video/'):
            raise HTTPException(status_code=400, detail="File must be a video")
        if story.video_filename:
            _delete_video_asset(story.video_filename)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = os.path.splitext(video.filename)[1]
        filename = f"{timestamp}_{title.replace(' ', '_')}{file_extension}"
        content_bytes = await video.read()

        try:
            object_key = generate_object_key("videos", filename)
            s3_url = upload_file(
                file_content=content_bytes,
                object_key=object_key,
                content_type=video.content_type,
                metadata={"original_filename": video.filename, "type": "story_video"},
            )
            story.video_filename = s3_url

            thumbnail_data = generate_video_thumbnail(content_bytes)
            if thumbnail_data and not image_filename:
                thumbnail_filename = f"{timestamp}_{title.replace(' ', '_')}_thumb.jpg"
                thumbnail_key = generate_object_key("images", thumbnail_filename)
                thumbnail_url = upload_file(
                    file_content=thumbnail_data,
                    object_key=thumbnail_key,
                    content_type="image/jpeg",
                    metadata={"original_filename": filename, "type": "video_thumbnail", "parent_video": object_key},
                )
                story.image_filename = thumbnail_url
        except Exception as e:
            import traceback
            print(f"Failed to upload story video to S3: {e}")
            print(traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"Failed to upload video to S3. Error: {e}")

    # Image handling --------------------------------------------------
    old_image = story.image_filename
    if image_filename is not None:
        if old_image and (not image_filename or image_filename != old_image):
            old_path = os.path.join("uploads/stories", old_image)
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except Exception as e:
                    print(f"Warning: could not delete old image {old_path}: {e}")
        story.image_filename = image_filename

    story.title = title
    story.summary = summary
    story.content = content
    story.is_active = is_active
    story.is_featured = is_featured

    # Manager edits send the story back to pending; admin edits do not change the
    # approval state (admin can use the /approve endpoint explicitly).
    if not _is_admin(current_user):
        story.is_pending_approval = True

    db.commit()
    db.refresh(story)
    return story


@router.delete("/{story_id}")
async def delete_story(
    story_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    if not _can_edit_story(current_user, story):
        raise HTTPException(status_code=403, detail="You can only delete stories you created")

    if story.video_filename:
        _delete_video_asset(story.video_filename)

    if story.image_filename and not story.image_filename.startswith(('http://', 'https://')):
        image_path = os.path.join("uploads/stories", story.image_filename)
        if os.path.exists(image_path):
            try:
                os.remove(image_path)
            except Exception as e:
                print(f"Warning: could not delete image file {image_path}: {e}")

    db.delete(story)
    db.commit()
    return {"message": "Story deleted"}


# ─────────────────────────────────────────────────────────────────────
# Admin-only approval
# ─────────────────────────────────────────────────────────────────────

@router.post("/{story_id}/approve", response_model=StoryResponse)
async def approve_story(
    story_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Approve a pending story so it becomes visible on the public site."""
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    story.is_pending_approval = False
    db.commit()
    db.refresh(story)
    return story


@router.post("/{story_id}/reject", response_model=StoryResponse)
async def reject_story(
    story_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Send a story back to pending state (e.g. after a problematic manager edit)."""
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    story.is_pending_approval = True
    db.commit()
    db.refresh(story)
    return story
