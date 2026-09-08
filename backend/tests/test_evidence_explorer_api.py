import pytest

from app.db.session import AsyncSessionLocal
from app.models.case_management import CaseEvidenceItem, CaseRecord, CaseStatus
from app.models.user import UserRole
from tests.test_jobs_api import _auth_header, _register_and_login


INV_EMAIL, INV_PW = "ev-inv@fg.example", "supersecret123"


def _seed_details() -> dict:
    return {
        "recovered_files": [
            {"filename": "photo1.jpg", "size_bytes": 102400, "sha256": "a" * 64, "confidence": 0.95, "type": "image"},
            {"filename": "report.pdf", "size_bytes": 512000, "sha256": "b" * 64, "confidence": 0.99, "pages": 12},
            {"filename": "surveillance.mp4", "size_bytes": 200_000_000, "sha256": "c" * 64, "confidence": 0.8, "duration_s": 3600},
            {"filename": "archive.zip", "size_bytes": 10_000_000, "sha256": "d" * 64},
            {"filename": "notes.txt", "size_bytes": 2048, "sha256": "e" * 64, "confidence": 1.0},
            {"filename": "backup.tar.gz", "size_bytes": 80_000_000, "sha256": "f" * 64},
            {"filename": "diagram.png", "size_bytes": 40960, "sha256": "g" * 64, "confidence": 0.9},
            {"filename": "movie.mov", "size_bytes": 500_000_000, "sha256": "h" * 64, "confidence": 0.75},
            {"filename": "spreadsheet.xlsx", "size_bytes": 100_000, "sha256": "i" * 64},
            {"filename": "rar-archive.rar", "size_bytes": 25_000_000, "sha256": "j" * 64},
            {"filename": "noextfile", "size_bytes": 1234, "sha256": "k" * 64},
        ]
    }


@pytest.mark.asyncio
async def test_tr9_1_evidence_explorer_returns_filtered_files(client):
    inv_token = await _register_and_login(client, INV_EMAIL, INV_PW)

    cc = await client.post(
        "/api/v1/cases",
        json={
            "title": "Evidence Explorer Case",
            "description": "for evidence files",
            "status": CaseStatus.OPEN.value,
        },
        headers=_auth_header(inv_token),
    )
    case_id = cc.json()["id"]

    async with AsyncSessionLocal() as db:
        ev = CaseEvidenceItem(
            case_id=case_id,
            evidence_label="USB-01 Recovered Data",
            evidence_reference="lab-bag-001",
            evidence_type="DIGITAL",
            details=_seed_details(),
        )
        db.add(ev)
        await db.commit()
        ev_id = ev.id

    all_files = await client.get(
        f"/api/v1/evidence/{ev_id}/files?type=all", headers=_auth_header(inv_token)
    )
    assert all_files.status_code == 200, all_files.text
    assert all_files.json()["count"] == 11

    images = await client.get(
        f"/api/v1/evidence/{ev_id}/files?type=image", headers=_auth_header(inv_token)
    )
    assert images.status_code == 200
    body = images.json()
    assert body["count"] == 2
    fnames = sorted(f["filename"] for f in body["files"])
    assert fnames == ["diagram.png", "photo1.jpg"]
    for f in body["files"]:
        assert "sha256" in f
        assert "size_bytes" in f
        assert "confidence" in f
        assert "metadata" in f

    videos = await client.get(
        f"/api/v1/evidence/{ev_id}/files?type=video", headers=_auth_header(inv_token)
    )
    assert videos.json()["count"] == 2

    docs = await client.get(
        f"/api/v1/evidence/{ev_id}/files?type=document", headers=_auth_header(inv_token)
    )
    assert docs.json()["count"] == 4

    archives = await client.get(
        f"/api/v1/evidence/{ev_id}/files?type=archive", headers=_auth_header(inv_token)
    )
    assert archives.json()["count"] == 3


@pytest.mark.asyncio
async def test_tr9_2_evidence_404_for_missing_id_and_fields(client):
    inv_token = await _register_and_login(client, "ev2-inv@fg.example", "supersecret123")

    notfound = await client.get(
        "/api/v1/evidence/00000000-0000-0000-0000-000000000000/files",
        headers=_auth_header(inv_token),
    )
    assert notfound.status_code == 404

    cc = await client.post(
        "/api/v1/cases",
        json={
            "title": "Ev Empty Case",
            "description": "no files",
            "status": CaseStatus.OPEN.value,
        },
        headers=_auth_header(inv_token),
    )
    case_id = cc.json()["id"]

    async with AsyncSessionLocal() as db:
        ev = CaseEvidenceItem(
            case_id=case_id,
            evidence_label="Empty Device",
            evidence_reference="xyz",
            evidence_type="DIGITAL",
            details={},
        )
        db.add(ev)
        await db.commit()
        ev_id = ev.id

    empty = await client.get(
        f"/api/v1/evidence/{ev_id}/files", headers=_auth_header(inv_token)
    )
    assert empty.status_code == 200
    assert empty.json()["count"] == 0
    assert empty.json()["files"] == []
