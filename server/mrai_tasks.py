#!/usr/bin/env python3
"""MR AI: MCP connectors + scheduled tasks + background jobs (stdlib only)."""
import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta

_ctx = {}
_running = set()
_jobs = {}
_lock = threading.Lock()
OUT_CAP = 20000
# AI vazifalar avval shu kompyuterdagi Next ilovasi orqali ishlaydi (Vercel'ning vaqt chegarasi va tunnel'ga bog'liq emas).
LOCAL_APP = os.environ.get("MRAI_LOCAL_APP", "http://127.0.0.1:3000").rstrip("/")
LOCAL_SERVER = os.environ.get("MRAI_LOCAL_SERVER", "http://127.0.0.1:8080").rstrip("/")
_slots = threading.BoundedSemaphore(max(1, int(os.environ.get("MRAI_TASK_SLOTS", "4"))))

SCHEMA = [
    """CREATE TABLE IF NOT EXISTS connectors (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL,
        headers TEXT DEFAULT '{}', enabled INTEGER DEFAULT 1, created_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'ai',
        prompt TEXT DEFAULT '', command TEXT DEFAULT '', schedule TEXT NOT NULL,
        enabled INTEGER DEFAULT 1, next_run REAL, last_run REAL, last_status TEXT DEFAULT '',
        app_url TEXT DEFAULT '', server_url TEXT DEFAULT '', key_id TEXT DEFAULT '',
        system TEXT DEFAULT '', created_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS task_runs (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL, started_at REAL, finished_at REAL,
        status TEXT, trigger TEXT, output TEXT)""",
    "CREATE INDEX IF NOT EXISTS idx_task_runs_task ON task_runs (task_id, started_at)",
]


def init(get_db, run_command, popen_kwargs, auth_token, workspace, home=None):
    _ctx.update(get_db=get_db, run=run_command, popen=popen_kwargs, token=auth_token, ws=workspace, home=home or workspace)
    conn = get_db()
    cur = conn.cursor()
    for s in SCHEMA:
        cur.execute(s)
    for tbl in ("connectors", "tasks"):
        cols = [r[1] for r in cur.execute("PRAGMA table_info(%s)" % tbl).fetchall()]
        if "user_id" not in cols:
            cur.execute("ALTER TABLE %s ADD COLUMN user_id TEXT NOT NULL DEFAULT 'mrqosimov2011'" % tbl)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_%s_user ON %s (user_id)" % (tbl, tbl))
    cur.execute("UPDATE task_runs SET status='error', output='server qayta ishga tushdi', finished_at=? WHERE status='running'", (time.time(),))
    conn.commit()
    conn.close()
    threading.Thread(target=_loop, daemon=True).start()


# ---------------------------------------------------------------- schedule
def _parse_field(f, lo, hi):
    vals = set()
    for part in f.split(","):
        step = 1
        has_step = "/" in part
        if has_step:
            part, s = part.split("/", 1)
            step = int(s)
            if step < 1:
                raise ValueError("cron step noto'g'ri")
        if part in ("*", ""):
            a, b = lo, hi
        elif "-" in part:
            a, b = (int(x) for x in part.split("-", 1))
        else:
            a = int(part)
            b = hi if has_step else a
        if a < lo or b > hi or a > b:
            raise ValueError("cron qiymati chegaradan tashqarida")
        vals.update(range(a, b + 1, step))
    return vals


def _parse_cron(expr):
    parts = expr.split()
    if len(parts) != 5:
        raise ValueError("cron 5 ta maydon bo'lishi kerak: m h dom mon dow")
    mi = _parse_field(parts[0], 0, 59)
    ho = _parse_field(parts[1], 0, 23)
    dm = _parse_field(parts[2], 1, 31)
    mo = _parse_field(parts[3], 1, 12)
    dw = {0 if x == 7 else x for x in _parse_field(parts[4], 0, 7)}
    return mi, ho, dm, mo, dw, parts[2].startswith("*"), parts[4].startswith("*")


