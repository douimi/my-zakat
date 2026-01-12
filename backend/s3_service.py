"""
S3-compatible storage service using MinIO
Handles file uploads, downloads, and URL generation
"""
import os
import boto3
from botocore.client import Config
from botocore.exceptions import ClientError, NoCredentialsError
from typing import Optional, BinaryIO
from datetime import datetime
import io
from dotenv import load_dotenv

load_dotenv()

# S3 Configuration
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://minio:9000")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "minioadmin")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "minioadmin")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "myzakat-media")
S3_REGION = os.getenv("S3_REGION", "us-east-1")
S3_USE_SSL = os.getenv("S3_USE_SSL", "false").lower() == "true"
S3_PUBLIC_URL = os.getenv("S3_PUBLIC_URL", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# Initialize S3 client
s3_client = None
bucket_exists = False


def get_s3_client():
    """Get or create S3 client"""
    global s3_client
    if s3_client is None:
        s3_client = boto3.client(
            's3',
            endpoint_url=S3_ENDPOINT,
            aws_access_key_id=S3_ACCESS_KEY,
            aws_secret_access_key=S3_SECRET_KEY,
            config=Config(signature_version='s3v4'),
            region_name=S3_REGION,
            use_ssl=S3_USE_SSL
        )
    return s3_client


def ensure_bucket_cors():
    """Ensure CORS is configured on the bucket"""
    try:
        client = get_s3_client()
        cors_configuration = {
            'CORSRules': [
                {
                    'AllowedOrigins': ['*'],  # Allow all origins
                    'AllowedMethods': ['GET', 'HEAD'],  # Allow GET and HEAD requests
                    'AllowedHeaders': ['*'],  # Allow all headers
                    'ExposeHeaders': ['ETag', 'Content-Length', 'Content-Type'],
                    'MaxAgeSeconds': 3000
                }
            ]
        }
        client.put_bucket_cors(
            Bucket=S3_BUCKET_NAME,
            CORSConfiguration=cors_configuration
        )
        print(f"✅ CORS configuration updated for {S3_BUCKET_NAME}")
        return True
    except Exception as e:
        print(f"⚠️  Warning: Could not set CORS configuration: {e}")
        return False


def ensure_bucket_exists():
    """Ensure the S3 bucket exists, create if it doesn't"""
    global bucket_exists
    if bucket_exists:
        # Still ensure CORS is configured
        ensure_bucket_cors()
        return
    
    try:
        client = get_s3_client()
        # Check if bucket exists
        try:
            client.head_bucket(Bucket=S3_BUCKET_NAME)
            bucket_exists = True
            # Ensure CORS is configured on existing bucket
            ensure_bucket_cors()
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            if error_code == '404':
                # Bucket doesn't exist, create it
                client.create_bucket(Bucket=S3_BUCKET_NAME)
                # Set bucket policy for public read access
                import json
                bucket_policy = {
                    "Version": "2012-10-17",
                    "Statement": [
                        {
                            "Effect": "Allow",
                            "Principal": {"AWS": "*"},
                            "Action": ["s3:GetObject"],
                            "Resource": [f"arn:aws:s3:::{S3_BUCKET_NAME}/*"]
                        }
                    ]
                }
                try:
                    client.put_bucket_policy(
                        Bucket=S3_BUCKET_NAME,
                        Policy=json.dumps(bucket_policy)
                    )
                    print(f"✅ Bucket policy set for public read access on {S3_BUCKET_NAME}")
                except Exception as e:
                    print(f"⚠️  Warning: Could not set bucket policy: {e}")
                    print("   You may need to set it manually in MinIO console")
                
                # Set CORS configuration
                ensure_bucket_cors()
                
                bucket_exists = True
            else:
                raise
    except Exception as e:
        print(f"Error ensuring bucket exists: {e}")
        raise


def upload_file(
    file_content: bytes,
    object_key: str,
    content_type: Optional[str] = None,
    metadata: Optional[dict] = None
) -> str:
    """
    Upload a file to S3
    
    Args:
        file_content: File content as bytes
        object_key: S3 object key (path/filename)
        content_type: MIME type of the file
        metadata: Optional metadata dictionary
    
    Returns:
        Public URL of the uploaded file
    """
    ensure_bucket_exists()
    client = get_s3_client()
    
    try:
        extra_args = {}
        if content_type:
            extra_args['ContentType'] = content_type
        
        if metadata:
            extra_args['Metadata'] = {str(k): str(v) for k, v in metadata.items()}
        
        client.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=object_key,
            Body=file_content,
            **extra_args
        )
        
        # Return public URL
        return get_file_url(object_key)
    except Exception as e:
        print(f"Error uploading file to S3: {e}")
        raise


def delete_file(object_key: str) -> bool:
    """
    Delete a file from S3
    
    Args:
        object_key: S3 object key (path/filename)
    
    Returns:
        True if deleted successfully, False otherwise
    """
    try:
        client = get_s3_client()
        client.delete_object(Bucket=S3_BUCKET_NAME, Key=object_key)
        return True
    except Exception as e:
        print(f"Error deleting file from S3: {e}")
        return False


def file_exists(object_key: str) -> bool:
    """
    Check if a file exists in S3
    
    Args:
        object_key: S3 object key (path/filename)
    
    Returns:
        True if file exists, False otherwise
    """
    try:
        client = get_s3_client()
        client.head_object(Bucket=S3_BUCKET_NAME, Key=object_key)
        return True
    except ClientError as e:
        if e.response.get('Error', {}).get('Code') == '404':
            return False
        raise
    except Exception:
        return False


