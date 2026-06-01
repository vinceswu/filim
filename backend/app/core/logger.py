import logging
import os
from logging.handlers import RotatingFileHandler

from app.core.config import settings


def setup_logging():
    """Configure efficient and standard logging for the Filim backend.

    Optimized for Raspberry Pi by using standard handlers and rotating files
    to prevent SD card wear. Removed Rich dependency for better performance.
    """

    log_dir = os.path.join(os.getcwd(), "logs")
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)

    log_file = os.path.join(log_dir, "filim.log")

    console_format = "%(levelname)-8s | %(message)s"
    console_formatter = logging.Formatter(console_format)
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(console_formatter)

    file_format = "%(asctime)s | %(levelname)-8s| %(name)s | %(filename)s:%(lineno)d | %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"
    file_formatter = logging.Formatter(file_format, date_format)

    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=5 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(file_formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(settings.log_level.upper())

    root_logger.handlers = []

    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)

    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    logging.info("Logging initialized (Standard Console & Rotating File)")
