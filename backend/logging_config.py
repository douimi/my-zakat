"""
Centralized logging configuration for MyZakat backend.

All loggers inherit from root, so configuring root once gives every module
consistent formatting. Logs go to stdout (Docker captures them → Promtail → Loki).
"""
import logging
import sys
import os

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()


def setup_logging():
    """
    Call once at application startup (before any request is handled).

    Format:  LEVEL | logger_name | message
    Example: INFO | donations | Webhook processed: checkout.session.completed
    """
    root = logging.getLogger()

    # Avoid adding handlers twice if called multiple times
    if root.handlers:
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        fmt="%(levelname)-8s | %(name)-20s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))

    root.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))
    root.addHandler(handler)

    # Quiet down noisy third-party loggers
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("botocore").setLevel(logging.WARNING)
    logging.getLogger("boto3").setLevel(logging.WARNING)
    logging.getLogger("s3transfer").setLevel(logging.WARNING)
    logging.getLogger("stripe").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Get a named logger. Usage: logger = get_logger(__name__)"""
    return logging.getLogger(name)
