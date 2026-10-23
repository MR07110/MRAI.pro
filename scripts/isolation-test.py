import urllib.request, urllib.error, json, os, uuid, sqlite3, shutil, time

BASE = "http://127.0.0.1:3000"
ENV = os.path.expanduser("~/Claude/work/mrai-next/.env.local")
KEY = [l.split("=", 1)[1].strip().strip("'\"") for l in open(ENV) if l.startswith("MRAI_ACCESS_KEY=")][0]

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None

class S:
    def __init__(s):
        s.c = {}
    def req(s, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(BASE + path, data=data, method=method)
        r.add_header("Content-Type", "application/json")
        if s.c:
            r.add_header("Cookie", "; ".join(f"{k}={v}" for k, v in s.c.items()))
        op = urllib.request.build_opener(NoRedirect)
        try:
            resp = op.open(r, timeout=25); code, txt, h = resp.status, resp.read().decode(), resp.headers
        except urllib.error.HTTPError as e:
            code, txt, h = e.code, e.read().decode(), e.headers
        for sc in (h.get_all("Set-Cookie") or []):
            k, v = sc.split(";")[0].split("=", 1)
            if "Max-Age=0" in sc or v == "":
                s.c.pop(k, None)
            else:
                s.c[k] = v
        try:
            j = json.loads(txt)
        except Exception:
            j = None
        return code, j, txt, h

res = []
def check(name, ok, info=""):
    res.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (" -- " + str(info) if info and not ok else ""), flush=True)

suffix = uuid.uuid4().hex[:6]
UA, UB = "zzta" + suffix, "zztb" + suffix
PW = "test-parol-123"

# --- 1) kirmagan foydalanuvchi
x = S()
c, _, _, h = x.req("GET", "/")
check("T1 '/' kirmasa /login ga yo'naltiradi", c in (302, 307, 308) and "/login" in (h.get("Location") or ""), (c, h.get("Location")))
c, _, _, h = x.req("GET", "/c/abcdefgh12")
check("T1 '/c/<id>' kirmasa /login?next= ga yo'naltiradi", c in (302, 307, 308) and "next=" in (h.get("Location") or ""), (c, h.get("Location")))
c, _, _, _ = x.req("GET", "/api/server/proxy/api/db/chats")
check("T1 kirmasdan chatlar API 401", c == 401, c)
c, _, _, _ = x.req("POST", "/api/auth/register", {"name": "x", "username": "zzxx" + suffix, "password": PW})
check("T2 kalitsiz ro'yxatdan o'tib bo'lmaydi", c == 401, c)
c, _, _, _ = x.req("POST", "/api/auth/signin", {"username": UA, "password": PW})
check("T2 kalitsiz kirib bo'lmaydi", c == 401, c)
c, _, _, _ = x.req("POST", "/api/auth/access", {"key": "noto'g'ri-kalit"})
check("T2 noto'g'ri kalit rad etiladi", c == 401, c)

def login(user, name):
    s = S()
    c, _, _, _ = s.req("POST", "/api/auth/access", {"key": KEY})
    assert c == 200, ("access", c)
    c, j, t, _ = s.req("POST", "/api/auth/register", {"name": name, "username": user, "password": PW})
    assert c == 200, ("register", c, t)
    return s

A = login(UA, "Test A"); B = login(UB, "Test B")
check("T3 ikki hisob yaratildi va sessiya cookie bor", "mrai_user" in A.c and "mrai_user" in B.c)
c, j, _, _ = A.req("GET", "/api/auth/state")
check("T3 state: A o'z hisobini ko'radi", c == 200 and j and j["user"] and j["user"]["username"] == UA, j)
c, _, _, _ = S().req("POST", "/api/auth/access", {"key": KEY})
c2, _, _, _ = A.req("POST", "/api/auth/register", {"name": "d", "username": UA, "password": PW})
check("T3 band username 409", c2 == 409, c2)
c, _, _, _ = A.req("POST", "/api/auth/register", {"name": "Egasi", "username": "mrqosimov2011", "password": PW})
check("T3 egasining username'ini egallab bo'lmaydi", c == 409, c)
w = S(); w.req("POST", "/api/auth/access", {"key": KEY})
c, _, _, _ = w.req("POST", "/api/auth/signin", {"username": UA, "password": "xato-parol"})
check("T3 noto'g'ri parol 401", c == 401, c)
c, j, _, _ = w.req("POST", "/api/auth/signin", {"username": UA, "password": PW})
check("T3 to'g'ri parol bilan kirish", c == 200 and "mrai_user" in w.c, c)

