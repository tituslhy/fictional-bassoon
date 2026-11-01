"""Restricted A2UI v1.0 profile, verified against web_core 0.10.6 schemas.

Only explicit, non-executable components and a read-only recommendation action.
Schema resources are local: validation never resolves remote references.
"""

import json
import re
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import ValidationError
from langchain_core.tools import tool
from referencing import Registry, Resource

CATALOG_ID = "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json"
TOOL_NAME = "render_interactive_ui"
BINDING = {"path": "/selection"}
BUTTON_ACTION = {"event": {"name": "select_option", "context": {"selection": BINDING}}}
FIELDS = {
    "Column": {"children"},
    "Row": {"children"},
    "Card": {"child"},
    "Text": {"text", "variant"},
    "ChoicePicker": {"label", "options", "value", "variant", "displayStyle"},
    "Button": {"child", "action", "variant"},
}


@lru_cache
def _validator(name: str) -> Draft202012Validator:
    folder = Path(__file__).with_name("a2ui_schemas")
    schemas = {p.name: json.loads(p.read_text()) for p in folder.glob("*.json")}
    registry: Registry = Registry()
    for schema in schemas.values():
        registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))
    # The published envelope uses a relative catalog.json reference.
    registry = registry.with_resource(
        "https://a2ui.org/specification/v1_0/catalog.json",
        Resource.from_contents(schemas["catalog.json"]),
    )
    return Draft202012Validator(schemas[name], registry=registry, format_checker=FormatChecker())


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def validate_surface(value: Any) -> dict[str, Any]:
    """Validate the official envelope plus our deliberately narrower renderer profile."""
    _require(isinstance(value, dict), "Expected a surface object")
    _require(len(json.dumps(value)) <= 48_000, "UI is too large")
    _require(set(value) == {"version", "createSurface"}, "Only createSurface is supported")
    surface = value.get("createSurface")
    _require(isinstance(surface, dict), "Missing createSurface")
    _require(
        set(surface) == {"surfaceId", "catalogId", "components", "dataModel"},
        "Unexpected surface fields",
    )
    _require(surface["catalogId"] == CATALOG_ID, "Unsupported catalog")
    _require(surface["dataModel"] == {"selection": []}, "Selection must start empty")
    sid = surface["surfaceId"]
    _require(
        isinstance(sid, str) and bool(re.fullmatch(r"[A-Za-z0-9_-]{1,100}", sid)),
        "Invalid surface ID",
    )
    nodes = surface["components"]
    _require(isinstance(nodes, list) and 1 <= len(nodes) <= 60, "Expected 1-60 components")
    indexed = {}
    for node in nodes:
        _require(isinstance(node, dict), "Expected component object")
        kind, identifier = node.get("component"), node.get("id")
        _require(isinstance(kind, str) and kind in FIELDS, "Unsupported component")
        _require(
            isinstance(identifier, str) and bool(re.fullmatch(r"[A-Za-z0-9_-]{1,80}", identifier)),
            "Invalid component ID",
        )
        _require(identifier not in indexed, "Duplicate component ID")
        _require(set(node) <= FIELDS[kind] | {"id", "component"}, "Unsupported component property")
        if kind == "Text":
            _require(
                isinstance(node.get("text"), str) and len(node["text"]) <= 2000,
                "Text must be a bounded literal",
            )
        if kind in ("Column", "Row"):
            _require(
                isinstance(node.get("children"), list)
                and 1 <= len(node["children"]) <= 20
                and all(isinstance(child, str) for child in node["children"]),
                "Children must be component IDs",
            )
        if kind == "ChoicePicker":
            _require(
                node.get("value") == BINDING
                and node.get("variant", "mutuallyExclusive") == "mutuallyExclusive",
                "Only single selection binding is supported",
            )
            _require(
                isinstance(node.get("label", ""), str) and len(node.get("label", "")) <= 200,
                "Invalid choice label",
            )
            options = node.get("options")
            _require(isinstance(options, list) and 2 <= len(options) <= 6, "Provide 2-6 options")
            seen = set()
            for option in options:
                _require(
                    isinstance(option, dict) and set(option) == {"label", "value"}, "Invalid option"
                )
                _require(
                    all(
                        isinstance(option[k], str) and 0 < len(option[k]) <= 160
                        for k in ("label", "value")
                    ),
                    "Invalid option strings",
                )
                _require(option["value"] not in seen, "Duplicate option")
                seen.add(option["value"])
        if kind == "Button":
            _require(node.get("action") == BUTTON_ACTION, "Only select_option action is supported")
        indexed[identifier] = node
    try:
        _validator("agent_to_renderer.json").validate(value)
    except ValidationError as exc:
        raise ValueError("Invalid A2UI schema: " + exc.message[:200]) from None
    _require(
        sum(n["component"] == "ChoicePicker" for n in nodes) == 1,
        "Exactly one choice picker required",
    )
    _require(sum(n["component"] == "Button" for n in nodes) == 1, "Exactly one button required")
    visited: set[str] = set()

    def walk(identifier: str, depth: int) -> None:
        _require(depth <= 12 and identifier not in visited, "Cyclic, shared, or overly deep UI")
        _require(identifier in indexed, "Missing component reference")
        visited.add(identifier)
        node = indexed[identifier]
        if node["component"] == "Button":
            _require(
                indexed.get(node["child"], {}).get("component") == "Text",
                "Button child must be Text",
            )
        children = node.get("children", [node["child"]] if "child" in node else [])
        for child in children:
            walk(child, depth + 1)

    walk("root", 0)
    _require(visited == set(indexed), "Unreachable components")
    return cast(dict[str, Any], value)


