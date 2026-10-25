#!/usr/bin/env python3
import http.server
import json
import os
import subprocess
import shlex
import signal
import sqlite3
import time
import datetime
import urllib.parse
import sys
import mrai_tasks
import stat as _stat
import mimetypes
import zipfile
import tarfile
import email.utils
from socketserver import ThreadingMixIn

HOME_DIR = os.path.expanduser("~")

# Data (DB, uploads, tokens, job logs) lives in ~/.mrai — independent of where the code is checked out,
# so the frontend repo stays pure code and the data survives redeploys. Override with MRAI_DATA_DIR.
DATA_DIR = os.path.abspath(os.environ.get("MRAI_DATA_DIR") or os.path.join(HOME_DIR, ".mrai"))
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "mrai.db")
WORKSPACE_DIR = os.path.join(DATA_DIR, "workspace")
UPLOAD_DIR = os.path.join(WORKSPACE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(WORKSPACE_DIR, exist_ok=True)
# NO sandbox: the agent works on the owner's real computer and can act anywhere when asked.
# Its default working folder is a "room" at ~/MR/mrai/work (override with MRAI_WORK_DIR), so new files
# do not scatter through the code or the data dir. workspace/ only keeps background-job logs (.jobs) and uploads.
WORK_DIR = os.path.abspath(os.environ.get("MRAI_WORK_DIR") or os.path.join(HOME_DIR, "MR", "mrai", "work"))
AGENT_HOME = WORK_DIR
os.makedirs(WORK_DIR, exist_ok=True)

# Skills library: always on the owner's real computer (never in the data dir or the code checkout), so a
# frontend hosted elsewhere (e.g. Vercel, whose filesystem is read-only and ephemeral) reads it over HTTP
# via /skills and /skills/content instead of the local filesystem. Override with MRAI_SKILLS_DIR.
SKILLS_DIR = os.path.abspath(os.environ.get("MRAI_SKILLS_DIR") or os.path.join(HOME_DIR, "MR", "mrai", "skills"))

TOKEN_PATH = os.path.join(DATA_DIR, "token.key")
AUTH_TOKEN = ""
if os.path.exists(TOKEN_PATH):
    try:
        with open(TOKEN_PATH, "r") as f:
            AUTH_TOKEN = f.read().strip()
    except Exception:
        pass

if not AUTH_TOKEN:
    import secrets as _secrets
    AUTH_TOKEN = _secrets.token_hex(32)
    with open(TOKEN_PATH, "w") as _f:
        _f.write(AUTH_TOKEN)
    os.chmod(TOKEN_PATH, 0o600)

import re as _re
import hashlib as _hashlib
import hmac as _hmac
import secrets as _sec
import datetime as _dt

LEGACY_USER = "mrqosimov2011"
import time as _t
# The site access key is stored ONLY here (in access.key); Vercel/Next never sees it.
ACCESS_KEY_FILE = os.path.join(DATA_DIR, "access.key")
_ACCESS_FAILS = {}  # ip -> [number of failures, time of first failure]
USERNAME_RE = _re.compile(r"^[a-z0-9_.-]{3,32}$")

import threading as _threading
_STATE_LOCK = _threading.Lock()
_STATE_USER_LOCKS = {}

def _user_lock(user):
    with _STATE_LOCK:
        lk = _STATE_USER_LOCKS.get(user)
        if lk is None:
            lk = _threading.Lock()
            _STATE_USER_LOCKS[user] = lk
        return lk

def req_user(headers):
    """x-mrai-user sent by the Next proxy. If missing (scheduler) -- the owner."""
    u = (headers.get("x-mrai-user", "") or "").strip().lower()
    return u if USERNAME_RE.match(u) else LEGACY_USER

# Command execution has no sandbox, so it is enabled ONLY for the owner: other registered
# accounts must not get a shell on the owner's computer. To allow one, add the name to this set.
EXEC_ALLOWED = {LEGACY_USER}
DENIED_MSG = "Command execution is disabled for this account (there is no sandbox, so it is enabled only for the owner).\n"

# MRAI_EXEC_ALL=1 (default): every account can run commands. Set MRAI_EXEC_ALL=0 to disable -- then only EXEC_ALLOWED.
EXEC_ALL = os.environ.get("MRAI_EXEC_ALL", "1").strip() != "0"

def exec_allowed(user):
    if EXEC_ALL:
        return True
    return (user or LEGACY_USER) in EXEC_ALLOWED

def hash_password(password, salt=None):
    salt = salt or _sec.token_bytes(16)
    h = _hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return "scrypt$%s$%s" % (salt.hex(), h.hex())

def check_password(password, stored):
    try:
        _, salt_hex, h_hex = stored.split("$")
        got = _hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1, dklen=32)
        return _hmac.compare_digest(got.hex(), h_hex)
    except Exception:
        return False

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _tok(v):
    try:
        n = int(float(v))
    except Exception:
        return 0
    return max(0, min(n, 50_000_000))