# --- 2) ma'lumotlar izolyatsiyasi
CID = str(uuid.uuid4()); MID = str(uuid.uuid4()); KID = str(uuid.uuid4()); CONID = uuid.uuid4().hex
now = "2026-10-23T00:00:00Z"
P = "/api/server/proxy/api/db"
A.req("POST", P + "/chats", {"id": CID, "title": "A-SECRET-CHAT", "created_at": now, "updated_at": now})
A.req("POST", P + "/messages", {"id": MID, "chat_id": CID, "role": "user", "content": "A-SECRET-MSG", "created_at": now})
A.req("POST", P + "/keys", {"id": KID, "provider": "custom", "name": "A-KEY", "api_key": "sk-A-SECRET", "model": "m", "created_at": now, "is_default": True})
A.req("POST", P + "/connectors", {"id": CONID, "name": "A-CONN", "url": "https://example.com/mcp", "headers": {"Authorization": "Bearer A-SECRET-HDR"}})
c, j, _, _ = A.req("GET", P + "/chats")
check("T4 A o'z chatini ko'radi", any(x["id"] == CID for x in (j or [])), j)
c, j, _, _ = A.req("GET", P + "/messages?chat_id=" + CID)
check("T4 A o'z xabarini ko'radi", any(x["content"] == "A-SECRET-MSG" for x in (j or [])), j)

c, j, t, _ = B.req("GET", P + "/chats")
check("T5 B: A ning chatlari ko'rinmaydi", c == 200 and CID not in t and "A-SECRET" not in t, t[:200])
c, j, t, _ = B.req("GET", P + "/messages?chat_id=" + CID)
check("T5 B: A chatining xabarlari bo'sh", c == 200 and j == [], t[:200])
c, j, t, _ = B.req("GET", P + "/keys")
check("T5 B: A ning API kalitlari ko'rinmaydi", "sk-A-SECRET" not in t and "A-KEY" not in t, t[:200])
c, j, t, _ = B.req("GET", P + "/connectors")
check("T5 B: A ning connectorlari/sirlari ko'rinmaydi", "A-CONN" not in t and "A-SECRET-HDR" not in t, t[:200])
c, j, t, _ = B.req("GET", P + "/export")
check("T5 B: eksportda A ma'lumoti yo'q", "A-SECRET" not in t and "sk-A" not in t, t[:200])
c, j, t, _ = B.req("GET", P + "/tasks")
check("T5 B: tasklar bo'sh", c == 200 and j == [], t[:200])
c, j, t, _ = B.req("GET", P + "/status")
check("T5 B: status faqat o'ziniki (sandbox yo'li yo'q)", "sandbox" not in t, t[:200])

