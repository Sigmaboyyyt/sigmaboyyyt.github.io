# -*- coding: utf-8 -*-
"""NenlyMine — сервис магазина и выдачи.
Один сервер отдаёт и сам сайт (index.html и остальные страницы),
и API выдачи POST /give. Ключ панели читается из panel_key.txt
(в .gitignore — в GitHub не попадёт).
Адрес: http://127.0.0.1:9898 (админка выдачи — /admin).
"""
import http.server, json, ssl, urllib.request, urllib.error, os, math, re, mimetypes
from urllib.parse import quote, unquote

PANEL = "https://mgr.hosting-minecraft.pro"
SERVER = "57a7571b"  # XZNN

def load_key():
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "panel_key.txt"), "r", encoding="utf-8") as f:
        return f.read().strip()

KEY = load_key()

KINDS = {
    "group":      ("setgroup",      True,  False),
    "case":       ("givecase",      False, True),
    "donatcase":  ("givecase",      False, True),
    "seasoncase": ("giveseasoncase", False, True),
    "weeklycase": ("giveweeklycase", False, True),
    "titlecase":  ("givetitlecase",  False, True),
    "moneycase":  ("givemoneycase",  False, True),
    "tag":        ("tag allow",     False, False),
    "mute":       ("mute",          False, False),
    "unban":      ("unban",         False, False),
}

GROUPS = ["premium", "creative", "straj", "lord", "delux", "tsar",
          "imperator", "legenda", "povelitel", "vlastelin", "vladika"]

def load_promos():
    """Промокоды: пробел/пустая строка отбрасываются.
    Формат строки: КОД|type|value
      type=percent -> бонус в % к количеству (только кейсы)
      type=amount  -> фиксированный бонус к количеству (только кейсы)
    Файл promos.txt в .gitignore — на GitHub не попадёт.
    """
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, "promos.txt")
    promos = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "|" not in line:
                    continue
                parts = line.split("|")
                code = parts[0].strip().upper()
                typ = (parts[1] or "").strip().lower()
                try:
                    val = int(float(parts[2]))
                except Exception:
                    continue
                if code and typ == "percent":
                    promos[code] = ("percent", val)
                elif code and typ == "amount":
                    promos[code] = ("amount", val)
    except OSError:
        pass
    return promos

PROMOS = load_promos()

