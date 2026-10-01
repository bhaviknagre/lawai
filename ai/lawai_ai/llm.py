"""
Provider-neutral LLM calls. LLM_PROVIDER picks Anthropic (production) or Groq (local testing).

Messages use one neutral shape so the agent loop doesn't care which provider runs it:
  {"role": "user", "content": str}
  {"role": "assistant", "content": str, "tool_calls": [ToolCall, ...]}
  {"role": "tool_results", "results": [{"id": str, "content": str, "is_error": bool}, ...]}
"""

import json
from dataclasses import dataclass, field
from typing import Any, Callable

from .config import PROVIDER, ai_enabled, env


class AiNotConfigured(Exception):
    def __init__(self) -> None:
        key = "GROQ_API_KEY" if PROVIDER == "groq" else "ANTHROPIC_API_KEY"
        super().__init__(f"AI is not configured. Add {key} to your environment and restart the AI service.")


@dataclass
class ToolCall:
    id: str
    name: str
    input: dict[str, Any]


@dataclass
class Tool:
    name: str
    description: str
    input_schema: dict[str, Any]


@dataclass
class LLMResult:
    text: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    stop: str = "end"  # end | tool_use | max_tokens
    input_tokens: int = 0
    output_tokens: int = 0


async def complete(
    *,
    model: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
    system: str | None = None,
    tools: list[Tool] | None = None,
    force_tool: str | None = None,
    tools_off: bool = False,
    cache_system: bool = False,
    on_text: Callable[[str], None] | None = None,
) -> LLMResult:
    """One model turn. Streams text deltas to on_text when given. tools_off keeps the tools defined but forbids calling them."""
    if not ai_enabled():
        raise AiNotConfigured()
    impl = _groq if PROVIDER == "groq" else _anthropic
    return await impl(model, messages, max_tokens, system, tools or [], force_tool, tools_off, cache_system, on_text)


# ─── Anthropic ──────────────────────────────────────────────────────────
_anthropic_client = None


def _anthropic_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for m in messages:
        if m["role"] == "user":
            out.append({"role": "user", "content": m["content"]})
        elif m["role"] == "assistant":
            blocks: list[dict[str, Any]] = []
            if m.get("content"):
                blocks.append({"type": "text", "text": m["content"]})
            for c in m.get("tool_calls", []):
                blocks.append({"type": "tool_use", "id": c.id, "name": c.name, "input": c.input})
            out.append({"role": "assistant", "content": blocks or m.get("content", "")})
        elif m["role"] == "tool_results":
            out.append({
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": r["id"], "content": r["content"], **({"is_error": True} if r.get("is_error") else {})}
                    for r in m["results"]
                ],
            })
    return out


async def _anthropic(model, messages, max_tokens, system, tools, force_tool, tools_off, cache_system, on_text) -> LLMResult:
    global _anthropic_client
    from anthropic import AsyncAnthropic

    _anthropic_client = _anthropic_client or AsyncAnthropic(api_key=env("ANTHROPIC_API_KEY"), max_retries=3)
    kwargs: dict[str, Any] = {"model": model, "max_tokens": max_tokens, "messages": _anthropic_messages(messages)}
    if system:
        block: dict[str, Any] = {"type": "text", "text": system}
        if cache_system:
            block["cache_control"] = {"type": "ephemeral"}
        kwargs["system"] = [block]
    if tools:
        defs = [{"name": t.name, "description": t.description, "input_schema": t.input_schema} for t in tools]
        defs[-1]["cache_control"] = {"type": "ephemeral"}  # the tool block is stable across requests
        kwargs["tools"] = defs
    if force_tool:
        kwargs["tool_choice"] = {"type": "tool", "name": force_tool}
    elif tools and tools_off:
        kwargs["tool_choice"] = {"type": "none"}

    if on_text:
        async with _anthropic_client.messages.stream(**kwargs) as stream:
            async for delta in stream.text_stream:
                on_text(delta)
            msg = await stream.get_final_message()
    else:
        msg = await _anthropic_client.messages.create(**kwargs)

    text = "".join(b.text for b in msg.content if b.type == "text")
    calls = [ToolCall(b.id, b.name, dict(b.input or {})) for b in msg.content if b.type == "tool_use"]
    u = msg.usage
    return LLMResult(
        text=text,
        tool_calls=calls,
        stop="tool_use" if msg.stop_reason == "tool_use" else "max_tokens" if msg.stop_reason == "max_tokens" else "end",
        input_tokens=u.input_tokens + (u.cache_read_input_tokens or 0) + (u.cache_creation_input_tokens or 0),
        output_tokens=u.output_tokens,
    )


