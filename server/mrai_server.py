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
from socketserver import ThreadingMixIn

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DATA_DIR, "mrai.db")
WORKSPACE_DIR = os.path.join(DATA_DIR, "workspace")
os.makedirs(WORKSPACE_DIR, exist_ok=True)
# Sandbox YO'Q: agent egasining haqiqiy kompyuterida ishlaydi (MCP orqali Claude kabi).
# Agent "yashaydigan" standart papka: ~/MR/mrai (shu papkaning o'zi). workspace/ faqat fon jarayon loglari (.jobs) uchun qoladi.
AGENT_HOME = os.path.abspath(DATA_DIR)
HOME_DIR = os.path.expanduser("~")

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
# Saytga kirish kaliti FAQAT shu yerda (access.key faylida) saqlanadi; Vercel/Next kalitni bilmaydi.
ACCESS_KEY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "access.key")
_ACCESS_FAILS = {}  # ip -> [xatolar soni, birinchi xato vaqti]
USERNAME_RE = _re.compile(r"^[a-z0-9_.-]{3,32}$")

def req_user(headers):
    """Next proxy yuboradigan x-mrai-user. Bo'lmasa (scheduler) -- egasi."""
    u = (headers.get("x-mrai-user", "") or "").strip().lower()
    return u if USERNAME_RE.match(u) else LEGACY_USER

# Kompyuterda buyruq bajarish sandbox'siz, shuning uchun FAQAT egasi uchun yoqilgan: boshqa ro'yxatdan o'tgan
# hisoblar egasining kompyuteriga shell olmasligi kerak. Ruxsat berish uchun nomni shu to'plamga qo'shing.
EXEC_ALLOWED = {LEGACY_USER}
DENIED_MSG = "Bu hisobda kompyuterda buyruq bajarish o'chirilgan (sandbox yo'q, shuning uchun faqat egasi uchun yoqilgan).\n"

def exec_allowed(user):
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
    """Foydalanuvchi sarflagan tokenlar: umumiy, kunlar, modellar, manbalar va oxirgi so'rovlar."""
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
    """~, ~/x, absolyut yoki base'ga nisbatan yo'lni mavjud papkaga aylantiradi, bo'lmasa None."""
    if not path:
        return None
    p = path
    if p == "~" or p.startswith("~/"):
        p = os.path.join(HOME_DIR, p[2:])
    elif not os.path.isabs(p):
        p = os.path.join(base, p)
    p = os.path.normpath(p)
    return p if os.path.isdir(p) else None


def sanitize_cwd(req_cwd, user=None):
    """Ishchi papka: so'ralgan (mavjud) papka, bo'lmasa ~/MR/mrai. Cheklov yo'q."""
    return _resolve_dir(req_cwd, AGENT_HOME) or AGENT_HOME


def host_env():
    """Egasining haqiqiy muhiti (HOME, PATH, D-Bus, Wayland): notify-send, systemctl --user va h.k. ishlashi uchun."""
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
    """Haqiqiy kompyuterda bash (sandbox yo'q)."""
    return {"args": ["bash", "-c", cmd], "cwd": cwd if cwd and os.path.isdir(cwd) else AGENT_HOME, "env": host_env()}


