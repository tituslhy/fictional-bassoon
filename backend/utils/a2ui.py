"""Scoped A2UI component-tree builder + validator (4-type subset).

Mirrors ``frontend/src/lib/a2ui/schema.ts`` / ``validator.ts`` /
``builders/legacyStreamTree.ts`` so a tree emitted on AG-UI ``CUSTOM``
(name=``a2ui``) is the same shape the frontend renderer already accepts.

This is **not** full A2UI v1.0: no data binding, function calls, actions, or
``updateComponents``. Unknown component types are rejected, not rendered.
"""

from __future__ import annotations

from typing import Any

ALLOWED_COMPONENT_TYPES = frozenset({"column", "reasoning", "tool_call", "markdown"})


class A2UIValidationError(ValueError):
    """Raised when a would-be tree fails the 4-type subset contract."""

    def __init__(self, message: str, path: str = "root") -> None:
        super().__init__(f'A2UI validation failed at "{path}": {message}')
        self.path = path


def _assert_str(value: Any, path: str) -> str:
    if not isinstance(value, str):
        raise A2UIValidationError(f"expected a string, got {type(value).__name__}", path)
    return value


def validate_component_node(input: Any, path: str = "root") -> dict[str, Any]:
    """Validate and return a sanitized nested 4-type tree. Raises on failure."""
    if not isinstance(input, dict):
        raise A2UIValidationError("expected a component object", path)

    node_id = _assert_str(input.get("id"), f"{path}.id")
    component = input.get("component")
    if not isinstance(component, str) or component not in ALLOWED_COMPONENT_TYPES:
        raise A2UIValidationError(
            f"unknown or disallowed component type {component!r} — "
            f"allowed: {', '.join(sorted(ALLOWED_COMPONENT_TYPES))}",
            f"{path}.component",
        )

    if component == "column":
        children = input.get("children")
        if not isinstance(children, list):
            raise A2UIValidationError("column requires a children array", f"{path}.children")
        gap = input.get("gap")
        if gap is not None and gap not in ("loose", "tight"):
            raise A2UIValidationError('gap must be "loose" or "tight"', f"{path}.gap")
        out: dict[str, Any] = {
            "id": node_id,
            "component": "column",
            "children": [
                validate_component_node(child, f"{path}.children[{i}]")
                for i, child in enumerate(children)
            ],
        }
        if gap is not None:
            out["gap"] = gap
        return out

    if component == "reasoning":
        return {
            "id": node_id,
            "component": "reasoning",
            "text": _assert_str(input.get("text"), f"{path}.text"),
        }

    if component == "tool_call":
        out = {
            "id": node_id,
            "component": "tool_call",
            "name": _assert_str(input.get("name"), f"{path}.name"),
            "args": _assert_str(input.get("args"), f"{path}.args"),
        }
        if "result" in input and input["result"] is not None:
            out["result"] = _assert_str(input.get("result"), f"{path}.result")
        return out

    # markdown
    text = _assert_str(input.get("text"), f"{path}.text")
    streaming = input.get("streaming")
    if streaming is not None and not isinstance(streaming, bool):
        raise A2UIValidationError(
            f"expected a boolean, got {type(streaming).__name__}", f"{path}.streaming"
        )
    out = {"id": node_id, "component": "markdown", "text": text}
    if streaming is not None:
        out["streaming"] = streaming
    return out


def validate_component_tree(input: Any) -> dict[str, Any]:
    return validate_component_node(input, "root")


def build_stream_tree(
    *,
    reasoning: str = "",
    answer: str = "",
    tool_calls: list[dict[str, str]] | None = None,
    streaming: bool = False,
) -> dict[str, Any]:
    """Build the nested 4-type tree (same layout as ``buildLegacyStreamTree``)."""
    children: list[dict[str, Any]] = []
    if reasoning:
        children.append({"id": "reasoning", "component": "reasoning", "text": reasoning})

    calls = tool_calls or []
    if calls:
        children.append(
            {
                "id": "tool-calls",
                "component": "column",
                "gap": "tight",
                "children": [
                    {
                        "id": f"tool-call-{tc['id']}",
                        "component": "tool_call",
                        "name": tc.get("name") or "",
                        "args": tc.get("args") or "",
                        **({"result": tc["result"]} if tc.get("result") is not None else {}),
                    }
                    for tc in calls
                ],
            }
        )

    if answer or streaming:
        node: dict[str, Any] = {
            "id": "answer",
            "component": "markdown",
            "text": answer,
        }
        if streaming:
            node["streaming"] = True
        else:
            node["streaming"] = False
        children.append(node)

    return {"id": "root", "component": "column", "gap": "loose", "children": children}
