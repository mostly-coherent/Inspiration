"""
Unit tests for Claude Code database extraction module.

Tests cover:
- Workspace name decoding
- Message content parsing
- JSONL session parsing
- Error recovery
- Subagent detection
"""

import pytest
import json
from pathlib import Path
from datetime import date, datetime
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.claude_code_db import (
    decode_workspace_name,
    parse_message_content,
    parse_jsonl_session,
    find_subagent_sessions,
    get_conversations_for_date,
)


class TestWorkspaceNameDecoding:
    """Test URL-encoded workspace directory name decoding."""

    def test_decode_basic_path(self):
        """Test decoding basic Unix-style path."""
        encoded = "-Users-username-Projects"
        expected = "/Users/username/Projects"
        assert decode_workspace_name(encoded) == expected

    def test_decode_path_with_spaces(self):
        """Test decoding path with URL-encoded spaces."""
        encoded = "-Users-test-My%20Folder"
        expected = "/Users/test/My Folder"
        assert decode_workspace_name(encoded) == expected

    def test_decode_windows_path(self):
        """Test decoding Windows-style path."""
        encoded = "-C-Users-test-Projects"
        expected = "/C/Users/test/Projects"
        assert decode_workspace_name(encoded) == expected

    def test_decode_complex_path(self):
        """Test decoding complex path with multiple special chars."""
        encoded = "-Users-username-Personal-Workspace"
        expected = "/Users/username/Personal-Workspace"
        assert decode_workspace_name(encoded) == expected


class TestMessageContentParsing:
    """Test message content extraction from content blocks."""

    def test_parse_text_block(self):
        """Test parsing simple text block."""
        blocks = [{"type": "text", "text": "Hello World"}]
        result = parse_message_content(blocks)
        assert result == "Hello World"

    def test_parse_multiple_text_blocks(self):
        """Test parsing multiple text blocks."""
        blocks = [
            {"type": "text", "text": "Hello"},
            {"type": "text", "text": "World"},
        ]
        result = parse_message_content(blocks)
        assert result == "Hello World"

    def test_parse_with_tool_use(self):
        """Test parsing content with tool usage."""
        blocks = [
            {"type": "text", "text": "Let me read the file"},
            {"type": "tool_use", "name": "Read", "input": {"file": "test.py"}},
            {"type": "text", "text": "Here's what I found"},
        ]
        result = parse_message_content(blocks)
        assert result == "Let me read the file [Tool: Read] Here's what I found"

    def test_parse_empty_blocks(self):
        """Test parsing empty content blocks."""
        blocks = []
        result = parse_message_content(blocks)
        assert result == ""

    def test_parse_tool_result_ignored(self):
        """Test that tool results are skipped (to keep messages concise)."""
        blocks = [
            {"type": "text", "text": "Query"},
            {"type": "tool_result", "content": "Long result data..."},
            {"type": "text", "text": "Response"},
        ]
        result = parse_message_content(blocks)
        assert result == "Query Response"
        assert "Long result data" not in result