def run_command(cmd, cwd, timeout=30, user=None):
    """Buyruqni egasining haqiqiy kompyuterida bajaradi. Vaqt tugasa butun jarayon guruhi o'ldiriladi."""
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
        return {"stdout": "", "stderr": "Xatolik: Buyruq belgilangan vaqt chegarasidan (%ds) oshib ketdi va to'xtatildi. Uzoq ishlar uchun background:true ishlating.\n" % timeout, "exit_code": 124, "cwd": cwd}
    return {"stdout": out[:500000], "stderr": err[:500000], "exit_code": p.returncode, "cwd": cwd}


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
                "security": "Host exec (sandbox yo'q; buyruq bajarish faqat egasi uchun)",
                "auth_required": bool(AUTH_TOKEN)
            }).encode("utf-8"))
            return

        # Security check for database routes
        if not is_authorized(self.headers):
            self.send_cors(401)
            self.wfile.write(json.dumps({"error": "Unauthorized: Xavfsizlik tokeni talab qilinadi"}).encode("utf-8"))
            return

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
        body = self.read_json_body()

        # Token authentication check
        if not is_authorized(self.headers):
            self.send_cors(401)
            self.wfile.write(json.dumps({"error": "Unauthorized: Noto‘g‘ri yoki mavjud bo‘lmagan xavfsizlik tokeni."}).encode("utf-8"))
            return

        # Buyruq bajarish: egasining HAQIQIY kompyuterida (sandbox yo'q), faqat EXEC_ALLOWED hisoblar uchun.
        if path == "/exec":
            cmd = body.get("command", "")
            req_cwd = body.get("cwd", "")
            xuser = req_user(self.headers)
            cwd = sanitize_cwd(req_cwd, xuser)

            trimmed = cmd.strip()
            if not exec_allowed(xuser):
                out = {"stdout": "", "stderr": DENIED_MSG, "exit_code": 126, "cwd": cwd}
            elif _PURE_CD.match(trimmed):
                # Sof `cd [papka]`: faqat ishchi papkani o'zgartiradi (haqiqiy shell kabi: ~ = uy papkasi, cheklovsiz).
                arg = trimmed[2:].strip()
                try:
                    parts = shlex.split(arg)
                except ValueError:
                    parts = [arg]
                target = parts[0] if parts else "~"
                new = _resolve_dir(target, cwd)
                if new:
                    cwd = new
                    out = {"stdout": "", "stderr": "", "exit_code": 0, "cwd": cwd}
                else:
                    out = {"stdout": "", "stderr": "bash: cd: %s: Papka topilmadi\n" % target, "exit_code": 1, "cwd": cwd}
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
                    self.wfile.write(json.dumps({"error": "Juda ko'p urinish. Keyinroq qayta urinib ko'ring."}).encode("utf-8"))
                    return
                try:
                    with open(ACCESS_KEY_FILE, encoding="utf-8") as _kf:
                        real_key = _kf.read().strip()
                except OSError:
                    real_key = ""
                if not real_key:
                    self.send_cors(503)
                    self.wfile.write(json.dumps({"error": "Kirish kaliti sozlanmagan (access.key)"}).encode("utf-8"))
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
                self.wfile.write(json.dumps({"error": "Kalit noto'g'ri"}).encode("utf-8"))
                return

            if path == "/api/auth/register":
                username = str(body.get("username", "")).strip().lower()
                name = str(body.get("name", "")).strip()[:60] or username
                password = str(body.get("password", ""))
                if not USERNAME_RE.match(username):
                    self.send_cors(400)
                    self.wfile.write(json.dumps({"error": "Username 3-32 belgi: a-z, 0-9, _ . -"}).encode("utf-8"))
                    return
                if len(password) < 6 or len(password) > 200:
                    self.send_cors(400)
                    self.wfile.write(json.dumps({"error": "Parol kamida 6 ta belgi bo'lishi kerak"}).encode("utf-8"))
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
                    check_password(password, "scrypt$00$00")  # vaqt farqini yashirish
                if not ok:
                    self.send_cors(401)
                    self.wfile.write(json.dumps({"error": "Username yoki parol noto'g'ri"}).encode("utf-8"))
                    return
                self.send_cors()
                self.wfile.write(json.dumps({"ok": True, "user": {"username": row["username"], "name": row["name"]}}).encode("utf-8"))
                return

            if path == "/api/auth/update":
                username = str(body.get("username", "")).strip().lower()
                row = cur.execute("SELECT username, name, pass_hash FROM users WHERE username = ?", (username,)).fetchone()
                if not row:
                    self.send_cors(404)
                    self.wfile.write(json.dumps({"error": "Foydalanuvchi topilmadi"}).encode("utf-8"))
                    return
                new_name = body.get("name")
                new_pass = body.get("new_password")
                if new_pass is not None:
                    new_pass = str(new_pass)
                    if not check_password(str(body.get("old_password", "")), row["pass_hash"]):
                        self.send_cors(401)
                        self.wfile.write(json.dumps({"error": "Joriy parol noto'g'ri"}).encode("utf-8"))
                        return
                    if len(new_pass) < 6 or len(new_pass) > 200:
                        self.send_cors(400)
                        self.wfile.write(json.dumps({"error": "Yangi parol kamida 6 ta belgi bo'lishi kerak"}).encode("utf-8"))
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
                    self.wfile.write(json.dumps({"error": "Foydalanuvchi topilmadi"}).encode("utf-8"))
                    return
                self.send_cors()
                self.wfile.write(json.dumps({"ok": True, "user": {"username": row["username"], "name": row["name"]}}).encode("utf-8"))
                return

            if path == "/api/db/chats":
                cid = body.get("id")
                title = body.get("title", "Yangi suhbat")
                created_at = body.get("created_at")
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
                    created_at = m.get("created_at")
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
    mrai_tasks.init(get_db, run_command, popen_kwargs, AUTH_TOKEN, WORKSPACE_DIR, AGENT_HOME)
    server = ThreadingServer(("127.0.0.1", port), ServerHandler)
    server.serve_forever()