def _next_cron(spec, after):
    mi, ho, dm, mo, dw, dm_star, dw_star = spec
    t = after.replace(second=0, microsecond=0) + timedelta(minutes=1)
    limit = t + timedelta(days=366 * 2)
    while t < limit:
        if t.month not in mo:
            y = t.year + (1 if t.month == 12 else 0)
            m = t.month % 12 + 1
            t = t.replace(year=y, month=m, day=1, hour=0, minute=0)
            continue
        dom_ok = t.day in dm
        dow_ok = ((t.weekday() + 1) % 7) in dw
        day_ok = (dom_ok and dow_ok) if (dm_star or dw_star) else (dom_ok or dow_ok)
        if not day_ok:
            t = (t + timedelta(days=1)).replace(hour=0, minute=0)
            continue
        if t.hour not in ho:
            t = (t + timedelta(hours=1)).replace(minute=0)
            continue
        if t.minute not in mi:
            t += timedelta(minutes=1)
            continue
        return t
    return None


def compute_next(schedule, after_ts):
    """Keyingi ishga tushish vaqti (epoch). Noto'g'ri format -> ValueError. Qayta ishlamaydigan (once, o'tgan) -> None."""
    s = (schedule or "").strip()
    low = s.lower()
    after = datetime.fromtimestamp(after_ts)
    m = re.fullmatch(r"(?:every|har)\s+(\d+)\s*(s|m|h|d)", low)
    if m:
        secs = int(m.group(1)) * {"s": 1, "m": 60, "h": 3600, "d": 86400}[m.group(2)]
        if secs < 30:
            raise ValueError("interval kamida 30 soniya bo'lishi kerak")
        return after_ts + secs
    m = re.fullmatch(r"(daily|weekdays)\s+(\d{1,2}):(\d{2})", low)
    if m:
        h, mi = int(m.group(2)), int(m.group(3))
        if h > 23 or mi > 59:
            raise ValueError("vaqt noto'g'ri")
        dow = "1-5" if m.group(1) == "weekdays" else "*"
        n = _next_cron(_parse_cron(f"{mi} {h} * * {dow}"), after)
        return n.timestamp() if n else None
    m = re.fullmatch(r"(?:once|at)\s+(.+)", low)
    if m:
        txt = m.group(1).strip().replace("t", " ", 1) if re.match(r"\d{4}-\d{2}-\d{2}t", m.group(1).strip()) else m.group(1).strip()
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
            try:
                ts = datetime.strptime(txt, fmt).timestamp()
                if ts <= after_ts:
                    raise ValueError("bu vaqt o'tib ketgan")
                return ts
            except ValueError as e:
                if "o'tib" in str(e):
                    raise
        raise ValueError("once formati: once 2026-10-25 09:00")
    m = re.fullmatch(r"cron:?\s*(.+)", s, re.I)
    expr = m.group(1) if m else (s if len(s.split()) == 5 else None)
    if expr:
        n = _next_cron(_parse_cron(expr), after)
        return n.timestamp() if n else None
    raise ValueError("schedule formati: every 15m | daily 09:00 | weekdays 18:30 | once 2026-10-25 09:00 | cron: */5 * * * *")


def _is_once(schedule):
    return bool(re.match(r"\s*(once|at)\s", (schedule or "").lower()))


# ---------------------------------------------------------------- running
def _record(task_id, run_id, status, output, started, trigger):
    conn = _ctx["get_db"]()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO task_runs (id, task_id, started_at, finished_at, status, trigger, output) VALUES (?,?,?,?,?,?,?) "
        "ON CONFLICT(id) DO UPDATE SET finished_at=excluded.finished_at, status=excluded.status, output=excluded.output",
        (run_id, task_id, started, time.time() if status != "running" else None, status, trigger, (output or "")[:OUT_CAP]),
    )
    cur.execute(
        "DELETE FROM task_runs WHERE task_id=? AND id NOT IN (SELECT id FROM task_runs WHERE task_id=? ORDER BY started_at DESC LIMIT 30)",
        (task_id, task_id),
    )
    if status != "running":
        cur.execute("UPDATE tasks SET last_run=?, last_status=? WHERE id=?", (started, status, task_id))
    conn.commit()
    conn.close()