class TestJSONLSessionParsing:
    """Test parsing of JSONL session files."""

    def test_parse_user_message(self, tmp_path):
        """Test parsing a user message from JSONL."""
        jsonl_file = tmp_path / "session.jsonl"
        jsonl_file.write_text(
            json.dumps({
                "type": "user",
                "message": {
                    "content": [{"type": "text", "text": "Hello Claude"}]
                },
                "timestamp": "2026-01-12T10:00:00Z",
                "uuid": "msg-123",
                "sessionId": "session-abc",
                "version": "1.0",
                "cwd": "/Users/test/project",
                "gitBranch": "main",
            }) + "\n"
        )

        messages = parse_jsonl_session(jsonl_file)

        assert len(messages) == 1
        assert messages[0]["type"] == "user"
        assert messages[0]["text"] == "Hello Claude"
        assert messages[0]["metadata"]["uuid"] == "msg-123"
        assert messages[0]["metadata"]["session_id"] == "session-abc"
        assert messages[0]["metadata"]["cwd"] == "/Users/test/project"
        assert messages[0]["metadata"]["git_branch"] == "main"
        assert messages[0]["metadata"]["is_subagent"] is False

    def test_parse_assistant_message(self, tmp_path):
        """Test parsing an assistant message with usage stats."""
        jsonl_file = tmp_path / "session.jsonl"
        jsonl_file.write_text(
            json.dumps({
                "type": "assistant",
                "message": {
                    "content": [{"type": "text", "text": "I can help with that"}],
                    "usage": {
                        "input_tokens": 100,
                        "output_tokens": 50,
                    }
                },
                "timestamp": "2026-01-12T10:00:01Z",
                "uuid": "msg-456",
                "sessionId": "session-abc",
            }) + "\n"
        )

        messages = parse_jsonl_session(jsonl_file)

        assert len(messages) == 1
        assert messages[0]["type"] == "assistant"
        assert messages[0]["text"] == "I can help with that"
        assert messages[0]["metadata"]["usage"]["input_tokens"] == 100
        assert messages[0]["metadata"]["usage"]["output_tokens"] == 50

    def test_parse_multiple_messages(self, tmp_path):
        """Test parsing multiple messages in sequence."""
        jsonl_file = tmp_path / "session.jsonl"
        lines = [
            json.dumps({
                "type": "user",
                "message": {"content": [{"type": "text", "text": "First message"}]},
                "timestamp": "2026-01-12T10:00:00Z",
                "uuid": "msg-1",
                "sessionId": "session-abc",
            }),
            json.dumps({
                "type": "assistant",
                "message": {"content": [{"type": "text", "text": "Second message"}]},
                "timestamp": "2026-01-12T10:00:01Z",
                "uuid": "msg-2",
                "sessionId": "session-abc",
            }),
            json.dumps({
                "type": "user",
                "message": {"content": [{"type": "text", "text": "Third message"}]},
                "timestamp": "2026-01-12T10:00:02Z",
                "uuid": "msg-3",
                "sessionId": "session-abc",
            }),
        ]
        jsonl_file.write_text("\n".join(lines) + "\n")

        messages = parse_jsonl_session(jsonl_file)

        assert len(messages) == 3
        assert messages[0]["text"] == "First message"
        assert messages[1]["text"] == "Second message"
        assert messages[2]["text"] == "Third message"

    def test_skip_non_message_events(self, tmp_path):
        """Test that non-message events (metadata, system) are skipped."""
        jsonl_file = tmp_path / "session.jsonl"
        lines = [
            json.dumps({"type": "session_start", "timestamp": "2026-01-12T10:00:00Z"}),
            json.dumps({
                "type": "user",
                "message": {"content": [{"type": "text", "text": "Hello"}]},
                "timestamp": "2026-01-12T10:00:01Z",
                "uuid": "msg-1",
                "sessionId": "session-abc",
            }),
            json.dumps({"type": "metadata", "data": {"foo": "bar"}}),
        ]
        jsonl_file.write_text("\n".join(lines) + "\n")

        messages = parse_jsonl_session(jsonl_file)

        assert len(messages) == 1
        assert messages[0]["text"] == "Hello"

    def test_skip_empty_lines(self, tmp_path):
        """Test that empty lines are gracefully skipped."""
        jsonl_file = tmp_path / "session.jsonl"
        lines = [
            json.dumps({
                "type": "user",
                "message": {"content": [{"type": "text", "text": "First"}]},
                "timestamp": "2026-01-12T10:00:00Z",
                "uuid": "msg-1",
                "sessionId": "session-abc",
            }),
            "",  # Empty line
            json.dumps({
                "type": "user",
                "message": {"content": [{"type": "text", "text": "Second"}]},
                "timestamp": "2026-01-12T10:00:01Z",
                "uuid": "msg-2",
                "sessionId": "session-abc",
            }),
        ]
        jsonl_file.write_text("\n".join(lines) + "\n")

        messages = parse_jsonl_session(jsonl_file)

        assert len(messages) == 2


