"""
Metadata scrubbing.

When a file is deleted normally, its FILENAME can still be recoverable
from filesystem journals, directory entry slack space, or forensic
tools even after the content is gone — a directory listing that once
said "confidential_report.pdf" is itself a piece of evidence. This
module scrubs that trail by renaming the file through several random
names (and resetting its timestamps) BEFORE the final delete, so the
last filename/metadata a forensic scan would find is meaningless.

Honest limitation: this is a software-level mitigation. Complete
scrubbing of filesystem journal entries (NTFS $LogFile, ext4 journal)
requires OS/filesystem-specific tooling operating below what portable
Python can reach — documented here rather than glossed over.
"""
import os
import random
import string
import sys
from dataclasses import dataclass

RENAME_PASSES = 3


@dataclass
class ScrubResult:
    final_path: str
    rename_passes: int
    timestamps_reset: bool


def _random_name(length: int = 16) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))


def reset_timestamps(path: str) -> None:
    """Reset timestamps using a value supported by the target filesystem.

    FAT-family removable media cannot represent Unix epoch timestamps and
    raises WinError 87 for ``(0, 0)``.  1980-01-01 is the earliest portable
    Windows/FAT timestamp; POSIX filesystems retain the Unix epoch behavior.
    """
    scrub_timestamp = 315532800 if sys.platform.startswith("win") else 0
    os.utime(path, (scrub_timestamp, scrub_timestamp))


def scrub_filename(path: str, passes: int = RENAME_PASSES) -> str:
    """Rename the file through `passes` random names in its own
    directory, returning the final path. Each intermediate rename
    overwrites the directory entry, so the original meaningful filename
    is no longer the most recent one on record."""
    directory = os.path.dirname(path) or "."
    current_path = path

    for _ in range(passes):
        new_name = _random_name()
        new_path = os.path.join(directory, new_name)
        os.rename(current_path, new_path)
        current_path = new_path

    return current_path


def scrub_metadata(path: str) -> ScrubResult:
    """Full metadata scrub: reset timestamps, then scrub the filename.
    Order matters — timestamps must be reset on the file BEFORE its
    final rename, since renaming doesn't reliably reset mtime on all
    filesystems but we want the scrubbed state to be the last one
    recorded regardless."""
    reset_timestamps(path)
    final_path = scrub_filename(path)
    return ScrubResult(final_path=final_path, rename_passes=RENAME_PASSES, timestamps_reset=True)