HTML = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NenlyMine — выдача</title>
<style>
:root{--bg:#0e1220;--panel:#171d33;--panel2:#1d2540;--line:#2a3460;
--txt:#e8ecff;--mut:#8b93b8;--acc:#55ccff;--acc2:#77ddff;--ok:#4ade80;--bad:#ff6b6b}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,Arial,sans-serif;background:var(--bg);color:var(--txt);padding:32px 16px}
.wrap{max-width:430px;margin:0 auto}
h1{font-size:22px;margin-bottom:6px}
p.sub{color:var(--mut);font-size:13px;margin-bottom:26px;line-height:1.55}
label{display:block;font-size:13px;color:var(--mut);margin:16px 0 6px}
select,input{width:100%;background:var(--panel2);color:var(--txt);border:1px solid var(--line);
border-radius:11px;padding:12px;font-size:15px}
input[type=number]{max-width:130px}
button{width:100%;margin-top:24px;background:linear-gradient(90deg,#33a9ff,#55ccff);border:0;
color:var(--bg);font-weight:700;font-size:16px;padding:13px;border-radius:11px;cursor:pointer}
button:disabled{opacity:.5;cursor:wait}
.row{font-size:12px;color:var(--mut);margin-top:16px}
.row b{color:var(--acc);font-weight:600}
#res{margin-top:14px;padding:12px;border-radius:10px;font-size:13px;display:none;white-space:pre-wrap;word-break:break-word}
#res.show{display:block}
#res.ok{background:rgba(74,222,128,.12)}
#res.bad{background:rgba(255,107,107,.12)}
</style>
</head>
<body>
<div class="wrap">
<h1>NenlyMine — выдача</h1>
<p class="sub">Локальный сервис игрового магазина. Ключ панели хранится только на этом устройстве и на GitHub не попадает.</p>

<label for="kind">Что выдаём</label>
<select id="kind">
  <option value="group">Привилегию (setgroup)</option>
  <option value="case">Кейс (givecase)</option>
  <option value="seasoncase">Сезонный кейс (giveseasoncase)</option>
  <option value="weeklycase">Недельный кейс (giveweeklycase)</option>
  <option value="titlecase">Титульный кейс (givetitlecase)</option>
  <option value="moneycase">Денежный кейс (givemoneycase)</option>
  <option value="tag">Тег (tag allow)</option>
</select>

<div id="groupWrap">
  <label for="group">Название группы</label>
  <select id="group">
    <option>premium</option><option>creative</option><option>straj</option>
    <option>lord</option><option>delux</option><option>tsar</option>
    <option>imperator</option><option>legenda</option><option>povelitel</option>
    <option>vlastelin</option><option>vladika</option>
  </select>
</div>

<label for="nick">Ник игрока</label>
<input id="nick" placeholder="Например: Steve" autocomplete="off">

<div id="amountWrap">
  <label for="amount">Количество</label>
  <input id="amount" type="number" min="1" value="1">
</div>

<button id="go">Выдать</button>
<div class="row">Команда: <b id="cmd">&nbsp;</b></div>
<div id="res"></div>
</div>

<script>
var KINDS={group:["setgroup",true,false],case:["givecase",false,true],
seasoncase:["giveseasoncase",false,true],weeklycase:["giveweeklycase",false,true],
titlecase:["givetitlecase",false,true],moneycase:["givemoneycase",false,true],tag:["tag allow",false,false]};
function $(id){return document.getElementById(id)}
function refresh(){
 var k=$("kind").value;
 $("groupWrap").style.display=k==="group"?"":"none";
 $("amountWrap").style.display=KINDS[k][2]?"":"none";
 var nick=$("nick").value.trim();
 var g=$("group").value, a=$("amount").value||1;
 var cmd;
 if(k==="group")cmd="setgroup "+nick+" "+g;
 else if(k==="tag")cmd="tag allow "+nick;
 else cmd=KINDS[k][0]+" "+nick+" "+a;
 $("cmd").textContent=cmd;
}
$("kind").addEventListener("input",refresh);
$("group").addEventListener("input",refresh);
$("nick").addEventListener("input",refresh);
$("amount").addEventListener("input",refresh);
refresh();
$("go").addEventListener("click",function(){
 var btn=$("go"); btn.disabled=true;
 fetch("/give",{method:"POST",headers:{"Content-Type":"application/json"},
 body:JSON.stringify({kind:$("kind").value,nick:$("nick").value.trim(),
 amount:$("amount").value,group:$("group").value})})
 .then(function(r){return r.json()})
 .then(function(j){
   var el=$("res"); el.className="res show "+(j.ok?"ok":"bad");
   el.textContent=j.message||j.error||"";
   btn.disabled=false; refresh();
 })
 .catch(function(e){var el=$("res"); el.className="res show bad"; el.textContent="Ошибка: "+e; btn.disabled=false;});
});
</script>
</body>
</html>"""

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send_html(self):
        body = HTML.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        """Сайт живёт на GitHub Pages (https), сервис — на http://127.0.0.1:9898.
        Без этих заголовков браузер блокирует запрос (cross-origin)."""
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    ALLOWED_EXT = {".html", ".htm", ".css", ".js", ".mjs", ".png", ".jpg",
                   ".jpeg", ".gif", ".svg", ".webp", ".ico", ".woff", ".woff2",
                   ".ttf", ".otf", ".map", ".json", ".webmanifest"}

    def _resolve_file(self, url_path):
        p = url_path.split("?", 1)[0].split("#", 1)[0]
        p = unquote(p).lstrip("/")
        if p == "":
            p = "index.html"
        base = os.path.dirname(os.path.abspath(__file__))
        full = os.path.normpath(os.path.join(base, p))
        if full != base and not full.startswith(base + os.sep):
            return None
        return full

    def send_file(self, full):
        """Отдаёт статический файл сайта. Только безопасные типы —
        бэкенд, ключи и скрипты (.py/.bat/.txt/.log) недоступны."""
        ext = os.path.splitext(full)[1].lower()
        if ext not in self.ALLOWED_EXT:
            return self.send_json(404, {"ok": False, "message": "Не найдено"})
        try:
            with open(full, "rb") as f:
                body = f.read()
        except OSError:
            return self.send_json(404, {"ok": False, "message": "Не найдено"})
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ext in (
                ".js", ".mjs", ".json", ".map", ".webmanifest", ".svg"):
            ctype += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/admin", "/admin/"):
            return self.send_html()
        if path == "/give":
            return self.send_json(200, {"ok": True, "message": "Сервис выдачи работает"})
        full = self._resolve_file(self.path)
        if not full:
            return self.send_json(404, {"ok": False, "message": "Не найдено"})
        if os.path.isdir(full):
            full = os.path.join(full, "index.html")
        return self.send_file(full)

    def build_command(self, kind, nick, amount, group):
        nick = nick.strip()
        if kind == "group":
            return "setgroup %s %s" % (nick, group)
        if kind == "tag":
            return "tag allow %s" % nick
        if kind == "mute":
            return "unmute %s" % nick
        if kind == "unban":
            if group == "full":
                return "unfullban %s" % nick
            return "untban %s" % nick
        if kind == "case":
            return "givecase %s %d" % (nick, int(amount))
        if kind == "seasoncase":
            return "giveseasoncase %s %d" % (nick, int(amount))
        if kind == "weeklycase":
            return "giveweeklycase %s %d" % (nick, int(amount))
        if kind == "titlecase":
            return "givetitlecase %s %d" % (nick, int(amount))
        if kind == "moneycase":
            return "givemoneycase %s %d" % (nick, int(amount))
        raise ValueError("unknown kind: %s" % kind)

    def panel_command(self, cmd):
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        data = json.dumps({"command": cmd}).encode("utf-8")
        req = urllib.request.Request(
            "%s/api/client/servers/%s/command" % (PANEL, SERVER),
            data=data, method="POST",
            headers={"Authorization": "Bearer " + KEY, "Accept": "application/json",
                     "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
                return r.status, ""
        except urllib.error.HTTPError as e:
            try:
                return e.code, e.read().decode("utf-8", "replace")
            except Exception:
                return e.code, ""
        except urllib.error.URLError as e:
            return 0, str(e.reason)

    def panel_get(self, path):
        """GET-запрос к клиентскому API панели. Возвращает (http_code, text)."""
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        req = urllib.request.Request(
            "%s%s" % (PANEL, path), method="GET",
            headers={"Authorization": "Bearer " + KEY, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
                return r.status, r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            try:
                return e.code, e.read().decode("utf-8", "replace")
            except Exception:
                return e.code, ""
        except urllib.error.URLError as e:
            return 0, str(e.reason)

    def resolve_player_ip(self, nick):
        """Ищет файл игрока в plugin_data/Auth/players и возвращает его last_ip.
        Панель не умеет читать файлы сервера напрямую — используем
        Pterodactyl-эндпоинты files/list + files/contents."""
        needle = (nick or "").strip().lower()
        entries = []
        base_path = ""
        for d in ("/plugin_data/Auth/players", "/plugins/data-auth-players"):
            code, body = self.panel_get(
                "/api/client/servers/%s/files/list?directory=%s" % (SERVER, quote(d, safe="/")))
            if code not in (200, 204):
                continue
            try:
                data = json.loads(body)
            except Exception:
                data = {}
            entries = (data.get("data") or []) if isinstance(data, dict) else []
            if entries:
                base_path = d
                break
        if not entries:
            return None

        candidates = []
        for e in entries:
            a = e.get("attributes") or {}
            name = str(a.get("name") or "")
            if not name:
                continue
            stem = name.lower()
            for ext in (".yml", ".yaml", ".json", ".txt", ".dat"):
                if stem.endswith(ext):
                    stem = stem[: -len(ext)]
                    break
            if stem == needle:
                candidates.insert(0, name)
            elif needle and needle in stem:
                candidates.append(name)
        for name in candidates[:8]:
            rel = quote("/%s/%s" % (base_path.strip("/"), name), safe="/")
            code, body = self.panel_get(
                "/api/client/servers/%s/files/contents?file=%s" % (SERVER, rel))
            if code not in (200, 204):
                continue
            m = re.search(
                r"(?im)^\s*last[_-]?ip\s*:\s*([0-9]{1,3}(?:\.[0-9]{1,3}){3})", body)
            ip = m.group(1) if m else None
            if not ip:
                m2 = re.search(r"\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b", body)
                ip = m2.group(0) if m2 else None
            if ip:
                return ip
        return None

    def resolve_promo(self, code):
        """Возвращает (kind, value) для кода промо либо (None, 0).
        Коды читаются из promos.txt при старте (PROMOS)."""
        code = (code or "").strip().upper()
        if not code:
            return (None, 0)
        return PROMOS.get(code, (None, 0))

    def apply_promo(self, kind, amount, promo_kind, promo_val):
        """Промокод влияет только на количество кейсов.
        Для привилегий/тегов количество всегда 1 (бонус не применяется)."""
        if promo_kind is None:
            return amount
        if kind in ("group", "tag"):
            return 1
        if promo_kind == "percent":
            bonus = int(math.ceil(amount * promo_val / 100.0))
            return amount + max(1, bonus)
        if promo_kind == "amount":
            return amount + promo_val
        return amount

    def do_POST(self):
        if not self.path.startswith("/give"):
            return self.send_json(404, {"ok": False, "message": "Не найдено"})
        try:
            n = int(self.headers.get("Content-Length", 0))
            d = json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
        except Exception:
            d = {}
        if not isinstance(d, dict):
            d = {}

        nick = (d.get("nick") or "").strip()
        if not nick:
            return self.send_json(400, {"ok": False, "message": "Укажите ник игрока"})

        # Промокод: если поле присутствует и не пустое — код обязан быть валидным
        promo_raw = d.get("promo_code")
        if promo_raw is None:
            promo_raw = d.get("promo")
        promo_code = (promo_raw or "").strip()
        promo_kind, promo_val = (None, 0)
        if promo_code:
            promo_kind, promo_val = self.resolve_promo(promo_code)
            if promo_kind is None:
                return self.send_json(400, {
                    "ok": False,
                    "message": "Промокод не найден или истёк: " + promo_code})

        # Корзина шлёт items[], одиночная форма — kind/amount/group
        items = d.get("items")
        if not isinstance(items, list) or not items:
            items = [{"kind": d.get("kind") or "case",
                      "amount": d.get("amount") or 1,
                      "group": d.get("group") or "premium"}]

        # Нормализация и валидация позиций
        norm = []
        for it in items:
            if not isinstance(it, dict):
                continue
            kind = (it.get("kind") or "case").strip().lower()
            if kind not in KINDS:
                return self.send_json(400, {"ok": False, "message": "Неизвестный тип: " + kind})
            group = (it.get("group") or "premium").strip()
            if kind == "group" and group not in GROUPS:
                return self.send_json(400, {"ok": False, "message": "Неизвестная группа: " + group})
            try:
                amount = int(it.get("amount") or 1)
            except (TypeError, ValueError):
                amount = 1
            amount = max(1, min(999, amount))
            norm.append({"kind": kind, "group": group, "amount": amount})
        if not norm:
            return self.send_json(400, {"ok": False, "message": "Корзина пуста"})

        # Сборка команд с учётом промокода
        plan, notes = [], []
        for it in norm:
            final_amount = self.apply_promo(it["kind"], it["amount"], promo_kind, promo_val)
            if final_amount != it["amount"]:
                notes.append("%s: %d -> %d" % (it["kind"], it["amount"], final_amount))
            try:
                cmd = self.build_command(it["kind"], nick, final_amount, it["group"])
            except Exception as e:
                return self.send_json(400, {"ok": False, "message": "Ошибка: " + str(e)})
            plan.append((cmd, it, final_amount))

        # Выдача
        done, failed = [], []
        for cmd, it, final_amount in plan:
            code, msg = self.panel_command(cmd)
            entry = {"kind": it["kind"], "command": cmd,
                     "amount": final_amount, "http": code}
            if code in (200, 204):
                done.append(entry)
            else:
                entry["error"] = msg or ("HTTP %s" % code)
                failed.append(entry)

        ok = bool(done) and not failed
        parts = []
        if done:
            parts.append("выдано: %d" % len(done))
        if failed:
            parts.append("ошибок: %d" % len(failed))
        if promo_kind and notes:
            parts.append("промокод %s (+%s)" % (
                promo_code,
                ", ".join(notes)))

        return self.send_json(200, {
            "ok": ok,
            "message": "; ".join(parts) if parts else "Нет данных",
            "promo": promo_code or None,
            "done": done,
            "failed": failed,
            "command": done[0]["command"] if done else (plan[0][0] if plan else None)})

if __name__ == "__main__":
    print("NenlyMine — магазин и выдача на одном сервере:")
    print("  Сайт   : http://127.0.0.1:9898")
    print("  Админка: http://127.0.0.1:9898/admin")
    print("  (с телефона: http://<IP компьютера>:9898)")
    http.server.ThreadingHTTPServer(("0.0.0.0", 9898), Handler).serve_forever()
