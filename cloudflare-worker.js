/* NenlyMine — Cloudflare Worker (без зависимости от ПК).
 *
 * Что делает:
 * - POST /pay/create: создаёт корзину TradeMC и возвращает авто-редирект на pay.trademc.org
 * - POST /give: ручная выдача через Pterodactyl (нужен секрет PANEL_KEY)
 *
 * Secrets/vars в Cloudflare:
 *   PANEL_KEY  (Secret)  = ключ панели (для /give)
 *   PROMOS     (Text)    = NENLY10|percent|10,WELCOME|amount|1
 */

const PANEL = "https://mgr.hosting-minecraft.pro";
const SERVER = "57a7571b";

const TRADEMC_SHOP = "245601";
const TRADEMC_API = "https://api.trademc.org";
const TRADEMC_PAY = "https://pay.trademc.org";

const GROUPS = ["premium", "creative", "straj", "lord", "delux", "tsar",
  "imperator", "legenda", "povelitel", "vlastelin", "vladika"];

const KINDS = ["group", "case", "donatcase", "seasoncase", "weeklycase", "titlecase", "moneycase", "tag", "mute", "unban"];

const TRADEMC_GROUPS = {
  premium: 993878, creative: 993879, straj: 993880, lord: 993881, delux: 993882,
  tsar: 993883, imperator: 993884, legenda: 993885, povelitel: 993886,
  vlastelin: 993887, vladika: 993888
};

const TRADEMC_CASES = {
  case: 993889, donatcase: 993889, seasoncase: 993890, weeklycase: 993891,
  titlecase: 993892, moneycase: 993894
};

const TRADEMC_UNBAN = { norm: 993895, full: 993895 };

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

function html(body, status) {
  return new Response(body, {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "text/html; charset=utf-8" }, CORS),
  });
}

function parsePromos(raw) {
  const map = {};
  String(raw || "").split(/[\n,;]+/).forEach(function (line) {
    line = String(line || "").trim();
    if (!line || line.charAt(0) === "#" || line.indexOf("|") === -1) return;
    const p = line.split("|");
    const code = String(p[0] || "").trim().toUpperCase();
    const typ = String(p[1] || "").trim().toLowerCase();
    const val = parseInt(parseFloat(p[2]), 10);
    if (!code || isNaN(val)) return;
    if (typ === "percent") map[code] = ["percent", val];
    else if (typ === "amount") map[code] = ["amount", val];
  });
  return map;
}

function applyPromo(kind, amount, promoKind, promoVal) {
  if (promoKind === null || promoKind === undefined) return amount;
  if (kind === "group" || kind === "tag") return 1;
  if (promoKind === "percent") return amount + Math.max(1, Math.ceil(amount * promoVal / 100));
  if (promoKind === "amount") return amount + promoVal;
  return amount;
}

