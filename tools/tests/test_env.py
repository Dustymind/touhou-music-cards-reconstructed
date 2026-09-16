"""环境自检：确认 Python 版本、标准库 tomllib 与仓库骨架就位。"""
import pathlib
import tomllib

ROOT = pathlib.Path(__file__).resolve().parents[2]


def test_python_supports_tomllib():
    assert tomllib.loads('a = "b"') == {"a": "b"}


def test_repo_skeleton_exists():
    for rel in ("data", "docs", "tools", "src", "tests", "reports"):
        assert (ROOT / rel).is_dir(), rel


def test_decision_records_present():
    for rel in ("docs/PLAN.md", "docs/DECISIONS.md", "docs/rules-classification-v1.md"):
        assert (ROOT / rel).stat().st_size > 1000, rel


def test_tools_project_parses():
    cfg = tomllib.loads((ROOT / "tools" / "pyproject.toml").read_text(encoding="utf-8"))
    assert cfg["project"]["requires-python"] == ">=3.11"