class TestErrorRecovery:
    """Test error recovery and graceful degradation."""

    def test_recover_from_malformed_json(self, tmp_path, capsys):
        """Test that malformed JSON lines are skipped with warnings."""
        jsonl_file = tmp_path / "session.jsonl"
        lines = [
            json.dumps({
                "type": "user",
                "message": {"content": [{"type": "text", "text": "Valid message 1"}]},
                "timestamp": "2026-01-12T10:00:00Z",
                "uuid": "msg-1",
                "sessionId": "session-abc",
            }),
            "{invalid json}",  # Malformed line
            json.dumps({
                "type": "user",
                "message": {"content": [{"type": "text", "text": "Valid message 2"}]},
                "timestamp": "2026-01-12T10:00:01Z",
                "uuid": "msg-2",
                "sessionId": "session-abc",
            }),
        ]
        jsonl_file.write_text("\n".join(lines) + "\n")

        messages = parse_jsonl_session(jsonl_file)

        # Should recover and parse the 2 valid messages
        assert len(messages) == 2
        assert messages[0]["text"] == "Valid message 1"
        assert messages[1]["text"] == "Valid message 2"

        # Check that warning was logged
        captured = capsys.readouterr()
        assert "Skipping malformed JSONL line" in captured.err

    def test_skip_message_without_timestamp(self, tmp_path, capsys):
        """Test that messages without timestamps are skipped."""
        jsonl_file = tmp_path / "session.jsonl"
        lines = [
            json.dumps({
                "type": "user",
                "message": {"content": [{"type": "text", "text": "No timestamp"}]},
                # Missing timestamp field
                "uuid": "msg-1",
                "sessionId": "session-abc",
            }),
            json.dumps({
                "type": "user",
                "message": {"content": [{"type": "text", "text": "Has timestamp"}]},
                "timestamp": "2026-01-12T10:00:01Z",
                "uuid": "msg-2",
                "sessionId": "session-abc",
            }),
        ]
        jsonl_file.write_text("\n".join(lines) + "\n")

        messages = parse_jsonl_session(jsonl_file)

        # Should skip message without timestamp
        assert len(messages) == 1
        assert messages[0]["text"] == "Has timestamp"

        # Check that warning was logged
        captured = capsys.readouterr()
        assert "No timestamp for message" in captured.err

    def test_skip_empty_text_content(self, tmp_path):
        """Test that messages with no text content are skipped."""
        jsonl_file = tmp_path / "session.jsonl"
        lines = [
            json.dumps({
                "type": "user",
                "message": {"content": []},  # Empty content
                "timestamp": "2026-01-12T10:00:00Z",
                "uuid": "msg-1",
                "sessionId": "session-abc",
            }),
            json.dumps({
                "type": "user",
                "message": {"content": [{"type": "text", "text": "Valid"}]},
                "timestamp": "2026-01-12T10:00:01Z",
                "uuid": "msg-2",
                "sessionId": "session-abc",
            }),
        ]
        jsonl_file.write_text("\n".join(lines) + "\n")

        messages = parse_jsonl_session(jsonl_file)

        # Should skip message with empty content
        assert len(messages) == 1
        assert messages[0]["text"] == "Valid"


class TestSubagentDetection:
    """Test subagent session file detection."""

    def test_find_subagent_sessions(self, tmp_path):
        """Test finding subagent JSONL files for a session."""
        # Create workspace structure
        workspace = tmp_path / "workspace"
        workspace.mkdir()

        session_id = "session-123"
        session_dir = workspace / session_id
        subagent_dir = session_dir / "subagents"
        subagent_dir.mkdir(parents=True)

        # Create subagent files
        (subagent_dir / "agent-1.jsonl").write_text("")
        (subagent_dir / "agent-2.jsonl").write_text("")
        (subagent_dir / "agent-3.jsonl").write_text("")
        (subagent_dir / "other.txt").write_text("")  # Should be ignored

        subagent_files = find_subagent_sessions(workspace, session_id)

        assert len(subagent_files) == 3
        assert all(f.suffix == ".jsonl" for f in subagent_files)
        assert all("agent-" in f.name for f in subagent_files)

    def test_no_subagent_directory(self, tmp_path):
        """Test graceful handling when no subagent directory exists."""
        workspace = tmp_path / "workspace"
        workspace.mkdir()

        session_id = "session-456"

        subagent_files = find_subagent_sessions(workspace, session_id)

        assert len(subagent_files) == 0


class TestTimestampConversion:
    """Test ISO8601 timestamp parsing."""

    def test_parse_iso8601_utc(self, tmp_path):
        """Test parsing ISO8601 timestamp with Z suffix."""
        jsonl_file = tmp_path / "session.jsonl"
        jsonl_file.write_text(
            json.dumps({
                "type": "user",
                "message": {"content": [{"type": "text", "text": "Test"}]},
                "timestamp": "2026-01-12T15:30:45Z",
                "uuid": "msg-1",
                "sessionId": "session-abc",
            }) + "\n"
        )

        messages = parse_jsonl_session(jsonl_file)

        assert len(messages) == 1
        # Verify timestamp is converted to milliseconds
        expected_ts = int(datetime(2026, 1, 12, 15, 30, 45).timestamp() * 1000)
        assert messages[0]["timestamp"] == expected_ts

    def test_parse_iso8601_with_offset(self, tmp_path):
        """Test parsing ISO8601 timestamp with timezone offset."""
        jsonl_file = tmp_path / "session.jsonl"
        jsonl_file.write_text(
            json.dumps({
                "type": "user",
                "message": {"content": [{"type": "text", "text": "Test"}]},
                "timestamp": "2026-01-12T15:30:45+00:00",
                "uuid": "msg-1",
                "sessionId": "session-abc",
            }) + "\n"
        )

        messages = parse_jsonl_session(jsonl_file)

        assert len(messages) == 1
        assert isinstance(messages[0]["timestamp"], int)
        assert messages[0]["timestamp"] > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
