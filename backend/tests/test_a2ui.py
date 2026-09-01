"""Tests for the scoped A2UI 4-type tree builder/validator."""

import pytest

from utils.a2ui import A2UIValidationError, build_stream_tree, validate_component_tree


def test_build_stream_tree_layout_matches_frontend():
    tree = build_stream_tree(
        reasoning="thinking",
        answer="hello",
        tool_calls=[{"id": "c1", "name": "search", "args": "{}", "result": "ok"}],
        streaming=True,
    )
    assert tree["id"] == "root"
    assert tree["component"] == "column"
    kinds = [c["component"] for c in tree["children"]]
    assert kinds == ["reasoning", "column", "markdown"]
    markdown = tree["children"][-1]
    assert markdown["streaming"] is True
    validated = validate_component_tree(tree)
    assert validated["children"][1]["children"][0]["name"] == "search"


def test_validate_rejects_unknown_component():
    with pytest.raises(A2UIValidationError):
        validate_component_tree({"id": "x", "component": "button", "label": "go"})


def test_validate_rejects_scripty_html_as_component_type():
    with pytest.raises(A2UIValidationError):
        validate_component_tree({"id": "x", "component": "markdown", "text": 123})


def test_empty_tree_is_valid_column():
    tree = validate_component_tree(build_stream_tree())
    assert tree["children"] == []


def test_validate_rejects_non_object():
    with pytest.raises(A2UIValidationError, match="expected a component object"):
        validate_component_tree(["not", "a", "dict"])


def test_validate_rejects_column_without_children():
    with pytest.raises(A2UIValidationError, match="children array"):
        validate_component_tree({"id": "root", "component": "column"})


def test_validate_rejects_bad_gap():
    with pytest.raises(A2UIValidationError, match="gap"):
        validate_component_tree(
            {"id": "root", "component": "column", "children": [], "gap": "huge"}
        )


def test_validate_rejects_non_bool_streaming():
    with pytest.raises(A2UIValidationError, match="boolean"):
        validate_component_tree(
            {"id": "m", "component": "markdown", "text": "hi", "streaming": "yes"}
        )


def test_validate_reasoning_and_tool_call():
    reasoning = validate_component_tree({"id": "r", "component": "reasoning", "text": "think"})
    assert reasoning["text"] == "think"
    tool = validate_component_tree(
        {"id": "t", "component": "tool_call", "name": "search", "args": "{}"}
    )
    assert "result" not in tool
