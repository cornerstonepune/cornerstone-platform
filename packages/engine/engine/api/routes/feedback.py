"""CP-30: the screenshot of a Report a problem note. Only wiring: what is kept and how is `w3_read/feedback_shot.py`.
From the site with the engine's key, after the site has saved the note; the site decides whose note it is."""

import mimetypes

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from engine.api.deps import get_conn, require_engine_key
from engine.w3_read import feedback_shot, voice_store

keyed = APIRouter(dependencies=[Depends(require_engine_key)])


class NoteRef(BaseModel):
    note_id: str


def _refused(no: voice_store.Refused) -> HTTPException:
    return HTTPException(status_code=no.status, detail=str(no))


@keyed.post("/feedback/screenshot")
async def keep(request: Request, conn=Depends(get_conn, scope="function")):
    form = await request.form(max_files=1)
    upload, note_id = form.get("file"), form.get("note_id")
    if isinstance(upload, str) or upload is None or not isinstance(note_id, str):
        raise HTTPException(status_code=422, detail="Not kept. Try again.")
    try:
        return feedback_shot.keep(conn, note_id, upload.filename or "", await upload.read())
    except voice_store.Refused as no:
        raise _refused(no) from no


@keyed.post("/feedback/screenshot/get")
def get(body: NoteRef, conn=Depends(get_conn, scope="function")):
    try:
        ext, data = feedback_shot.get(conn, body.note_id)
    except voice_store.Refused as no:
        raise _refused(no) from no
    return Response(
        content=data, media_type=mimetypes.guess_type(f"x.{ext}")[0] or "application/octet-stream"
    )
