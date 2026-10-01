"""
Structure-aware chunking for legal text.

Legal documents are organised by clauses, sections, articles and numbered paragraphs, and lawyers
ask about them by number ("what does 14.2 say?"). So we:
 1. split on headings (numbered clauses, ARTICLE/SECTION/SCHEDULE, ALL-CAPS titles),
 2. keep each section intact when it fits the budget,
 3. pack long sections paragraph-by-paragraph with a small overlap,
 4. remember each chunk's heading + page so answers can cite "cl. 14.2, p. 11".
"""

import math
import re
from dataclasses import dataclass

MAX_CHARS = 2400  # ≈ 600 tokens
OVERLAP_CHARS = 400

HEADING = re.compile(
    "|".join([
        r"^\s*(?:ARTICLE|Article|SECTION|Section|SCHEDULE|Schedule|PART|Part|CLAUSE|Clause)\s+[0-9IVXLC]+[A-Za-z]?\b.*$",
        r"^\s*\d{1,3}(?:\.\d{1,3}){0,2}\.?\s+[A-Z][^\n]{0,80}[^.;:,\n]$",  # "14. Limitation of Liability" (titles, not sentences)
        r"^\s*\([a-z]{1,3}\)\s+.+$",  # (a) sub-paragraphs
        r"^[A-Z][A-Z0-9 ,.&'’\-]{4,80}$",  # ALL CAPS TITLES
    ]),
    re.M,
)
SUB_PARAGRAPH = re.compile(r"^\s*\([a-z]{1,3}\)")


@dataclass
class Chunk:
    index: int
    heading: str | None
    content: str
    start: int
    tokens: int


@dataclass
class _Section:
    heading: str | None
    text: str
    start: int


def approx_tokens(s: str) -> int:
    return math.ceil(len(s) / 4)


def _sections(text: str) -> list[_Section]:
    out: list[_Section] = []
    cur = _Section(None, "", 0)
    pos = 0
    for line in text.split("\n"):
        is_heading = bool(HEADING.search(line)) and len(line.strip()) < 160 and not SUB_PARAGRAPH.match(line)
        if is_heading and cur.text.strip():
            out.append(cur)
            cur = _Section(line.strip()[:140], "", pos)
        elif is_heading and not cur.heading:
            cur.heading = line.strip()[:140]
        cur.text += line + "\n"
        pos += len(line) + 1
    if cur.text.strip():
        out.append(cur)
    return out


def chunk_text(text: str) -> list[Chunk]:
    chunks: list[Chunk] = []

    def push(heading: str | None, content: str, start: int) -> None:
        c = content.strip()
        if c:
            chunks.append(Chunk(len(chunks), heading, c, start, approx_tokens(c)))

    # Merge tiny neighbouring sections (e.g. a heading line followed by one sentence).
    merged: list[_Section] = []
    for s in _sections(text):
        last = merged[-1] if merged else None
        if last and len(last.text) + len(s.text) < 700:
            last.text += s.text
            last.heading = last.heading or s.heading
        else:
            merged.append(_Section(s.heading, s.text, s.start))

    for s in merged:
        if len(s.text) <= MAX_CHARS:
            push(s.heading, s.text, s.start)
            continue
        buf = ""
        buf_start = s.start
        offset = s.start
        for p in re.split(r"\n{2,}", s.text):
            if buf and len(buf) + len(p) > MAX_CHARS:
                push(s.heading, buf, buf_start)
                tail = buf[-OVERLAP_CHARS:]
                buf_start = offset - len(tail)
                buf = tail
            # Hard-split pathological paragraphs.
            if len(p) > MAX_CHARS:
                for i in range(0, len(p), MAX_CHARS - OVERLAP_CHARS):
                    push(s.heading, p[i : i + MAX_CHARS], offset + i)
                offset += len(p) + 2
                buf = ""
                buf_start = offset
                continue
            buf += ("\n\n" if buf else "") + p
            offset += len(p) + 2
        if buf.strip():
            push(s.heading, buf, buf_start)
    return chunks


def page_for_offset(offsets: list[int] | None, start: int) -> int | None:
    if not offsets:
        return None
    page = 1
    for i, o in enumerate(offsets):
        if o <= start:
            page = i + 1
    return page