function buildCommand(kind, nick, amount, group) {
  if (kind === "group") return "setgroup " + nick + " " + group;
  if (kind === "tag") return "tag allow " + nick;
  if (kind === "mute") return "unmute " + nick;
  if (kind === "unban") return group === "full" ? "unfullban " + nick : "untban " + nick;
  if (kind === "case" || kind === "donatcase") return "givecase " + nick + " " + amount;
  if (kind === "seasoncase") return "giveseasoncase " + nick + " " + amount;
  if (kind === "weeklycase") return "giveweeklycase " + nick + " " + amount;
  if (kind === "titlecase") return "givetitlecase " + nick + " " + amount;
  if (kind === "moneycase") return "givemoneycase " + nick + " " + amount;
  throw new Error("Неизвестный тип: " + kind);
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

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function handlePayCreate(request, env) {
  let d = {};
  const ct = (request.headers.get("Content-Type") || "").toLowerCase();
  try {
    if (ct.indexOf("application/json") !== -1) {
      d = await request.json();
    } else {
      const text = await request.text();
      try { d = JSON.parse(text); }
      catch (e) {
        const params = new URLSearchParams(text);
        d = {};
        for (const [k, v] of params.entries()) d[k] = v;
      }
    }
  } catch (e) { d = {}; }
  if (typeof d !== "object" || d === null) d = {};

  const nick = String(d.nick || "").trim();
  if (!nick) return json({ ok: false, message: "Укажите ник игрока" }, 400);

  let items = d.items;
  if (typeof items === "string") {
    try { items = JSON.parse(items); } catch (e) { items = null; }
  }
  if (!Array.isArray(items) || items.length === 0) {
    return json({ ok: false, message: "Корзина пуста" }, 400);
  }

  const norm = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const kind = String(it.kind || "case").trim().toLowerCase();
    if (KINDS.indexOf(kind) === -1 && kind !== "unban") {
      return json({ ok: false, message: "Неизвестный тип: " + kind }, 400);
    }
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

  const promoCode = String(d.promo_code || d.promo || "").trim();
  let promoKind = null, promoVal = 0;
  if (promoCode) {
    const promos = parsePromos(env.PROMOS);
    const found = promos[promoCode.toUpperCase()];
    if (!found) return json({ ok: false, message: "Промокод не найден или истёк" }, 400);
    promoKind = found[0];
    promoVal = found[1];
  }

  const itemsList = [];
  for (const it of norm) {
    if (it.kind === "group") {
      const tid = TRADEMC_GROUPS[it.group];
      if (!tid) return json({ ok: false, message: "Товар не найден" }, 400);
      itemsList.push(String(tid) + ":1");
    } else if (Object.prototype.hasOwnProperty.call(TRADEMC_CASES, it.kind)) {
      const tid = TRADEMC_CASES[it.kind];
      const finalAmount = applyPromo(it.kind, it.amount, promoKind, promoVal);
      itemsList.push(String(tid) + ":" + String(parseInt(finalAmount, 10)));
    } else if (it.kind === "unban") {
      const utype = String(it.group || "norm").trim().toLowerCase();
      const tid = TRADEMC_UNBAN[utype] || TRADEMC_UNBAN.norm;
      if (!tid) return json({ ok: false, message: "Товар не найден" }, 400);
      itemsList.push(String(tid) + ":1");
    } else {
      return json({ ok: false, message: "Товар не поддерживается в TradeMC" }, 400);
    }
  }

  if (itemsList.length === 0) return json({ ok: false, message: "Корзина пуста" }, 400);

  const successUrl = "https://sigmaboyyyt.github.io/success.html";
  const failUrl = "https://sigmaboyyyt.github.io/fail.html";
  const pendingUrl = "https://sigmaboyyyt.github.io/success.html";

  const buyUrl = TRADEMC_API + "/shop.buyItems?" + new URLSearchParams({
    items: itemsList.join(","),
    buyer: nick,
    shop: TRADEMC_SHOP,
    v: "3",
  }).toString();

  let data;
  try {
    const r = await fetch(buyUrl, { method: "GET", headers: { Accept: "application/json" } });
    const body = await r.text();
    data = JSON.parse(body);
  } catch (e) {
    return json({ ok: false, message: "Ошибка TradeMC: " + String(e && e.message || e) }, 500);
  }

  const cartId = data && data.response && data.response.cart_id;
  if (!cartId) {
    return json({ ok: false, message: "Не удалось создать корзину TradeMC" }, 500);
  }

  const formHtml = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Оплата...</title></head><body>"
    + "<form id='f' method='get' action='" + escHtml(TRADEMC_PAY) + "'>"
    + "<input type='hidden' name='cart_id' value='" + escHtml(cartId) + "'>"
    + "<input type='hidden' name='success_url' value='" + escHtml(successUrl) + "'>"
    + "<input type='hidden' name='fail_url' value='" + escHtml(failUrl) + "'>"
    + "<input type='hidden' name='pending_url' value='" + escHtml(pendingUrl) + "'>"
    + "</form><script>document.getElementById('f').submit();</script></body></html>";

  return html(formHtml, 200);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/pay/create" || url.pathname === "/api/pay/create") {
      if (request.method !== "POST") return json({ ok: false, message: "Метод не поддерживается" }, 405);
      return handlePayCreate(request, env);
    }

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
