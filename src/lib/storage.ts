import "server-only";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { del as blobDel, get as blobGet, put as blobPut } from "@vercel/blob";

/**
 * File storage, first match wins:
 *  - S3-compatible (AWS S3, Cloudflare R2, Supabase Storage, MinIO) when S3_BUCKET is set
 *  - Vercel Blob (private store) on Vercel, or locally with STORAGE_DRIVER=blob
 *  - local disk: fine for dev and single-server Docker, not for serverless
 */
const bucket = process.env.S3_BUCKET;
const s3 = bucket
  ? new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: !!process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    })
  : null;
const blob = !s3 && !!process.env.BLOB_READ_WRITE_TOKEN && (!!process.env.VERCEL || process.env.STORAGE_DRIVER === "blob");

// Relative STORAGE_DIR is anchored to where npm was launched (INIT_CWD): the standalone server chdirs into .next/standalone.
const root = path.resolve(/*turbopackIgnore: true*/ process.env.INIT_CWD || process.cwd(), process.env.STORAGE_DIR || "storage");
const safe = (key: string) => {
  const p = path.resolve(/*turbopackIgnore: true*/ root, key);
  if (!p.startsWith(root)) throw new Error("Invalid storage key");
  return p;
};

export async function putFile(key: string, body: Buffer, contentType: string) {
  if (s3) {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    return;
  }
  if (blob) {
    await blobPut(key, body, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
    return;
  }
  const p = safe(key);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(p), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ p, body);
}

export async function getFile(key: string): Promise<Buffer> {
  if (s3) {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  if (blob) {
    const res = await blobGet(key, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200) throw new Error(`File not found in storage: ${key}`);
    return Buffer.from(await new Response(res.stream).arrayBuffer());
  }
  return readFile(/*turbopackIgnore: true*/ safe(key));
}

export async function deleteFile(key: string) {
  if (s3) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return;
  }
  if (blob) {
    await blobDel(key).catch(() => {});
    return;
  }
  await unlink(/*turbopackIgnore: true*/ safe(key)).catch(() => {});
}
