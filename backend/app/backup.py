"""Consistent SQLite snapshot with verified immutable PDF objects.

Run inside the single backend instance against persistent storage. Encrypt and ship the
result off host using the operator's backup system; this command does not do that.
"""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
import time


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def create_backup(destination: Path, db_path: Path, upload_dir: Path) -> dict:
    destination = destination.resolve()
    if destination.exists():
        raise FileExistsError(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".kart-backup-", dir=destination.parent))
    temporary.chmod(0o700)
    try:
        snapshot = temporary / "kart.db"
        with closing(sqlite3.connect(db_path)) as source, closing(sqlite3.connect(snapshot)) as target:
            source.backup(target)
        snapshot.chmod(0o600)
        copied = []
        (temporary / "uploads").mkdir(mode=0o700)
        with closing(sqlite3.connect(snapshot)) as db:
            for job_id, file_path, expected in db.execute("SELECT id,file_path,file_sha256 FROM print_jobs"):
                source = Path(file_path)
                if source.parent.resolve() != upload_dir.resolve() or source.name != job_id + ".pdf" or source.is_symlink():
                    raise ValueError(f"Invalid upload path for {job_id}")
                target = temporary / "uploads" / source.name
                shutil.copyfile(source, target)
                target.chmod(0o600)
                digest = sha256_file(target)
                if digest != expected:
                    raise ValueError(f"Upload integrity check failed for {job_id}")
                copied.append({"id": job_id, "sha256": digest})
        manifest = {"created_at": int(time.time()), "database_sha256": sha256_file(snapshot),
                    "uploads": copied}
        (temporary / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        os.replace(temporary, destination)
        return manifest
    except BaseException:
        shutil.rmtree(temporary)
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Snapshot KART SQLite and private PDFs")
    parser.add_argument("destination", type=Path, help="New backup directory on durable storage")
    args = parser.parse_args()
    print(json.dumps(create_backup(args.destination, Path(os.getenv("KART_DB_PATH", "kart.db")),
                                   Path(os.getenv("KART_UPLOAD_DIR", "private-uploads"))), indent=2))
