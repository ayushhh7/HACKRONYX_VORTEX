import sqlite3
from pathlib import Path
from contextlib import contextmanager

DB_PATH = Path(__file__).resolve().parent.parent / "database" / "expense_system.db"

def get_db_connection():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

@contextmanager
def get_db():
    conn = get_db_connection()
    try:
        yield conn
    finally:
        conn.close()

if __name__ == "__main__":
    with get_db() as conn:
        tables = conn.execute("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY type, name").fetchall()
        print("Schema objects in database:")
        for t in tables:
            print(f"  [{t['type'].upper()}] {t['name']}")
            if t['type'] == 'table':
                cols = conn.execute(f"PRAGMA table_info({t['name']})").fetchall()
                col_names = [c['name'] for c in cols]
                print(f"       columns: {', '.join(col_names)}")
