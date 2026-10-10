import sqlite3
from contextlib import closing
import tempfile
import unittest
from pathlib import Path

from app.database import Database


class MigrationTests(unittest.TestCase):
    def test_upgrades_legacy_database_without_losing_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "kart.db"
            with closing(sqlite3.connect(path)) as db, db:
                db.execute("CREATE TABLE campuses (id TEXT PRIMARY KEY, name TEXT NOT NULL)")
                db.execute("INSERT INTO campuses VALUES (?,?)", ("existing", "Existing campus"))
            database = Database(str(path))
            with database.connect() as db:
                self.assertEqual(db.execute("PRAGMA user_version").fetchone()[0], 1)
                self.assertEqual(db.execute("SELECT name FROM campuses WHERE id='existing'").fetchone()[0], "Existing campus")
                self.assertIsNotNone(db.execute("SELECT name FROM sqlite_master WHERE name='sessions'").fetchone())
            Database(str(path))
            with closing(sqlite3.connect(path)) as db, db:
                db.execute("PRAGMA user_version=99")
            with self.assertRaisesRegex(RuntimeError, "newer"):
                Database(str(path))
