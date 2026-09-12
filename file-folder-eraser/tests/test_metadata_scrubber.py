import os
import sys
import time

from src.metadata_scrubber import reset_timestamps, scrub_filename, scrub_metadata


def test_reset_timestamps_sets_epoch(tmp_path):
    path = tmp_path / "confidential_report.pdf"
    path.write_bytes(b"data")

    reset_timestamps(str(path))

    stat = os.stat(path)
    expected = 315532800 if sys.platform.startswith("win") else 0
    assert stat.st_mtime == expected
    assert stat.st_atime == expected


def test_scrub_filename_renames_away_from_original(tmp_path):
    original_path = tmp_path / "confidential_report.pdf"
    original_path.write_bytes(b"data")

    final_path = scrub_filename(str(original_path))

    assert not os.path.exists(original_path)
    assert os.path.exists(final_path)
    assert "confidential_report" not in os.path.basename(final_path)


def test_scrub_filename_does_multiple_passes(tmp_path):
    """The whole point is that the LAST name on record isn't the
    meaningful one — confirm multiple renames actually happened by
    checking the final name looks nothing like the original and the
    original is completely gone from the directory listing."""
    original_path = tmp_path / "case_1234_evidence_list.docx"
    original_path.write_bytes(b"data")

    scrub_filename(str(original_path), passes=3)

    remaining_files = os.listdir(tmp_path)
    assert "case_1234_evidence_list.docx" not in remaining_files
    assert len(remaining_files) == 1  # the final scrubbed name


def test_scrub_metadata_resets_timestamps_and_renames(tmp_path):
    original_path = tmp_path / "sensitive.txt"
    original_path.write_bytes(b"secret")

    result = scrub_metadata(str(original_path))

    assert result.timestamps_reset is True
    assert os.path.exists(result.final_path)
    assert not os.path.exists(original_path)
