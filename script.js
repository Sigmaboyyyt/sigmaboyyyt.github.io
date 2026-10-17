/* -*- coding: utf-8 -*-
 * NenlyMine - script.js
 * 1) Тема (localStorage "nenlymine-theme", атрибут data-theme на <html>)
 * 2) Мобильное меню (.hamburger / .nav.open)
 * 3) КОРЗИНА (localStorage "nenlymine-cart"):
 *    - кнопки ".btn-add-cart" на карточках, счётчик "#cartBadge" в шапке
 *    - страница cart.html: ник + количество (кейсы) + промокод
 * 4) Отправка заказа в локальный give_app.py (POST /give, {nick, items[], promo_code})
 */
(function () {
    'use strict';

    var THEME_KEY = 'nenlymine-theme';
    var CART_KEY = 'nenlymine-cart';
    var DEFAULT_API = 'http://127.0.0.1:9898/give';
    var REMOTE_API = 'https://nenlymine.vffgeg4.workers.dev/give';

    var CASE_KINDS = { case: 1, seasoncase: 1, weeklycase: 1, titlecase: 1, moneycase: 1 };

    var GROUP_NAMES = {
        premium: 'Премиум', creative: 'Креатив', straj: 'Страж',
        lord: 'Лорд', delux: 'Делюкс', tsar: 'Царь',
        imperator: 'Император', legenda: 'Легенда',
        povelitel: 'Повелитель', vlastelin: 'Властелин',
        vladika: 'Владыка'
    };

    var CASE_NAMES = {
        case: 'Кейс', seasoncase: 'Сезонный кейс',
        weeklycase: 'Недельный кейс', titlecase: 'Титульный кейс', moneycase: 'Денежный кейс'
    };

    function $(sel, root) { return (root || document).querySelector(sel); }
    function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

    /* ================= ТЕМА =================
       По умолчанию тёмная (атрибута нет), светлая — data-theme="light". */
    function applyTheme(theme) {
        var root = document.documentElement;
        if (theme === 'light') { root.setAttribute('data-theme', 'light'); }
        else { root.removeAttribute('data-theme'); }
    }

    var themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', function () {
            var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
            var next = cur === 'light' ? 'dark' : 'light';
            applyTheme(next);
            try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
        });
    }

    /* ================= КОПИРОВАНИЕ (IP сервера) ================= */
    function copyText(text, btn) {
        function done() {
            if (!btn) { return; }
            var prev = btn.textContent;
            btn.textContent = 'Скопировано';
            btn.classList.add('is-added');
            setTimeout(function () { btn.textContent = prev; btn.classList.remove('is-added'); }, 1400);
        }
        function fallback() {
            var ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); } catch (e) {}
            document.body.removeChild(ta);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () { fallback(); done(); });
        } else { fallback(); done(); }
    }

    function bindCopyButtons() {
        $$('[data-copy]').forEach(function (btn) {
            btn.addEventListener('click', function () { copyText(btn.getAttribute('data-copy') || '', btn); });
        });
        var ipBtn = document.getElementById('copyIp');
        if (ipBtn) {
            ipBtn.addEventListener('click', function () {
                var src = document.getElementById('serverIp');
                var val = ipBtn.getAttribute('data-ip') || (src ? src.textContent : '');
                copyText((val || '').trim(), ipBtn);
            });
        }
    }

    /* ================= АККОРДЕОН FAQ ================= */
    function bindFaq() {
        $$('.faq-item').forEach(function (item) {
            var q = item.querySelector('.faq-q');
            if (!q) { return; }
            q.addEventListener('click', function () {
                var open = item.classList.toggle('open');
                q.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
        });
    }

    /* ================= АНИМАЦИИ ПРИ ПРОКРУТКЕ ================= */
    document.documentElement.classList.add('js');

    function initHeader() {
        var h = document.querySelector('.site-header');
        if (!h) { return; }
        var onScroll = function () {
            h.classList.toggle('is-scrolled', window.scrollY > 8);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    function initReveal() {
        var els = $$('.section, .page-hero');
        els.forEach(function (el) { el.classList.add('reveal'); });
        if ('IntersectionObserver' in window) {
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (en) {
                    if (en.isIntersecting) {
                        en.target.classList.add('in');
                        io.unobserve(en.target);
                    }
                });
            }, { threshold: 0.1, rootMargin: '0px 0px -48px 0px' });
            els.forEach(function (el) { io.observe(el); });
        } else {
            els.forEach(function (el) { el.classList.add('in'); });
        }
    }

    function initStagger() {
        $$('.grid').forEach(function (g) {
            Array.prototype.forEach.call(g.children, function (c, i) {
                c.style.setProperty('--i', String(i));
            });
        });
    }

    /* ================= ЖИВОЙ ФОН (пятна + звёзды) ================= */
    function injectBgFx() {
        if (document.getElementById('bgfx')) { return; }
        var fx = document.createElement('div');
        fx.id = 'bgfx';
        fx.className = 'bgfx';
        fx.setAttribute('aria-hidden', 'true');
        var i, dots = '';
        for (i = 0; i < 14; i++) { dots += '<span class="bg-dot"></span>'; }
        fx.innerHTML = '<i class="bg-orb"></i><i class="bg-orb"></i><i class="bg-orb"></i>' + dots;
        document.body.appendChild(fx);
        Array.prototype.forEach.call(fx.querySelectorAll('.bg-dot'), function (d) {
            d.style.left = (Math.random() * 100).toFixed(2) + '%';
            d.style.top = (Math.random() * 100).toFixed(2) + '%';
            var s = (1.5 + Math.random() * 2.5).toFixed(1) + 'px';
            d.style.width = s;
            d.style.height = s;
            d.style.animationDelay = (Math.random() * 5).toFixed(1) + 's';
            d.style.animationDuration = (3 + Math.random() * 5).toFixed(1) + 's';
        });
    }

    /* ================= СОЦСЕТИ В ОСНОВНОМ ЭКРАНЕ ================= */
    var headerSvgVk = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12.8 16.2c-5.3 0-8.7-3.7-8.8-9.9h2.7c.1 4.6 2.2 6.5 3.8 6.9V6.3h2.6v3.9c1.6-.2 3.2-1.9 3.8-3.9h2.6c-.4 2.5-2.1 4.2-3.3 4.9 1.2.6 3.2 2.1 3.9 5h-2.9c-.6-1.9-2.1-3.3-4.1-3.6v3.6h-.3z"/></svg>';
    var headerSvgTg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M21.9 4.3 18.6 20c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.8 13.1l-4.9-1.5c-1.1-.3-1.1-1 .2-1.5l19.1-7.4c.9-.3 1.7.2 1.4 1.6z"/></svg>';
    var headerSvgDs = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19.3 5.3A16 16 0 0 0 15.2 4l-.2.4a13 13 0 0 1 3.6 1.8 11.4 11.4 0 0 0-9.2 0A13 13 0 0 1 13 4.4L12.8 4a16 16 0 0 0-4 1.3C5.8 9.5 5 13.6 5.4 17.6a16 16 0 0 0 4.9 2.4l.6-1a10 10 0 0 1-1.7-.8l.4-.3a11 11 0 0 0 9.6 0l.4.3c-.5.3-1.1.6-1.7.8l.6 1a16 16 0 0 0 4.9-2.4c.5-4.6-.8-8.7-3.1-12.3zM9.7 15.1c-.9 0-1.7-.9-1.7-2s.8-2 1.7-2 1.7.9 1.7 2-.8 2-1.7 2zm4.6 0c-.9 0-1.7-.9-1.7-2s.8-2 1.7-2 1.7.9 1.7 2-.7 2-1.7 2z"/></svg>';

    function injectHeroSocials() {
        if (document.querySelector('.hero-socials')) { return; }
        var block = document.createElement('div');
        block.className = 'hero-socials';
        block.setAttribute('aria-label', 'Мы в соцсетях');
        block.innerHTML =
            '<div class="hero-socials-inner">' +
            '<span class="hero-socials-label">Мы в соцсетях</span>' +
            '<a href="#vk" class="hs s-vk" aria-label="VK" title="VK">' + headerSvgVk + '</a>' +
            '<a href="https://t.me/nenlymine" class="hs s-tg" aria-label="Telegram" title="Telegram">' + headerSvgTg + '</a>' +
            '<a href="#ds" class="hs s-ds" aria-label="Discord" title="Discord">' + headerSvgDs + '</a>' +
            '</div>';
        var anchor = document.querySelector('.hero .hero-copy .ip-box');
        if (!anchor) { anchor = document.querySelector('.page-hero .page-hero-sub'); }
        if (!anchor) { return; }
        anchor.parentNode.insertBefore(block, anchor.nextSibling);
    }

    /* ================= МОБИЛЬНОЕ МЕНЮ ================= */
    var menuBtn = document.getElementById('menuToggle');
    var nav = document.getElementById('siteNav') || document.querySelector('.nav');

    function closeMenu() {
        if (nav) {
            nav.classList.remove('open');
            nav.setAttribute('aria-hidden', 'true');
        }
        if (menuBtn) {
            menuBtn.classList.remove('active');
            menuBtn.setAttribute('aria-expanded', 'false');
        }
    }

    if (menuBtn && nav) {
        menuBtn.addEventListener('click', function () {
            var open = nav.classList.toggle('open');
            menuBtn.classList.toggle('active', open);
            menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            nav.setAttribute('aria-hidden', open ? 'false' : 'true');
        });
        $$('a', nav).forEach(function (a) { a.addEventListener('click', closeMenu); });
        document.addEventListener('click', function (e) {
            if (nav.contains(e.target) || menuBtn.contains(e.target)) { return; }
            if (window.innerWidth <= 760) { closeMenu(); }
        });
        window.addEventListener('resize', function () {
            if (window.innerWidth > 760) { closeMenu(); }
        });
    }

    /* ================= ХРАНИЛИЩЕ ================= */
    function readStore(key, fallback) {
        try {
            var v = JSON.parse(localStorage.getItem(key) || 'null');
            return v === null || v === undefined ? fallback : v;
        } catch (e) { return fallback; }
    }
    function writeStore(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
    }

    function getCart() {
        var v = readStore(CART_KEY, []);
        return Array.isArray(v) ? v : [];
    }
    function saveCart(items) {
        writeStore(CART_KEY, items);
        refreshCartBadge();
    }

    function itemId(it) {
        return [it.kind, it.group || '', it.label || ''].join('|');
    }

    function isCase(it) { return !!CASE_KINDS[it.kind]; }

    /* ================= СЧЁТЧИК ================= */
    function cartCount() {
        return getCart().reduce(function (s, it) {
            return s + (isCase(it) ? (it.qty || 1) : 1);
        }, 0);
    }

    function refreshCartBadge() {
        var n = cartCount();
        $$('#cartBadge').forEach(function (b) {
            b.textContent = n > 0 ? String(n) : '';
            b.style.display = n > 0 ? '' : 'none';
        });
    }

    /* ================= ТОСТ ================= */
    var toastTimer = null;
    function toast(text) {
        var t = document.getElementById('toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'toast';
            t.className = 'toast';
            document.body.appendChild(t);
        }
        t.textContent = text;
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
    }

    /* ================= ДОБАВЛЕНИЕ ================= */
    function addToCart(item) {
        var items = getCart();
        var id = itemId(item);
        var found = null;
        for (var i = 0; i < items.length; i++) {
            if (itemId(items[i]) === id) { found = items[i]; break; }
        }
        if (found) {
            /* Привилегия и тег выдаются один раз - количество не копится. */
            if (isCase(found)) { found.qty = (found.qty || 1) + (item.qty || 1); }
            toast('Уже в корзине: ' + (found.label || ''));
        } else {
            item.qty = item.qty || 1;
            items.push(item);
            toast('Добавлено в корзину: ' + (item.label || ''));
        }
        saveCart(items);
    }

    function removeAt(index) {
        var items = getCart();
        if (index < 0 || index >= items.length) { return; }
        var removed = items.splice(index, 1)[0];
        saveCart(items);
        renderCartPage();
        toast('Удалено: ' + (removed.label || ''));
    }

    /* --------- Кнопки "В корзину" на карточках ---------
       На элементе с .btn-add-cart (или на самой карточке):
         data-kind  = group|tag|case|seasoncase|weeklycase|titlecase
         data-group = внутренняя группа (для kind=group)
         data-label = название для показа
         data-price = цена в рублях (необязательно) */
    function bindBuyButtons() {
        $$('.btn-add-cart').forEach(function (btn) {
            var card = btn.closest('.card') || btn;
            btn.addEventListener('click', function (ev) {
                ev.preventDefault();
                var kind = (card.getAttribute('data-kind') || 'group').toLowerCase();
                var group = card.getAttribute('data-group') || 'premium';
                var label = card.getAttribute('data-label') || '';
                var price = parseInt(card.getAttribute('data-price') || '0', 10) || 0;
                var qty = parseInt(card.getAttribute('data-qty') || '1', 10) || 1;

                if (!label) {
                    label = kind === 'group' ? (GROUP_NAMES[group] || group)
                          : kind === 'tag' ? 'Тег'
                          : (CASE_NAMES[kind] || 'Товар');
                }
                addToCart({ kind: kind, group: group, label: label, price: price, qty: qty });
            });
        });
    }

    /* ================= СТРАНИЦА КОРЗИНЫ ================= */
    var qtyTouched = false;

    function renderCartPage() {
        var listEl = document.getElementById('cartList');
        if (!listEl) { return; }

        var items = getCart();
        var emptyEl = document.getElementById('cartEmpty');
        var formEl = document.getElementById('orderForm');
        var sumEl = document.getElementById('cartSum');

        if (!items.length) {
            if (emptyEl) { emptyEl.style.display = 'block'; }
            if (formEl) { formEl.style.display = 'none'; }
            listEl.textContent = '';
            if (sumEl) { sumEl.textContent = '0 ₽'; }
            return;
        }

        if (emptyEl) { emptyEl.style.display = 'none'; }
        if (formEl) { formEl.style.display = 'block'; }

        /* Список позиций (DOM, без innerHTML - безопасно для ника/названий) */
        listEl.textContent = '';
        var total = 0;
        items.forEach(function (it, idx) {
            total += (isCase(it) ? (it.qty || 1) : 1) * (it.price || 0);

            var row = document.createElement('div');
            row.className = 'cart-item';

            var badge = document.createElement('span');
            badge.className = 'cart-kind ' + (isCase(it) ? 'is-case' : (it.kind === 'tag' ? 'is-tag' : 'is-group'));
            badge.textContent = it.kind === 'group' ? 'Привилегия'
                             : it.kind === 'tag' ? 'Тег'
                             : it.kind === 'unban' ? 'Разбан'
                             : 'Кейс';
            row.appendChild(badge);

            var info = document.createElement('div');
            info.className = 'cart-item-info';

            var name = document.createElement('div');
            name.className = 'cart-item-name';
            name.textContent = it.label || 'Товар';
            info.appendChild(name);

            var meta = document.createElement('div');
            meta.className = 'cart-item-meta';
            var parts = [];
            if (isCase(it) && it.qty > 1) { parts.push('в корзине: ' + it.qty + ' шт.'); }
            if (it.price) { parts.push(it.price.toLocaleString('ru-RU') + ' ₽'); }
            meta.textContent = parts.join(' • ');
            if (!parts.length) { meta.style.display = 'none'; }
            info.appendChild(meta);
            row.appendChild(info);

            var del = document.createElement('button');
            del.type = 'button';
            del.className = 'cart-del';
            del.setAttribute('aria-label', 'Удалить товар');
            del.textContent = '×';
            del.addEventListener('click', function () { removeAt(idx); });
            row.appendChild(del);

            listEl.appendChild(row);
        });

        if (sumEl) { sumEl.textContent = total.toLocaleString('ru-RU') + ' ₽'; }
        bindPromoVisibility();
    }

    /* Поля формы зависят от содержимого корзины:
       - есть кейс  -> показываем количество
       - есть кейс/привилегия/тег -> показываем промокод */
    function bindPromoVisibility() {
        var promoWrap = document.getElementById('promoWrap');
        var qtyWrap = document.getElementById('qtyWrap');
        if (!promoWrap && !qtyWrap) { return; }

        var items = getCart();
        var hasCase = items.some(isCase);

        if (qtyWrap) { qtyWrap.style.display = hasCase ? '' : 'none'; }
        if (promoWrap) { promoWrap.style.display = 'block'; }

        var qty = document.getElementById('qty');
        if (qty && hasCase && !qtyTouched) {
            var maxQ = items.reduce(function (m, it) {
                return isCase(it) ? Math.max(m, it.qty || 1) : m;
            }, 1);
            qty.value = maxQ;
        }
    }

    /* ================= ОТПРАВКА ЗАКАЗА ================= */
    function getApiUrl() {
        if (location.protocol === 'file:') {
            return DEFAULT_API;
        }
        if (/\.github\.io$/i.test(location.hostname) ||
            /\.pages\.dev$/i.test(location.hostname)) {
            return REMOTE_API || DEFAULT_API;
        }
        return location.origin + '/give';
    }

    function submitOrder(form) {
        var btn = form.querySelector('button[type="submit"]');
        var items = getCart();

        if (!items.length) {
            showResult('Корзина пуста - добавьте товары', false);
            return;
        }
        var nick = (form.nick && form.nick.value || '').trim();
        if (!nick) {
            showResult('Укажите ник игрока', false);
            if (form.nick) { form.nick.focus(); }
            return;
        }
        if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) {
            showResult('Ник игрока: 3-16 символов, латиница, цифры и подчеркивание', false);
            if (form.nick) { form.nick.focus(); }
            return;
        }

        var promo = (form.promo && form.promo.value || '').trim().toUpperCase();
        var qty = 1;
        if (form.qty) { qty = Math.max(1, Math.min(999, parseInt(form.qty.value || '1', 10) || 1)); }

        var payload = items.map(function (it) {
            var amount = 1;
            if (isCase(it)) { amount = qty; }
            return {
                kind: it.kind,
                group: it.group || 'premium',
                amount: amount
            };
        });

        sendToGive(nick, payload, promo, btn);
    }

    function sendToGive(nick, payload, promo, btn) {
        var url = getApiUrl();

        if (btn) { btn.disabled = true; btn.textContent = 'Отправляем...'; }

        fetch(url, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nick: nick, items: payload, promo_code: promo || '' })
        })
        .then(function (r) {
            return r.json().catch(function () {
                throw new Error('Сервис вернул не-JSON (HTTP ' + r.status + ')');
            });
        })
        .then(function (j) {
            if (j && j.ok) {
                showResult('Заказ выполнен! ' + (j.message || ''), true);
                saveCart([]);
                renderCartPage();
            } else {
                showResult((j && (j.message || j.error)) || 'Не удалось выполнить заказ', false);
            }
            if (btn) { btn.disabled = false; btn.textContent = 'Оформить заказ'; }
        })
        .catch(function (e) {
            showResult('Не удалось связаться с сервисом выдачи (' + url + '). Убедитесь, что запущен site.bat (или give_app.py отдельно).', false);
            if (window.console) { console.error(e); }
            if (btn) { btn.disabled = false; btn.textContent = 'Оформить заказ'; }
        });
    }

    function showResult(text, ok) {
        var el = document.getElementById('orderResult');
        if (!el) {
            el = document.createElement('div');
            el.id = 'orderResult';
            var wrap = $('.cart-page') || document.body;
            wrap.appendChild(el);
        }
        el.textContent = text;
        el.className = 'order-result ' + (ok ? 'ok' : 'bad');
        el.style.display = 'block';
    }

    /* ================= ИНИЦИАЛИЗАЦИЯ ================= */
    initHeader();
    injectBgFx();
    injectHeroSocials();
    initReveal();
    initStagger();
    refreshCartBadge();
    bindBuyButtons();
    bindCopyButtons();
    bindFaq();

    var cartForm = document.getElementById('orderForm');
    if (cartForm) {
        cartForm.addEventListener('submit', function (e) {
            e.preventDefault();
            submitOrder(cartForm);
        });
    }
    var qtyInput = document.getElementById('qty');
    if (qtyInput) {
        qtyInput.addEventListener('input', function () { qtyTouched = true; });
    }

    renderCartPage();
})();
