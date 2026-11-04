"""In-memory storage for unit tests only; actual S3 semantics have a separate probe."""

import hashlib
import io
from uuid import uuid4

from tests.test_upload_sessions import S3, StorageError


class MultipartS3(S3):
    def __init__(self):
        super().__init__()
        self.uploads, self.finals, self.signatures = {}, {}, []
        self.lost_completion = False

    def create_multipart_upload(self, **kwargs):
        upload_id = uuid4().hex
        self.uploads[upload_id] = {**kwargs, "parts": {}}
        return {"UploadId": upload_id}

    def add_part(self, upload_id, number, body):
        self.uploads[upload_id]["parts"][number] = body

    def list_parts(self, **kwargs):
        upload = self.uploads.get(kwargs["UploadId"])
        if not upload or upload["Key"] != kwargs["Key"]:
            raise StorageError("NoSuchUpload")
        return {
            "Parts": [
                {"PartNumber": number, "Size": len(body), "ETag": hashlib.md5(body).hexdigest()}
                for number, body in sorted(upload["parts"].items())
            ]
        }

    def generate_presigned_url(self, *args, **kwargs):
        self.signatures.append((args, kwargs))
        return "https://storage.invalid/synthetic-part"

    def complete_multipart_upload(self, **kwargs):
        upload = self.uploads.pop(kwargs["UploadId"])
        body = b"".join(upload["parts"][part["PartNumber"]] for part in kwargs["MultipartUpload"]["Parts"])
        self.finals[kwargs["Key"]] = {
            "body": body,
            "Metadata": upload["Metadata"],
            "ContentType": upload["ContentType"],
            "ETag": hashlib.md5(body).hexdigest(),
            "ContentLength": len(body),
        }
        if self.lost_completion:
            raise StorageError("InternalError")
        return {"ETag": self.finals[kwargs["Key"]]["ETag"]}

    def head_object(self, **kwargs):
        if kwargs["Key"] not in self.finals:
            raise StorageError("NoSuchKey")
        return {key: value for key, value in self.finals[kwargs["Key"]].items() if key != "body"}

    def get_object(self, **kwargs):
        if kwargs["Key"] in self.finals:
            return {**self.head_object(**kwargs), "Body": io.BytesIO(self.finals[kwargs["Key"]]["body"])}
        return super().get_object(**kwargs)

    def abort_multipart_upload(self, **kwargs):
        if kwargs["UploadId"] not in self.uploads:
            raise StorageError("NoSuchUpload")
        self.uploads.pop(kwargs["UploadId"])

    def get_paginator(self, operation):
        assert operation == "list_multipart_uploads"
        owner = self

        class Paginator:
            def paginate(self, **kwargs):
                return [
                    {
                        "Uploads": [
                            {"Key": upload["Key"], "UploadId": uid}
                            for uid, upload in owner.uploads.items()
                            if upload["Key"].startswith(kwargs["Prefix"])
                        ]
                    }
                ]

        return Paginator()
