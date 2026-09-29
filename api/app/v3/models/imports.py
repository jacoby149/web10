from pydantic import BaseModel


class ImportPart(BaseModel):
    filename: str
    size_bytes: int | None = None


class ImportCreate(BaseModel):
    token: str
    platform: str
    parts: list[ImportPart]
    # The target group (optional). When set, the import's posts + comments
    # attach to THAT group and the channel becomes the group's face (the
    # group-as-profile model) — the "port your channel into a page" flow.
    # Absent → the user's followers group + personal profile (back-compat).
    target_group_id: str | None = None


class ImportJobRef(BaseModel):
    token: str
    job_id: str