# ─── Groq (OpenAI-compatible chat completions) ──────────────────────────
_groq_client = None


def openai_messages(system: str | None, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = [{"role": "system", "content": system}] if system else []
    for m in messages:
        if m["role"] == "user":
            out.append({"role": "user", "content": m["content"]})
        elif m["role"] == "assistant":
            msg: dict[str, Any] = {"role": "assistant", "content": m.get("content") or None}
            if m.get("tool_calls"):
                msg["tool_calls"] = [
                    {"id": c.id, "type": "function", "function": {"name": c.name, "arguments": json.dumps(c.input)}}
                    for c in m["tool_calls"]
                ]
            out.append(msg)
        elif m["role"] == "tool_results":
            for r in m["results"]:
                content = f"Error: {r['content']}" if r.get("is_error") else r["content"]
                out.append({"role": "tool", "tool_call_id": r["id"], "content": content})
    return out


def _parse_args(raw: str | None) -> dict[str, Any]:
    try:
        parsed = json.loads(raw or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


async def _groq(model, messages, max_tokens, system, tools, force_tool, tools_off, cache_system, on_text) -> LLMResult:
    global _groq_client
    from groq import AsyncGroq, BadRequestError

    _groq_client = _groq_client or AsyncGroq(api_key=env("GROQ_API_KEY"), max_retries=3)
    kwargs: dict[str, Any] = {"model": model, "max_tokens": max_tokens, "messages": openai_messages(system, messages)}
    if tools:
        kwargs["tools"] = [
            {"type": "function", "function": {"name": t.name, "description": t.description, "parameters": t.input_schema}}
            for t in tools
        ]
        kwargs["tool_choice"] = {"type": "function", "function": {"name": force_tool}} if force_tool else "none" if tools_off else "auto"

    # Open models occasionally emit a malformed tool call, which Groq rejects with "tool_use_failed". One retry usually fixes it.
    for attempt in range(2):
        try:
            return await (_groq_stream(kwargs, on_text) if on_text else _groq_once(kwargs))
        except BadRequestError as e:
            if attempt == 0 and "tool_use_failed" in str(e):
                continue
            raise
    raise RuntimeError("unreachable")


def _stop(finish_reason: str | None, has_calls: bool) -> str:
    if has_calls or finish_reason == "tool_calls":
        return "tool_use"
    return "max_tokens" if finish_reason == "length" else "end"


async def _groq_once(kwargs: dict[str, Any]) -> LLMResult:
    res = await _groq_client.chat.completions.create(**kwargs)
    choice = res.choices[0]
    calls = [ToolCall(c.id, c.function.name, _parse_args(c.function.arguments)) for c in choice.message.tool_calls or []]
    return LLMResult(
        text=choice.message.content or "",
        tool_calls=calls,
        stop=_stop(choice.finish_reason, bool(calls)),
        input_tokens=res.usage.prompt_tokens if res.usage else 0,
        output_tokens=res.usage.completion_tokens if res.usage else 0,
    )


async def _groq_stream(kwargs: dict[str, Any], on_text: Callable[[str], None]) -> LLMResult:
    stream = await _groq_client.chat.completions.create(**kwargs, stream=True)
    text = ""
    slots: dict[int, dict[str, str]] = {}
    finish = None
    usage = None
    async for chunk in stream:
        u = getattr(getattr(chunk, "x_groq", None), "usage", None) or getattr(chunk, "usage", None)
        usage = u or usage
        if not chunk.choices:
            continue
        choice = chunk.choices[0]
        finish = choice.finish_reason or finish
        delta = choice.delta
        if delta.content:
            text += delta.content
            on_text(delta.content)
        for tc in delta.tool_calls or []:
            slot = slots.setdefault(tc.index, {"id": "", "name": "", "args": ""})
            if tc.id:
                slot["id"] = tc.id
            if tc.function and tc.function.name:
                slot["name"] = tc.function.name
            if tc.function and tc.function.arguments:
                slot["args"] += tc.function.arguments
    calls = [ToolCall(s["id"], s["name"], _parse_args(s["args"])) for _, s in sorted(slots.items())]
    return LLMResult(
        text=text,
        tool_calls=calls,
        stop=_stop(finish, bool(calls)),
        input_tokens=getattr(usage, "prompt_tokens", 0) or 0,
        output_tokens=getattr(usage, "completion_tokens", 0) or 0,
    )
