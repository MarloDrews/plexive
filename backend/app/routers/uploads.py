import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..auth import get_current_user
from ..rate_limit import check_rate_limit
from ..sanitize import sanitize_svg, validate_image
from ..schemas import SvgUploadResponse, UploadResponse
from ..upload_config import SUPABASE_BUCKET, supabase_client

router = APIRouter()


@router.post("/upload/image", response_model=UploadResponse, status_code=201)
async def upload_image(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    check_rate_limit(current_user.id, "upload_image", 10, 3600)
    try:
        data, media_type = await validate_image(file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    ext = media_type.split("/")[1]
    if ext == "jpeg":
        ext = "jpg"
    filename = f"{uuid.uuid4()}.{ext}"
    path = f"images/{filename}"
    supabase_client.storage.from_(SUPABASE_BUCKET).upload(
        path=path,
        file=data,
        file_options={"content-type": media_type, "upsert": "false"},
    )
    url = supabase_client.storage.from_(SUPABASE_BUCKET).get_public_url(path)
    return {"url": url}


@router.post("/upload/svg", response_model=SvgUploadResponse, status_code=201)
async def upload_svg(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    check_rate_limit(current_user.id, "upload_svg", 10, 3600)
    if file.content_type != "image/svg+xml":
        raise HTTPException(status_code=400, detail="Only SVG files are accepted")
    try:
        svg_content = await sanitize_svg(file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"svg_content": svg_content}
