"""
Selective secure deletion of a single file, addressing all three
erasure targets in order:
  1. Content — overwritten with random bytes (same size), so recovering
     the deleted file's data via carving is not possible.
  2. Filename/timestamp metadata — scrubbed via metadata_scrubber before
     the final unlink, so the last directory-entry record isn't the
     meaningful original name.
  3. The directory entry itself — removed via os.remove/os.rmdir.

Order matters: content must be overwritten BEFORE the file is renamed
away and deleted, since we need a stable path to open and overwrite.
"""
import os
from dataclasses import dataclass

from src.metadata_scrubber import scrub_metadata

CHUNK_SIZE = 1024 * 1024


@dataclass
class DeleteResult:
    original_path: str
    success: bool
    bytes_overwritten: int
    metadata_scrubbed: bool
    error: str | None = None


def _overwrite_content(path: str) -> int:
    """Overwrite the file's content in place with random bytes of the
    same length, flushing to disk. Returns bytes written."""
    size = os.path.getsize(path)
    bytes_written = 0
    with open(path, "r+b") as f:
        f.seek(0)
        while bytes_written < size:
            chunk = min(CHUNK_SIZE, size - bytes_written)
            f.write(os.urandom(chunk))
            bytes_written += chunk
        f.flush()
        os.fsync(f.fileno())
    return bytes_written


def secure_delete_file(path: str) -> DeleteResult:
    """Securely delete a single file. Never raises — failures (missing
    file, permission denied, etc.) are captured in the result so a batch
    operation can continue past one bad target instead of aborting
    everything else in the batch."""
    if not os.path.isfile(path):
        return DeleteResult(
            original_path=path, success=False, bytes_overwritten=0,
            metadata_scrubbed=False, error="File not found",
        )

    bytes_overwritten = 0
    try:
        bytes_overwritten = _overwrite_content(path)
        scrub_result = scrub_metadata(path)
        os.remove(scrub_result.final_path)
        return DeleteResult(
            original_path=path, success=True,
            bytes_overwritten=bytes_overwritten, metadata_scrubbed=True,
        )
    except OSError as e:
        return DeleteResult(
            original_path=path, success=False, bytes_overwritten=bytes_overwritten,
            metadata_scrubbed=False, error=str(e),
        )


def secure_delete_folder(folder_path: str) -> list[DeleteResult]:
    """Recursively secure-delete every file in a folder, then remove the
    now-empty directory tree bottom-up. Returns one DeleteResult per
    file processed."""
    results: list[DeleteResult] = []

    if not os.path.isdir(folder_path):
        return [DeleteResult(
            original_path=folder_path, success=False, bytes_overwritten=0,
            metadata_scrubbed=False, error="Folder not found",
        )]

    for root, _dirs, files in os.walk(folder_path, topdown=False):
        for filename in files:
            file_path = os.path.join(root, filename)
            results.append(secure_delete_file(file_path))

    # Remove now-empty directories, deepest first (os.walk topdown=False
    # already gives us that order for the files; now clean up dirs).
    for root, dirs, _files in os.walk(folder_path, topdown=False):
        for dirname in dirs:
            dir_path = os.path.join(root, dirname)
            try:
                os.rmdir(dir_path)
            except OSError:
                pass  # not empty (e.g. a file failed to delete) — leave it, don't crash the batch
    try:
        os.rmdir(folder_path)
    except OSError:
        pass

    return results