def usage_summary(cur, user, days):
    """Tokens a user has spent: total, days, models, sources and recent requests."""
    days = max(1, min(int(days or 30), 365))
    today = datetime.date.today()
    t0 = int(time.mktime(today.timetuple()))
    start = int(time.mktime((today - datetime.timedelta(days=days - 1)).timetuple()))

    def agg(since):
        cur.execute("SELECT COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0), COUNT(*) FROM usage WHERE user_id=? AND ts>=?", (user, since))
        r = cur.fetchone()
        return {"input": r[0], "output": r[1], "calls": r[2]}

    totals = {
        "today": agg(t0),
        "d7": agg(int(time.mktime((today - datetime.timedelta(days=6)).timetuple()))),
        "d30": agg(int(time.mktime((today - datetime.timedelta(days=29)).timetuple()))),
        "all": agg(0),
        "range": agg(start),
    }

    cur.execute("""SELECT date(ts,'unixepoch','localtime') d, SUM(input_tokens), SUM(output_tokens), COUNT(*)
                   FROM usage WHERE user_id=? AND ts>=? GROUP BY d""", (user, start))
    byd = {r[0]: {"input": r[1], "output": r[2], "calls": r[3]} for r in cur.fetchall()}
    by_day = []
    for i in range(days):
        d = (today - datetime.timedelta(days=days - 1 - i)).isoformat()
        v = byd.get(d, {"input": 0, "output": 0, "calls": 0})
        by_day.append({"day": d, **v})

    cur.execute("""SELECT provider, model, SUM(input_tokens), SUM(output_tokens), COUNT(*), SUM(estimated)
                   FROM usage WHERE user_id=? AND ts>=? GROUP BY provider, model
                   ORDER BY SUM(input_tokens)+SUM(output_tokens) DESC LIMIT 20""", (user, start))
    by_model = [{"provider": r[0], "model": r[1], "input": r[2], "output": r[3], "calls": r[4], "estimated": r[5] or 0} for r in cur.fetchall()]

    cur.execute("""SELECT source, SUM(input_tokens), SUM(output_tokens), COUNT(*)
                   FROM usage WHERE user_id=? AND ts>=? GROUP BY source
                   ORDER BY SUM(input_tokens)+SUM(output_tokens) DESC""", (user, start))
    by_source = [{"source": r[0], "input": r[1], "output": r[2], "calls": r[3]} for r in cur.fetchall()]

    cur.execute("""SELECT ts, provider, model, source, input_tokens, output_tokens, estimated
                   FROM usage WHERE user_id=? ORDER BY ts DESC LIMIT 12""", (user,))
    recent = [{"ts": r[0], "provider": r[1], "model": r[2], "source": r[3], "input": r[4], "output": r[5], "estimated": bool(r[6])} for r in cur.fetchall()]

    cur.execute("SELECT COUNT(*) FROM usage WHERE user_id=? AND ts>=? AND estimated=1", (user, start))
    return {"days": days, "totals": totals, "by_day": by_day, "by_model": by_model,
            "by_source": by_source, "recent": recent, "estimated_calls": cur.fetchone()[0]}

def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )""")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""")
    cur.execute("""
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages (chat_id)
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        name TEXT NOT NULL,
        api_key TEXT NOT NULL,
        model TEXT NOT NULL,
        base_url TEXT,
        is_default INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
    )""")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        pass_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        ts REAL NOT NULL,
        provider TEXT DEFAULT '',
        model TEXT DEFAULT '',
        key_id TEXT DEFAULT '',
        source TEXT DEFAULT 'chat',
        chat_id TEXT DEFAULT '',
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        estimated INTEGER DEFAULT 0
    )""")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_usage_user_ts ON usage (user_id, ts)")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS user_state (
        user_id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at REAL NOT NULL
    )""")
    for tbl in ("chats", "messages", "api_keys"):
        cols = [r[1] for r in cur.execute("PRAGMA table_info(%s)" % tbl).fetchall()]
        if "user_id" not in cols:
            cur.execute("ALTER TABLE %s ADD COLUMN user_id TEXT NOT NULL DEFAULT '%s'" % (tbl, LEGACY_USER))
        cur.execute("CREATE INDEX IF NOT EXISTS idx_%s_user ON %s (user_id)" % (tbl, tbl))
    conn.commit()
    conn.close()

init_db()

VALID_TOKENS = set(filter(None, [AUTH_TOKEN]))

def is_authorized(headers):
    if not VALID_TOKENS:
        return False
    auth = headers.get("Authorization", "").strip()
    if auth.startswith("Bearer "):
        if auth[7:].strip() in VALID_TOKENS:
            return True
    if headers.get("x-mrai-token", "").strip() in VALID_TOKENS:
        return True
    return False

_PURE_CD = _re.compile(r"^cd(?:\s+[^;&|<>()$`\n]+)?$")


def _resolve_dir(path, base):
    """Turns ~, ~/x, an absolute path or one relative to base into an existing folder, otherwise None."""
    if not path:
        return None
    p = path
    if p == "~" or p.startswith("~/"):
        p = os.path.join(HOME_DIR, p[2:])
    elif not os.path.isabs(p):
        p = os.path.join(base, p)
    p = os.path.normpath(p)
    return p if os.path.isdir(p) else None


# ---- Skills (read-only): served over HTTP so a frontend that isn't on this computer (e.g. Vercel) can
# still see the real skills library, exactly like /file does for any other file on this machine. ----
def _skill_frontmatter(skill_md_path):
    try:
        with open(skill_md_path, "r", encoding="utf-8", errors="replace") as f:
            raw = f.read(8192)
    except Exception:
        return {}
    m = _re.match(r"^﻿?---\r?\n(.*?)\r?\n---", raw, _re.S)
    if not m:
        return {}
    out, key = {}, None
    for line in m.group(1).splitlines():
        kv = _re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if kv:
            key = kv.group(1).lower()
            v = kv.group(2).strip()
            if len(v) > 1 and v[0] in "\"'" and v[-1] == v[0]:
                v = v[1:-1]
            out[key] = v
        elif key and line.strip():
            out[key] = (out.get(key, "") + " " + line.strip()).strip()
    return out


def _list_category_names():
    """Cheap: just the top-level category folder names (no SKILL.md files opened at all)."""
    out = []
    if not os.path.isdir(SKILLS_DIR):
        return out
    for e in sorted(os.listdir(SKILLS_DIR)):
        if e.startswith(".") or e.startswith("_"):
            continue
        d = os.path.join(SKILLS_DIR, e)
        if os.path.isdir(d) and not os.path.isfile(os.path.join(d, "SKILL.md")):
            out.append(e)
    return out


