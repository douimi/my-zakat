from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import FileResponse, Response
import os
from pathlib import Path

router = APIRouter()

# Video and image directories
VIDEO_DIR = "uploads/media/videos"
IMAGE_DIR = "uploads/media/images"
STORIES_VIDEO_DIR = "uploads/stories"
STORIES_IMAGE_DIR = "uploads/stories"
TESTIMONIALS_VIDEO_DIR = "uploads/testimonials"
TESTIMONIALS_IMAGE_DIR = "uploads/testimonials"
EVENTS_IMAGE_DIR = "uploads/events"


def get_content_type(filename: str) -> str:
    """Determine content type based on file extension"""
    ext = Path(filename).suffix.lower()
    content_types = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.ogg': 'video/ogg',
        '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
    }
    return content_types.get(ext, 'application/octet-stream')


@router.options("/media/videos/{filename}")
async def options_video(filename: str):
    """Handle CORS preflight requests for videos"""
    return Response(
        status_code=200,
        headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range',
            'Access-Control-Max-Age': '3600',
        }
    )

@router.head("/media/videos/{filename}")
async def head_video(filename: str):
    """Handle HEAD requests for video metadata"""
    # Security: prevent directory traversal
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    file_path = os.path.join(VIDEO_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video not found")
    
    file_size = os.path.getsize(file_path)
    content_type = get_content_type(filename)
    
    return Response(
        status_code=200,
        headers={
            'Content-Type': content_type,
            'Content-Length': str(file_size),
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=86400',  # Cache for 1 day
        }
    )

@router.get("/media/videos/{filename}")
async def serve_video(filename: str, request: Request):
    """
    Serve video files with proper range request support for video playback
    """
    # Security: prevent directory traversal
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    file_path = os.path.join(VIDEO_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video not found")
    
    file_size = os.path.getsize(file_path)
    content_type = get_content_type(filename)
    
    # Handle range requests for video seeking
    range_header = request.headers.get('range')
    
    if range_header:
        # Parse range header
        range_match = range_header.replace('bytes=', '').split('-')
        start = int(range_match[0]) if range_match[0] else 0
        end = int(range_match[1]) if range_match[1] and range_match[1] else file_size - 1
        
        # Ensure valid range
        if start >= file_size or end >= file_size:
            raise HTTPException(status_code=416, detail="Range Not Satisfiable")
        
        # Open file and read chunk
        with open(file_path, 'rb') as f:
            f.seek(start)
            chunk_size = end - start + 1
            data = f.read(chunk_size)
        
        # Return partial content response
        return Response(
            content=data,
            status_code=206,
            media_type=content_type,
            headers={
                'Content-Range': f'bytes {start}-{end}/{file_size}',
                'Accept-Ranges': 'bytes',
                'Content-Length': str(chunk_size),
                'Content-Type': content_type,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                'Access-Control-Allow-Headers': 'Range',
                'Cache-Control': 'public, max-age=86400',  # Cache for 1 day
            }
        )
    else:
        # Return full file
        return FileResponse(
            file_path,
            media_type=content_type,
            headers={
                'Accept-Ranges': 'bytes',
                'Content-Length': str(file_size),
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=86400',  # Cache for 1 day
            }
        )


@router.get("/media/images/{filename}")
async def serve_image(filename: str):
    """
    Serve image files
    """
    # Security: prevent directory traversal
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    file_path = os.path.join(IMAGE_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Image not found")
    
    content_type = get_content_type(filename)
    return FileResponse(
        file_path, 
        media_type=content_type,
        headers={
            'Access-Control-Allow-Origin': '*',
        }
    )


@router.get("/stories/{filename}")
async def serve_story_media(filename: str, request: Request):
    """
    Serve story media files (images or videos) with range support for videos
    """
    # Security: prevent directory traversal
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    file_path = os.path.join(STORIES_VIDEO_DIR, filename)
    
    # Check if it's a video or image
    is_video = filename.lower().endswith(('.mp4', '.webm', '.ogg', '.avi', '.mov'))
    
    if not os.path.exists(file_path):
        # Try image directory
        file_path = os.path.join(STORIES_IMAGE_DIR, filename)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found")
    
    content_type = get_content_type(filename)
    
    if is_video:
        # Handle range requests for video
        file_size = os.path.getsize(file_path)
        range_header = request.headers.get('range')
        
        if range_header:
            range_match = range_header.replace('bytes=', '').split('-')
            start = int(range_match[0]) if range_match[0] else 0
            end = int(range_match[1]) if range_match[1] and range_match[1] else file_size - 1
            
            if start >= file_size or end >= file_size:
                raise HTTPException(status_code=416, detail="Range Not Satisfiable")
            
            with open(file_path, 'rb') as f:
                f.seek(start)
                chunk_size = end - start + 1
                data = f.read(chunk_size)
            
            return Response(
                content=data,
                status_code=206,
                media_type=content_type,
                headers={
                    'Content-Range': f'bytes {start}-{end}/{file_size}',
                    'Accept-Ranges': 'bytes',
                    'Content-Length': str(chunk_size),
                    'Content-Type': content_type,
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                    'Access-Control-Allow-Headers': 'Range',
                }
            )
    
    from fastapi.responses import FileResponse
    return FileResponse(file_path, media_type=content_type)


@router.get("/testimonials/{filename}")
async def serve_testimonial_media(filename: str, request: Request):
    """
    Serve testimonial media files (images or videos) with range support for videos
    """
    # Security: prevent directory traversal
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    file_path = os.path.join(TESTIMONIALS_VIDEO_DIR, filename)
    
    # Check if it's a video or image
    is_video = filename.lower().endswith(('.mp4', '.webm', '.ogg', '.avi', '.mov'))
    
    if not os.path.exists(file_path):
        # Try image directory (testimonials use same directory for both)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found")
    
    content_type = get_content_type(filename)
    
    if is_video:
        # Handle range requests for video
        file_size = os.path.getsize(file_path)
        range_header = request.headers.get('range')
        
        if range_header:
            range_match = range_header.replace('bytes=', '').split('-')
            start = int(range_match[0]) if range_match[0] else 0
            end = int(range_match[1]) if range_match[1] and range_match[1] else file_size - 1
            
            if start >= file_size or end >= file_size:
                raise HTTPException(status_code=416, detail="Range Not Satisfiable")
            
            with open(file_path, 'rb') as f:
                f.seek(start)
                chunk_size = end - start + 1
                data = f.read(chunk_size)
            
            return Response(
                content=data,
                status_code=206,
                media_type=content_type,
                headers={
                    'Content-Range': f'bytes {start}-{end}/{file_size}',
                    'Accept-Ranges': 'bytes',
                    'Content-Length': str(chunk_size),
                    'Content-Type': content_type,
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                    'Access-Control-Allow-Headers': 'Range',
                }
            )
    
    from fastapi.responses import FileResponse
    return FileResponse(file_path, media_type=content_type)


@router.get("/events/{filename}")
async def serve_event_image(filename: str):
    """
    Serve event image files
    """
    # Security: prevent directory traversal
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    file_path = os.path.join(EVENTS_IMAGE_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Image not found")
    
    content_type = get_content_type(filename)
    return FileResponse(
        file_path, 
        media_type=content_type,
        headers={
            'Access-Control-Allow-Origin': '*',
        }
    )

