"""TS/JS parsers for PoTATo format data.

Pokemon Showdown's mod files are TypeScript with `inherit: true` entries and
function references. The text files for i18n follow the same shape. These
helpers do brace-counting + string-aware parsing to lift the structured
data out.

Supported syntax:
- Single and double-quoted strings (with backslash escapes)
- Single-line `//` and block `/* ... */` comments (skipped at every level)
- Object literals `{key: value, ...}`
- Array literals `[value, ...]`
- Booleans (`true`/`false`), null (`null`), undefined (`undefined`)
- Numbers (int and float)
- Nested structures
- Top-level `export const X = { ... }` or `export const X = { ... };` wrappers
- Trailing commas

Not supported (will be silently dropped or cause an error):
- Template literals (backticks) — not used in the mod files we care about
- Regex literals — not used in the relevant mod files
- Computed property names (`[foo]: bar`) — not used
- Imports / cross-file references — not used
"""

import json
import re
from typing import Any


class ParseError(Exception):
    """Raised when a TS/JS file cannot be parsed. Includes line/column info."""

    def __init__(self, message: str, text: str, pos: int):
        line = text.count("\n", 0, pos) + 1
        col = pos - (text.rfind("\n", 0, pos) + 1) + 1
        snippet = text[max(0, pos - 40):pos + 40].replace("\n", "\\n")
        super().__init__(f"{message} at line {line}, col {col}: ...{snippet}...")
        self.line = line
        self.col = col


def _skip_string(text: str, i: int) -> int:
    """Skip past a string literal at position i (i points to the opening quote).
    Handles backslash escapes. Returns new position (past closing quote)."""
    quote = text[i]
    i += 1
    while i < len(text):
        if text[i] == "\\":
            i += 2
            continue
        if text[i] == quote:
            return i + 1
        i += 1
    raise ParseError("unterminated string literal", text, i)


def _skip_line_comment(text: str, i: int) -> int:
    """Skip past a // comment starting at position i."""
    end = text.find("\n", i)
    return len(text) if end == -1 else end + 1


def _skip_block_comment(text: str, i: int) -> int:
    """Skip past a /* ... */ comment starting at position i (i points to the '/')."""
    end = text.find("*/", i + 2)
    if end == -1:
        raise ParseError("unterminated block comment", text, i)
    return end + 2


def _skip_ws_and_comments(text: str, i: int) -> int:
    """Skip whitespace and any comments starting at position i."""
    while i < len(text):
        c = text[i]
        if c in " \t\r\n":
            i += 1
        elif c == "/" and i + 1 < len(text) and text[i + 1] == "/":
            i = _skip_line_comment(text, i)
        elif c == "/" and i + 1 < len(text) and text[i + 1] == "*":
            i = _skip_block_comment(text, i)
        else:
            break
    return i


def _find_brace_end(text: str, start: int) -> int:
    """Find matching closing brace from position start (which is after '{').
    Returns position past the matching '}'. Handles strings, comments, nested braces."""
    depth = 1
    i = start
    while i < len(text) and depth > 0:
        c = text[i]
        if c == '"' or c == "'":
            i = _skip_string(text, i)
        elif c == "/" and i + 1 < len(text) and text[i + 1] == "/":
            i = _skip_line_comment(text, i)
        elif c == "/" and i + 1 < len(text) and text[i + 1] == "*":
            i = _skip_block_comment(text, i)
        elif c == "{":
            depth += 1
            i += 1
        elif c == "}":
            depth -= 1
            i += 1
        else:
            i += 1
    if depth != 0:
        raise ParseError("unterminated object literal", text, i)
    return i


def _find_bracket_end(text: str, start: int) -> int:
    """Find matching closing bracket from position start (which is after '[').
    Returns position past the matching ']'."""
    depth = 1
    i = start
    while i < len(text) and depth > 0:
        c = text[i]
        if c == '"' or c == "'":
            i = _skip_string(text, i)
        elif c == "/" and i + 1 < len(text) and text[i + 1] == "/":
            i = _skip_line_comment(text, i)
        elif c == "/" and i + 1 < len(text) and text[i + 1] == "*":
            i = _skip_block_comment(text, i)
        elif c == "[":
            depth += 1
            i += 1
        elif c == "]":
            depth -= 1
            i += 1
        else:
            i += 1
    if depth != 0:
        raise ParseError("unterminated array literal", text, i)
    return i


