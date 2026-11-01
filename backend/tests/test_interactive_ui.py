import copy
import json

import pytest
from langchain.messages import AIMessage, HumanMessage, ToolMessage

from src.history import checkpoint_messages_to_history
from src.interactive_ui import build_surface, resolve_action, validate_surface
from utils.streaming import _handle_completed_message, _RunState


def components():
    return [
        {"id": "root", "component": "Column", "children": ["card", "choices", "submit"]},
        {"id": "card", "component": "Card", "child": "description"},
        {"id": "description", "component": "Text", "text": "FastAPI: typed APIs"},
        {
            "id": "choices",
            "component": "ChoicePicker",
            "label": "Choose a framework",
            "options": [
                {"label": "FastAPI", "value": "fastapi"},
                {"label": "Flask", "value": "flask"},
            ],
            "value": {"path": "/selection"},
            "variant": "mutuallyExclusive",
            "displayStyle": "chips",
        },
        {
            "id": "submit",
            "component": "Button",
            "child": "label",
            "variant": "primary",
            "action": {
                "event": {"name": "select_option", "context": {"selection": {"path": "/selection"}}}
            },
        },
        {"id": "label", "component": "Text", "text": "Recommend this option"},
    ]


def action(surface):
    return {
        "version": "v1.0",
        "action": {
            "name": "select_option",
            "surfaceId": surface["createSurface"]["surfaceId"],
            "sourceComponentId": "submit",
            "timestamp": "2026-11-01T16:00:00Z",
            "context": {"selection": ["fastapi"]},
        },
    }


def test_standard_surface_unique_ids_and_safe_selection():
    surface = build_surface(components())
    assert validate_surface(surface) == surface
    assert (
        surface["createSurface"]["surfaceId"]
        != build_surface(components())["createSurface"]["surfaceId"]
    )
    assert "FastAPI" in resolve_action(action(surface), [surface])


@pytest.mark.parametrize(
    "mutation",
    [
        lambda c: c[0].update(children=["root"]),
        lambda c: c[0].update(children=["missing"]),
        lambda c: c[2].update(component="WebView"),
        lambda c: c[2].update(text={"call": "eval", "args": {}}),
        lambda c: c[3].update(value={"path": "/__proto__/selection"}),
        lambda c: c[4]["action"].update(event={"name": "delete_all", "context": {}}),
        lambda c: c.append(copy.deepcopy(c[2])),
        lambda c: c.append({"id": "orphan", "component": "Text", "text": "hidden"}),
    ],
)
def test_rejects_unsafe_or_invalid_model_trees(mutation):
    nodes = components()
    mutation(nodes)
    with pytest.raises(ValueError):
        build_surface(nodes)


@pytest.mark.parametrize(
    "mutation",
    [
        lambda a: a["action"].update(surfaceId="unissued"),
        lambda a: a["action"].update(sourceComponentId="description"),
        lambda a: a["action"].update(context={"selection": ["unknown"]}),
        lambda a: a["action"].update(
            context={"selection": ["fastapi"], "instruction": "injection"}
        ),
        lambda a: a["action"].update(name="delete_all"),
        lambda a: a["action"].update(timestamp="invalid"),
        lambda a: a["action"].update(context={"selection": ["fastapi", "flask"]}),
    ],
)
def test_rejects_forged_actions(mutation):
    surface = build_surface(components())
    event = action(surface)
    mutation(event)
    with pytest.raises(ValueError):
        resolve_action(event, [surface])


def test_ui_tool_result_streams_standard_envelope_and_hydrates():
    surface = build_surface(components())
    tool = ToolMessage(
        content=json.dumps(surface), tool_call_id="ui-call", name="render_interactive_ui"
    )
    emitted = _handle_completed_message(tool, _RunState())
    wire = [json.loads(e["data"]) for e in emitted]
    assert any(e.get("name") == "a2ui.surface" and e["value"] == surface for e in wire)
    history = checkpoint_messages_to_history(
        [
            HumanMessage(content="Compare APIs"),
            AIMessage(
                content="",
                tool_calls=[{"id": "ui-call", "name": "render_interactive_ui", "args": {}}],
            ),
            tool,
        ]
    )
    assert history[-1].model_dump(by_alias=True)["a2uiSurfaces"] == [surface]


def test_invalid_tool_result_never_becomes_ui():
    tool = ToolMessage(
        content='{"createSurface":{"components":[]}}',
        tool_call_id="bad",
        name="render_interactive_ui",
    )
    wire = [json.loads(e["data"]) for e in _handle_completed_message(tool, _RunState())]
    assert not any(e.get("name") == "a2ui.surface" for e in wire)


