"""Extract plain text from an uploaded file. PDFs keep page boundaries for citations."""

import io
import re
from dataclasses import dataclass


@dataclass
class Parsed:
    text: str
    page_offsets: list[int] | None
    page_count: int | None


def parse_file(buf: bytes, mime: str, filename: str) -> Parsed:
    lower = filename.lower()
    if mime == "application/pdf" or lower.endswith(".pdf"):
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(buf))
        offsets: list[int] = []
        out = ""
        for page in reader.pages:
            offsets.append(len(out))
            out += re.sub(r"[ \t]+\n", "\n", page.extract_text() or "").strip() + "\n\n"
        if len(out.strip()) < 20:
            raise ValueError("No text layer found. This looks like a scanned PDF — run OCR first (see README → OCR).")
        return Parsed(out.strip(), offsets, len(reader.pages))

    if "wordprocessingml" in mime or lower.endswith(".docx"):
        import mammoth

        return Parsed(mammoth.extract_raw_text(io.BytesIO(buf)).value.strip(), None, None)

    if mime.startswith("text/") or re.search(r"\.(txt|md|csv|eml)$", lower):
        return Parsed(buf.decode("utf-8", errors="replace").strip(), None, None)

    raise ValueError(f"Unsupported file type: {mime or filename}. Upload PDF, DOCX, TXT or MD.")
