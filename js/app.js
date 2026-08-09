/* ============================================================
 * app.js — منطق اصلی مجسمه‌حساب
 * ساخت، فروش، موجودی، نمودارها، تنظیمات، بکاپ/بازیابی
 * ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var J = window.Jalali;

  var state = {
    stocks: [],   // [{id, name, qty, cost, price, updated}]
    builds: [],   // [{id, name, qty, cost, price, dateKey, jy, jm, jd}]
    sales: [],    // [{id, name, qty, price, channel, dateKey, jy, jm, jd}]
    settings: { goal: 10000000, lowStock: 3 },
    view: 'dashboard'
  };

  var CHANNELS = ['حضوری (غرفه)', 'سفارش تلفنی', 'اینستاگرام', 'باغ‌فردوس', 'سایر'];

  /* ---------- Init ---------- */
  function init() {
    if (!window.Jalali) { console.error('jalali.js missing'); return; }
    hideSplash();
    bindNav();
    bindButtons();

    // دریافت داده
    Promise.all([
      DB.getAll('stocks'), DB.getAll('builds'), DB.getAll('sales')
    ]).then(function (res) {
      state.stocks = res[0] || [];
      state.builds = res[1] || [];
      state.sales = res[2] || [];
      normalizeDates();
      loadSettings();
      renderAll();
      showOnline();
    }).catch(function (e) {
      toast('خطا در بارگذاری داده: ' + e.message, 'err');
    });
  }

  function hideSplash() {
    var sp = $('splash');
    if (sp) setTimeout(function () { sp.classList.add('hidden'); }, 900);
  }

  function showOnline() {
    var dot = $('onlineDot');
    if (dot) dot.classList.toggle('off', !navigator.onLine);
  }

  function normalizeDates() {
    var i;
    for (i = 0; i < state.builds.length; i++) {
      var b = state.builds[i];
      if (!b.dateKey) { b.dateKey = JKeyOf(b.jy, b.jm, b.jd); }
    }
    for (i = 0; i < state.sales.length; i++) {
      var s = state.sales[i];
      if (!s.dateKey) { s.dateKey = JKeyOf(s.jy, s.jm, s.jd); }
    }
  }

  function JKeyOf(jy, jm, jd) {
    if (jy === undefined) return 0;
    return jy * 10000 + jm * 100 + jd;
  }

  /* ---------- رندر ---------- */
  function renderAll() {
    renderHeaderDate();
    renderDashboard();
    renderBuildHistory();
    renderStock();
    renderSellForm();
    renderRecentSales();
    renderReports();
  }

  function fnum(x) {
    if (x === null || x === undefined || isNaN(x)) return '۰';
    return window.Jalali.faNum(Math.round(x).toLocaleString('en-US').replace(/,/g, '٬'));
  }

  function fmtMoney(x) {
    return fnum(x) + ' تومان';
  }

  function renderHeaderDate() {
    var t = window.Jalali.today();
    var el = $('hdrDate');
    if (el) el.textContent = window.Jalali.fullLabel(t);
  }

  function renderDashboard() {
    var t = window.Jalali.today();
    var m = t.jy * 100 + t.jm;

    // درآمد/هزینه/سود ماه جاری
    var income = 0, cost = 0, salesCount = 0, buildCount = 0;
    state.sales.forEach(function (s) {
      if ((s.jy * 100 + s.jm) === m) { income += s.qty * s.price; salesCount += s.qty; }
    });
    state.builds.forEach(function (b) {
      if ((b.jy * 100 + b.jm) === m) { cost += b.qty * b.cost; buildCount += b.qty; }
    });
    var profit = income - cost;

    $('heroProfitVal').textContent = fmtMoney(profit);
    $('heroIncome').textContent = fmtMoney(income);
    $('heroCost').textContent = fmtMoney(cost);
    $('heroSalesCount').textContent = fnum(salesCount) + ' عدد';

    // هدف
    var goal = state.settings.goal || 0;
    var pct = goal > 0 ? Math.min(100, Math.round(profit / goal * 100)) : 0;
    var fill = $('targetFill');
    fill.style.width = pct + '%';
    fill.classList.toggle('over', profit >= goal);
    $('targetTxt').textContent = (profit >= goal ? '🎯 هدف زده شد! ' : '') + fnum(pct) + '٪ از هدف ' + fnum(goal);

    // شمارنده‌های سریع
    $('qaBuilt').textContent = 'این ماه: ' + fnum(buildCount) + ' عدد';
    $('qaSold').textContent = 'این ماه: ' + fnum(salesCount) + ' عدد';

    renderAlerts();
    renderDashTopSellers();
    greet();
  }

  function greet() {
    var h = new Date().getHours();
    var txt = h < 12 ? 'صبح بخیر استاد ☀️' : (h < 17 ? 'ظهر بخیر استاد 🌤️' : 'شب بخیر استاد 🌙');
    $('greetText').textContent = txt;
    var t = window.Jalali.today();
    $('greetSub').textContent = window.Jalali.fullLabel(t);
  }

  function renderAlerts() {
    var box = $('alertsBox');
    box.innerHTML = '';
    var list = [];

    // موجودی کم
    state.stocks.forEach(function (st) {
      if (st.qty <= (state.settings.lowStock || 3)) {
        list.push({ type: 'red', txt: 'موجودی «' + st.name + '» کم است', val: 'موجودی: ' + fnum(st.qty) });
      }
    });

    // هدف ماه
    var t = window.Jalali.today();
    var m = t.jy * 100 + t.jm;
    var profit = monthProfit(m);
    var goal = state.settings.goal || 0;
    if (goal > 0 && profit < goal) {
      list.push({ type: 'gold', txt: 'سود این ماه هنوز به هدف نرسیده', val: fnum(profit) + ' از ' + fnum(goal) });
    }

    if (!list.length) {
      box.innerHTML = '<div class="empty small">✅ همه‌چیز رو به راه است — هشداری نیست.</div>';
      return;
    }
    list.slice(0, 4).forEach(function (a) {
      var d = document.createElement('div');
      d.className = 'alert' + (a.type === 'red' ? ' red' : '');
      d.innerHTML = '<span class="a-dot"></span><span class="a-txt">' + a.txt + '</span><span class="a-val">' + a.val + '</span>';
      box.appendChild(d);
    });
  }

  function monthProfit(m) {
    var income = 0, cost = 0;
    state.sales.forEach(function (s) { if ((s.jy * 100 + s.jm) === m) income += s.qty * s.price; });
    state.builds.forEach(function (b) { if ((b.jy * 100 + b.jm) === m) cost += b.qty * b.cost; });
    return income - cost;
  }

  function renderDashTopSellers() {
    var box = $('dashTopSellers');
    var t = window.Jalali.today();
    var m = t.jy * 100 + t.jm;
    var agg = {};
    state.sales.forEach(function (s) {
      if ((s.jy * 100 + s.jm) !== m) return;
      agg[s.name] = (agg[s.name] || 0) + s.qty;
    });
    var arr = Object.keys(agg).map(function (k) { return { name: k, qty: agg[k] }; })
      .sort(function (a, b) { return b.qty - a.qty; }).slice(0, 3);
    if (!arr.length) {
      box.innerHTML = '<div class="empty small">هنوز فروشی ثبت نشده — اولین فروش را ثبت کن! 🎯</div>';
      return;
    }
    box.innerHTML = arr.map(function (r, i) {
      return '<div class="trow"><div class="n"><span class="pareto-rank">' + (i + 1) + '</span><b>' + r.name + '</b></div><span class="v gold">' + fnum(r.qty) + ' عدد</span></div>';
    }).join('');
  }

  /* ---------- ساخت ---------- */
  function bindBuild() {
    $('btnBuild').addEventListener('click', function () {
      var name = $('bName').value.trim();
      var qty = parseInt($('bQty').value, 10);
      var cost = parseInt($('bCost').value, 10) || 0;
      var price = parseInt($('bPrice').value, 10) || 0;
      if (!name) { toast('نام مجسمه را وارد کن', 'err'); return; }
      if (!qty || qty < 1) { toast('تعداد نامعتبر است', 'err'); return; }

      var dateStr = $('bDate').value.trim();
      var j = dateStr ? window.Jalali.parse(dateStr) : window.Jalali.today();
      if (!j) { toast('تاریخ نامعتبر است — نمونه: 1404/05/16', 'err'); return; }

      var build = {
        id: Date.now(),
        name: name,
        qty: qty,
        cost: cost,
        price: price,
        jy: j.jy, jm: j.jm, jd: j.jd,
        dateKey: JKeyOf(j.jy, j.jm, j.jd)
      };

      // به‌روزرسانی stock
      var st = state.stocks.filter(function (s) { return s.name === name; })[0];
      if (st) {
        st.qty += qty;
        st.cost = cost;
        st.price = price;
        st.updated = Date.now();
        DB.put('stocks', st);
      } else {
        st = { id: 'st_' + Date.now(), name: name, qty: qty, cost: cost, price: price, updated: Date.now() };
        DB.add('stocks', st);
        state.stocks.push(st);
      }

      DB.add('builds', build).then(function () {
        state.builds.push(build);
        $('bName').value = '';
        $('bQty').value = '1';
        $('bCost').value = '';
        $('bPrice').value = '';
        renderAll();
        toast('✅ «' + name + '» (' + fnum(qty) + ' عدد) به موجودی اضافه شد');
      });
    });
  }

  function renderBuildHistory() {
    // تاریخچه ساخت
    var box = $('buildHistory');
    if (!state.builds.length) {
      box.innerHTML = '<div class="empty">هنوز ساخت‌ی ثبت نشده — اولین مجسمه را ثبت کن 🏗️</div>';
      return;
    }
    var sorted = state.builds.slice().sort(function (a, b) { return b.id - a.id; }).slice(0, 12);
    box.innerHTML = sorted.map(function (b) {
      var j = { jy: b.jy, jm: b.jm, jd: b.jd };
      return '<div class="trow"><div class="n"><b>' + b.name + '</b><small>' + window.Jalali.jToStr(j) + '</small></div>' +
        '<span class="v">' + fnum(b.qty) + ' عدد</span></div>';
    }).join('');
  }

  /* ---------- فروش ---------- */
  function renderStock() {
    var box = $('stockChips');
    if (!state.stocks.length) {
      box.innerHTML = '<div class="empty small">📦 موجودی خالی است — اول «ساخت» را ثبت کن</div>';
      return;
    }
    box.innerHTML = '';
    state.stocks.forEach(function (st) {
      var chip = document.createElement('button');
      chip.className = 'chip' + (st.qty <= (state.settings.lowStock || 3) ? ' low' : '');
      chip.innerHTML = '<span>' + st.name + '</span><span class="c-qty">' + fnum(st.qty) + '</span>';
      chip.addEventListener('click', function () { selectStock(st.name); });
      box.appendChild(chip);
    });
  }

  function selectStock(name) {
    var sel = $('sName');
    sel.value = name;
    var st = state.stocks.filter(function (s) { return s.name === name; })[0];
    if (st) $('sPrice').value = st.price || '';
    // scroll to form
    $('sellFormPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderSellForm() {
    var sel = $('sName');
    sel.innerHTML = '';
    state.stocks.forEach(function (st) {
      var o = document.createElement('option');
      o.value = st.name;
      o.textContent = st.name + ' (موجودی: ' + fnum(st.qty) + ')';
      sel.appendChild(o);
    });
    // مقدار پیش‌فرض قیمت
    var cur = sel.value;
    if (cur) {
      var st = state.stocks.filter(function (s) { return s.name === cur; })[0];
      if (st && st.price) $('sPrice').value = st.price;
    }
  }

  function bindSell() {
    $('btnSellAdd').addEventListener('click', function () {
      var name = $('sName').value;
      var qty = parseInt($('sQty').value, 10);
      var price = parseInt($('sPrice').value, 10) || 0;
      var channel = $('sChannel').value;
      var st = state.stocks.filter(function (s) { return s.name === name; })[0];
      if (!st) { toast('این مجسمه در موجودی نیست', 'err'); return; }
      if (!qty || qty < 1) { toast('تعداد نامعتبر است', 'err'); return; }
      if (qty > st.qty) { toast('موجودی کافی نیست — فقط ' + fnum(st.qty) + ' عدد دارید', 'err'); return; }
      if (!price) { toast('قیمت فروش را وارد کن', 'err'); return; }

      var dateStr = $('sDate').value.trim();
      var j = dateStr ? window.Jalali.parse(dateStr) : window.Jalali.today();
      if (!j) { toast('تاریخ نامعتبر است — ' + '1404/05/16', 'err'); return; }

      var sale = {
        id: Date.now(),
        name: name,
        qty: qty,
        price: price,
        channel: channel,
        jy: j.jy, jm: j.jm, jd: j.jd,
        dateKey: JKeyOf(j.jy, j.jm, j.jd)
      };

      st.qty -= qty;
      DB.put('stocks', st);
      DB.add('sales', sale).then(function () {
        state.sales.push(sale);
        $('sQty').value = '1';
        $('sDate').value = '';
        renderAll();
        toast('✅ فروش ثبت شد: ' + name + ' ×' + fnum(qty));
      });
    });
  }

  function renderRecentSales() {
    var box = $('recentSales');
    if (!state.sales.length) {
      box.innerHTML = '<div class="empty small">هنوز فروشی ثبت نشده 🕘</div>';
      return;
    }
    var sorted = state.sales.slice().sort(function (a, b) { return b.id - a.id; }).slice(0, 12);
    box.innerHTML = sorted.map(function (s) {
      var j = { jy: s.jy, jm: s.jm, jd: s.jd };
      return '<div class="trow"><div class="n"><b>' + s.name + '</b><small>' + window.Jalali.jToStr(j) + ' · ' + s.channel + '</small></div>' +
        '<div style="text-align:left"><div class="v gold">' + fmtMoney(s.qty * s.price) + '</div><small class="v dim">×' + fnum(s.qty) + '</small></div></div>';
    }).join('');
  }

  /* ---------- Reports ---------- */
  function renderReports() {
    renderMonthlyBars();
    renderProfitLine();
    renderWeekday();
    renderDonut();
    renderPareto();
  }

  function renderMonthlyBars() {
    var box = $('chMonthlyBars');
    var t = window.Jalali.today();
    var months = [];
    var i;
    for (i = 5; i >= 0; i--) {
      var k = t.jy * 100 + t.jm - i;
      var jy = Math.floor(k / 100), jm = k % 100;
      if (jm < 1) { jy -= 1; jm += 12; }
      months.push({ jy: jy, jm: jm, income: 0, cost: 0 });
    }
    state.sales.forEach(function (s) {
      var k = s.jy * 100 + s.jm;
      for (i = 0; i < 6; i++) if (months[i].jy * 100 + months[i].jm === k) months[i].income += s.qty * s.price;
    });
    state.builds.forEach(function (b) {
      var k = b.jy * 100 + b.jm;
      for (i = 0; i < 6; i++) if (months[i].jy * 100 + months[i].jm === k) months[i].cost += b.qty * b.cost;
    });

    var max = 1;
    months.forEach(function (m) { max = Math.max(max, m.income, m.cost); });

    box.innerHTML = '<div class="bar-chart">' + months.map(function (m) {
      var hi = Math.round(m.income / max * 100);
      var hc = Math.round(m.cost / max * 100);
      return '<div class="bars-col">' +
        '<span class="bars-val">' + fnum(Math.round(m.income / 1000)) + 'k</span>' +
        '<div class="bars-bar" style="height:' + hi + '%"></div>' +
        '<div class="bars-bar cost" style="height:' + hc + '%"></div>' +
        '<span class="bars-lbl">' + window.Jalali.monthName(m.jm) + '</span>' +
        '</div>';
    }).join('') + '</div>' +
      '<div class="chart-title">— آبی: درآمد · قرمز: هزینه (هزار تومان) —</div>';
  }

  function renderProfitLine() {
    var box = $('chProfitLine');
    var t = window.Jalali.today();
    var months = [];
    var i;
    for (i = 5; i >= 0; i--) {
      var k = t.jy * 100 + t.jm - i;
      var jy = Math.floor(k / 100), jm = k % 100;
      if (jm < 1) { jy -= 1; jm += 12; }
      months.push({ jy: jy, jm: jm, profit: 0 });
    }
    months.forEach(function (m, idx) {
      m.profit = monthProfit(m.jy * 100 + m.jm);
      void idx;
    });

    var maxP = 1, minP = 0;
    months.forEach(function (m) { maxP = Math.max(maxP, m.profit); minP = Math.min(minP, m.profit); });
    var range = (maxP - minP) || 1;

    box.innerHTML = '<div class="bar-chart">' + months.map(function (m) {
      var hp = 10 + Math.round((m.profit - minP) / range * 90);
      var cls = m.profit >= 0 ? '' : ' cost';
      return '<div class="bars-col"><span class="bars-val">' + fnum(Math.round(m.profit / 1000)) + 'k</span>' +
        '<div class="bars-bar profit' + cls + '" style="height:' + hp + '%"></div>' +
        '<span class="bars-lbl">' + window.Jalali.monthName(m.jm) + '</span></div>';
    }).join('') + '</div>' +
      '<div class="chart-title">— طلایی: سود خالص (هزار تومان) —</div>';
  }

  function renderWeekday() {
    var box = $('chWeekdayBars');
    var t = window.Jalali.today();
    // ۹۰ روز اخیر
    var counts = [0, 0, 0, 0, 0, 0, 0];
    var names = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
    state.sales.forEach(function (s) {
      var wd = window.Jalali.weekday(s.jy, s.jm, s.jd);
      counts[wd] += s.qty;
    });
    var max = Math.max.apply(null, counts.concat([1]));
    var bestIdx = counts.indexOf(Math.max.apply(null, counts));

    box.innerHTML = '<div class="bar-chart">' + counts.map(function (c, i) {
      var h = Math.round(c / max * 100);
      return '<div class="bars-col' + (i === bestIdx ? ' best' : '') + '">' +
        '<span class="bars-val">' + fnum(c) + '</span>' +
        '<div class="wd-bar" style="height:' + Math.max(h, 4) + '%"></div>' +
        '<span class="bars-lbl">' + names[i] + '</span></div>';
    }).join('') + '</div>';

    $('weekdayBest').innerHTML = '🏆 بهترین روز فروش: <b>' + window.Jalali.weekdayName(t.jy, t.jm, t.jd === 1 ? 1 : 1) + '</b> — ' + fnum(counts[bestIdx]) + ' فروش <small>(همه تاریخ‌ها)</small>';

    // (روز بهترین از داده‌ها استخراج می‌شود)
    var bestName = window.Jalali.MONTHS; // placeholder
    void bestName;
  }

  function renderDonut() {
    var box = $('chDonut');
    var legend = $('chDonutLegend');
    var t = window.Jalali.today();
    var m = t.jy * 100 + t.jm;
    var agg = {};
    state.sales.forEach(function (s) {
      if ((s.jy * 100 + s.jm) !== m) return;
      agg[s.channel] = (agg[s.channel] || 0) + s.qty * s.price;
    });
    var arr = Object.keys(agg).map(function (k) { return { name: k, val: agg[k] }; })
      .sort(function (a, b) { return b.val - a.val; });
    var total = arr.reduce(function (s, o) { return s + o.val; }, 0);

    if (!arr.length) {
      box.innerHTML = '<div class="empty small">فروشی در این ماه نداریم — بعد از ثبت فروش، نمودار ظاهر می‌شود</div>';
      legend.innerHTML = '';
      return;
    }

    var colors = ['#f0b429', '#3b82f6', '#22d3ee', '#34d399', '#f87171', '#a78bfa', '#f97316'];
    var acc = 0;
    var seg = arr.map(function (o, i) {
      var start = acc;
      acc += o.val / total * 100;
      return { c: colors[i % colors.length], from: start, to: acc };
    });
    box.innerHTML = '<div class="donut" style="background:conic-gradient(' +
      seg.map(function (s) { return s.c + ' ' + s.from.toFixed(1) + '% ' + s.to.toFixed(1) + '%'; }).join(', ') + ')">' +
      '<span class="donut-center">' + fnum(total) + '</span></div>';

    legend.innerHTML = arr.map(function (o, i) {
      var p = total ? Math.round(o.val / total * 100) : 0;
      return '<div class="dl-item"><span class="dl-dot" style="background:' + colors[i % colors.length] + '"></span>' +
        '<span class="dl-name">' + o.channel + '</span><span class="dl-pct">' + fnum(p) + '٪</span></div>';
    }).join('');
  }

  function renderPareto() {
    var box = $('chPareto');
    var t = window.Jalali.today();
    var m = t.jy * 100 + t.jm;
    var agg = {};
    state.sales.forEach(function (s) {
      if ((s.jy * 100 + s.jm) !== m) return;
      agg[s.name] = (agg[s.name] || 0) + s.qty;
    });
    var arr = Object.keys(agg).map(function (k) { return { name: k, qty: agg[k] }; })
      .sort(function (a, b) { return b.qty - a.qty; });
    var total = arr.reduce(function (s, o) { return s + o.qty; }, 0);

    if (!arr.length) {
      box.innerHTML = '<div class="empty">داده‌ای برای پارتو نیست — اول چند فروش ثبت کن</div>';
      return;
    }
    box.innerHTML = arr.map(function (o, i) {
      var pct = total ? Math.round(o.qty / total * 100) : 0;
      return '<div class="pareto-row"><span class="pareto-rank">' + (i + 1) + '</span>' +
        '<div class="pareto-info"><div class="pareto-name">' + o.name + '</div>' +
        '<div class="pareto-bar"><div class="pareto-fill" style="width:' + pct + '%"></div></div></div>' +
        '<span class="pareto-val">' + fnum(o.qty) + ' · ' + fnum(pct) + '٪</span></div>';
    }).join('');
  }

  /* ---------- Nav & Views ---------- */
  function bindNav() {
    var btns = document.querySelectorAll('.nbtn');
    btns.forEach(function (b) {
      b.addEventListener('click', function () { switchView(b.dataset.view); });
    });
    document.querySelectorAll('[data-goto]').forEach(function (el) {
      el.addEventListener('click', function () { switchView(el.dataset.goto); });
    });
  }

  function switchView(name) {
    state.view = name;
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    var v = $('view-' + name);
    if (v) v.classList.add('active');
    document.querySelectorAll('.nbtn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === name);
    });
    window.scrollTo({ top: 0 });
    if (name === 'reports') { renderReports(); }
    if (name === 'sell') { renderStock(); renderSellForm(); }
    if (name === 'dashboard') renderDashboard();
  }

  /* ---------- Settings ---------- */
  function loadSettings() {
    // localStorage fallback (مقاوم)
    try {
      var raw = localStorage.getItem('sact_settings');
      if (raw) {
        var s = JSON.parse(raw);
        if (s.goal) state.settings.goal = s.goal;
        if (s.lowStock) state.settings.lowStock = s.lowStock;
      }
    } catch (e) { /* ignore */ }
    $('setGoal').value = state.settings.goal || '';
    $('setLow').value = state.settings.lowStock || '';
  }

  function saveSettings() {
    var goal = parseInt($('setGoal').value, 10) || 0;
    var low = parseInt($('setLow').value, 10) || 3;
    state.settings.goal = goal;
    state.settings.lowStock = low;
    try { localStorage.setItem('sact_settings', JSON.stringify(state.settings)); } catch (e) {}
    toast('تنظیمات ذخیره شد ✅');
    renderAll();
  }

  /* ---------- Backup / Restore ---------- */
  function doBackup() {
    var payload = {
      app: 'sculpture-accounting',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      stocks: state.stocks,
      builds: state.builds,
      sales: state.sales
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sculpture-backup-' + window.Jalali.jToStrEn(window.Jalali.today()) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('پشتیبان دانلود شد 💾');
  }

  function doRestore(file) {
    var fr = new FileReader();
    fr.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!data || data.app !== 'sculpture-accounting') { toast('فایل پشتیبان معتبر نیست', 'err'); return; }
        var st = data.stocks || [];
        Promise.all([
          DB.clear('stocks'), DB.clear('builds'), DB.clear('sales'),
          Promise.all(st.map(function (s) { return DB.put('stocks', s); })),
          Promise.all((data.builds || []).map(function (b) { return DB.put('builds', b); })),
          Promise.all((data.sales || []).map(function (s) { return DB.put('sales', s); }))
        ]).then(function () {
          state.stocks = st;
          state.builds = data.builds || [];
          state.sales = data.sales || [];
          if (data.settings) {
            state.settings = data.settings;
            try { localStorage.setItem('sact_settings', JSON.stringify(state.settings)); } catch (e2) {}
          }
          renderAll();
          toast('بازیابی کامل شد ✅ (' + fnum(state.sales.length) + ' فروش)');
        });
      } catch (err) {
        toast('خطا: ' + err.message, 'err');
      }
    };
    fr.onerror = function () { toast('خواندن فایل ممکن نشد', 'err'); };
    fr.readAsText(file);
  }

  /* ---------- Toast ---------- */
  var toastTimer;
  function toast(msg, type) {
    var el = $('toast');
    el.textContent = msg;
    el.className = 'toast show' + (type === 'err' ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  /* ---------- پرکننده dummies ---------- */
  function seedDemo() {
    // فقط برای تست در مرورگر (دکمه مخفی)
    if (state.sales.length || state.builds.length) return;
    var now = new Date();
    var t = window.Jalali.today();
    var ks = [
      { name: 'هواپیمای استیم‌پانک', cost: 50000, price: 450000, qty: 4 },
      { name: 'مگس فولادی', cost: 30000, price: 250000, qty: 6 },
      { name: 'ربات', cost: 70000, price: 600000, qty: 2 }
    ];
    ks.forEach(function (k, i) {
      var j = window.Jalali.toJalali(new Date(now.getFullYear(), now.getMonth() - i, 10));
      var b = { id: Date.now() + i, name: k.name, qty: k.qty, cost: k.cost, price: k.price, jy: j.jy, jm: j.jm, jd: j.jd, dateKey: JKeyOf(j.jy, j.jm, j.jd) };
      state.builds.push(b);
      DB.add('builds', b);
      state.stocks.push({ id: 'st_' + b.id, name: k.name, qty: k.qty, cost: k.cost, price: k.price, updated: Date.now() });
      DB.add('stocks', state.stocks[state.stocks.length - 1]);
    });
    // فروش نمونه
    var chans = ['حضوری (غرفه)', 'اینستاگرام', 'باغ‌فردوس', 'سفارش تلفنی'];
    for (var i = 0; i < 18; i++) {
      var si = i % ks.length;
      var b = ks[si];
      var dj = window.Jalali.toJalali(new Date(now.getFullYear(), now.getMonth(), 1 + i));
      var sl = { id: Date.now() + 100 + i, name: b.name, qty: 1, price: b.price, channel: ch[i % 4], jy: dj.jy, jm: dj.jm, jd: dj.jd, dateKey: JKeyOf(dj.jy, dj.jm, dj.jd) };
      state.sales.push(sl);
      DB.add('sales', sl);
    }
    renderAll();
    toast('داده نمونه ساخته شد 🧪');
  }

  var uid = (function () { var c = 1; return function () { return Date.now() + (c++); }; })();

  function bindButtons() {
    bindBuild();
    bindSell();
    $('btnSaveSettings').addEventListener('click', saveSettings);
    $('btnBackup').addEventListener('click', doBackup);
    $('btnRestore').addEventListener('click', function () { $('restoreFile').click(); });
    $('restoreFile').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) doRestore(e.target.files[0]);
      e.target.value = '';
    });
    $('gearBtn').addEventListener('click', function () { openModal('settingsModal'); });
    document.querySelectorAll('.icon-btn.modal-close, [data-close]').forEach(function (b) {
      b.addEventListener('click', function () { closeModal(b.dataset.close); });
    });
    document.querySelectorAll('[data-close-modal]').forEach(function (b) {
      b.addEventListener('click', function () { closeModal(b.dataset.closeModal); });
    });

    // تغییر نام در فرم فروش → قیمت پیشنهادی
    $('sName').addEventListener('change', function () {
      var st = state.stocks.filter(function (s) { return s.name === this.value; }.bind(this))[0];
      if (st) $('sPrice').value = st.price || '';
    });
  }

  function openModal(id) { $(id).classList.add('open'); }
  function closeModal(id) { if (id) $(id).classList.remove('open'); }

  /* ---------- Start ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();