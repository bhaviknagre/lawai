"""
Read uploaded files (Next.js writes them), first match wins:
  - S3-compatible when S3_BUCKET is set
  - through the Next.js app (GET {APP_URL}/api/internal/files) on Vercel or when FILES_URL is set;
    that covers Vercel Blob, which has no S3 API
  - local disk under STORAGE_DIR. Relative STORAGE_DIR is anchored at the repo root, like Next.js.
"""

import asyncio
from pathlib import Path

from .config import REPO_ROOT, env


def _root() -> Path:
    return (REPO_ROOT / env("STORAGE_DIR", "storage")).resolve()


def _safe(key: str) -> Path:
    root = _root()
    p = (root / key).resolve()
    if not p.is_relative_to(root):
        raise ValueError("Invalid storage key")
    return p


def _s3():
    import boto3
    from botocore.config import Config

    endpoint = env("S3_ENDPOINT")
    return boto3.client(
        "s3",
        region_name=env("S3_REGION", "auto"),
        endpoint_url=endpoint,
        aws_access_key_id=env("S3_ACCESS_KEY_ID"),
        aws_secret_access_key=env("S3_SECRET_ACCESS_KEY"),
        config=Config(s3={"addressing_style": "path"}) if endpoint else None,
    )


async def get_file(key: str) -> bytes:
    bucket = env("S3_BUCKET")
    if bucket:
        def read() -> bytes:
            return _s3().get_object(Bucket=bucket, Key=key)["Body"].read()

        return await asyncio.to_thread(read)
    files_url = env("FILES_URL") or (f"{env('APP_URL', '').rstrip('/')}/api/internal/files" if env("VERCEL") and env("APP_URL") else None)
    if files_url:
        import httpx

        async with httpx.AsyncClient(timeout=60) as client:
            res = await client.get(files_url, params={"key": key}, headers={"Authorization": f"Bearer {env('INTERNAL_API_TOKEN', '')}"})
            res.raise_for_status()
            return res.content
    return await asyncio.to_thread(_safe(key).read_bytes)