def _pick_key(task):
    conn = _ctx["get_db"]()
    cur = conn.cursor()
    uid = task.get("user_id") or "mrqosimov2011"
    row = None
    if task.get("key_id"):
        cur.execute("SELECT * FROM api_keys WHERE id=? AND user_id=?", (task["key_id"], uid))
        row = cur.fetchone()
    if not row:
        cur.execute("SELECT * FROM api_keys WHERE user_id=? ORDER BY is_default DESC, created_at DESC LIMIT 1", (uid,))
        row = cur.fetchone()
    cur.execute("SELECT name, url, headers FROM connectors WHERE enabled=1 AND user_id=?", (uid,))
    conns = [{"name": r["name"], "url": r["url"], "headers": json.loads(r["headers"] or "{}")} for r in cur.fetchall()]
    conn.close()
    return (dict(row) if row else None), conns


def _post_agent(base, payload):
    req = urllib.request.Request(
        base.rstrip("/") + "/api/agent/run",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + _ctx["token"],
                 "ngrok-skip-browser-warning": "1", "User-Agent": "mrai-scheduler/1.0"},
    )
    with urllib.request.urlopen(req, timeout=900) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def _run_ai(task):
    uid = task.get("user_id") or "mrqosimov2011"
    key, conns = _pick_key(task)
    if not key:
        raise RuntimeError("API kalit topilmadi (Sozlamalar -> API kalitlar)")
    payload = {
        "prompt": task["prompt"], "system": task.get("system") or "",
        "provider": key["provider"], "apiKey": key["api_key"], "model": key["model"],
        "baseUrl": key.get("base_url") or "", "connectors": conns,
        "keyId": key["id"], "scheduled": True, "user": uid,
    }
    # Tartib: 1) shu kompyuterdagi Next (server ham lokal), 2) vazifa yaratilgan app_url (zaxira).
    targets = [(LOCAL_APP, LOCAL_SERVER)]
    app = (task.get("app_url") or "").strip().rstrip("/")
    if app and app != LOCAL_APP:
        targets.append((app, task.get("server_url") or ""))
    last_err = None
    for base, srv in targets:
        try:
            data = _post_agent(base, dict(payload, appUrl=base, serverUrl=srv))
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"agent HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:300]}")
        except urllib.error.URLError as e:
            # faqat ulanish bo'lmasa (ilova o'chiq) keyingi manzilga o'tamiz; agent allaqachon ishlagan bo'lsa qayta ishga tushirmaymiz
            if isinstance(e.reason, (ConnectionRefusedError, ConnectionResetError)) or "refused" in str(e.reason).lower():
                last_err = f"{base}: ulanib bo'lmadi"
                continue
            raise RuntimeError(f"agent ulanish xatosi ({base}): {e.reason}")
        if not data.get("ok"):
            raise RuntimeError(data.get("error") or "agent xatosi")
        return data.get("text", "")
    raise RuntimeError("Web ilova (Next) ishlamayapti: " + (last_err or "manzil yo'q"))


def _run_shell(task):
    out = _ctx["run"](task["command"], _ctx["home"], 600, task.get("user_id") or "mrqosimov2011")
    text = (out.get("stdout", "") + out.get("stderr", "")).strip()
    if out.get("exit_code", 1) != 0:
        raise RuntimeError(f"exit {out.get('exit_code')}: {text[-1500:]}")
    return text


def _execute(task, trigger):
    run_id = uuid.uuid4().hex
    started = time.time()
    _record(task["id"], run_id, "running", "", started, trigger)
    _slots.acquire()
    try:
        text = _run_ai(task) if task["kind"] == "ai" else _run_shell(task)
        _record(task["id"], run_id, "ok", text or "(bo'sh natija)", started, trigger)
    except Exception as e:
        _record(task["id"], run_id, "error", str(e), started, trigger)
    finally:
        _slots.release()
        with _lock:
            _running.discard(task["id"])


def _spawn(task, trigger):
    with _lock:
        if task["id"] in _running:
            return False
        _running.add(task["id"])
    threading.Thread(target=_execute, args=(task, trigger), daemon=True).start()
    return True


def _loop():
    while True:
        try:
            now = time.time()
            conn = _ctx["get_db"]()
            cur = conn.cursor()
            cur.execute("SELECT * FROM tasks WHERE enabled=1 AND next_run IS NOT NULL AND next_run<=?", (now,))
            due = [dict(r) for r in cur.fetchall()]
            for t in due:
                try:
                    nxt = None if _is_once(t["schedule"]) else compute_next(t["schedule"], now)
                except Exception:
                    nxt = None
                cur.execute("UPDATE tasks SET next_run=?, enabled=? WHERE id=?", (nxt, 1 if nxt else 0, t["id"]))
            conn.commit()
            conn.close()
            for t in due:
                _spawn(t, "schedule")
        except Exception:
            pass
        time.sleep(15)


