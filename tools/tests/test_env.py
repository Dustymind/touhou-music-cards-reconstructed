"""环境自检：确认 Python 版本、标准库 tomllib 与仓库骨架就位。"""
import pathlib
import tomllib

ROOT = pathlib.Path(__file__).resolve().parents[2]


def test_python_supports_tomllib():
    assert tomllib.loads('a = "b"') == {"a": "b"}


def test_repo_skeleton_exists():
    # 2026-09-28 起 `reports/` 移进 `docs/reports/`（见 docs/DECISIONS.md 的 D170 同批整理），
    # 所以这里列的是**根目录**那一层：reports 不再单列，改为断言它的新位置。
    for rel in ("data", "docs", "tools", "src", "tests"):
        assert (ROOT / rel).is_dir(), rel
    assert (ROOT / "docs" / "reports").is_dir(), "docs/reports"


def test_decision_records_present():
    for rel in ("docs/DECISIONS.md", "docs/data-provenance.md"):
        assert (ROOT / rel).stat().st_size > 1000, rel


def test_tools_project_parses():
    cfg = tomllib.loads((ROOT / "tools" / "pyproject.toml").read_text(encoding="utf-8"))
    assert cfg["project"]["requires-python"] == ">=3.11"
