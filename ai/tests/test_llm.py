import json

from lawai_ai.llm import ToolCall, _anthropic_messages, openai_messages

HISTORY = [
    {"role": "user", "content": "When is my next hearing?"},
    {"role": "assistant", "content": "", "tool_calls": [ToolCall("call_1", "get_schedule", {"types": ["hearing"]})]},
    {"role": "tool_results", "results": [{"id": "call_1", "content": "{\"events\": []}"}, {"id": "call_2", "content": "boom", "is_error": True}]},
]


def test_openai_translation():
    out = openai_messages("sys", HISTORY)
    assert out[0] == {"role": "system", "content": "sys"}
    assert out[2]["content"] is None
    assert json.loads(out[2]["tool_calls"][0]["function"]["arguments"]) == {"types": ["hearing"]}
    assert out[3] == {"role": "tool", "tool_call_id": "call_1", "content": "{\"events\": []}"}
    assert out[4]["content"] == "Error: boom"


def test_anthropic_translation():
    out = _anthropic_messages(HISTORY)
    assert out[1]["content"] == [{"type": "tool_use", "id": "call_1", "name": "get_schedule", "input": {"types": ["hearing"]}}]
    assert out[2]["role"] == "user"
    assert out[2]["content"][1] == {"type": "tool_result", "tool_use_id": "call_2", "content": "boom", "is_error": True}
