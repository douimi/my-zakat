"""Tests for the direct-S3-URL predicate the audit script gates the bucket
policy removal on (Task 19).

`_is_direct_s3_url` is the one thing that decides whether the audit — and by
extension the decision to drop the public-read bucket policy — can be
trusted. It is pure (no DB, no network) and cheap to test directly, so this
module imports the script the same way a caller would
(`python -m scripts.audit_direct_s3_urls`) rather than re-implementing the
predicate.
"""
from scripts.audit_direct_s3_urls import _is_direct_s3_url, S3_BUCKET_NAME


def test_none_is_not_a_direct_url():
    assert _is_direct_s3_url(None) is False


def test_non_string_is_not_a_direct_url():
    assert _is_direct_s3_url(12345) is False


def test_relative_path_is_not_a_direct_url():
    # No scheme at all -- served by whatever renders it, not a bucket read.
    assert _is_direct_s3_url("/api/uploads/media/images/foo.jpg") is False


def test_proxy_url_is_not_a_direct_url():
    assert _is_direct_s3_url(
        "https://myzakat.org/api/uploads/media/images/foo.jpg"
    ) is False


def test_media_library_proxy_url_is_not_a_direct_url():
    assert _is_direct_s3_url("https://myzakat.org/api/media-library/5/file") is False


def test_direct_minio_url_with_bucket_name_is_flagged():
    url = f"http://31.97.131.31:9000/{S3_BUCKET_NAME}/workspaces/7/2026/03/abc.jpg"
    assert _is_direct_s3_url(url) is True


def test_direct_url_with_only_the_minio_port_is_flagged():
    # Bucket name absent (e.g. a virtual-hosted-style URL) but the MinIO
    # default port is present -- still a direct S3 read, not a proxy.
    url = f"http://{S3_BUCKET_NAME}.minio.internal:9000/workspaces/7/2026/03/abc.jpg"
    assert _is_direct_s3_url(url) is True


def test_unrelated_https_url_is_not_flagged():
    assert _is_direct_s3_url("https://images.example.com/thumb/1.jpg") is False


def test_false_positive_bucket_name_as_a_query_string_substring():
    """Known limitation: the predicate is a plain substring test, not a
    parsed-URL check. A completely unrelated host whose query string happens
    to contain the bucket name as a substring is misclassified as a direct
    S3 URL.

    This is a false positive, not a false negative -- it only ever makes the
    audit over-report, never under-report, so it does not threaten the
    property the audit exists to guarantee (nothing will 404 once the bucket
    goes private). It is asserted here so a future change to the predicate
    that "fixes" this doesn't silently flip the audit into under-reporting.
    """
    url = f"https://cdn.example.com/img.jpg?ref={S3_BUCKET_NAME}-campaign"
    assert _is_direct_s3_url(url) is True


def test_false_positive_bucket_name_substring_within_a_longer_token():
    # Same limitation surfacing as a bare substring match rather than a
    # query string: "myzakat-media-archive" contains "myzakat-media".
    url = f"https://unrelated.example.com/{S3_BUCKET_NAME}-archive/file.jpg"
    assert _is_direct_s3_url(url) is True


def test_http_and_https_both_count_as_urls():
    url_http = f"http://host:9000/{S3_BUCKET_NAME}/key.jpg"
    url_https = f"https://host:9000/{S3_BUCKET_NAME}/key.jpg"
    assert _is_direct_s3_url(url_http) is True
    assert _is_direct_s3_url(url_https) is True


def test_scheme_relative_or_bare_host_is_not_a_direct_url():
    # No http(s):// prefix -- the predicate is deliberately conservative
    # about what counts as "a URL" at all.
    url = f"//host:9000/{S3_BUCKET_NAME}/key.jpg"
    assert _is_direct_s3_url(url) is False
