"""
Media processing utilities for compression and thumbnail generation
"""
import os
import io
from PIL import Image
from typing import Optional, Tuple
import subprocess
import tempfile

# Image compression settings
IMAGE_QUALITY = 85  # JPEG quality (1-100)
IMAGE_MAX_WIDTH = 1920
IMAGE_MAX_HEIGHT = 1920

# Video compression settings
VIDEO_CRF = 23  # Constant Rate Factor (18-28, lower = better quality)
VIDEO_MAX_WIDTH = 1920
VIDEO_MAX_HEIGHT = 1080
VIDEO_BITRATE = "2M"  # Target bitrate

# Thumbnail settings
THUMBNAIL_WIDTH = 640
THUMBNAIL_HEIGHT = 360
THUMBNAIL_QUALITY = 80


def compress_image(image_data: bytes, max_width: int = IMAGE_MAX_WIDTH, max_height: int = IMAGE_MAX_HEIGHT, quality: int = IMAGE_QUALITY) -> bytes:
    """
    Compress an image while maintaining quality
    
    Args:
        image_data: Original image bytes
        max_width: Maximum width (maintains aspect ratio)
        max_height: Maximum height (maintains aspect ratio)
        quality: JPEG quality (1-100)
    
    Returns:
        Compressed image bytes
    """
    try:
        # Open image
        image = Image.open(io.BytesIO(image_data))
        
        # Convert RGBA to RGB if necessary (for JPEG)
        if image.mode in ('RGBA', 'LA', 'P'):
            # Create white background
            rgb_image = Image.new('RGB', image.size, (255, 255, 255))
            if image.mode == 'P':
                image = image.convert('RGBA')
            rgb_image.paste(image, mask=image.split()[-1] if image.mode == 'RGBA' else None)
            image = rgb_image
        elif image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Calculate new dimensions maintaining aspect ratio
        width, height = image.size
        if width > max_width or height > max_height:
            ratio = min(max_width / width, max_height / height)
            new_width = int(width * ratio)
            new_height = int(height * ratio)
            image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # Save compressed image
        output = io.BytesIO()
        image.save(output, format='JPEG', quality=quality, optimize=True)
        compressed_data = output.getvalue()
        
        original_size = len(image_data)
        compressed_size = len(compressed_data)
        compression_ratio = (1 - compressed_size / original_size) * 100
        
        print(f"📦 Image compressed: {original_size} bytes → {compressed_size} bytes ({compression_ratio:.1f}% reduction)")
        
        return compressed_data
    except Exception as e:
        print(f"⚠️  Warning: Image compression failed: {e}")
        # Return original if compression fails
        return image_data


def generate_video_thumbnail(video_data: bytes, output_format: str = 'JPEG') -> Optional[bytes]:
    """
    Generate a thumbnail from a video file
    
    Args:
        video_data: Video file bytes
        output_format: Output image format (JPEG, PNG)
    
    Returns:
        Thumbnail image bytes or None if generation fails
    """
    try:
        # Check if ffmpeg is available
        try:
            subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("⚠️  Warning: ffmpeg not found. Video thumbnail generation disabled.")
            print("   Install ffmpeg: apt-get install ffmpeg (Linux) or brew install ffmpeg (Mac)")
            return None
        
        # Create temporary files
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as video_file:
            video_file.write(video_data)
            video_path = video_file.name
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as thumbnail_file:
            thumbnail_path = thumbnail_file.name
        
        try:
            # Use ffmpeg to extract frame at 1 second
            cmd = [
                'ffmpeg',
                '-i', video_path,
                '-ss', '00:00:01',  # Seek to 1 second
                '-vframes', '1',  # Extract 1 frame
                '-vf', f'scale={THUMBNAIL_WIDTH}:{THUMBNAIL_HEIGHT}:force_original_aspect_ratio=decrease',
                '-q:v', '2',  # High quality
                '-y',  # Overwrite output file
                thumbnail_path
            ]
            
            result = subprocess.run(cmd, capture_output=True, timeout=30)
            
            if result.returncode == 0 and os.path.exists(thumbnail_path):
                with open(thumbnail_path, 'rb') as f:
                    thumbnail_data = f.read()
                
                print(f"✅ Video thumbnail generated: {len(thumbnail_data)} bytes")
                return thumbnail_data
            else:
                print(f"⚠️  Warning: ffmpeg thumbnail generation failed: {result.stderr.decode()}")
                return None
        finally:
            # Clean up temporary files
            try:
                os.unlink(video_path)
            except:
                pass
            try:
                os.unlink(thumbnail_path)
            except:
                pass
    except Exception as e:
        print(f"⚠️  Warning: Video thumbnail generation error: {e}")
        import traceback
        print(traceback.format_exc())
        return None


