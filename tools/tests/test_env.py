"""环境自检：确认 Python 版本、标准库 tomllib 与仓库骨架就位。"""
import pathlib
import tomllib

ROOT = pathlib.Path(__file__).resolve().parents[2]


def test_python_supports_tomllib():
    assert tomllib.loads('a = "b"') == {"a": "b"}


def test_repo_skeleton_exists():
    # S5 起 `docs/reports/` 是 gitignored 的工作记录目录（validate --report 现写现用），不随仓库分发。
    # （根 `tests/` 那个空占位已删：Python 测试早就全在 `tools/tests/`，它唯一的作用就是让这条断言成立。）
    for rel in ("data", "docs", "tools", "src"):
        assert (ROOT / rel).is_dir(), rel


def test_decision_records_present():
    for rel in ("docs/DECISIONS.md", "docs/data-provenance.md"):
        assert (ROOT / rel).stat().st_size > 1000, rel


def test_tools_project_parses():
    cfg = tomllib.loads((ROOT / "tools" / "pyproject.toml").read_text(encoding="utf-8"))
    assert cfg["project"]["requires-python"] == ">=3.11"
