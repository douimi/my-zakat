"""Keys for files that must never be public (report invoices, sponsorship documents)."""


def test_private_files_never_share_a_key_or_land_in_the_public_images_prefix():
    import s3_service
    a = s3_service.private_object_key("sponsorship/7", "invoice.PDF")
    b = s3_service.private_object_key("sponsorship/7", "invoice.PDF")
    hostile = s3_service.private_object_key("proposal-reports/../../images", "../../logo.png")

    assert a != b
    assert a.startswith("sponsorship/7/") and a.endswith(".pdf")
    assert not hostile.startswith("images/") and ".." not in hostile


def test_report_attachments_use_private_keys():
    """The defect this pins: report files were keyed images/<uploader's filename>,
    so two teams' invoice.pdf overwrote each other under the public prefix."""
    import inspect
    import routers.proposal_portal as portal
    source = inspect.getsource(portal._store_staged)
    assert "s3_service.private_object_key(" in source
    assert "s3_service.generate_object_key(" not in source
