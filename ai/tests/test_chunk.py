from lawai_ai.rag.chunk import MAX_CHARS, chunk_text, page_for_offset

CONTRACT = """MASTER SERVICES AGREEMENT

1. Definitions
In this Agreement, "Services" means the services described in Schedule 1. """ + "The Supplier shall perform the Services with reasonable skill and care. " * 12 + """

14. Limitation of Liability
14.1 Neither party limits liability for death or personal injury caused by negligence. """ + "The aggregate liability of the Supplier shall not exceed the fees paid in the preceding twelve months. " * 10 + """

ARTICLE IV Termination
Either party may terminate on 30 days' written notice."""


def test_splits_on_legal_headings():
    chunks = chunk_text(CONTRACT)
    headings = [c.heading for c in chunks]
    assert "14. Limitation of Liability" in headings
    assert any(h and h.startswith("ARTICLE IV") for h in headings)
    assert all(c.index == i for i, c in enumerate(chunks))


def test_long_sections_are_packed_with_overlap():
    text = "1. Long Clause\n\n" + "\n\n".join(f"Paragraph {i}. " + "word " * 120 for i in range(12))
    chunks = chunk_text(text)
    assert len(chunks) > 1
    assert all(len(c.content) <= MAX_CHARS + 2 for c in chunks)
    assert chunks[1].content[:50] in chunks[0].content  # overlap carried forward


def test_start_offsets_point_into_the_text():
    for c in chunk_text(CONTRACT):
        assert c.content[:30] in CONTRACT[c.start : c.start + len(c.content) + 50]


def test_page_for_offset():
    assert page_for_offset(None, 10) is None
    assert page_for_offset([0, 100, 250], 0) == 1
    assert page_for_offset([0, 100, 250], 120) == 2
    assert page_for_offset([0, 100, 250], 999) == 3