def _list_skills(only_category=None):
    """<SKILLS_DIR>/<category>/<skill>/SKILL.md (old flat <SKILLS_DIR>/<skill>/SKILL.md also works).
    With only_category set, every other category's folder is skipped entirely (its files are never
    opened) — this is what lets the UI load one category's skills at a time instead of all 3000+ at once."""
    out = []
    if not os.path.isdir(SKILLS_DIR):
        return out

    def read_one(d, category, fallback_name):
        md = os.path.join(d, "SKILL.md")
        if not os.path.isfile(md):
            return None
        fm = _skill_frontmatter(md)
        name = (fm.get("name") or fallback_name).strip()
        desc = (fm.get("description") or "").strip() or ("Skill: " + name)
        return {"name": name, "description": desc, "dir": d, "category": category}

    for e in sorted(os.listdir(SKILLS_DIR)):
        if e.startswith(".") or e.startswith("_"):
            continue
        if only_category is not None and e != only_category:
            continue
        d = os.path.join(SKILLS_DIR, e)
        if not os.path.isdir(d):
            continue
        flat = read_one(d, "", e)
        if flat:
            out.append(flat)
            continue
        try:
            children = sorted(os.listdir(d))
        except Exception:
            continue
        for c in children:
            if c.startswith(".") or c.startswith("_"):
                continue
            cd = os.path.join(d, c)
            if not os.path.isdir(cd):
                continue
            m = read_one(cd, e, c)
            if m:
                out.append(m)
    return out


def _skill_bundled_files(skill_dir, limit=60):
    out = []
    def walk(d, depth):
        if len(out) >= limit or depth > 3:
            return
        try:
            entries = sorted(os.listdir(d))
        except Exception:
            return
        for name in entries:
            if len(out) >= limit:
                return
            if name.startswith(".") or name in ("node_modules", "__pycache__"):
                continue
            full = os.path.join(d, name)
            if os.path.isdir(full):
                walk(full, depth + 1)
            elif not (depth == 0 and name == "SKILL.md"):
                out.append(os.path.relpath(full, skill_dir))
    walk(skill_dir, 0)
    return out


def sanitize_cwd(req_cwd, user=None):
    """Working folder: the requested (existing) folder anywhere on the computer, otherwise ~/MR/mrai/work. No restriction."""
    return _resolve_dir(req_cwd, WORK_DIR) or WORK_DIR


def _safe_upload_name(name):
    """Keep only a safe basename for an uploaded file."""
    name = os.path.basename(name or "").replace("\x00", "")
    name = _re.sub(r"[^A-Za-z0-9._ -]", "_", name).strip() or "file"
    return name[:120]


def host_env():
    """The owner's real environment (HOME, PATH, D-Bus, Wayland): so notify-send, systemctl --user etc. work."""
    env = os.environ.copy()
    env["HOME"] = HOME_DIR
    rt = env.get("XDG_RUNTIME_DIR") or "/run/user/%d" % os.getuid()
    if os.path.isdir(rt):
        env["XDG_RUNTIME_DIR"] = rt
        if not env.get("DBUS_SESSION_BUS_ADDRESS") and os.path.exists(rt + "/bus"):
            env["DBUS_SESSION_BUS_ADDRESS"] = "unix:path=" + rt + "/bus"
        if not env.get("WAYLAND_DISPLAY"):
            try:
                socks = sorted(n for n in os.listdir(rt) if n.startswith("wayland-") and not n.endswith(".lock"))
            except OSError:
                socks = []
            if socks:
                env["WAYLAND_DISPLAY"] = socks[0]
    cur = [x for x in (env.get("PATH") or "").split(":") if x]
    extra = [os.path.join(HOME_DIR, ".local", "bin"), os.path.join(HOME_DIR, "bin"),
             "/usr/local/sbin", "/usr/local/bin", "/usr/sbin", "/usr/bin", "/sbin", "/bin"]
    env["PATH"] = ":".join(cur + [x for x in extra if x not in cur])
    env.setdefault("LANG", "C.UTF-8")
    env.setdefault("TERM", "dumb")
    return env


def popen_kwargs(cmd, cwd, user=None):
    """Bash on the real computer (no sandbox)."""
    return {"args": ["bash", "-c", cmd], "cwd": cwd if cwd and os.path.isdir(cwd) else WORK_DIR, "env": host_env()}


def run_command(cmd, cwd, timeout=30, user=None):
    """Runs the command on the owner's real computer. If the time runs out the whole process group is killed."""
    if not exec_allowed(user):
        return {"stdout": "", "stderr": DENIED_MSG, "exit_code": 126, "cwd": cwd}
    try:
        p = subprocess.Popen(**popen_kwargs(cmd, cwd, user), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             stdin=subprocess.DEVNULL, text=True, errors="replace", start_new_session=True)
    except Exception as e:
        return {"stdout": "", "stderr": str(e) + "\n", "exit_code": 1, "cwd": cwd}
    try:
        out, err = p.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(p.pid, signal.SIGKILL)
        except Exception:
            p.kill()
        try:
            p.communicate(timeout=5)
        except Exception:
            pass
        return {"stdout": "", "stderr": "Error: the command exceeded the time limit (%ds) and was stopped. Use background:true for long jobs.\n" % timeout, "exit_code": 124, "cwd": cwd}
    return {"stdout": out[:500000], "stderr": err[:500000], "exit_code": p.returncode, "cwd": cwd}


