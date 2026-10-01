from lawai_ai.rag.search import boost_clause_refs, or_query, rrf


def test_or_query_sanitises_and_dedupes():
    assert or_query("What does § 14.2 say about 14.2?") == "what | does | 14.2 | say | about"
    assert or_query("a ! ?") is None


def test_rrf_rewards_items_in_both_lists():
    a, b, c = {"id": "a"}, {"id": "b"}, {"id": "c"}
    fused = rrf([[a, b], [b, c]])
    assert [f["item"]["id"] for f in fused] == ["b", "a", "c"]


def test_clause_reference_boost():
    fused = [
        {"item": {"id": "x", "content": "General terms apply."}, "score": 0.02},
        {"item": {"id": "y", "content": "14.2 The Supplier's liability is capped."}, "score": 0.01},
    ]
    boost_clause_refs("what does 14.2 say", fused)
    assert fused[0]["item"]["id"] == "y"