def _parse_string_value(text: str, i: int) -> tuple[str, int]:
    """Parse a string literal starting at i (i points to the opening quote).
    Returns (unquoted_value, new_position)."""
    quote = text[i]
    raw: list[str] = []
    i += 1
    while i < len(text) and text[i] != quote:
        if text[i] == "\\":
            i += 1
            if i >= len(text):
                break
            esc = text[i]
            if esc == "n":
                raw.append("\n")
            elif esc == "t":
                raw.append("\t")
            elif esc == "r":
                raw.append("\r")
            else:
                raw.append(esc)
            i += 1
        else:
            raw.append(text[i])
            i += 1
    if i >= len(text):
        raise ParseError("unterminated string literal", text, i)
    return "".join(raw), i + 1


def _parse_value(text: str, i: int) -> tuple[Any, int]:
    """Parse a single value starting at i. Returns (value, new_position)."""
    i = _skip_ws_and_comments(text, i)
    if i >= len(text):
        return None, i

    c = text[i]

    if c == "{":
        end = _find_brace_end(text, i + 1)
        return _parse_obj_body(text, i + 1, end - 1), end

    if c == "[":
        end = _find_bracket_end(text, i + 1)
        inner = text[i + 1:end - 1]
        items: list[Any] = []
        if inner.strip():
            for piece in _split_top_level(inner, ","):
                piece = piece.strip()
                if piece:
                    val, _ = _parse_value(piece, 0)
                    items.append(val)
        return items, end

    if c == '"' or c == "'":
        val, end = _parse_string_value(text, i)
        return val, end

    if text[i:].startswith("true"):
        return True, i + 4
    if text[i:].startswith("false"):
        return False, i + 5
    if text[i:].startswith("null") or text[i:].startswith("undefined"):
        return None, i + (4 if text[i:].startswith("null") else 9)

    if c == "-" or c.isdigit():
        m = re.match(r"-?\d+(?:\.\d+)?", text[i:])
        if m:
            num_str = m.group(0)
            num = float(num_str) if "." in num_str else int(num_str)
            return num, i + len(num_str)

    raise ParseError(f"unexpected character {c!r}", text, i)


def _split_top_level(text: str, sep: str) -> list[str]:
    """Split text by separator, respecting braces, brackets, strings, and comments."""
    parts: list[str] = []
    depth_brace = 0
    depth_bracket = 0
    start = 0
    i = 0
    while i < len(text):
        c = text[i]
        if c == '"' or c == "'":
            i = _skip_string(text, i)
        elif c == "/" and i + 1 < len(text) and text[i + 1] == "/":
            i = _skip_line_comment(text, i)
        elif c == "/" and i + 1 < len(text) and text[i + 1] == "*":
            i = _skip_block_comment(text, i)
        elif c == "{":
            depth_brace += 1
            i += 1
        elif c == "}":
            depth_brace -= 1
            i += 1
        elif c == "[":
            depth_bracket += 1
            i += 1
        elif c == "]":
            depth_bracket -= 1
            i += 1
        elif c == sep and depth_brace == 0 and depth_bracket == 0:
            parts.append(text[start:i])
            start = i + 1
            i += 1
        else:
            i += 1
    remaining = text[start:].strip()
    if remaining:
        parts.append(remaining)
    return parts


def _strip_leading_comments(s: str) -> str:
    """Strip `// line` and `/* block */` comments from the start of a string."""
    while s.startswith("//") or s.startswith("/*"):
        if s.startswith("//"):
            idx = s.find("\n")
            if idx == -1:
                return ""
            s = s[idx + 1:].lstrip()
        else:
            idx = s.find("*/")
            if idx == -1:
                return ""
            s = s[idx + 2:].lstrip()
    return s


def _parse_obj_body(text: str, start: int, end: int) -> dict[str, Any]:
    """Parse key: value pairs from a TS object body (no outer braces)."""
    props: dict[str, Any] = {}
    body = text[start:end]
    for entry in _split_top_level(body, ","):
        entry = entry.strip()
        entry = _strip_leading_comments(entry)
        if not entry:
            continue
        m = re.match(r"([a-zA-Z_$][a-zA-Z0-9_$]*|'[^']*'|\"[^\"]*\")\s*:\s*", entry)
        if not m:
            continue
        key_raw = m.group(1)
        if key_raw.startswith('"') or key_raw.startswith("'"):
            key = key_raw[1:-1]
        else:
            key = key_raw
        if key == "inherit":
            continue
        try:
            val, _ = _parse_value(entry, m.end())
        except ParseError:
            continue
        props[key] = val
    return props