# ---------------------------------------------------------------------------
# File artifact ("runner"): the file stays on the computer and is ONLY streamed to the browser.
# The whole file is never read into memory: a 1 MB file and a 1 TB file open in the same time.
# Range (partial reads), ETag/304 (cached but never stale), stat, and archive/folder listing.
# ---------------------------------------------------------------------------
_MAGIC = [
    (b"\x89PNG\r\n\x1a\n", "image/png"), (b"\xff\xd8\xff", "image/jpeg"), (b"GIF8", "image/gif"),
    (b"%PDF-", "application/pdf"), (b"PK\x03\x04", "application/zip"), (b"PK\x05\x06", "application/zip"),
    (b"\x1f\x8b", "application/gzip"), (b"7z\xbc\xaf\x27\x1c", "application/x-7z-compressed"),
    (b"Rar!", "application/vnd.rar"), (b"BZh", "application/x-bzip2"), (b"\xfd7zXZ\x00", "application/x-xz"),
    (b"\x7fELF", "application/x-elf"), (b"SQLite format 3\x00", "application/vnd.sqlite3"),
    (b"OggS", "audio/ogg"), (b"ID3", "audio/mpeg"), (b"fLaC", "audio/flac"),
]
_BINARY_PREFIX = ("image/", "video/", "audio/")
_BINARY_MIME = {"application/pdf", "application/zip", "application/gzip", "application/x-7z-compressed",
                "application/vnd.rar", "application/x-bzip2", "application/x-xz", "application/x-elf",
                "application/vnd.sqlite3", "application/octet-stream"}

def _sniff(path):
    """(mime, is_text): sniffed from the first 8 KB (works even if the extension is wrong or missing)."""
    try:
        with open(path, "rb") as f:
            head = f.read(8192)
    except OSError:
        return None, False
    mime = None
    for sig, m in _MAGIC:
        if head.startswith(sig):
            mime = m
            break
    if mime is None and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        mime = "image/webp"
    if mime is None and head[4:8] == b"ftyp":
        mime = "video/mp4"
    if mime is None:
        mime = mimetypes.guess_type(path)[0]
    if mime and (mime.startswith(_BINARY_PREFIX) and mime != "image/svg+xml" or mime in _BINARY_MIME):
        return mime, False
    text = b"\x00" not in head
    if text:
        try:
            head.decode("utf-8")
        except UnicodeDecodeError as e:
            text = e.start >= len(head) - 4  # the last character may be cut off
    return mime, text

def _parse_range(h, size):
    """'bytes=a-b' | 'bytes=a-' | 'bytes=-n' -> (start, end), or None (invalid) / False (not satisfiable)."""
    try:
        unit, _, spec = h.partition("=")
        if unit.strip().lower() != "bytes" or "," in spec:
            return None
        a, _, b = spec.strip().partition("-")
        if a == "":
            n = int(b)
            if n <= 0:
                return False
            return max(0, size - n), size - 1
        start = int(a)
        end = int(b) if b != "" else size - 1
        if start >= size or start > end:
            return False
        return start, min(end, size - 1)
    except Exception:
        return None