def build_surface(components: list[dict[str, Any]]) -> dict[str, Any]:
    return validate_surface(
        {
            "version": "v1.0",
            "createSurface": {
                "surfaceId": "ui-" + uuid4().hex,
                "catalogId": CATALOG_ID,
                "components": components,
                "dataModel": {"selection": []},
            },
        }
    )


def surface_from_tool(message: Any) -> dict[str, Any] | None:
    """Only successful, named UI tool results can become interactive surfaces."""
    if getattr(message, "name", None) != TOOL_NAME or getattr(message, "status", None) == "error":
        return None
    try:
        content = message.content
        if not isinstance(content, str) or len(content) > 48_000:
            return None
        return validate_surface(json.loads(content))
    except (ValueError, TypeError):
        return None


def resolve_action(value: Any, surfaces: list[dict[str, Any]]) -> str:
    """Resolve a browser selection only against UI previously issued in this thread."""
    _require(
        isinstance(value, dict) and set(value) == {"version", "action"}, "Invalid action envelope"
    )
    event = value.get("action")
    _require(
        isinstance(event, dict)
        and set(event) == {"name", "surfaceId", "sourceComponentId", "timestamp", "context"},
        "Invalid action fields",
    )
    try:
        _validator("renderer_to_agent.json").validate(value)
    except ValidationError as exc:
        raise ValueError("Invalid action schema: " + exc.message[:160]) from None
    try:
        timestamp = datetime.fromisoformat(event["timestamp"].replace("Z", "+00:00"))
        _require(timestamp.tzinfo is not None, "Timestamp requires timezone")
    except (ValueError, TypeError):
        raise ValueError("Invalid action timestamp") from None
    _require(event["name"] == "select_option", "Unsupported action")
    surface = next(
        (s for s in surfaces if s["createSurface"]["surfaceId"] == event["surfaceId"]), None
    )
    _require(surface is not None, "Surface was not issued in this conversation")
    assert surface is not None
    nodes = validate_surface(surface)["createSurface"]["components"]
    _require(
        any(n["id"] == event["sourceComponentId"] and n["component"] == "Button" for n in nodes),
        "Invalid action source",
    )
    context = event["context"]
    _require(set(context) == {"selection"}, "Unexpected action context")
    selected = context["selection"]
    _require(
        isinstance(selected, list) and len(selected) == 1 and isinstance(selected[0], str),
        "Select one option",
    )
    picker = next(n for n in nodes if n["component"] == "ChoicePicker")
    option = next((o for o in picker["options"] if o["value"] == selected[0]), None)
    _require(option is not None, "Selection is not an offered option")
    assert option is not None
    return f"I selected {option['label']}. Please give me a tailored recommendation and practical next steps for this option, using our comparison above."


@tool
def render_interactive_ui(components: list[dict[str, Any]]) -> str:
    """Render an interactive A2UI comparison/selection. Author the layout, don't emit JSON in chat.

    Supply flat components with unique id strings, one id 'root'. Allowed ONLY:
    Column/Row: children array of IDs. Card: child ID (wrap multiple children in Column).
    Text: literal text, optional variant 'body' or 'caption'. No HTML, links or code.
    ChoicePicker: exactly one, label, 2-6 options [{label,value}], value {path:'/selection'},
      variant 'mutuallyExclusive', displayStyle 'chips' or 'checkbox'.
    Button: exactly one, child ID of Text, variant 'primary', action:
      {event:{name:'select_option',context:{selection:{path:'/selection'}}}}.
    Use cards with headings and concise tradeoffs for comparisons, followed by choices
    and a 'Get recommendation' button. You choose all copy and layout. Max 60 nodes,
    depth 12, all nodes reachable from root. No other fields, functions, or bindings.
    User clicks send their choice back for your recommendation. Do not claim selection
    occurred before receiving the follow-up. If validation fails, correct and retry.
    """
    try:
        return json.dumps(build_surface(components))
    except ValueError as exc:
        return json.dumps(
            {
                "error": str(exc),
                "hint": "Correct the components and call render_interactive_ui again.",
            }
        )