# ---------------------------------------------------------------- jobs
def start_job(cmd, cwd, user="mrqosimov2011"):
    with _lock:
        alive = [j for j in _jobs.values() if j["proc"].poll() is None]
        if len(alive) >= 10:
            return {"stdout": "", "stderr": "Xatolik: bir vaqtda 10 tadan ortiq fon jarayon mumkin emas\n", "exit_code": 1, "cwd": cwd}
        import subprocess
        jid = uuid.uuid4().hex[:8]
        logdir = os.path.join(_ctx["ws"], ".jobs")
        os.makedirs(logdir, exist_ok=True)
        logpath = os.path.join(logdir, jid + ".log")
        lf = open(logpath, "wb")
        proc = subprocess.Popen(**_ctx["popen"](cmd, cwd, user), stdout=lf, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True)
        _jobs[jid] = {"proc": proc, "cmd": cmd, "log": logpath, "started": time.time(), "cwd": cwd, "user": user}
    return {"stdout": f"fon jarayon ishga tushdi: job_id={jid}\n", "stderr": "", "exit_code": 0, "cwd": cwd, "job_id": jid}


def _job_info(jid, j):
    rc = j["proc"].poll()
    return {"id": jid, "cmd": j["cmd"][:200], "running": rc is None, "exit_code": rc, "started": j["started"]}


def _tail(path, n):
    try:
        with open(path, "rb") as f:
            data = f.read()[-200000:].decode("utf-8", "replace")
        return "\n".join(data.splitlines()[-n:])
    except Exception:
        return ""


# ---------------------------------------------------------------- http glue
def _row(r):
    d = dict(r)
    d["enabled"] = bool(d.get("enabled"))
    return d