B.req("POST", P + "/chats", {"id": CID, "title": "HACKED", "created_at": now, "updated_at": now})
B.req("POST", P + "/messages", {"id": MID, "chat_id": CID, "role": "user", "content": "HACKED-MSG", "created_at": now})
B.req("POST", P + "/keys", {"id": KID, "provider": "custom", "name": "HACKED", "api_key": "HACK", "model": "m", "created_at": now})
B.req("POST", P + "/connectors", {"id": CONID, "name": "HACKED", "url": "https://evil.example/mcp", "headers": {}})
B.req("DELETE", P + "/chats?id=" + CID)
B.req("DELETE", P + "/keys?id=" + KID)
B.req("DELETE", P + "/connectors?id=" + CONID)
B.req("POST", P + "/clear", {})
c, j, t, _ = A.req("GET", P + "/chats")
check("T6 B A ning chatini o'zgartira/o'chira olmaydi", any(x["id"] == CID and x["title"] == "A-SECRET-CHAT" for x in (j or [])), t[:200])
c, j, t, _ = A.req("GET", P + "/messages?chat_id=" + CID)
check("T6 B A ning xabarini o'zgartira olmaydi", any(x["content"] == "A-SECRET-MSG" for x in (j or [])) and "HACKED" not in t, t[:200])
c, j, t, _ = A.req("GET", P + "/keys")
check("T6 B A ning kalitini o'zgartira/o'chira olmaydi", "sk-A-SECRET" in t and "HACK" not in t, t[:200])
c, j, t, _ = A.req("GET", P + "/connectors")
check("T6 B A ning connectorini o'zgartira/o'chira olmaydi", "A-SECRET-HDR" in t and "evil" not in t, t[:200])

# --- 3) sandbox / fayllar / jobs
A.req("POST", "/api/server/exec", {"command": "echo A-FILE-SECRET > a_secret.txt && echo ok"})
c, j, t, _ = B.req("POST", "/api/server/exec", {"command": "ls -la; cat a_secret.txt; ls /home/muhamad/MR 2>&1; cat /home/muhamad/MR/mrai/token.key 2>&1"})
check("T7 B A ning faylini ko'ra olmaydi", "A-FILE-SECRET" not in t and "a_secret.txt" not in t.replace("cat: a_secret.txt", ""), t[:300])
check("T7 sandboxdan token.key o'qib bo'lmaydi", "No such file" in t or "Permission denied" in t or "cannot" in t, t[:300])
c, j, t, _ = A.req("POST", "/api/server/exec", {"command": "cat a_secret.txt"})
check("T7 A o'z faylini ko'radi", j and "A-FILE-SECRET" in (j.get("stdout") or ""), t[:200])
A.req("POST", "/api/server/exec", {"command": "sleep 20", "background": True})
c, j, t, _ = A.req("GET", "/api/server/proxy/api/jobs")
c2, j2, t2, _ = B.req("GET", "/api/server/proxy/api/jobs")
check("T8 jobs: B A ning jarayonini ko'rmaydi", c2 == 200 and j2 == [] and isinstance(j, list) and len(j) >= 1, (t[:100], t2[:100]))

# --- 4) soxta sessiya
F = S(); F.req("POST", "/api/auth/access", {"key": KEY}); F.c["mrai_user"] = UA + ":9999999999999:" + "0" * 64
c, _, _, _ = F.req("GET", P + "/chats")
check("T9 soxta imzoli sessiya rad etiladi", c == 401, c)
c, j, _, _ = F.req("GET", "/api/auth/state")
check("T9 soxta sessiya state'da hisob bermaydi", j and j.get("user") is None, j)

# --- 5) chiqish
c, _, _, _ = A.req("POST", "/api/auth/signout")
c2, _, _, _ = A.req("GET", P + "/chats")
check("T10 chiqqach API yopiladi (kalit ham qayta so'raladi)", c2 == 401 and "mrai_access" not in A.c, (c2, A.c.keys()))

print("JAMI: %d/%d PASS" % (sum(res), len(res)), flush=True)

# --- tozalash: faqat shu test yaratgan narsalar
try:
    db = sqlite3.connect(os.path.expanduser("~/MR/mrai/mrai.db"))
    for u in (UA, UB):
        for t in ("messages", "chats", "api_keys", "connectors", "tasks"):
            db.execute("DELETE FROM %s WHERE user_id=?" % t, (u,))
        db.execute("DELETE FROM users WHERE username=?", (u,))
        shutil.rmtree(os.path.expanduser("~/MR/mrai/workspace/users/" + u), ignore_errors=True)
    db.commit(); db.close()
    print("tozalandi", flush=True)
except Exception as e:
    print("tozalashda xato:", e, flush=True)
