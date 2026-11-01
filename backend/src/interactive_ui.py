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
REQUIRED = {
    "Column": {"children"},
    "Row": {"children"},
    "Card": {"child"},
    "Text": {"text"},
    "ChoicePicker": {"options", "value"},
    "Button": {"child", "action"},
}
COMPONENT_TYPES = ", ".join(sorted(FIELDS))

_ID = {
    "type": "string",
    "pattern": "^[A-Za-z0-9_-]{1,80}$",
    "description": "Unique component ID. Exactly one component must have id 'root'.",
}
_REF = {"type": "string", "description": "The id of another component in this list."}


def _variant(name: str, summary: str, props: dict[str, Any], required: list[str]) -> dict:
    return {
        "type": "object",
        "description": summary,
        "properties": {"id": _ID, "component": {"const": name}, **props},
        "required": ["id", "component", *required],
        "additionalProperties": False,
    }


_CHILDREN = {"type": "array", "items": _REF, "minItems": 1, "maxItems": 20}
_SELECTION_BINDING = {
    "type": "object",
    "properties": {"path": {"const": "/selection"}},
    "required": ["path"],
    "additionalProperties": False,
}
# Model-facing input schema: the standard A2UI v1.0 basic-catalog component shapes,
# narrowed to this profile. It mirrors validate_surface; the server still validates.
UI_INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "components": {
            "type": "array",
            "description": (
                "Flat list of A2UI components. Every item needs 'id' and 'component' "
                "(the component type name; never 'type'). Parents refer to children by id."
            ),
            "minItems": 1,
            "maxItems": 60,
            "items": {
                "anyOf": [
                    _variant(
                        "Column",
                        "Vertical layout. children: ordered child ids.",
                        {"children": _CHILDREN},
                        ["children"],
                    ),
                    _variant(
                        "Row",
                        "Horizontal layout. children: ordered child ids.",
                        {"children": _CHILDREN},
                        ["children"],
                    ),
                    _variant(
                        "Card",
                        "Card container with exactly ONE child id in 'child' (not 'children'). "
                        "Wrap multiple items in a Column and pass the Column's id.",
                        {"child": _REF},
                        ["child"],
                    ),
                    _variant(
                        "Text",
                        "Literal plain text (no HTML, links, or code).",
                        {
                            "text": {"type": "string", "maxLength": 2000},
                            "variant": {"enum": ["body", "caption"]},
                        },
                        ["text"],
                    ),
                    _variant(
                        "ChoicePicker",
                        "The single-choice list. Use exactly one.",
                        {
                            "label": {"type": "string", "maxLength": 200},
                            "options": {
                                "type": "array",
                                "minItems": 2,
                                "maxItems": 6,
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "label": {
                                            "type": "string",
                                            "minLength": 1,
                                            "maxLength": 160,
                                        },
                                        "value": {
                                            "type": "string",
                                            "minLength": 1,
                                            "maxLength": 160,
                                        },
                                    },
                                    "required": ["label", "value"],
                                    "additionalProperties": False,
                                },
                            },
                            "value": _SELECTION_BINDING,
                            "variant": {"const": "mutuallyExclusive"},
                            "displayStyle": {"enum": ["chips", "checkbox"]},
                        },
                        ["options", "value"],
                    ),
                    _variant(
                        "Button",
                        "The submit button. Use exactly one. 'child' (not 'childId') is the id "
                        "of a Text component holding the button label.",
                        {
                            "child": _REF,
                            "variant": {"enum": ["default", "primary", "borderless"]},
                            "action": {
                                "type": "object",
                                "properties": {
                                    "event": {
                                        "type": "object",
                                        "properties": {
                                            "name": {"const": "select_option"},
                                            "context": {
                                                "type": "object",
                                                "properties": {"selection": _SELECTION_BINDING},
                                                "required": ["selection"],
                                                "additionalProperties": False,
                                            },
                                        },
                                        "required": ["name", "context"],
                                        "additionalProperties": False,
                                    }
                                },
                                "required": ["event"],
                                "additionalProperties": False,
                            },
                        },
                        ["child", "action"],
                    ),
                ]
            },
        }
    },
    "required": ["components"],
    "additionalProperties": False,
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
    for position, node in enumerate(nodes):
        _require(isinstance(node, dict), f"components[{position}] must be an object")
        kind, identifier = node.get("component"), node.get("id")
        where = f"components[{position}] (id={identifier!r})"
        if not (isinstance(kind, str) and kind in FIELDS):
            hint = " Put the type name in 'component', not 'type'." if "type" in node else ""
            raise ValueError(
                f"{where}: unsupported component {kind!r}. "
                f"'component' must be one of: {COMPONENT_TYPES}.{hint}"
            )
        where = f"components[{position}] (id={identifier!r}, component={kind!r})"
        _require(
            isinstance(identifier, str) and bool(re.fullmatch(r"[A-Za-z0-9_-]{1,80}", identifier)),
            f"{where}: invalid id; use 1-80 letters, digits, '_' or '-'",
        )
        _require(identifier not in indexed, f"{where}: duplicate component id")
        extra = sorted(set(node) - FIELDS[kind] - {"id", "component"})
        _require(
            not extra,
            f"{where}: unsupported field(s) {extra}; {kind} allows only "
            f"{sorted(FIELDS[kind] | {'id', 'component'})}",
        )
        missing = sorted(REQUIRED[kind] - set(node))
        _require(not missing, f"{where}: missing required field(s) {missing}")
        if kind == "Text":
            _require(
                isinstance(node.get("text"), str) and len(node["text"]) <= 2000,
                f"{where}: 'text' must be a literal string of at most 2000 characters",
            )
        if kind in ("Column", "Row"):
            _require(
                isinstance(node.get("children"), list)
                and 1 <= len(node["children"]) <= 20
                and all(isinstance(child, str) for child in node["children"]),
                f"{where}: 'children' must be a list of 1-20 component id strings",
            )
        if kind == "ChoicePicker":
            _require(
                node.get("value") == BINDING
                and node.get("variant", "mutuallyExclusive") == "mutuallyExclusive",
                f"{where}: 'value' must be {{'path': '/selection'}} and 'variant' "
                "must be 'mutuallyExclusive'",
            )
            _require(
                isinstance(node.get("label", ""), str) and len(node.get("label", "")) <= 200,
                f"{where}: 'label' must be a string of at most 200 characters",
            )
            options = node.get("options")
            _require(
                isinstance(options, list) and 2 <= len(options) <= 6,
                f"{where}: 'options' must list 2-6 options",
            )
            seen = set()
            for option in options:
                _require(
                    isinstance(option, dict) and set(option) == {"label", "value"},
                    f"{where}: each option must be exactly {{'label': str, 'value': str}}",
                )
                _require(
                    all(
                        isinstance(option[k], str) and 0 < len(option[k]) <= 160
                        for k in ("label", "value")
                    ),
                    f"{where}: option label/value must be 1-160 character strings",
                )
                _require(
                    option["value"] not in seen, f"{where}: duplicate option {option['value']!r}"
                )
                seen.add(option["value"])
        if kind == "Button":
            _require(
                node.get("action") == BUTTON_ACTION,
                f"{where}: 'action' must be exactly {json.dumps(BUTTON_ACTION)}",
            )
        indexed[identifier] = node
    try:
        _validator("agent_to_renderer.json").validate(value)
    except ValidationError as exc:
        location = "/".join(str(part) for part in exc.absolute_path) or "surface"
        raise ValueError(f"Invalid A2UI schema at {location}: {exc.message[:200]}") from None
    _require(
        sum(n["component"] == "ChoicePicker" for n in nodes) == 1,
        "Exactly one ChoicePicker component is required",
    )
    _require(
        sum(n["component"] == "Button" for n in nodes) == 1,
        "Exactly one Button component is required",
    )
    visited: set[str] = set()

    def walk(identifier: str, depth: int) -> None:
        _require(
            depth <= 12 and identifier not in visited,
            f"Component {identifier!r} is referenced twice, cyclic, or nested deeper than 12",
        )
        _require(
            identifier in indexed,
            f"Component id {identifier!r} is referenced but not defined"
            + ("; one component must have id 'root'" if identifier == "root" else ""),
        )
        visited.add(identifier)
        node = indexed[identifier]
        if node["component"] == "Button":
            _require(
                indexed.get(node["child"], {}).get("component") == "Text",
                f"Button {identifier!r}: 'child' must be the id of a Text component",
            )
        children = node.get("children", [node["child"]] if "child" in node else [])
        for child in children:
            walk(child, depth + 1)

    walk("root", 0)
    _require(
        visited == set(indexed),
        f"Components not reachable from 'root': {sorted(set(indexed) - visited)}",
    )
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