def get_file_url(object_key: str) -> str:
    """
    Get public URL for a file in S3
    Returns direct S3 URL for public access (MinIO format: http://IP:9000/bucket/object-key)
    
    Args:
        object_key: S3 object key (path/filename)
    
    Returns:
        Public URL of the file (direct S3 URL)
    """
    # If object_key is already a full URL, return as-is
    if object_key.startswith('http://') or object_key.startswith('https://'):
        return object_key
    
    # Construct public URL
    # Remove leading slash if present
    object_key = object_key.lstrip('/')
    
    # Use S3_PUBLIC_URL if configured (should be VPS IP:9000 for now)
    if S3_PUBLIC_URL:
        base_url = S3_PUBLIC_URL.rstrip('/')
        # MinIO direct access format: http://IP:9000/bucket-name/object-key
        return f"{base_url}/{S3_BUCKET_NAME}/{object_key}"
    
    # Fallback: construct from endpoint (internal Docker network)
    # Replace internal hostname with public IP if possible
    endpoint = S3_ENDPOINT
    # If endpoint is internal (minio:9000), try to use public URL
    if 'minio:' in endpoint or 'localhost' in endpoint:
        # Use port 9000 for direct MinIO access
        # Default to localhost for development, but should be set via S3_PUBLIC_URL in production
        endpoint = endpoint.replace('minio:', 'localhost:').replace('localhost:', 'http://localhost:')
        if not endpoint.startswith('http'):
            endpoint = f"http://{endpoint}"
    elif not endpoint.startswith('http'):
        endpoint = f"http://{endpoint}"
    
    return f"{endpoint}/{S3_BUCKET_NAME}/{object_key}"


def download_file(object_key: str) -> Optional[bytes]:
    """
    Download a file from S3
    
    Args:
        object_key: S3 object key (path/filename)
    
    Returns:
        File content as bytes, or None if not found
    """
    try:
        client = get_s3_client()
        response = client.get_object(Bucket=S3_BUCKET_NAME, Key=object_key)
        return response['Body'].read()
    except ClientError as e:
        if e.response.get('Error', {}).get('Code') == 'NoSuchKey':
            return None
        raise
    except Exception as e:
        print(f"Error downloading file from S3: {e}")
        return None


def get_file_info(object_key: str) -> Optional[dict]:
    """
    Get file metadata from S3
    
    Args:
        object_key: S3 object key (path/filename)
    
    Returns:
        Dictionary with file info (size, content_type, last_modified) or None
    """
    try:
        client = get_s3_client()
        response = client.head_object(Bucket=S3_BUCKET_NAME, Key=object_key)
        return {
            'size': response.get('ContentLength', 0),
            'content_type': response.get('ContentType', 'application/octet-stream'),
            'last_modified': response.get('LastModified'),
            'etag': response.get('ETag', '').strip('"')
        }
    except ClientError as e:
        if e.response.get('Error', {}).get('Code') == '404':
            return None
        raise
    except Exception as e:
        print(f"Error getting file info from S3: {e}")
        return None


def list_files(prefix: str = "") -> list:
    """
    List files in S3 bucket with optional prefix
    
    Args:
        prefix: Optional prefix to filter files
    
    Returns:
        List of file objects with key, size, last_modified
    """
    try:
        client = get_s3_client()
        response = client.list_objects_v2(Bucket=S3_BUCKET_NAME, Prefix=prefix)
        
        files = []
        if 'Contents' in response:
            for obj in response['Contents']:
                files.append({
                    'key': obj['Key'],
                    'size': obj['Size'],
                    'last_modified': obj['LastModified'],
                    'url': get_file_url(obj['Key'])
                })
        
        return files
    except Exception as e:
        print(f"Error listing files from S3: {e}")
        return []


def generate_object_key(media_type: str, filename: str) -> str:
    """
    Generate a standardized S3 object key for media files
    
    Args:
        media_type: 'images' or 'videos'
        filename: Original filename
    
    Returns:
        S3 object key (path) - simple structure: images/filename or videos/filename
    """
    # Sanitize filename
    safe_filename = filename.replace(' ', '_').replace('..', '').replace('/', '').replace('\\', '')
    
    # Ensure media_type is either 'images' or 'videos'
    if media_type not in ['images', 'videos']:
        # Try to infer from filename extension
        if safe_filename.lower().endswith(('.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp')):
            media_type = 'images'
        elif safe_filename.lower().endswith(('.mp4', '.webm', '.ogg', '.avi', '.mov', '.mkv')):
            media_type = 'videos'
        else:
            media_type = 'images'  # Default to images
    
    return f"{media_type}/{safe_filename}"


def extract_object_key_from_url(url: str) -> Optional[str]:
    """
    Extract S3 object key from a URL
    
    Args:
        url: Full S3 URL
    
    Returns:
        Object key or None if not a valid S3 URL
    """
    if not url or not (url.startswith('http://') or url.startswith('https://')):
        return None
    
    try:
        parts = url.split('/')
        # Look for bucket name in URL
        bucket_name = S3_BUCKET_NAME
        bucket_idx = -1
        
        for i, part in enumerate(parts):
            if bucket_name in part or 'myzakat-media' in part:
                bucket_idx = i
                break
        
        if bucket_idx >= 0 and bucket_idx < len(parts) - 1:
            # Reconstruct key from parts after bucket
            key_parts = parts[bucket_idx + 1:]
            return '/'.join(key_parts)
        
        return None
    except Exception:
        return None

