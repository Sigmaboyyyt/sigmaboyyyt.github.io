/* NenlyMine — публичная выдача (Cloudflare Worker).
 *
 * Что делает: принимает POST /give с сайта (GitHub Pages) и отправляет
 * команды на панель хостинга. Ключ панели хранится в секрете Cloudflare
 * и в браузер не попадает.
 *
 * Как развернуть (бесплатно, без своего ПК):
 *   1. Зайди на https://dash.cloudflare.com  ->  Workers & Pages  ->  Create  ->  Worker.
 *   2. Имя, например: nenlymine.  Нажми Deploy.
 *   3. Edit code -> удали всё и вставь содержимое этого файла -> Deploy.
 *   4. Settings -> Variables and Secrets -> добавь:
 *        PANEL_KEY  (Secret)  = ключ панели (из файла panel_key.txt)
 *        PROMOS     (Text)    = NENLY10|percent|10,WELCOME|amount|1
 *      Сохрани и Deploy.
 *   5. Скопируй адрес вида https://nenlymine.<что-то>.workers.dev
 *      и пришли его — он пропишется в script.js (REMOTE_API).
 *
 * Проверка: открой в браузере https://<адрес>/give — должно вернуть
 * {"ok":true,"message":"Сервис выдачи работает"}.
 */

const PANEL = "https://mgr.hosting-minecraft.pro";
const SERVER = "57a7571b";

const GROUPS = ["premium", "creative", "straj", "lord", "delux", "tsar",
  "imperator", "legenda", "povelitel", "vlastelin", "vladika"];

const KINDS = ["group", "case", "seasoncase", "weeklycase", "titlecase", "moneycase", "tag", "mute", "unban"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, CORS),
  });
}

function parsePromos(raw) {
  const map = {};
  String(raw || "").split(/[\n,;]+/).forEach(function (line) {
    line = line.trim();
    if (!line || line.charAt(0) === "#" || line.indexOf("|") === -1) return;
    const p = line.split("|");
    const code = (p[0] || "").trim().toUpperCase();
    const typ = (p[1] || "").trim().toLowerCase();
    const val = parseInt(parseFloat(p[2]), 10);
    if (!code || isNaN(val)) return;
    if (typ === "percent") map[code] = ["percent", val];
    else if (typ === "amount") map[code] = ["amount", val];
  });
  return map;
}

function buildCommand(kind, nick, amount, group) {
  if (kind === "group") return "setgroup " + nick + " " + group;
  if (kind === "tag") return "tag allow " + nick;
  if (kind === "mute") return "unmute " + nick;
  if (kind === "unban") return group === "full" ? "unfullban " + nick : "untban " + nick;
  if (kind === "case") return "givecase " + nick + " " + amount;
  if (kind === "seasoncase") return "giveseasoncase " + nick + " " + amount;
  if (kind === "weeklycase") return "giveweeklycase " + nick + " " + amount;
  if (kind === "titlecase") return "givetitlecase " + nick + " " + amount;
  if (kind === "moneycase") return "givemoneycase " + nick + " " + amount;
  throw new Error("Неизвестный тип: " + kind);
}

function applyPromo(kind, amount, promoKind, promoVal) {
  if (promoKind === null) return amount;
  if (kind === "group" || kind === "tag") return 1;
  if (promoKind === "percent") return amount + Math.max(1, Math.ceil(amount * promoVal / 100));
  if (promoKind === "amount") return amount + promoVal;
  return amount;
}

async function runCommand(env, command) {
  const r = await fetch(PANEL + "/api/client/servers/" + SERVER + "/command", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.PANEL_KEY,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ command: command }),
  });
  return r.status;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname !== "/give") return json({ ok: false, message: "Не найдено" }, 404);
    if (request.method === "GET") return json({ ok: true, message: "Сервис выдачи работает" });
    if (request.method !== "POST") return json({ ok: false, message: "Метод не поддерживается" }, 405);

    let d = {};
    try { d = await request.json(); } catch (e) { d = {}; }
    if (typeof d !== "object" || d === null) d = {};

    const nick = String(d.nick || "").trim();
    if (!nick) return json({ ok: false, message: "Укажите ник игрока" }, 400);
    if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) {
      return json({ ok: false, message: "Ник игрока: 3-16 символов, латиница, цифры и подчеркивание" }, 400);
    }

    const promos = parsePromos(env.PROMOS);
    const promoCode = String(d.promo_code || d.promo || "").trim();
    let promoKind = null, promoVal = 0;
    if (promoCode) {
      const found = promos[promoCode.toUpperCase()];
      if (!found) return json({ ok: false, message: "Промокод не найден или истёк: " + promoCode }, 400);
      promoKind = found[0];
      promoVal = found[1];
    }

    let items = d.items;
    if (!Array.isArray(items) || items.length === 0) {
      items = [{ kind: d.kind || "case", amount: d.amount || 1, group: d.group || "premium" }];
    }

    const norm = [];
    for (const it of items) {
      if (!it || typeof it !== "object") continue;
      const kind = String(it.kind || "case").trim().toLowerCase();
      if (KINDS.indexOf(kind) === -1) return json({ ok: false, message: "Неизвестный тип: " + kind }, 400);
      const group = String(it.group || "premium").trim();
      if (kind === "group" && GROUPS.indexOf(group) === -1) {
        return json({ ok: false, message: "Неизвестная группа: " + group }, 400);
      }
      let amount = parseInt(it.amount || 1, 10);
      if (isNaN(amount)) amount = 1;
      amount = Math.max(1, Math.min(999, amount));
      norm.push({ kind: kind, group: group, amount: amount });
    }
    if (norm.length === 0) return json({ ok: false, message: "Корзина пуста" }, 400);

    const plan = [], notes = [];
    for (const it of norm) {
      const finalAmount = applyPromo(it.kind, it.amount, promoKind, promoVal);
      if (finalAmount !== it.amount) notes.push(it.kind + ": " + it.amount + " -> " + finalAmount);
      let cmd;
      try { cmd = buildCommand(it.kind, nick, finalAmount, it.group); }
      catch (e) { return json({ ok: false, message: "Ошибка: " + e.message }, 400); }
      plan.push({ cmd: cmd, it: it, finalAmount: finalAmount });
    }

    const done = [], failed = [];
    for (const p of plan) {
      let code;
      try { code = await runCommand(env, p.cmd); } catch (e) { code = 0; }
      const entry = { kind: p.it.kind, command: p.cmd, amount: p.finalAmount, http: code };
      if (code === 200 || code === 204) done.push(entry);
      else failed.push(Object.assign({ error: "HTTP " + code }, entry));
    }

    const ok = done.length > 0 && failed.length === 0;
    const parts = [];
    if (done.length) parts.push("выдано: " + done.length);
    if (failed.length) parts.push("ошибок: " + failed.length);
    if (promoKind && notes.length) parts.push("промокод " + promoCode + " (+" + notes.join(", ") + ")");

    return json({
      ok: ok,
      message: parts.length ? parts.join("; ") : "Нет данных",
      promo: promoCode || null,
      done: done,
      failed: failed,
      command: done.length ? done[0].command : (plan.length ? plan[0].cmd : null),
    });
  },
};