def compress_video(video_data: bytes, max_width: int = VIDEO_MAX_WIDTH, max_height: int = VIDEO_MAX_HEIGHT) -> bytes:
    """
    Compress a video file using ffmpeg
    
    Args:
        video_data: Original video bytes
        max_width: Maximum width
        max_height: Maximum height
    
    Returns:
        Compressed video bytes (or original if compression fails)
    """
    try:
        # Check if ffmpeg is available
        try:
            subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("⚠️  Warning: ffmpeg not found. Video compression disabled.")
            return video_data
        
        # Create temporary files
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as input_file:
            input_file.write(video_data)
            input_path = input_file.name
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as output_file:
            output_path = output_file.name
        
        try:
            # Get video dimensions first
            probe_cmd = [
                'ffprobe',
                '-v', 'error',
                '-select_streams', 'v:0',
                '-show_entries', 'stream=width,height',
                '-of', 'csv=p=0',
                input_path
            ]
            
            probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=10)
            
            if probe_result.returncode == 0:
                dimensions = probe_result.stdout.strip().split(',')
                if len(dimensions) == 2:
                    width = int(dimensions[0])
                    height = int(dimensions[1])
                    
                    # Calculate scale if needed
                    scale_filter = None
                    if width > max_width or height > max_height:
                        ratio = min(max_width / width, max_height / height)
                        new_width = int(width * ratio)
                        new_height = int(height * ratio)
                        # Ensure even dimensions for codec compatibility
                        new_width = new_width - (new_width % 2)
                        new_height = new_height - (new_height % 2)
                        scale_filter = f'scale={new_width}:{new_height}'
            
            # Compress video
            cmd = [
                'ffmpeg',
                '-i', input_path,
                '-c:v', 'libx264',  # H.264 codec
                '-crf', str(VIDEO_CRF),  # Quality setting
                '-preset', 'medium',  # Encoding speed
                '-c:a', 'aac',  # Audio codec
                '-b:a', '128k',  # Audio bitrate
                '-movflags', '+faststart',  # Web optimization
                '-y',  # Overwrite output
            ]
            
            if scale_filter:
                cmd.extend(['-vf', scale_filter])
            
            cmd.append(output_path)
            
            result = subprocess.run(cmd, capture_output=True, timeout=300)  # 5 minute timeout
            
            if result.returncode == 0 and os.path.exists(output_path):
                with open(output_path, 'rb') as f:
                    compressed_data = f.read()
                
                original_size = len(video_data)
                compressed_size = len(compressed_data)
                compression_ratio = (1 - compressed_size / original_size) * 100
                
                print(f"📦 Video compressed: {original_size} bytes → {compressed_size} bytes ({compression_ratio:.1f}% reduction)")
                
                return compressed_data
            else:
                print(f"⚠️  Warning: Video compression failed: {result.stderr.decode()}")
                return video_data
        finally:
            # Clean up temporary files
            try:
                os.unlink(input_path)
            except:
                pass
            try:
                os.unlink(output_path)
            except:
                pass
    except Exception as e:
        print(f"⚠️  Warning: Video compression error: {e}")
        import traceback
        print(traceback.format_exc())
        # Return original if compression fails
        return video_data


def should_compress_image(content_type: str) -> bool:
    """Check if image should be compressed"""
    return content_type.startswith('image/') and content_type not in ('image/svg+xml', 'image/gif')


def should_compress_video(content_type: str) -> bool:
    """Check if video should be compressed"""
    return content_type.startswith('video/')