class ThreadingServer(ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


class ServerHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def send_cors(self, status=200, content_type="application/json"):
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-mrai-token, ngrok-skip-browser-warning")
        self.send_header("Content-Type", content_type)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_cors(200)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return {}

    def _json(self, status, obj):
        self.send_cors(status)
        self.wfile.write(json.dumps(obj).encode("utf-8"))

    def _handle_upload(self):
        """Save a raw uploaded file (streamed, never fully buffered) to UPLOAD_DIR; return its absolute path."""
        try:
            length = int(self.headers.get("Content-Length", 0))
        except Exception:
            length = 0
        if length <= 0 or length > 50 * 1024 * 1024 * 1024:  # cap 50 GB
            return self._json(413, {"error": "Invalid or too large upload"})
        name = _safe_upload_name(urllib.parse.unquote(self.headers.get("x-filename", "") or "file"))
        import uuid as _uuid
        udir = os.path.join(UPLOAD_DIR, req_user(self.headers))
        os.makedirs(udir, exist_ok=True)
        dest = os.path.join(udir, _uuid.uuid4().hex[:8] + "-" + name)
        got = 0
        with open(dest, "wb") as f:
            remaining = length
            while remaining > 0:
                chunk = self.rfile.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                f.write(chunk)
                got += len(chunk)
                remaining -= len(chunk)
        self._json(200, {"path": dest, "name": name, "size": got})

    def handle_file(self, query):
        """GET /file?path=/abs&op=stat|list|get — same permission as /exec (exec_allowed)."""
        user = req_user(self.headers)
        if not exec_allowed(user):
            return self._json(403, {"error": "forbidden"})
        p = query.get("path", [""])[0] or ""
        op = query.get("op", ["get"])[0] or "get"
        if not p.startswith("/") or "\x00" in p or len(p) > 4096:
            return self._json(400, {"error": "bad_path"})
        try:
            st = os.stat(p)
        except FileNotFoundError:
            return self._json(404, {"error": "not_found"})
        except PermissionError:
            return self._json(403, {"error": "permission_denied"})
        except OSError as e:
            return self._json(500, {"error": "os_error", "detail": str(e)[:200]})
        is_dir = _stat.S_ISDIR(st.st_mode)
        etag = '"%x-%x-%x"' % (st.st_ino, st.st_size, st.st_mtime_ns)

        if op == "stat":
            info = {"exists": True, "type": "dir" if is_dir else "file",
                    "name": os.path.basename(p.rstrip("/")) or "/", "size": st.st_size,
                    "mtime": st.st_mtime, "etag": etag.strip('"')}
            if not is_dir:
                mime, text = _sniff(p)
                info["mime"] = mime
                info["text"] = text
            return self._json(200, info)

        if op == "list":
            LIMIT = 400
            try:
                if is_dir:
                    names = sorted(os.listdir(p), key=lambda n: n.lower())
                    ents = []
                    for n in names[:LIMIT]:
                        try:
                            ents.append(n + ("/" if os.path.isdir(os.path.join(p, n)) else ""))
                        except OSError:
                            ents.append(n)
                    return self._json(200, {"entries": ents, "total": len(names), "truncated": len(names) > LIMIT})
                if zipfile.is_zipfile(p):
                    with zipfile.ZipFile(p) as z:
                        names = z.namelist()
                    return self._json(200, {"entries": names[:LIMIT], "total": len(names), "truncated": len(names) > LIMIT})
                try:
                    ents = []
                    with tarfile.open(p, "r:*") as t:
                        for m in t:
                            ents.append(m.name + ("/" if m.isdir() else ""))
                            if len(ents) >= LIMIT:
                                break
                    return self._json(200, {"entries": ents, "total": None, "truncated": len(ents) >= LIMIT})
                except tarfile.TarError:
                    pass
                import shutil
                bsd = shutil.which("bsdtar")
                if bsd:
                    proc = subprocess.Popen([bsd, "-tf", p], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
                    ents = []
                    try:
                        for line in proc.stdout:
                            ents.append(line.rstrip("\n"))
                            if len(ents) >= LIMIT:
                                break
                    finally:
                        proc.kill()
                    if ents:
                        return self._json(200, {"entries": ents, "total": None, "truncated": len(ents) >= LIMIT})
                return self._json(415, {"error": "not_archive"})
            except PermissionError:
                return self._json(403, {"error": "permission_denied"})
            except Exception as e:
                return self._json(500, {"error": "list_failed", "detail": str(e)[:200]})

        # ---- op=get: oqim (stream) ----
        if is_dir or not _stat.S_ISREG(st.st_mode):
            return self._json(400, {"error": "not_a_file"})
        size = st.st_size
        last_mod = email.utils.formatdate(st.st_mtime, usegmt=True)
        inm = (self.headers.get("If-None-Match") or "").strip()
        if inm and (inm == "*" or etag in [x.strip() for x in inm.split(",")]):
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Last-Modified", last_mod)
            self.end_headers()
            return
        start, end, status = 0, size - 1, 200
        rng = self.headers.get("Range")
        ifr = (self.headers.get("If-Range") or "").strip()
        if rng and (not ifr or ifr == etag):
            r = _parse_range(rng, size) if size > 0 else False
            if r is False:
                self.send_response(416)
                self.send_header("Content-Range", "bytes */%d" % size)
                self.send_header("Content-Length", "0")
                self.send_header("ETag", etag)
                self.end_headers()
                return
            if r:
                start, end = r
                status = 206
        length = max(0, end - start + 1) if size > 0 else 0
        mime, text = _sniff(p)
        try:
            f = open(p, "rb")
        except PermissionError:
            return self._json(403, {"error": "permission_denied"})
        except OSError as e:
            return self._json(500, {"error": "os_error", "detail": str(e)[:200]})
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(length))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("ETag", etag)
            self.send_header("Last-Modified", last_mod)
            self.send_header("X-File-Size", str(size))
            self.send_header("X-File-Mime", mime or "")
            self.send_header("X-File-Text", "1" if text else "0")
            if status == 206:
                self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
            self.end_headers()
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(1 << 20, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass  # the browser disconnected (e.g. a video was seeked) — normal
        finally:
            f.close()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # Health check (public, no token needed)
        if path in ("/", "/health"):
            self.send_cors()
            self.wfile.write(json.dumps({
                "status": "ok",
                "server": "MR AI Local Server",
                "security": "Host exec (no sandbox; command execution only for the owner)",
                "auth_required": bool(AUTH_TOKEN)
            }).encode("utf-8"))
            return

        # Security check for database routes
        if not is_authorized(self.headers):
            self.send_cors(401)
            self.wfile.write(json.dumps({"error": "Unauthorized: security token required"}).encode("utf-8"))
            return

        if path == "/file":
            self.handle_file(query)
            return

        if path == "/skills":
            # ?categories=1      -> just the category names (near-instant: no SKILL.md files opened)
            # ?category=<name>   -> only that category's skills (fast: skips every other folder)
            # (neither)          -> every skill (kept for callers that genuinely want the full catalog)
            if query.get("categories", [""])[0]:
                self._json(200, {"categories": _list_category_names(), "root": SKILLS_DIR})
            else:
                only = query.get("category", [None])[0]
                self._json(200, {"skills": _list_skills(only_category=only), "root": SKILLS_DIR})
            return

        if path == "/skills/content":
            d = os.path.normpath(query.get("dir", [""])[0])
            # must resolve inside SKILLS_DIR (no escaping via ../..)
            if not d or os.path.commonpath([d, SKILLS_DIR]) != SKILLS_DIR:
                return self._json(400, {"error": "Invalid skill directory"})
            md = os.path.join(d, "SKILL.md")
            if not os.path.isfile(md):
                return self._json(404, {"error": "SKILL.md not found"})
            try:
                with open(md, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
            except Exception as e:
                return self._json(500, {"error": str(e)})
            return self._json(200, {"skillMd": content, "files": _skill_bundled_files(d)})

        if path == "/state":
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT data FROM user_state WHERE user_id = ?", (req_user(self.headers),))
            row = cur.fetchone()
            conn.close()
            return self._json(200, {"data": json.loads(row[0]) if row else None})

        _h = mrai_tasks.handle("GET", path, query, {}, req_user(self.headers))
        if _h is not None:
            self.send_cors(_h[0])
            self.wfile.write(json.dumps(_h[1]).encode("utf-8"))
            return

        conn = get_db()
        cur = conn.cursor()
        try:
            if path == "/api/db/status":
                cur.execute("SELECT COUNT(*) FROM chats WHERE user_id = ?", (req_user(self.headers),))
                chats_count = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM messages WHERE user_id = ?", (req_user(self.headers),))
                messages_count = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM api_keys WHERE user_id = ?", (req_user(self.headers),))
                keys_count = cur.fetchone()[0]
                db_size = os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0

                self.send_cors()
                self.wfile.write(json.dumps({
                    "status": "ok",
                    "chats_count": chats_count,
                    "messages_count": messages_count,
                    "keys_count": keys_count,
                    "db_size": db_size
                }).encode("utf-8"))
                return

            if path == "/api/db/chats":
                cur.execute("SELECT id, title, created_at, updated_at FROM chats WHERE user_id = ? ORDER BY updated_at DESC", (req_user(self.headers),))
                rows = [dict(r) for r in cur.fetchall()]
                self.send_cors()
                self.wfile.write(json.dumps(rows).encode("utf-8"))
                return

            if path == "/api/db/messages":
                chat_id = query.get("chat_id", [""])[0]
                if not chat_id:
                    self.send_cors(400)
                    self.wfile.write(json.dumps({"error": "chat_id is required"}).encode("utf-8"))
                    return
                cur.execute("SELECT id, chat_id, role, content, created_at FROM messages WHERE chat_id = ? AND user_id = ? ORDER BY created_at ASC", (chat_id, req_user(self.headers)))
                rows = [dict(r) for r in cur.fetchall()]
                self.send_cors()
                self.wfile.write(json.dumps(rows).encode("utf-8"))
                return

            if path == "/api/db/keys":
                cur.execute("SELECT id, provider, name, api_key, model, base_url, is_default, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC", (req_user(self.headers),))
                rows = [dict(r) for r in cur.fetchall()]
                for r in rows:
                    r["is_default"] = bool(r["is_default"])
                self.send_cors()
                self.wfile.write(json.dumps(rows).encode("utf-8"))
                return

            if path == "/api/db/usage":
                try:
                    _days = int(query.get("days", ["30"])[0])
                except Exception:
                    _days = 30
                self.send_cors()
                self.wfile.write(json.dumps(usage_summary(cur, req_user(self.headers), _days)).encode("utf-8"))
                return

            if path == "/api/db/export":
                cur.execute("SELECT * FROM chats WHERE user_id = ? ORDER BY updated_at DESC", (req_user(self.headers),))
                chats = [dict(r) for r in cur.fetchall()]
                cur.execute("SELECT * FROM messages WHERE user_id = ? ORDER BY created_at ASC", (req_user(self.headers),))
                messages = [dict(r) for r in cur.fetchall()]
                cur.execute("SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC", (req_user(self.headers),))
                keys = [dict(r) for r in cur.fetchall()]
                self.send_cors()
                self.wfile.write(json.dumps({"chats": chats, "messages": messages, "api_keys": keys}).encode("utf-8"))
                return

            self.send_cors(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))
        finally:
            conn.close()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Binary upload (raw body, not JSON) — handled before the JSON body is read.
        if path == "/upload":
            if not is_authorized(self.headers):
                return self._json(401, {"error": "Unauthorized: invalid or missing security token."})
            return self._handle_upload()

        body = self.read_json_body()

        # Token authentication check
        if not is_authorized(self.headers):
            self.send_cors(401)
            self.wfile.write(json.dumps({"error": "Unauthorized: invalid or missing security token."}).encode("utf-8"))
            return

        # Command execution: on the owner's REAL computer (no sandbox), only for EXEC_ALLOWED accounts.
        if path == "/exec":
            cmd = body.get("command", "")
            req_cwd = body.get("cwd", "")
            xuser = req_user(self.headers)
            cwd = sanitize_cwd(req_cwd, xuser)

            trimmed = cmd.strip()
            if not exec_allowed(xuser):
                out = {"stdout": "", "stderr": DENIED_MSG, "exit_code": 126, "cwd": cwd}
            elif _PURE_CD.match(trimmed):
                arg = trimmed[2:].strip()
                try:
                    parts = shlex.split(arg)
                except ValueError:
                    parts = [arg]
                target = parts[0] if parts else "~"
                new_dir = _resolve_dir(target, cwd)
                if new_dir:
                    cwd = new_dir
                    out = {"stdout": "", "stderr": "", "exit_code": 0, "cwd": cwd}
                else:
                    out = {"stdout": "", "stderr": "bash: cd: %s: No such directory\n" % target, "exit_code": 1, "cwd": cwd}
            else:
                try:
                    tmo = max(1, min(int(body.get("timeout", 30)), 900))
                except Exception:
                    tmo = 30
                if body.get("background"):
                    out = mrai_tasks.start_job(cmd, cwd, xuser)
                else:
                    out = run_command(cmd, cwd, tmo, xuser)

            self.send_cors()
            self.wfile.write(json.dumps(out).encode("utf-8"))
            return

        # Save (edit) a text file back to disk. Same privilege as /exec: owner only, no sandbox.
        if path == "/save":
            xuser = req_user(self.headers)
            if not exec_allowed(xuser):
                return self._json(403, {"error": DENIED_MSG.strip()})
            fp = body.get("path", "")
            content = body.get("content", "")
            if not isinstance(fp, str) or not fp.startswith("/") or "\0" in fp or len(fp) > 4096:
                return self._json(400, {"error": "Invalid path"})
            if not isinstance(content, str):
                return self._json(400, {"error": "Invalid content"})
            try:
                d = os.path.dirname(fp)
                if d and not os.path.isdir(d):
                    os.makedirs(d, exist_ok=True)
                with open(fp, "w", encoding="utf-8") as f:
                    f.write(content)
                st = os.stat(fp)
                return self._json(200, {"ok": True, "path": fp, "size": st.st_size, "mtime": int(st.st_mtime)})
            except Exception as e:
                return self._json(500, {"error": str(e)})

        # Per-user app state (message queue, UI state, memory): a full-document replace, same shape as
        # before when it lived in a local JSON file on the Next server — now durable here instead, so it
        # also works when the frontend runs somewhere without a writable/persistent filesystem (Vercel).
        if path == "/state":
            data = body.get("data")
            if data is None or not isinstance(data, (dict, list)):
                return self._json(400, {"error": "Invalid state"})
            xuser = req_user(self.headers)
            with _user_lock(xuser):
                conn = get_db()
                cur = conn.cursor()
                cur.execute(
                    "INSERT INTO user_state (user_id, data, updated_at) VALUES (?, ?, ?) "
                    "ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
                    (xuser, json.dumps(data), time.time()),
                )
                conn.commit()
                conn.close()
            return self._json(200, {"ok": True})

        # Image upload endpoint (cgi removed)
        if path == "/api/upload":
            self.send_cors(501)
            self.wfile.write(json.dumps({"error": "Upload is temporarily disabled"}).encode("utf-8"))
            return

        _h = mrai_tasks.handle("POST", path, urllib.parse.parse_qs(parsed.query), body, req_user(self.headers))
        if _h is not None:
            self.send_cors(_h[0])
            self.wfile.write(json.dumps(_h[1]).encode("utf-8"))
            return

        conn = get_db()
        cur = conn.cursor()
        try:
            if path == "/api/auth/access":
                ip = (str(body.get("ip", "")).strip()[:64]) or "local"
                rec = _ACCESS_FAILS.get(ip)
                if rec and _t.time() - rec[1] < 600 and rec[0] >= 5:
                    self.send_cors(429)
                    self.wfile.write(json.dumps({"error": "Too many attempts. Try again later."}).encode("utf-8"))
                    return
                try:
                    with open(ACCESS_KEY_FILE, encoding="utf-8") as _kf:
                        real_key = _kf.read().strip()
                except OSError:
                    real_key = ""
                if not real_key:
                    self.send_cors(503)
                    self.wfile.write(json.dumps({"error": "The access key is not configured (access.key)"}).encode("utf-8"))
                    return
                given = str(body.get("key", "")).strip()
                if given and _hmac.compare_digest(given.encode("utf-8"), real_key.encode("utf-8")):
                    _ACCESS_FAILS.pop(ip, None)
                    self.send_cors()
                    self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))
                    return
                if rec and _t.time() - rec[1] < 600:
                    rec[0] += 1
                else:
                    _ACCESS_FAILS[ip] = [1, _t.time()]
                _t.sleep(0.6)
                self.send_cors(401)
                self.wfile.write(json.dumps({"error": "Wrong access key"}).encode("utf-8"))
                return

            if path == "/api/auth/register":
                username = str(body.get("username", "")).strip().lower()
                name = str(body.get("name", "")).strip()[:60] or username
                password = str(body.get("password", ""))
                if not USERNAME_RE.match(username):
                    self.send_cors(400)
                    self.wfile.write(json.dumps({"error": "Username must be 3-32 characters: a-z, 0-9, _ . -"}).encode("utf-8"))
                    return
                if len(password) < 6 or len(password) > 200:
                    self.send_cors(400)
                    self.wfile.write(json.dumps({"error": "Password must be at least 6 characters"}).encode("utf-8"))
                    return
                if username == LEGACY_USER or cur.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
                    self.send_cors(409)
                    self.wfile.write(json.dumps({"error": "Bu username allaqachon band"}).encode("utf-8"))
                    return
                cur.execute("INSERT INTO users (username, name, pass_hash, created_at) VALUES (?, ?, ?, ?)",
                            (username, name, hash_password(password), _dt.datetime.utcnow().isoformat() + "Z"))
                conn.commit()
                self.send_cors()
                self.wfile.write(json.dumps({"ok": True, "user": {"username": username, "name": name}}).encode("utf-8"))
                return

            if path == "/api/auth/verify":
                username = str(body.get("username", "")).strip().lower()
                password = str(body.get("password", ""))
                row = cur.execute("SELECT username, name, pass_hash FROM users WHERE username = ?", (username,)).fetchone()
                ok = bool(row) and check_password(password, row["pass_hash"])
                if not row:
                    check_password(password, "scrypt$00$00")  # hide the timing difference
                if not ok:
                    self.send_cors(401)
                    self.wfile.write(json.dumps({"error": "Wrong username or password"}).encode("utf-8"))
                    return
                self.send_cors()
                self.wfile.write(json.dumps({"ok": True, "user": {"username": row["username"], "name": row["name"]}}).encode("utf-8"))
                return

            if path == "/api/auth/update":
                username = str(body.get("username", "")).strip().lower()
                row = cur.execute("SELECT username, name, pass_hash FROM users WHERE username = ?", (username,)).fetchone()
                if not row:
                    self.send_cors(404)
                    self.wfile.write(json.dumps({"error": "User not found"}).encode("utf-8"))
                    return
                new_name = body.get("name")
                new_pass = body.get("new_password")
                if new_pass is not None:
                    new_pass = str(new_pass)
                    if not check_password(str(body.get("old_password", "")), row["pass_hash"]):
                        self.send_cors(401)
                        self.wfile.write(json.dumps({"error": "Current password is wrong"}).encode("utf-8"))
                        return
                    if len(new_pass) < 6 or len(new_pass) > 200:
                        self.send_cors(400)
                        self.wfile.write(json.dumps({"error": "New password must be at least 6 characters"}).encode("utf-8"))
                        return
                    cur.execute("UPDATE users SET pass_hash = ? WHERE username = ?", (hash_password(new_pass), username))
                if new_name is not None:
                    nm = str(new_name).strip()[:60]
                    if nm:
                        cur.execute("UPDATE users SET name = ? WHERE username = ?", (nm, username))
                conn.commit()
                r2 = cur.execute("SELECT username, name FROM users WHERE username = ?", (username,)).fetchone()
                self.send_cors()
                self.wfile.write(json.dumps({"ok": True, "user": {"username": r2["username"], "name": r2["name"]}}).encode("utf-8"))
                return

            if path == "/api/auth/me":
                username = str(body.get("username", "")).strip().lower()
                row = cur.execute("SELECT username, name FROM users WHERE username = ?", (username,)).fetchone()
                if not row:
                    self.send_cors(404)
                    self.wfile.write(json.dumps({"error": "User not found"}).encode("utf-8"))
                    return
                self.send_cors()
                self.wfile.write(json.dumps({"ok": True, "user": {"username": row["username"], "name": row["name"]}}).encode("utf-8"))
                return

            if path == "/api/db/chats":
                cid = body.get("id")
                title = body.get("title", "New chat")
                created_at = body.get("created_at") or _dt.datetime.utcnow().isoformat() + "Z"
                updated_at = body.get("updated_at") or created_at
                cur.execute("""
                INSERT INTO chats (id, title, created_at, updated_at, user_id)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    updated_at = excluded.updated_at
                WHERE chats.user_id = excluded.user_id
                """, (cid, title, created_at, updated_at, req_user(self.headers)))
                conn.commit()
                self.send_cors()
                self.wfile.write(json.dumps({"ok": True, "id": cid}).encode("utf-8"))
                return

            if path == "/api/db/messages":
                msgs = body if isinstance(body, list) else [body]
                for m in msgs:
                    mid = m.get("id")
                    chat_id = m.get("chat_id")
                    role = m.get("role", "user")
                    content = m.get("content", "")
                    created_at = m.get("created_at") or _dt.datetime.utcnow().isoformat() + "Z"
                    cur.execute("""
                    INSERT INTO messages (id, chat_id, role, content, created_at, user_id)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET content = excluded.content
                    WHERE messages.user_id = excluded.user_id
                    """, (mid, chat_id, role, content, created_at, req_user(self.headers)))
                    cur.execute("UPDATE chats SET updated_at = ? WHERE id = ? AND user_id = ?", (created_at, chat_id, req_user(self.headers)))
                conn.commit()
                self.send_cors()
                self.wfile.write(json.dumps({"ok": True, "count": len(msgs)}).encode("utf-8"))
                return

            if path == "/api/db/keys":
                kid = body.get("id")
                provider = body.get("provider", "custom")
                name = body.get("name", "Custom")
                api_key = body.get("api_key", "")
                model = body.get("model", "")
                base_url = body.get("base_url")
                is_default = 1 if body.get("is_default") else 0
                created_at = body.get("created_at")
                if is_default:
                    cur.execute("UPDATE api_keys SET is_default = 0 WHERE user_id = ?", (req_user(self.headers),))
                cur.execute("""
                INSERT INTO api_keys (id, provider, name, api_key, model, base_url, is_default, created_at, user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    provider = excluded.provider,
                    name = excluded.name,
                    api_key = excluded.api_key,
                    model = excluded.model,
                    base_url = excluded.base_url,
                    is_default = excluded.is_default
                WHERE api_keys.user_id = excluded.user_id
                """, (kid, provider, name, api_key, model, base_url, is_default, created_at, req_user(self.headers)))
                conn.commit()
                self.send_cors()
                self.wfile.write(json.dumps({"ok": True, "id": kid}).encode("utf-8"))
                return

            if path == "/api/db/keys/default":
                kid = body.get("id")
                cur.execute("UPDATE api_keys SET is_default = 0 WHERE user_id = ?", (req_user(self.headers),))
                cur.execute("UPDATE api_keys SET is_default = 1 WHERE id = ? AND user_id = ?", (kid, req_user(self.headers)))
                conn.commit()
                self.send_cors()
                self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))
                return

            if path == "/api/db/usage":
                recs = body if isinstance(body, list) else [body]
                n = 0
                for u in recs[:200]:
                    if not isinstance(u, dict):
                        continue
                    i_t, o_t = _tok(u.get("input")), _tok(u.get("output"))
                    if i_t == 0 and o_t == 0:
                        continue
                    try:
                        ts = float(u.get("ts") or time.time())
                    except Exception:
                        ts = time.time()
                    cur.execute(
                        "INSERT INTO usage (user_id, ts, provider, model, key_id, source, chat_id, input_tokens, output_tokens, estimated) VALUES (?,?,?,?,?,?,?,?,?,?)",
                        (req_user(self.headers), ts, str(u.get("provider") or "")[:64], str(u.get("model") or "")[:160],
                         str(u.get("key_id") or "")[:64], str(u.get("source") or "chat")[:16], str(u.get("chat_id") or "")[:64],
                         i_t, o_t, 1 if u.get("estimated") else 0))
                    n += 1
                conn.commit()
                self.send_cors()
                self.wfile.write(json.dumps({"ok": True, "count": n}).encode("utf-8"))
                return

            if path == "/api/db/clear":
                cur.execute("DELETE FROM messages WHERE user_id = ?", (req_user(self.headers),))
                cur.execute("DELETE FROM chats WHERE user_id = ?", (req_user(self.headers),))
                conn.commit()
                self.send_cors()
                self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))
                return

            self.send_cors(404)
            self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode("utf-8"))
        finally:
            conn.close()

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        body = self.read_json_body()

        if not is_authorized(self.headers):
            self.send_cors(401)
            self.wfile.write(json.dumps({"error": "Unauthorized"}).encode("utf-8"))
            return

        _h = mrai_tasks.handle("DELETE", path, query, body, req_user(self.headers))
        if _h is not None:
            self.send_cors(_h[0])
            self.wfile.write(json.dumps(_h[1]).encode("utf-8"))
            return

        conn = get_db()
        cur = conn.cursor()
        try:
            if path == "/api/db/chats":
                cid = query.get("id", [""])[0] or body.get("id")
                if cid:
                    cur.execute("DELETE FROM messages WHERE chat_id = ? AND user_id = ?", (cid, req_user(self.headers)))
                    cur.execute("DELETE FROM chats WHERE id = ? AND user_id = ?", (cid, req_user(self.headers)))
                    conn.commit()
                self.send_cors()
                self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))
                return

            if path == "/api/db/keys":
                kid = query.get("id", [""])[0] or body.get("id")
                if kid:
                    cur.execute("DELETE FROM api_keys WHERE id = ? AND user_id = ?", (kid, req_user(self.headers)))
                    conn.commit()
                self.send_cors()
                self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))
                return

            self.send_cors(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))
        finally:
            conn.close()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    mrai_tasks.init(get_db, run_command, popen_kwargs, AUTH_TOKEN, WORKSPACE_DIR, WORK_DIR)
    server = ThreadingServer(("127.0.0.1", port), ServerHandler)
    server.serve_forever()
