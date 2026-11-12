"""Run contract tests without Docker or source checkout."""
import pytest

if __name__ == "__main__":
    raise SystemExit(pytest.main(["-q", "tests"]))
