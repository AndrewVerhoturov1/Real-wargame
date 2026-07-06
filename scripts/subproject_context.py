#!/usr/bin/env python3

"""Print small, bounded context views for repository subprojects."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Iterable

DEFAULT_REPO_ROOT = Path(__file__).resolve().parents[1]
SUBPROJECTS_DIR = Path("docs/subprojects")


class SubprojectError(RuntimeError):
    """Raised for user-facing subproject configuration errors."""


def _repo_root(root: Path | str | None = None) -> Path:
    if root is not None:
        return Path(root).resolve()
    override = os.environ.get("SUBPROJECT_REPO_ROOT")
    return Path(override).resolve() if override else DEFAULT_REPO_ROOT


def _load_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SubprojectError(f"Subproject metadata not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise SubprojectError(f"Invalid JSON in {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise SubprojectError(f"Subproject metadata must be a JSON object: {path}")
    return data


def discover_subprojects(root: Path | str | None = None) -> list[dict[str, Any]]:
    base = _repo_root(root) / SUBPROJECTS_DIR
    if not base.is_dir():
        return []
    found: list[dict[str, Any]] = []
    for path in sorted(base.glob("*/subproject.json")):
        if path.parent.name.startswith("_"):
            continue
        data = _load_json(path)
        subproject_id = str(data.get("id") or path.parent.name)
        data = dict(data)
        data["id"] = subproject_id
        data["_path"] = path
        found.append(data)
    return found


def load_subproject(
    subproject_id: str, root: Path | str | None = None
) -> dict[str, Any]:
    for data in discover_subprojects(root):
        if data["id"] == subproject_id:
            return data
    available = ", ".join(item["id"] for item in discover_subprojects(root)) or "none"
    raise SubprojectError(
        f"Unknown subproject '{subproject_id}'. Available subprojects: {available}."
    )


def _items(data: dict[str, Any], key: str) -> list[Any]:
    value = data.get(key, [])
    return value if isinstance(value, list) else []


def _lines(title: str, values: Iterable[Any], empty: str = "(none)") -> list[str]:
    rendered = [str(value) for value in values]
    return (
        [f"{title}:", *(f"- {value}" for value in rendered)]
        if rendered
        else [f"{title}:", f"- {empty}"]
    )


def render_list(root: Path | str | None = None) -> str:
    projects = discover_subprojects(root)
    if not projects:
        return "No subprojects found."
    return "\n".join(
        f"{item['id']} | status={item.get('status', 'unknown')} | focus={item.get('current_focus', '—')}"
        for item in projects
    )


def render_brief(data: dict[str, Any]) -> str:
    parts = [
        f"Goal:\n{data.get('goal', '—')}",
        f"Current focus:\n{data.get('current_focus', '—')}",
        "\n".join(_lines("Must read first", _items(data, "must_read_first"))),
        "\n".join(_lines("Main files", _items(data, "main_files"))),
        "\n".join(
            _lines("Do not read by default", _items(data, "do_not_read_by_default"))
        ),
        "\n".join(_lines("Commands", _items(data, "commands"))),
    ]
    return "\n\n".join(parts)


def render_opencode(data: dict[str, Any]) -> str:
    memory = f"{data.get('title', data.get('id', 'Subproject'))}: {data.get('goal', '—')}"
    read_now = _items(data, "must_read_first")
    parts = [
        f"Task memory:\n{memory}",
        "\n".join(_lines("Read now", read_now)),
        "\n".join(
            _lines("Do not read unless needed", _items(data, "do_not_read_by_default"))
        ),
        f"Current focus:\n{data.get('current_focus', '—')}",
        "\n".join(_lines("Safety rules", _items(data, "safety_rules"))),
        "\n".join(
            _lines("Suggested verification", _items(data, "suggested_verification"))
        ),
    ]
    return "\n\n".join(parts)


def render_files(data: dict[str, Any]) -> str:
    return "\n\n".join(
        [
            "\n".join(_lines("Main files", _items(data, "main_files"))),
            "\n".join(_lines("Test files", _items(data, "test_files"))),
            "\n".join(_lines("Manual docs", _items(data, "manual_docs"))),
        ]
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("subproject_id", nargs="?", help="Subproject id")
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--list", action="store_true", help="List subprojects")
    modes.add_argument("--brief", action="store_true", help="Print bounded human context")
    modes.add_argument("--opencode", action="store_true", help="Print OpenCode task memory")
    modes.add_argument("--files", action="store_true", help="Print grouped files")
    return parser


def main(
    argv: list[str] | None = None,
    *,
    root: Path | str | None = None,
    stdout: Any = None,
    stderr: Any = None,
) -> int:
    out = stdout or sys.stdout
    err = stderr or sys.stderr
    parser = _parser()
    args = parser.parse_args(argv)
    try:
        if args.list:
            print(render_list(root), file=out)
            return 0
        if not args.subproject_id:
            parser.error("subproject_id is required unless --list is used")
        data = load_subproject(args.subproject_id, root)
        if args.brief:
            result = render_brief(data)
        elif args.opencode:
            result = render_opencode(data)
        else:
            result = render_files(data)
        print(result, file=out)
        return 0
    except SubprojectError as exc:
        print(f"error: {exc}", file=err)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())