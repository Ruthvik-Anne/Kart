import hashlib
import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.backup import create_backup
from app.database import Database


class BackupTests(unittest.TestCase):
    def test_snapshot_includes_private_files_and_detects_corruption(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            uploads = root / "uploads"
            uploads.mkdir()
            pdf = b"%PDF-1.7\nexample document"
            (uploads / "job.pdf").write_bytes(pdf)
            database = Database(str(root / "source.db"))
            with database.transaction() as db:
                db.execute("INSERT INTO campuses VALUES (?,?)", ("campus", "Campus"))
                db.execute("INSERT INTO users VALUES (?,?,?,?,?)", ("user", "campus", "Student", "student", 1))
                db.execute("INSERT INTO organizations VALUES (?,?,?,?)", ("org", "campus", "Xerox", "vendor"))
                db.execute("INSERT INTO stores VALUES (?,?,?,?,?,?)", ("store", "campus", "org", "Xerox", "xerox", 1))
                db.execute("INSERT INTO print_jobs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                    "job", "campus", "user", "store", str(uploads / "job.pdf"), hashlib.sha256(pdf).hexdigest(),
                    "file.pdf", 1, 1, 0, 0, 0, 2, "placed", "pickup-hash", 1))
            result = create_backup(root / "backup", root / "source.db", uploads)
            self.assertEqual(result["uploads"][0]["sha256"], hashlib.sha256(pdf).hexdigest())
            self.assertEqual((root / "backup/uploads/job.pdf").read_bytes(), pdf)
            with sqlite3.connect(root / "backup/kart.db") as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM print_jobs").fetchone()[0], 1)
            (uploads / "job.pdf").write_bytes(b"corrupt")
            with self.assertRaises(ValueError):
                create_backup(root / "bad", root / "source.db", uploads)
            self.assertFalse((root / "bad").exists())