@pytest.mark.asyncio
async def test_action_authorization_resolves_only_issued_surface_and_ignores_client_text():
    from unittest.mock import AsyncMock, patch

    from fastapi import HTTPException

    from src.models.chat_models import ChatRequest
    from src.threads import authorize_chat

    surface = build_surface(components())
    tool = ToolMessage(
        content=json.dumps(surface), tool_call_id="issued", name="render_interactive_ui"
    )
    req = ChatRequest(
        message="untrusted instruction",
        thread_id="00000000-0000-0000-0000-000000000001",
        a2ui_action=action(surface),
    )
    with (
        patch("src.threads.require_owned_thread", new=AsyncMock()),
        patch("src.history.load_checkpoint_messages", new=AsyncMock(return_value=[tool])),
    ):
        result = await authorize_chat(req, "owner", object())
        assert result.message.startswith("I selected FastAPI.")
        assert "untrusted" not in result.message
    with (
        patch("src.threads.require_owned_thread", new=AsyncMock()),
        patch("src.history.load_checkpoint_messages", new=AsyncMock(return_value=[])),
    ):
        with pytest.raises(HTTPException) as error:
            await authorize_chat(req, "owner", object())
        assert error.value.status_code == 422


@pytest.mark.asyncio
async def test_action_authorization_checks_owner_before_reading_checkpoint():
    from unittest.mock import AsyncMock, patch

    from fastapi import HTTPException

    from src.models.chat_models import ChatRequest
    from src.threads import authorize_chat

    surface = build_surface(components())
    req = ChatRequest(
        message="selection",
        thread_id="00000000-0000-0000-0000-000000000001",
        a2ui_action=action(surface),
    )
    with (
        patch("src.threads.require_owned_thread", new=AsyncMock(side_effect=HTTPException(404))),
        patch("src.history.load_checkpoint_messages", new=AsyncMock()) as load,
    ):
        with pytest.raises(HTTPException):
            await authorize_chat(req, "other", object())
        load.assert_not_called()


def test_agent_registers_ui_tool_and_instructions():
    from unittest.mock import patch

    from src.agent import create_agent

    with (
        patch("src.agent.create_deep_agent") as create,
        patch("src.agent.init_chat_model"),
        patch("src.agent.TavilySearch"),
    ):
        create_agent()
        assert any(
            getattr(t, "name", None) == "render_interactive_ui"
            for t in create.call_args.kwargs["tools"]
        )
        assert "render_interactive_ui" in create.call_args.kwargs["system_prompt"]


@pytest.mark.asyncio
async def test_parallel_tool_update_keeps_ui_and_action_metadata():
    from unittest.mock import MagicMock, patch

    from src.models.chat_models import ChatRequest
    from utils.streaming import stream_agent_events

    surface = build_surface(components())
    captured = {}

    class Agent:
        async def astream(self, inputs, **kwargs):
            captured.update(inputs)
            yield {
                "type": "updates",
                "data": {
                    "tools": {
                        "messages": [
                            ToolMessage(
                                content=json.dumps(surface),
                                tool_call_id="ui",
                                name="render_interactive_ui",
                            ),
                            ToolMessage(
                                content="search results",
                                tool_call_id="search",
                                name="tavily_search",
                            ),
                        ]
                    }
                },
            }

    request = ChatRequest(
        message="I selected FastAPI", thread_id="thread", job_id="run", a2ui_action=action(surface)
    )
    with patch("utils.streaming.CallbackHandler", return_value=MagicMock()):
        events = [json.loads(e["data"]) async for e in stream_agent_events(Agent(), request)]
    assert any(e.get("name") == "a2ui.surface" for e in events)
    assert captured["messages"][0]["additional_kwargs"]["a2ui_action"] == action(surface)
    assert events[-1]["type"] == "RUN_FINISHED"


def test_history_restores_successful_selection_but_keeps_failed_turn_retryable():
    surface = build_surface(components())
    tool = ToolMessage(content=json.dumps(surface), tool_call_id="ui", name="render_interactive_ui")
    raw = [
        AIMessage(
            content="", tool_calls=[{"id": "ui", "name": "render_interactive_ui", "args": {}}]
        ),
        tool,
        HumanMessage(
            content="I selected FastAPI", additional_kwargs={"a2ui_action": action(surface)}
        ),
    ]
    unfinished = checkpoint_messages_to_history(raw)
    assert unfinished[-1].model_dump(by_alias=True).get("a2uiAction") is None
    history = checkpoint_messages_to_history(
        [*raw, AIMessage(content="FastAPI suits your typed API.")]
    )
    assert history[-2].model_dump(by_alias=True)["a2uiAction"] == action(surface)


def test_ui_tool_advertises_exact_component_fields_to_model():
    from src.interactive_ui import render_interactive_ui

    schema = render_interactive_ui.args_schema
    assert isinstance(schema, dict)
    variants = schema["properties"]["components"]["items"]["anyOf"]
    assert {v["properties"]["component"]["const"] for v in variants} == {
        "Column",
        "Row",
        "Card",
        "Text",
        "ChoicePicker",
        "Button",
    }
    assert all(
        "component" in v["required"] and v["additionalProperties"] is False for v in variants
    )