@tool(args_schema=UI_INPUT_SCHEMA)
def render_interactive_ui(components: list[dict[str, Any]]) -> str:
    """Render an interactive A2UI comparison with a selectable list. Do not emit UI JSON in chat.

    Pass a flat `components` list. Every item has a unique `id` and a `component` field naming
    its type (Column, Row, Card, Text, ChoicePicker, Button) — never `type`. Containers refer
    to children by id: Column/Row use `children` (list of ids); Card and Button use `child`
    (one id). Use exactly one ChoicePicker and one Button; the Button's child is a Text label.
    Compact valid example (author your own cards, copy, and layout):
    [{"id":"root","component":"Column","children":["c1","pick","go"]},
     {"id":"c1","component":"Card","child":"c1body"},
     {"id":"c1body","component":"Text","text":"FastAPI: async, typed, auto docs"},
     {"id":"pick","component":"ChoicePicker","label":"Pick one","displayStyle":"chips",
      "variant":"mutuallyExclusive","value":{"path":"/selection"},
      "options":[{"label":"FastAPI","value":"fastapi"},{"label":"Flask","value":"flask"}]},
     {"id":"go","component":"Button","child":"golabel","variant":"primary",
      "action":{"event":{"name":"select_option","context":{"selection":{"path":"/selection"}}}}},
     {"id":"golabel","component":"Text","text":"Get recommendation"}]
    Max 60 components, depth 12, every component reachable from 'root'. The user's choice is
    sent back to you later for a recommendation; do not claim a selection happened before then.
    If the result contains an error, fix exactly what it names and call this tool again.
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