def handle(method, path, query, body, user="mrqosimov2011"):
    """(status, obj) yoki None (bu modul yo'li emas)."""
    q = lambda k, d="": (query.get(k) or [d])[0]
    if path == "/api/jobs" and method == "GET":
        return 200, [_job_info(i, j) for i, j in _jobs.items() if j.get("user") == user]
    if path == "/api/jobs/logs" and method == "GET":
        j = _jobs.get(q("id"))
        if j and j.get("user") != user:
            j = None
        if not j:
            return 404, {"error": "job topilmadi"}
        info = _job_info(q("id"), j)
        info["output"] = _tail(j["log"], int(q("tail", "80") or 80))
        return 200, info
    if path == "/api/jobs/kill" and method == "POST":
        j = _jobs.get(body.get("id", ""))
        if j and j.get("user") != user:
            j = None
        if not j:
            return 404, {"error": "job topilmadi"}
        try:
            import signal
            os.killpg(os.getpgid(j["proc"].pid), signal.SIGTERM)
        except Exception:
            try:
                j["proc"].kill()
            except Exception:
                pass
        return 200, {"ok": True}

    if not path.startswith("/api/db/connectors") and not path.startswith("/api/db/task"):
        return None
    conn = _ctx["get_db"]()
    cur = conn.cursor()
    try:
        if path == "/api/db/connectors":
            if method == "GET":
                cur.execute("SELECT * FROM connectors WHERE user_id=? ORDER BY created_at ASC", (user,))
                rows = []
                for r in cur.fetchall():
                    d = _row(r)
                    d["headers"] = json.loads(d.get("headers") or "{}")
                    rows.append(d)
                return 200, rows
            if method == "POST":
                cid = body.get("id") or uuid.uuid4().hex
                url = (body.get("url") or "").strip()
                if not re.match(r"^https?://", url):
                    return 400, {"error": "URL http(s):// bilan boshlanishi kerak"}
                headers = body.get("headers") if isinstance(body.get("headers"), dict) else {}
                cur.execute(
                    "INSERT INTO connectors (id,name,url,headers,enabled,created_at,user_id) VALUES (?,?,?,?,?,?,?) "
                    "ON CONFLICT(id) DO UPDATE SET name=excluded.name,url=excluded.url,headers=excluded.headers,enabled=excluded.enabled WHERE connectors.user_id=excluded.user_id",
                    (cid, (body.get("name") or "Connector").strip()[:60], url, json.dumps(headers),
                     0 if body.get("enabled") is False else 1, body.get("created_at") or datetime.now().isoformat(), user),
                )
                conn.commit()
                return 200, {"ok": True, "id": cid}
            if method == "DELETE":
                cur.execute("DELETE FROM connectors WHERE id=? AND user_id=?", (q("id") or body.get("id", ""), user))
                conn.commit()
                return 200, {"ok": True}

        if path == "/api/db/tasks":
            if method == "GET":
                cur.execute("SELECT * FROM tasks WHERE user_id=? ORDER BY created_at DESC", (user,))
                rows = [_row(r) for r in cur.fetchall()]
                for r in rows:
                    r["running"] = r["id"] in _running
                return 200, rows
            if method == "POST":
                kind = body.get("kind") if body.get("kind") in ("ai", "shell") else "ai"
                if kind == "ai" and not (body.get("prompt") or "").strip():
                    return 400, {"error": "AI vazifa uchun prompt kerak"}
                if kind == "shell" and not (body.get("command") or "").strip():
                    return 400, {"error": "shell vazifa uchun command kerak"}
                schedule = (body.get("schedule") or "").strip()
                try:
                    nxt = compute_next(schedule, time.time())
                except ValueError as e:
                    return 400, {"error": str(e)}
                tid = body.get("id") or uuid.uuid4().hex
                enabled = 0 if body.get("enabled") is False else 1
                cur.execute(
                    "INSERT INTO tasks (id,name,kind,prompt,command,schedule,enabled,next_run,app_url,server_url,key_id,system,created_at,user_id) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,"
                    "prompt=excluded.prompt,command=excluded.command,schedule=excluded.schedule,enabled=excluded.enabled,"
                    "next_run=excluded.next_run,app_url=excluded.app_url,server_url=excluded.server_url,key_id=excluded.key_id,system=excluded.system WHERE tasks.user_id=excluded.user_id",
                    (tid, (body.get("name") or "Vazifa").strip()[:80], kind, body.get("prompt") or "", body.get("command") or "",
                     schedule, enabled, nxt, body.get("app_url") or "", body.get("server_url") or "", body.get("key_id") or "",
                     body.get("system") or "", datetime.now().isoformat(), user),
                )
                conn.commit()
                return 200, {"ok": True, "id": tid, "next_run": nxt}
            if method == "DELETE":
                tid = q("id") or body.get("id", "")
                cur.execute("DELETE FROM task_runs WHERE task_id IN (SELECT id FROM tasks WHERE id=? AND user_id=?)", (tid, user))
                cur.execute("DELETE FROM tasks WHERE id=? AND user_id=?", (tid, user))
                conn.commit()
                return 200, {"ok": True}

        if path == "/api/db/tasks/toggle" and method == "POST":
            cur.execute("SELECT * FROM tasks WHERE id=? AND user_id=?", (body.get("id", ""), user))
            r = cur.fetchone()
            if not r:
                return 404, {"error": "vazifa topilmadi"}
            en = bool(body.get("enabled"))
            nxt = None
            if en:
                try:
                    nxt = compute_next(r["schedule"], time.time())
                except ValueError as e:
                    return 400, {"error": str(e)}
            cur.execute("UPDATE tasks SET enabled=?, next_run=? WHERE id=?", (1 if en else 0, nxt, r["id"]))
            conn.commit()
            return 200, {"ok": True, "next_run": nxt}

        if path == "/api/db/tasks/run" and method == "POST":
            cur.execute("SELECT * FROM tasks WHERE id=? AND user_id=?", (body.get("id", ""), user))
            r = cur.fetchone()
            if not r:
                return 404, {"error": "vazifa topilmadi"}
            started = _spawn(dict(r), "manual")
            return 200, {"ok": True, "started": started}

        if path == "/api/db/task-runs" and method == "GET":
            cur.execute("SELECT * FROM task_runs WHERE task_id=? AND task_id IN (SELECT id FROM tasks WHERE user_id=?) ORDER BY started_at DESC LIMIT ?",
                        (q("task_id"), user, min(int(q("limit", "10") or 10), 30)))
            return 200, [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()
    return None
