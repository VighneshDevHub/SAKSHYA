from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_roles
from app.models.case_management import CaseEvidenceItem
from app.models.user import UserRole

router = APIRouter(prefix="/evidence", tags=["evidence"])

_ALL_ROLES = (UserRole.ADMINISTRATOR, UserRole.INVESTIGATOR, UserRole.AUDITOR, UserRole.SUPERVISOR)

_IMAGE_EXTS = {"png", "jpg", "jpeg", "gif", "bmp", "tiff", "webp"}
_VIDEO_EXTS = {"mp4", "mov", "avi", "mkv", "wmv", "flv"}
_DOC_EXTS = {"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "odt"}
_ARCHIVE_EXTS = {"zip", "rar", "7z", "tar", "gz", "bz2"}
_COMPOUND_ARCHIVE_SUFFIXES = (".tar.gz", ".tar.bz2", ".tar.xz")


def _ext(name: str) -> str:
    if "." not in name:
        return ""
    lower = name.lower()
    for suffix in _COMPOUND_ARCHIVE_SUFFIXES:
        if lower.endswith(suffix):
            return suffix[1:]  # "tar.gz"
    return name.rsplit(".", 1)[-1].lower()


def _matches_type(file_item: dict, type_filter: str) -> bool:
    if type_filter == "all":
        return True

    explicit_type = (file_item.get("type") or "").lower()
    if explicit_type and explicit_type == type_filter:
        return True

    filename = (
        file_item.get("filename")
        or file_item.get("name")
        or file_item.get("path")
        or ""
    )
    ext = _ext(filename)

    if "pages" in file_item and type_filter == "document":
        return True

    if type_filter == "image":
        return ext in _IMAGE_EXTS
    if type_filter == "video":
        return ext in _VIDEO_EXTS
    if type_filter == "document":
        if ext in _DOC_EXTS:
            return True
        if ext == "":
            return True
        return False
    if type_filter == "archive":
        if ext in _ARCHIVE_EXTS:
            return True
        for suffix in _COMPOUND_ARCHIVE_SUFFIXES:
            if filename.lower().endswith(suffix):
                return True
        return False
    return True


@router.get("/{evidence_id}/files")
async def list_evidence_files(
    evidence_id: str,
    db: AsyncSession = Depends(get_db),
    _user=Depends(require_roles(*_ALL_ROLES)),
    type: str = Query(default="all", pattern="^(image|video|document|archive|all)$"),
) -> dict:
    result = await db.execute(
        select(CaseEvidenceItem).where(CaseEvidenceItem.id == evidence_id)
    )
    evidence = result.scalar_one_or_none()
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence item not found")

    details = evidence.details or {}
    recovered_files = details.get("recovered_files", details.get("files", [])) or []

    filtered = []
    for f in recovered_files:
        filename = (
            f.get("filename")
            or f.get("name")
            or f.get("path")
            or ""
        )
        if not _matches_type(f, type):
            continue
        filtered.append({
            "filename": filename,
            "size_bytes": int(f.get("size_bytes") or f.get("size") or 0),
            "sha256": f.get("sha256") or f.get("hash") or "",
            "confidence": f.get("confidence") or f.get("confidence_score"),
            "metadata": {k: v for k, v in f.items() if k not in (
                "filename", "name", "path", "size_bytes", "size", "sha256", "hash",
                "confidence", "confidence_score",
            )},
        })

    return {
        "evidence_id": evidence_id,
        "evidence_label": evidence.evidence_label,
        "type_filter": type,
        "count": len(filtered),
        "files": filtered,
    }