def parse_ts_overrides(text: str) -> dict[str, dict]:
    """Parse a TypeScript file with `{key: {prop: value, ...}}` entries.

    Handles the `export const X = {...}` wrapper, trailing semicolons, and
    trailing commas. Returns a dict of key → {prop: value}.

    Entries with `inherit: true` are skipped (the caller is expected to
    handle inheritance from base data).
    """
    m = re.search(r"=\s*\{", text)
    if m:
        text = text[m.end():]
    text = re.sub(r"\}\s*;\s*$", "", text.rstrip())
    text = re.sub(r"\}\s*$", "", text.rstrip())

    result: dict[str, dict] = {}
    pos = 0
    while pos < len(text):
        pos = _skip_ws_and_comments(text, pos)
        if pos >= len(text):
            break
        m = re.compile(r"([a-z0-9_]+|'[^']*'|\"[^\"]*\")\s*:\s*\{" ).search(text, pos)
        if not m:
            break
        key_raw = m.group(1)
        if key_raw.startswith('"') or key_raw.startswith("'"):
            key = key_raw[1:-1]
        else:
            key = key_raw
        body_start = m.end()
        end = _find_brace_end(text, body_start)
        body = text[body_start:end - 1]
        result[key] = _parse_obj_body(text, body_start, end - 1)
        pos = end
    return result


def parse_learnsets_ts(text: str) -> dict[str, dict]:
    """Parse a nested learnset file where entries have `{learnset:{move:[sources]}}`.

    Returns a dict of species_id → {learnset: {move_id: [sources]}}.
    Move sources are kept as raw strings (e.g. `"[9L1]"` or `"[9M]"`).
    """
    m = re.search(r"=\s*\{", text)
    if m:
        text = text[m.end():]
    text = re.sub(r"\}\s*;\s*$", "", text.rstrip())

    result: dict[str, dict] = {}
    pos = 0
    while pos < len(text):
        pos = _skip_ws_and_comments(text, pos)
        if pos >= len(text):
            break
        m = re.compile(r"([a-z0-9_]+)\s*:\s*\{" ).search(text, pos)
        if not m:
            break
        key = m.group(1)
        body_start = m.end()
        end = _find_brace_end(text, body_start)
        body = text[body_start:end - 1]

        lsm = re.search(r"learnset\s*:\s*\{", body)
        if lsm:
            ls_start = lsm.end()
            ls_end = _find_brace_end(text, body_start + ls_start)
            ls_body = text[body_start + ls_start:ls_end - 1]
            learnset: dict[str, Any] = {}
            for line in ls_body.split("\n"):
                line = line.strip()
                if not line or line.startswith("//") or line.startswith("/*"):
                    continue
                pm = re.compile(r"([a-z0-9_]+)\s*:\s*(\[.*?\])\s*,?\s*$").match(line)
                if pm:
                    move, val = pm.group(1), pm.group(2)
                    try:
                        learnset[move] = json.loads(val)
                    except json.JSONDecodeError:
                        learnset[move] = val
            result[key] = {"learnset": learnset}

        pos = end
    return result


def fetch_js_data(text: str) -> Any:
    """Parse a Showdown `.js` data file like `items.js` into a Python dict.

    Format: `exports.BattleItems = {key:{...},key:{...},...};`
    """
    text = re.sub(r"^exports\.\w+\s*=\s*", "", text)
    text = text.rstrip().rstrip(";").strip()
    text = re.sub(r"(?<=[{,])\s*([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*:)", r'"\1"', text)
    text = re.sub(r":\s*true(?=[,}])", ":true", text)
    text = re.sub(r":\s*false(?=[,}])", ":false", text)
    text = re.sub(r":\s*null(?=[,}])", ":null", text)
    return json.loads(text)


def species_name_to_key(name: str) -> str:
    """Normalize a species name to a key (lowercase, alphanum only)."""
    return name.lower().replace("-", "").replace(" ", "").replace("'", "").replace(".", "")


def apply_overrides(base: dict, overrides: dict) -> None:
    """Apply overrides dict to base in place. Deletes keys for None values (TS null/undefined)."""
    for k, v in overrides.items():
        if v is None:
            base.pop(k, None)
        else:
            base[k] = v
