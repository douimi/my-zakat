from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import FileResponse, Response, RedirectResponse
import os
from pathlib import Path
from s3_service import file_exists, get_file_url, download_file, extract_object_key_from_url, get_file_info

router = APIRouter()

# Video and image directories
VIDEO_DIR = "uploads/media/videos"
IMAGE_DIR = "uploads/media/images"
STORIES_VIDEO_DIR = "uploads/stories"
STORIES_IMAGE_DIR = "uploads/stories"
TESTIMONIALS_VIDEO_DIR = "uploads/testimonials"
TESTIMONIALS_IMAGE_DIR = "uploads/testimonials"
EVENTS_IMAGE_DIR = "uploads/events"
PROGRAM_CATEGORIES_DIR = "uploads/program_categories"
PROGRAMS_DIR = "uploads/programs"


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
    Proxies videos from S3 with range request support for video seeking
    """
    from urllib.parse import unquote
    
    # Decode URL-encoded filename
    filename = unquote(filename)
    
    # Security: prevent directory traversal (but allow forward slashes for S3 paths)
    if '..' in filename or filename.startswith('/'):
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    # If filename is already an S3 URL, extract object key
    object_key = None
    if filename.startswith('http://') or filename.startswith('https://'):
        # Extract object key from S3 URL
        object_key = extract_object_key_from_url(filename)
        if not object_key:
            # If we can't extract, try to redirect (for external URLs)
            return RedirectResponse(url=filename)
    else:
        # Handle cases where filename might be "videos/filename.mp4" or just "filename.mp4"
        if '/' in filename:
            object_key = filename if filename.startswith('videos/') else f"videos/{filename.split('/')[-1]}"
        else:
            object_key = f"videos/{filename}"
    
    # Try to serve from S3 FIRST - never fall back to filesystem
    if object_key and file_exists(object_key):
        try:
            print(f"📥 Serving video from S3: {object_key}")
            
            # Get file info from S3
            file_info = get_file_info(object_key)
            if not file_info:
                raise HTTPException(status_code=404, detail=f"Video not found in S3: {object_key}")
            
            file_size = file_info['size']
            content_type = file_info.get('content_type', 'video/mp4')
            
            # Handle range requests for video seeking
            range_header = request.headers.get('range')
            
            # For HEAD requests or metadata-only requests, return file info without body
            if request.method == 'HEAD':
                return Response(
                    status_code=200,
                    headers={
                        'Content-Type': content_type,
                        'Content-Length': str(file_size),
                        'Accept-Ranges': 'bytes',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'public, max-age=86400',
                    }
                )
            
            if range_header:
                # Parse range header
                range_match = range_header.replace('bytes=', '').split('-')
                start = int(range_match[0]) if range_match[0] else 0
                end = int(range_match[1]) if range_match[1] else file_size - 1
                
                # Ensure valid range
                if start >= file_size:
                    raise HTTPException(status_code=416, detail="Range Not Satisfiable")
                if end >= file_size:
                    end = file_size - 1
                
                # Download specific range from S3
                from s3_service import get_s3_client, S3_BUCKET_NAME
                client = get_s3_client()
                
                response = client.get_object(
                    Bucket=S3_BUCKET_NAME,
                    Key=object_key,
                    Range=f'bytes={start}-{end}'
                )
                
                chunk_data = response['Body'].read()
                chunk_size = len(chunk_data)
                
                print(f"✅ Serving video range {start}-{end} from S3: {object_key} ({chunk_size} bytes)")
                
                # Return partial content response
                return Response(
                    content=chunk_data,
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
                        'Cache-Control': 'public, max-age=86400',
                    }
                )
            else:
                # Return full file from S3
                file_content = download_file(object_key)
                if not file_content:
                    raise HTTPException(status_code=404, detail=f"Video not found in S3: {object_key}")
                
                print(f"✅ Successfully served full video from S3: {object_key} ({len(file_content)} bytes)")
                
                return Response(
                    content=file_content,
                    media_type=content_type,
                    headers={
                        'Accept-Ranges': 'bytes',
                        'Content-Length': str(file_size),
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                        'Access-Control-Allow-Headers': 'Range',
                        'Cache-Control': 'public, max-age=86400',
                    }
                )
        except Exception as e:
            import traceback
            print(f"❌ Error serving video from S3: {object_key}")
            print(f"   Error: {str(e)}")
            print(traceback.format_exc())
            # Don't fall back to filesystem - fail instead
            raise HTTPException(status_code=500, detail=f"Failed to retrieve video from S3: {str(e)}")
    
    # If we reach here, file doesn't exist in S3
    print(f"⚠️  Video not found in S3: {object_key or filename}")
    raise HTTPException(status_code=404, detail=f"Video not found in S3: {object_key or filename}")


@router.get("/media/images/{filename:path}")
async def serve_image(filename: str):
    """
    Serve image files
    If filename is an S3 URL, extract object key and serve from S3. Otherwise check S3 first, then local filesystem.
    """
    from urllib.parse import unquote
    
    # Decode URL-encoded filename
    filename = unquote(filename)
    
    # Security: prevent directory traversal (but allow forward slashes for S3 paths)
    if '..' in filename or filename.startswith('/'):
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    # If filename is already an S3 URL, extract the object key
    object_key = None
    if filename.startswith('http://') or filename.startswith('https://'):
        # Extract object key from S3 URL
        object_key = extract_object_key_from_url(filename)
        if not object_key:
            # If we can't extract, try to redirect (for external URLs)
            return RedirectResponse(url=filename)
    else:
        # Extract just the filename if it contains path separators
        # Handle cases where filename might be "images/filename.jpg" or just "filename.jpg"
        if '/' in filename:
            # If it already has the path, use it as-is
            object_key = filename if filename.startswith('images/') or filename.startswith('videos/') else f"images/{filename.split('/')[-1]}"
        else:
            # Check S3 first - simple structure: images/filename
            object_key = f"images/{filename}"
    
    # Try to serve from S3 FIRST - never fall back to filesystem
    if object_key:
        # Check if file exists in S3
        if file_exists(object_key):
            try:
                print(f"📥 Serving image from S3: {object_key}")
                file_content = download_file(object_key)
                if file_content:
                    file_info = get_file_info(object_key)
                    content_type = file_info.get('content_type', 'image/jpeg') if file_info else get_content_type(filename.split('/')[-1])
                    print(f"✅ Successfully served image from S3: {object_key} ({len(file_content)} bytes)")
                    return Response(
                        content=file_content,
                        media_type=content_type,
                        headers={
                            'Access-Control-Allow-Origin': '*',
                            'Cache-Control': 'public, max-age=86400',
                        }
                    )
                else:
                    print(f"⚠️  S3 file exists but content is empty: {object_key}")
            except Exception as e:
                import traceback
                print(f"❌ Error serving image from S3: {object_key}")
                print(f"   Error: {str(e)}")
                print(traceback.format_exc())
                # Don't fall back to filesystem - fail instead
                raise HTTPException(status_code=500, detail=f"Failed to retrieve image from S3: {str(e)}")
        else:
            print(f"⚠️  Image not found in S3: {object_key}")
    
    # If we reach here, file doesn't exist in S3
    # Don't fall back to filesystem - fail instead
    raise HTTPException(status_code=404, detail=f"Image not found in S3: {object_key or filename}")


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


@router.options("/program_categories/{filename}")
async def options_program_category_video(filename: str):
    """Handle CORS preflight requests for program category videos"""
    return Response(
        status_code=200,
        headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range',
            'Access-Control-Max-Age': '3600',
        }
    )


@router.head("/program_categories/{filename}")
async def head_program_category_video(filename: str):
    """Handle HEAD requests for program category video metadata"""
    # Security: prevent directory traversal
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    file_path = os.path.join(PROGRAM_CATEGORIES_DIR, filename)
    
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
            'Cache-Control': 'public, max-age=86400',
        }
    )


@router.get("/program_categories/{filename}")
async def serve_program_category_video(filename: str, request: Request):
    """
    Serve program category video files with proper range request support for video playback
    """
    # Security: prevent directory traversal
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    file_path = os.path.join(PROGRAM_CATEGORIES_DIR, filename)
    
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
                'Cache-Control': 'public, max-age=86400',
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
                'Cache-Control': 'public, max-age=86400',
            }
        )


@router.options("/programs/{filename}")
async def options_program_video(filename: str):
    """Handle CORS preflight requests for program videos"""
    return Response(
        status_code=200,
        headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range',
            'Access-Control-Max-Age': '3600',
        }
    )


@router.head("/programs/{filename}")
async def head_program_video(filename: str):
    """Handle HEAD requests for program video metadata"""
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    file_path = os.path.join(PROGRAMS_DIR, filename)
    
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
            'Cache-Control': 'public, max-age=86400',
        }
    )


@router.get("/programs/{filename}")
async def serve_program_video(filename: str, request: Request):
    """Serve program video files with proper range request support"""
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    file_path = os.path.join(PROGRAMS_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video not found")
    
    file_size = os.path.getsize(file_path)
    content_type = get_content_type(filename)
    
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
                'Cache-Control': 'public, max-age=86400',
            }
        )
    else:
        return FileResponse(
            file_path,
            media_type=content_type,
            headers={
                'Accept-Ranges': 'bytes',
                'Content-Length': str(file_size),
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=86400',
            }
        )

