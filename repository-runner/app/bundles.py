import hashlib
import os
from pathlib import Path


def digest(path: Path) -> str:
    root = path.resolve()
    if not root.is_dir():
        raise ValueError("Suite bundle is unavailable")
    hasher = hashlib.sha256()
    files = sorted(item for item in root.rglob("*") if item.is_file())
    if not files or len(files) > 200:
        raise ValueError("Suite bundle must contain 1-200 regular files")
    for item in files:
        if item.is_symlink() or item.stat().st_size > 1024 * 1024:
            raise ValueError("Suite bundle contains an unsupported file")
        relative = item.relative_to(root).as_posix().encode("utf-8")
        hasher.update(len(relative).to_bytes(4, "big"))
        hasher.update(relative)
        with item.open("rb") as source:
            while block := source.read(65536):
                hasher.update(block)
    return "sha256:" + hasher.hexdigest()


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m app.bundles /path/to/suite")
    print(digest(Path(sys.argv[1])))
