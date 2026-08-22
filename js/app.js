/* ============================================================
 * app.js — مجسمه‌حساب v3.0
 * ساخت، انبار، فروش، ویرایش/حذف، تقویم شمسی، گزارش تعاملی
 * ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var J = window.Jalali;

  /* شناسه یکتا و امن — جلوگیری از کولیشن */
  function newId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  var state = {
    stocks: [], builds: [], sales: [],
    settings: { goal: 10000000, lowStock: 3 },
    view: 'dashboard',
    editTarget: null,
    calTargetKey: null,
    calYear: 0, calMonth: 0
  };

  var CHANNELS = ['حضوری (غرفه)', 'سفارش تلفنی', 'اینستاگرام', 'باغ‌فردوس', 'سایر'];

  /* ---------- Init ---------- */
  function init() {
    if (!window.Jalali) { console.error('jalali.js missing'); return; }
    hideSplash();
    bindNav();
    bindButtons();
    bindCal();
    bindEdit();

    Promise.all([DB.getAll('stocks'), DB.getAll('builds'), DB.getAll('sales')])
      .then(function (res) {
        state.stocks = res[0] || [];
        state.builds = res[1] || [];
        state.sales = res[2] || [];
        normalizeDates();
        loadSettings();
        renderAll();
      })
      .catch(function (e) { toast('خطا: ' + e.message, 'err'); });
  }

  function hideSplash() {
    var sp = $('splash');
    if (sp) setTimeout(function () { sp.classList.add('hidden'); }, 600);
  }

  function normalizeDates() {
    state.builds.forEach(function (b) { if (!b.dateKey) b.dateKey = JKeyOf(b.jy, b.jm, b.jd); });
    state.sales.forEach(function (s) { if (!s.dateKey) s.dateKey = JKeyOf(s.jy, s.jm, s.jd); });
  }

  function JKeyOf(jy, jm, jd) { return jy * 10000 + jm * 100 + jd; }
  function monthOf(x) { return (x.jy || 0) * 100 + (x.jm || 0); }

  /* ---------- Format ---------- */
  function fnum(x) {
    if (x === null || x === undefined || isNaN(x)) return '۰';
    return J.faNum(Math.round(x).toLocaleString('en-US').replace(/,/g, '٬'));
  }
  function fmtMoney(x) { return fnum(x) + ' تومان'; }

  /* قالب‌بندی زنده اعداد با جداکننده هزارگان — ورودی قیمت */
  function bindMoneyInput(input) {
    if (!input) return;
    input.addEventListener('input', function () {
      var digits = input.value.replace(/[^\d]/g, '');
      if (!digits) { input.value = ''; return; }
      var num = parseInt(digits, 10);
      if (isNaN(num)) return;
      input.value = num.toLocaleString('en-US');
    });
    input.addEventListener('blur', function () {
      input.value = input.value.replace(/[^\d]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    });
  }

  /* تبدیل اعداد با جداکننده به عدد — برای ذخیره */
  function parseNum(str) {
    return parseInt(String(str || '').replace(/[^\d]/g, ''), 10) || 0;
  }

  /* ---------- Render All ---------- */
  function renderAll() {
    renderHeaderDate();
    renderDashboard();
    renderBuildHistory();
    renderBuildsChart();
    renderStockView();
    renderStockChips();
    renderSellForm();
    renderRecentSales();
    renderReports();
    renderLastBackupInfo();
  }

  function renderHeaderDate() {
    var t = J.today();
    $('hdrDate').textContent = J.fullLabel(t);
    $('buildDateToday').textContent = 'امروز: ' + J.jToStr(t);
    $('sellDateToday').textContent = 'امروز: ' + J.jToStr(t);
    $('stockDate').textContent = J.jToStr(t);
    var todayStr = J.jToStrEn({ jy: t.jy, jm: t.jm, jd: t.jd });
    if ($('bDate') && !$('bDate').value) $('bDate').value = todayStr;
    if ($('sDate') && !$('sDate').value) $('sDate').value = todayStr;
  }

  /* ================= DASHBOARD ================= */
  function renderDashboard() {
    var t = J.today();
    var m = monthOf(t);
    var income = 0, sold = 0, stock = 0, cost = 0;
    state.sales.forEach(function (s) { if (monthOf(s) === m) { income += s.qty * s.price; sold += s.qty; } });
    state.builds.forEach(function (b) { if (monthOf(b) === m) cost += b.qty * b.cost; });
    state.stocks.forEach(function (st) { stock += st.qty; });
    var profit = income - cost;

    // محاسبه بهترین روز هفته (از کل تاریخچه)
    var counts = [0,0,0,0,0,0,0];
    state.sales.forEach(function (s) { counts[J.weekday(s.jy, s.jm, s.jd)] += s.qty; });
    var total = counts.reduce(function (a,b) { return a+b; }, 0);
    var bestIdx = counts.indexOf(Math.max.apply(null, counts));
    var bestDayNames = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
    var bestDayName = total ? bestDayNames[bestIdx] : '—';

    $('kpiIncome').textContent = fmtMoney(income);
    $('kpiSold').textContent = fnum(sold) + ' عدد';
    $('kpiStock').textContent = fnum(stock) + ' عدد';
    $('kpiBestDay').textContent = bestDayName;

    var h = new Date().getHours();
    $('greetText').textContent = h < 12 ? 'صبح بخیر استاد' : (h < 17 ? 'ظهر بخیر استاد' : 'شب بخیر استاد');
    $('greetSub').textContent = J.fullLabel(t);

    renderDashTopSellers(m);
  }

  function renderDashTopSellers(m) {
    var box = $('dashTopSellers');
    var agg = {};
    state.sales.forEach(function (s) {
      if (monthOf(s) !== m) return;
      agg[s.name] = (agg[s.name] || 0) + s.qty;
    });
    var arr = Object.keys(agg).map(function (k) { return { name: k, qty: agg[k] }; })
      .sort(function (a, b) { return b.qty - a.qty; }).slice(0, 3);
    if (!arr.length) {
      box.innerHTML = '<div class="empty small">هنوز فروشی ثبت نشده — اولین فروش را ثبت کن</div>';
      return;
    }
    box.innerHTML = arr.map(function (r, i) {
      return '<div class="trow"><div class="n"><span class="rank-badge">' + (i + 1) + '</span><b>' + r.name + '</b></div><span class="v gold">' + fnum(r.qty) + ' فروش</span></div>';
    }).join('');
  }

  /* ================= BUILD ================= */
  function bindBuild() {
    $('btnBuild').addEventListener('click', function () {
      var name = $('bName').value.trim();
      var qty = parseInt($('bQty').value, 10);
      var price = parseNum($('bPrice').value);
      if (!name) { toast('نام مجسمه را وارد کن', 'err'); return; }
      if (!qty || qty < 1) { toast('تعداد نامعتبر است', 'err'); return; }
      var dateStr = $('bDate').value.trim();
      var j = dateStr ? J.parse(dateStr) : J.today();
      if (!j) { toast('تاریخ نامعتبر', 'err'); return; }

      var build = {
        id: newId(),
        name: name, qty: qty, price: price,
        jy: j.jy, jm: j.jm, jd: j.jd,
        dateKey: JKeyOf(j.jy, j.jm, j.jd)
      };

      var st = state.stocks.filter(function (s) { return s.name === name; })[0];
      if (st) {
        st.qty += qty; st.price = price; st.updated = Date.now();
        DB.put('stocks', st);
      } else {
        st = { id: 'st_' + build.id, name: name, qty: qty, price: price, updated: Date.now() };
        DB.add('stocks', st);
        state.stocks.push(st);
      }

      DB.add('builds', build).then(function () {
        state.builds.push(build);
        $('bName').value = ''; $('bQty').value = '1'; $('bPrice').value = ''; $('bDate').value = J.jToStrEn(J.today());
        renderAll();
        toast('✅ «' + name + '» ×' + fnum(qty) + ' به انبار اضافه شد');
      });
    });
  }

  function renderBuildHistory() {
    var box = $('buildHistory');
    if (!state.builds.length) {
      box.innerHTML = '<div class="empty">هنوز ساختی ثبت نشده</div>';
      return;
    }
    var sorted = state.builds.slice().sort(function (a, b) { return String(b.id) > String(a.id) ? 1 : -1; }).slice(0, 20);
    box.innerHTML = sorted.map(function (b) {
      var j = { jy: b.jy, jm: b.jm, jd: b.jd };
      return '<div class="trow clickable" data-type="build" data-id="' + b.id + '">' +
        '<div class="n"><b>' + b.name + '</b><small>' + J.jToStr(j) + '</small></div>' +
        '<span class="v"><span class="v green">+' + fnum(b.qty) + '</span> <svg class="edit-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></span></div>';
    }).join('');
    box.querySelectorAll('.trow.clickable').forEach(function (row) {
      row.addEventListener('click', function () {
        openEditModal({ type: row.dataset.type, id: row.dataset.id });
      });
    });
  }

  /* نمودار ساخت ماهانه (پایین صفحه ساخت) */
  function renderBuildsChart() {
    var box = $('chBuildsMonthly');
    var t = J.today();
    var months = [];
    var i;
    var abs = t.jy * 12 + (t.jm - 1); // شماره ماه مطلق
    for (i = 5; i >= 0; i--) {
      var k = abs - i;
      months.push({ jy: Math.floor(k / 12), jm: (k % 12) + 1, built: 0 });
    }
    state.builds.forEach(function (b) {
      var k = b.jy * 100 + b.jm;
      for (i = 0; i < 6; i++) if (months[i].jy * 100 + months[i].jm === k) months[i].built += b.qty;
    });
    var max = Math.max.apply(null, months.map(function (m) { return m.built; }).concat([1]));

    if (!state.builds.length) {
      box.innerHTML = '<div class="empty small">بعد از اولین ساخت، نمودار ماهانه اینجا می‌آید</div>';
      return;
    }
    box.innerHTML = '<div class="bar-chart">' + months.map(function (m) {
      var h = Math.max(Math.round(m.built / max * 100), 3);
      return '<div class="bars-col">' +
        '<span class="bars-val">' + fnum(m.built) + '</span>' +
        '<div class="bars-bar build-color" style="height:' + h + '%"></div>' +
        '<span class="bars-lbl">' + J.monthName(m.jm) + '</span></div>';
    }).join('') + '</div>';
  }

  /* ================= STOCK ================= */
  function renderStockView() {
    var grid = $('stockCards');
    if (!state.stocks.length) {
      grid.innerHTML = '<div class="empty">انبار خالی است — اول ساخت ثبت کن</div>';
      return;
    }
    var sorted = state.stocks.slice().sort(function (a, b) { return b.qty - a.qty; });
    grid.innerHTML = sorted.map(function (st) {
      var low = st.qty <= (state.settings.lowStock || 3);
      return '<div class="stock-card' + (low ? ' low' : '') + '">' +
        '<div class="sc-top"><span class="sc-name">' + st.name + '</span>' +
        (low ? '<span class="sc-warn">کم</span>' : '<span class="sc-ok">موجود</span>') + '</div>' +
        '<div class="sc-qty">' + fnum(st.qty) + '</div>' +
        '<div class="sc-sub">عدد در انبار</div>' +
        (st.price ? '<div class="sc-price">' + fmtMoney(st.price) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  function renderStockChips() {
    var box = $('stockChips');
    if (!state.stocks.length) {
      box.innerHTML = '<div class="empty small">انبار خالی است</div>';
      return;
    }
    box.innerHTML = '';
    state.stocks.forEach(function (st) {
      var chip = document.createElement('button');
      chip.className = 'chip';
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
    $('sellFormPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ================= SELL ================= */
  function renderSellForm() {
    var sel = $('sName');
    sel.innerHTML = '';
    state.stocks.forEach(function (st) {
      var o = document.createElement('option');
      o.value = st.name;
      o.textContent = st.name + ' (' + fnum(st.qty) + ' عدد)';
      sel.appendChild(o);
    });
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
      var price = parseNum($('sPrice').value);
      var channel = $('sChannel').value;
      var st = state.stocks.filter(function (s) { return s.name === name; })[0];
      if (!st) { toast('این مجسمه در انبار نیست', 'err'); return; }
      if (!qty || qty < 1) { toast('تعداد نامعتبر', 'err'); return; }
      if (qty > st.qty) { toast('موجودی کافی نیست — فقط ' + fnum(st.qty), 'err'); return; }
      if (!price) { toast('قیمت فروش را وارد کن', 'err'); return; }
      var dateStr = $('sDate').value.trim();
      var j = dateStr ? J.parse(dateStr) : J.today();
      if (!j) { toast('تاریخ نامعتبر', 'err'); return; }

      var sale = {
        id: newId(),
        name: name, qty: qty, price: price, channel: channel,
        jy: j.jy, jm: j.jm, jd: j.jd,
        dateKey: JKeyOf(j.jy, j.jm, j.jd)
      };
      st.qty -= qty;
      DB.put('stocks', st);
      DB.add('sales', sale).then(function () {
        state.sales.push(sale);
        $('sQty').value = '1'; $('sDate').value = J.jToStrEn(J.today());
        renderAll();
        toast('✅ فروش ثبت شد: ' + name + ' ×' + fnum(qty));
      });
    });
    $('sName').addEventListener('change', function () {
      var st = state.stocks.filter(function (s) { return s.name === $('sName').value; })[0];
      if (st) $('sPrice').value = st.price || '';
    });
  }

  function renderRecentSales() {
    var box = $('recentSales');
    if (!state.sales.length) {
      box.innerHTML = '<div class="empty small">هنوز فروشی ثبت نشده</div>';
      return;
    }
    var sorted = state.sales.slice().sort(function (a, b) { return String(b.id) > String(a.id) ? 1 : -1; }).slice(0, 15);
    box.innerHTML = sorted.map(function (s) {
      var j = { jy: s.jy, jm: s.jm, jd: s.jd };
      return '<div class="trow clickable" data-type="sale" data-id="' + s.id + '">' +
        '<div class="n"><b>' + s.name + '</b><small>' + J.jToStr(j) + ' · ' + (s.channel || '') + '</small></div>' +
        '<span class="v gold">' + fmtMoney(s.qty * s.price) + ' <svg class="edit-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></span></div>';
    }).join('');
    box.querySelectorAll('.trow.clickable').forEach(function (row) {
      row.addEventListener('click', function () { openEditModal({ type: row.dataset.type, id: row.dataset.id }); });
    });
  }

  /* ================= EDIT / DELETE ================= */
  function openEditModal(target) {
    state.editTarget = target;
    var fields = $('editFields');
    fields.innerHTML = '';
    if (target.type === 'build') {
      var b = state.builds.filter(function (x) { return String(x.id) === String(target.id); })[0];
      if (!b) { toast('ردیف پیدا نشد', 'err'); return; }
      $('editModalTitle').textContent = 'ویرایش ساخت — ' + b.name;
      fields.innerHTML =
        makeField('نام', 'eName', 'text', b.name) +
        makeField('تعداد', 'eQty', 'number', b.qty, 1) +
        makeField('قیمت فروش', 'ePrice', 'number', b.price) +
        makeField('تاریخ (شمسی)', 'eDate', 'text', J.jToStrEn({ jy: b.jy, jm: b.jm, jd: b.jd }));
    } else {
      var s = state.sales.filter(function (x) { return String(x.id) === String(target.id); })[0];
      if (!s) { toast('ردیف پیدا نشد', 'err'); return; }
      $('editModalTitle').textContent = 'ویرایش فروش — ' + s.name;
      var opts = CHANNELS.map(function (c) { return '<option' + (c === s.channel ? ' selected' : '') + '>' + c + '</option>'; }).join('');
      fields.innerHTML =
        makeField('نام', 'eName', 'text', s.name) +
        makeField('تعداد', 'eQty', 'number', s.qty, 1) +
        makeField('قیمت هر عدد', 'ePrice', 'number', s.price) +
        makeField('تاریخ (شمسی)', 'eDate', 'text', J.jToStrEn({ jy: s.jy, jm: s.jm, jd: s.jd })) +
        '<label class="f-full">نحوه فروش<select id="eChannel" class="input">' + opts + '</select></label>';
      $('eChannel').value = s.channel;
    }
    $('editModal').classList.add('open');
    bindMoneyInput($('ePrice'));
  }

  function makeField(lbl, id, type, val, min) {
    if (id === 'eQty') {
      return '<label class="f-full">' + lbl +
        '<div class="stepper" data-target="eQty">' +
        '<button type="button" class="stp-btn" data-dir="-1">\u2212</button>' +
        '<input id="' + id + '" class="stp-input" type="number" value="' + (val === undefined ? '1' : val) + '" min="1" readonly>' +
        '<button type="button" class="stp-btn" data-dir="1">+</button>' +
        '</div></label>';
    }
    var isMoney = (id === 'ePrice');
    if (isMoney) {
      var v = (val === undefined || val === null || val === '') ? '' : Number(val).toLocaleString('en-US');
      return '<label class="f-full">' + lbl +
        '<input id="' + id + '" class="input" type="text" inputmode="numeric" dir="ltr" style="text-align:left" value="' + v + '"></label>';
    }
    return '<label class="f-full">' + lbl +
      '<input id="' + id + '" class="input" type="' + type + '" value="' + (val === undefined ? '' : val) + '"' +
      (min ? ' min="' + min + '"' : '') + '></label>';
  }

  function bindEdit() {
    $('editSave').addEventListener('click', function () {
      var t = state.editTarget;
      if (!t) return;
      var name = $('eName').value.trim();
      var qty = parseInt($('eQty').value, 10);
      var dateStr = $('eDate').value.trim();
      if (!name || !qty || qty < 1) { toast('مقادیر نامعتبر', 'err'); return; }
      var j = dateStr ? J.parse(dateStr) : J.today();
      if (!j) { toast('تاریخ نامعتبر', 'err'); return; }

      if (t.type === 'build') {
        var b = state.builds.filter(function (x) { return String(x.id) === String(t.id); })[0];
        if (!b) return;
        var oldQty = b.qty;
        var oldName = b.name;
        var price = parseNum($('ePrice').value);
        b.name = name; b.qty = qty; b.price = price;
        b.jy = j.jy; b.jm = j.jm; b.jd = j.jd; b.dateKey = JKeyOf(j.jy, j.jm, j.jd);
        DB.put('builds', b);
        if (oldName !== name) {
          moveStock(oldName, name, oldQty, qty, price);
        } else {
          adjustStock(name, qty - oldQty, price);
        }
      } else {
        var s = state.sales.filter(function (x) { return String(x.id) === String(t.id); })[0];
        if (!s) return;
        var oldQty2 = s.qty;
        var oldName2 = s.name;
        var price2 = parseNum($('ePrice').value);
        var ch = $('eChannel') ? $('eChannel').value : s.channel;
        s.name = name; s.qty = qty; s.price = price2; s.channel = ch;
        s.jy = j.jy; s.jm = j.jm; s.jd = j.jd; s.dateKey = JKeyOf(j.jy, j.jm, j.jd);
        DB.put('sales', s);
        if (oldName2 !== name) {
          moveStockBySale(oldName2, name, oldQty2, qty);
        } else {
          adjustStock(name, -(qty - oldQty2));
        }
      }
      closeEdit();
      renderAll();
      toast('ذخیره شد');
    });

    $('editDelete').addEventListener('click', function () {
      var t = state.editTarget;
      if (!t) return;
      if (t.type === 'build') {
        var b = state.builds.filter(function (x) { return String(x.id) === String(t.id); })[0];
        if (b) {
          DB.del('builds', b.id);
          adjustStock(b.name, -b.qty);
          state.builds = state.builds.filter(function (x) { return String(x.id) !== String(b.id); });
        }
      } else {
        var s = state.sales.filter(function (x) { return String(x.id) === String(t.id); })[0];
        if (s) {
          DB.del('sales', s.id);
          adjustStock(s.name, s.qty);
          state.sales = state.sales.filter(function (x) { return String(x.id) !== String(s.id); });
        }
      }
      closeEdit();
      renderAll();
      toast('حذف شد');
    });
    $('editClose').addEventListener('click', closeEdit);
  }

  function closeEdit() {
    $('editModal').classList.remove('open');
    state.editTarget = null;
  }

  function adjustStock(name, delta, price) {
    var st = state.stocks.filter(function (s) { return s.name === name; })[0];
    if (st) {
      st.qty += delta;
      if (st.qty < 0) st.qty = 0;
      if (price !== undefined) st.price = price;
      st.updated = Date.now();
      DB.put('stocks', st);
    } else if (delta > 0) {
      st = { id: 'st_' + Date.now(), name: name, qty: delta, price: price || 0, updated: Date.now() };
      DB.add('stocks', st);
      state.stocks.push(st);
    }
  }

  /* جابه‌جا کردن موجودی هنگام تغییر نام مجسمه (ویرایش ساخت) */
  function moveStock(oldName, newName, oldQty, newQty, price) {
    var stOld = state.stocks.filter(function (s) { return s.name === oldName; })[0];
    if (stOld) {
      stOld.qty = Math.max(0, stOld.qty - oldQty);
      stOld.updated = Date.now();
      DB.put('stocks', stOld);
    }
    var stNew = state.stocks.filter(function (s) { return s.name === newName; })[0];
    if (stNew) {
      stNew.qty += newQty;
      if (price !== undefined) stNew.price = price;
      stNew.updated = Date.now();
      DB.put('stocks', stNew);
    } else if (newQty > 0) {
      stNew = { id: 'st_' + Date.now(), name: newName, qty: newQty, price: price || 0, updated: Date.now() };
      DB.add('stocks', stNew);
      state.stocks.push(stNew);
    }
  }

  /* جابه‌جا کردن موجودی هنگام تغییر نام در ویرایش فروش */
  function moveStockBySale(oldName, newName, soldOld, soldNew) {
    var stOld = state.stocks.filter(function (s) { return s.name === oldName; })[0];
    if (stOld) {
      stOld.qty += soldOld;
      stOld.updated = Date.now();
      DB.put('stocks', stOld);
    }
    var stNew = state.stocks.filter(function (s) { return s.name === newName; })[0];
    if (stNew) {
      stNew.qty = Math.max(0, stNew.qty - soldNew);
      stNew.updated = Date.now();
      DB.put('stocks', stNew);
    }
  }

  /* ================= CALENDAR ================= */
  function bindCal() {
    $('bDateBtn').addEventListener('click', function () { openCalendar('bDate'); });
    $('sDateBtn').addEventListener('click', function () { openCalendar('sDate'); });
    $('calClose').addEventListener('click', function () { $('calModal').classList.remove('open'); });
    $('calPrev').addEventListener('click', function () { moveCal(-1); });
    $('calNext').addEventListener('click', function () { moveCal(1); });
    $('calToday').addEventListener('click', function () {
      var t = J.today();
      if (state.calTargetKey) $(state.calTargetKey).value = J.jToStrEn(t);
      $('calModal').classList.remove('open');
    });
  }

  function openCalendar(targetKey) {
    state.calTargetKey = targetKey;
    var input = $(targetKey);
    var j = input && input.value ? J.parse(input.value) : null;
    if (!j) j = J.today();
    state.calYear = j.jy; state.calMonth = j.jm;
    renderCalendar();
    $('calModal').classList.add('open');
  }

  function moveCal(d) {
    var m = state.calMonth + d;
    var y = state.calYear;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    state.calMonth = m; state.calYear = y;
    renderCalendar();
  }

  function renderCalendar() {
    $('calMonthLabel').textContent = J.monthName(state.calMonth) + ' ' + J.faNum(state.calYear);
    var grid = $('calGrid');
    grid.innerHTML = '';
    ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].forEach(function (d) {
      var h = document.createElement('div');
      h.className = 'cal-hd';
      h.textContent = d;
      grid.appendChild(h);
    });
    var days = (state.calMonth <= 6) ? 31 : 30;
    if (state.calMonth === 12 && !isLeap(state.calYear)) days = 29;
    var firstWd = J.weekday(state.calYear, state.calMonth, 1);
    for (var i = 0; i < firstWd; i++) grid.appendChild(document.createElement('div'));
    var today = J.today();
    for (var d = 1; d <= days; d++) {
      var cell = document.createElement('button');
      cell.className = 'cal-day';
      cell.textContent = J.faNum(d);
      if (d === today.jd && state.calMonth === today.jm && state.calYear === today.jy) cell.classList.add('today');
      (function (day) {
        cell.addEventListener('click', function () {
          var jsel = { jy: state.calYear, jm: state.calMonth, jd: day };
          if (state.calTargetKey) $(state.calTargetKey).value = J.jToStrEn(jsel);
          $('calModal').classList.remove('open');
        });
      })(d);
      grid.appendChild(cell);
    }
  }

  /* اسفند ماه ۱۲: ۳۰ روزه اگر کبیسه باشد.
   روش مطمئن: اگر بین ۲۹ اسفند تا ۱ فروردین سال بعد ۲ روز فاصله باشد → کبیسه */
  function isLeap(jy) {
    try {
      var g1 = J.toGregorian(jy, 12, 29);
      var g2 = J.toGregorian(jy + 1, 1, 1);
      return (g2 - g1) / 86400000 === 2;
    } catch (e) { return false; }
  }

  /* ================= REPORTS ================= */
  var segViewMode = true;

  function renderReports() {
    renderMonthlyBars();
    renderWeeklyChart();
    renderWeekdayChart();
    renderDonut();
    renderPareto();
  }

  function renderMonthlyBars() {
    var box = $('chMonthlyBars');
    var t = J.today();
    var months = [];
    var i;
    var abs = t.jy * 12 + (t.jm - 1);
    if (segViewMode) {
      for (i = 5; i >= 0; i--) {
        var k = abs - i;
        months.push({ jy: Math.floor(k / 12), jm: (k % 12) + 1, income: 0, sales: 0 });
      }
    } else {
      for (var mo = 1; mo <= 12; mo++) months.push({ jy: t.jy, jm: mo, income: 0, sales: 0 });
    }
    state.sales.forEach(function (s) {
      var k = s.jy * 100 + s.jm;
      for (i = 0; i < months.length; i++) {
        if (months[i].jy * 100 + months[i].jm === k) { months[i].income += s.qty * s.price; months[i].sales += s.qty; }
      }
    });
    var max = Math.max.apply(null, months.map(function (m) { return m.income; }).concat([1]));

    if (!state.sales.length) {
      box.innerHTML = '<div class="empty">هنوز فروشی ثبت نشده — بعد از ثبت، نمودار می‌آید</div>';
      return;
    }
    box.innerHTML = '<div class="bar-chart">' + months.map(function (m) {
      var h = Math.max(Math.round(m.income / max * 100), 3);
      return '<div class="bars-col clickable" data-mk="' + (m.jy * 100 + m.jm) + '">' +
        '<span class="bars-val">' + fnum(Math.round(m.income / 1000)) + 'k</span>' +
        '<div class="bars-bar" style="height:' + h + '%"></div>' +
        '<span class="bars-lbl">' + J.monthName(m.jm) + '</span>' +
        '</div>';
    }).join('') + '</div>';

    box.querySelectorAll('.bars-col.clickable').forEach(function (col) {
      col.addEventListener('click', function () {
        var k = parseInt(col.dataset.mk, 10);
        var m = months.filter(function (x) { return x.jy * 100 + x.jm === k; })[0];
        if (m) openMonthDetail(m);
      });
    });
  }

  /* helper برای کارت‌های جمع‌بندی ماه */
  function mdCell(ico, val, color) {
    return '<div class="md-cell ' + color + '"><span class="md-ico">' + ico + '</span><div class="md-val">' + val + '</div></div>';
  }

  /* مودال حساب کتاب کامل ماه */
  function openMonthDetail(m) {
    var jy = m.jy, jm = m.jm;
    var mk = jy * 100 + jm;
    var _mt=document.getElementById('monthModalTitleText'); if(_mt) _mt.textContent='حساب کتاب — ' + J.monthName(jm) + ' ' + J.faNum(jy); else $('monthModalTitle').textContent='حساب کتاب — ' + J.monthName(jm) + ' ' + J.faNum(jy);

    var sales = state.sales.filter(function (s) { return monthOf(s) === mk; });
    var builds = state.builds.filter(function (b) { return monthOf(b) === mk; });
    var income = 0, soldQty = 0;
    sales.forEach(function (s) { income += s.qty * s.price; soldQty += s.qty; });
    var builtQty = 0;
    builds.forEach(function (b) { builtQty += b.qty; });

    $('mdSummary').innerHTML =
      '<div class="md-grid">' +
      mdCell('درآمد', fmtMoney(income), 'gold') +
      mdCell('تعداد فروش', fnum(soldQty) + ' عدد', 'blue') +
      mdCell('تعداد ساخت', fnum(builtQty) + ' عدد', 'green') +
      '</div>';

    // روزهای پرفروش
    var daysAgg = {};
    sales.forEach(function (s) {
      var key = J.jToStrEn({ jy: s.jy, jm: s.jm, jd: s.jd });
      daysAgg[key] = (daysAgg[key] || 0) + s.qty;
    });
    var topDays = Object.keys(daysAgg).map(function (k) { return { d: k, q: daysAgg[k] }; })
      .sort(function (a, b) { return b.q - a.q; }).slice(0, 3);
    $('mdDays').innerHTML = topDays.length
      ? topDays.map(function (r) {
          var parts = r.d.split('/');
          var name = J.monthName(parseInt(parts[1], 10));
          return '<div class="md-day-row">' + J.faNum(parts[2]) + ' ' + name + ' — <b>' + fnum(r.q) + ' فروش</b></div>';
        }).join('')
      : '<div class="empty small">فروشی نبود</div>';

    // لیست فروش‌های ماه
    $('mdSales').innerHTML = sales.length
      ? sales.slice().sort(function (a, b) { return a.jd - b.jd; }).map(function (s) {
        var j = { jy: s.jy, jm: s.jm, jd: s.jd };
        return '<div class="trow"><div class="n"><b>' + s.name + '</b><small>' + J.jToStr(j) + ' · ' + (s.channel || '') + '</small></div><span class="v gold">' + fmtMoney(s.qty * s.price) + '</span></div>';
      }).join('')
      : '<div class="empty small">فروشی در این ماه ثبت نشده</div>';

    // لیست ساخت‌های ماه
    $('mdBuilds').innerHTML = builds.length
      ? builds.slice().sort(function (a, b) { return a.jd - b.jd; }).map(function (b) {
        var j = { jy: b.jy, jm: b.jm, jd: b.jd };
        return '<div class="trow"><div class="n"><b>' + b.name + '</b><small>' + J.jToStr(j) + '</small></div><span class="v green">+' + fnum(b.qty) + '</span></div>';
      }).join('')
      : '<div class="empty small">ساختی در این ماه ثبت نشده</div>';

    $('monthModal').classList.add('open');
  }

  /* نمودار هفتگی ماه جاری — فروش و ساخت به تفکیک هفته، کلیک → جزئیات */
  function renderWeeklyChart() {
    var box = $('chWeekly');
    if (!box) return;
    var t = J.today();
    var mk = monthOf(t);

    // هفته‌ها را بر اساس شماره روز ماه به ۵ بازه تقسیم می‌کنیم (هفته ۱: روز ۱-۷، ...)
    var weekSales = [0, 0, 0, 0, 0];
    var weekBuilds = [0, 0, 0, 0, 0];
    state.sales.forEach(function (s) {
      if (monthOf(s) !== mk) return;
      var w = Math.min(Math.floor((s.jd - 1) / 7), 4);
      weekSales[w] += s.qty;
    });
    state.builds.forEach(function (b) {
      if (monthOf(b) !== mk) return;
      var w = Math.min(Math.floor((b.jd - 1) / 7), 4);
      weekBuilds[w] += b.qty;
    });

    var max = Math.max.apply(null, weekSales.concat(weekBuilds).concat([1]));
    var labels = ['هفته ۱', 'هفته ۲', 'هفته ۳', 'هفته ۴', 'هفته ۵'];

    box.innerHTML = '<div class="wk-card"><div class="wd-bars">' + weekSales.map(function (c, i) {
      var hS = Math.max(Math.round(c / max * 100), c > 0 ? 10 : 2);
      var hB = Math.max(Math.round(weekBuilds[i] / max * 100), weekBuilds[i] > 0 ? 10 : 2);
      var has = c > 0 || weekBuilds[i] > 0;
      var total = c + weekBuilds[i];
      return '<div class="wd-col' + (has ? ' clickable' : '') + '" data-wk="' + i + '">' +
        '<span class="wd-num build">' + (weekBuilds[i] > 0 ? fnum(weekBuilds[i]) : '&nbsp;') + '</span>' +
        '<div class="wd-bar build-color" style="height:' + hB + '%"></div>' +
        '<span class="wd-num">' + (c > 0 ? fnum(c) : '&nbsp;') + '</span>' +
        '<div class="wd-bar" style="height:' + hS + '%"></div>' +
        '<div class="wd-lbl">' + labels[i] + '</div>' +
        (has ? '<div style="font-size:8px;color:var(--dim2);font-weight:700;margin-top:1px">' + fnum(total) + '</div>' : '') +
        '</div>';
    }).join('') + '</div></div>';
    box.innerHTML += '<div class="chart-legend"><span class="lg lg-in">فروش</span><span class="lg build-color-lg">ساخت</span><span class="lg-note">— روی هر هفته بزن برای جزئیات</span></div>';

    box.querySelectorAll('.wd-col.clickable').forEach(function (col) {
      col.addEventListener('click', function () {
        openWeekDetail(parseInt(col.dataset.wk, 10));
      });
    });
  }

  /* تعداد روزهای یک ماه شمسی */
  function monthDays(jm, jy) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isLeap(jy) ? 30 : 29;
  }

  /* مودال جزئیات هفته — فروش و ساخت با جزئیات کامل */
  function openWeekDetail(w) {
    var t = J.today();
    var jy = t.jy, jm = t.jm;
    var mk = jy * 100 + jm;
    var dayStart = w * 7 + 1;
    var dayEnd = Math.min(dayStart + 6, monthDays(jm, jy));
    var inWeek = function (x) { return monthOf(x) === mk && x.jd >= dayStart && x.jd <= dayEnd; };

    var weekSales = state.sales.filter(inWeek);
    var weekBuilds = state.builds.filter(inWeek);
    var income = 0, sold = 0;
    weekSales.forEach(function (s) { income += s.qty * s.price; sold += s.qty; });
    var built = 0;
    weekBuilds.forEach(function (b) { built += b.qty; });

    var labels = ['هفته ۱', 'هفته ۲', 'هفته ۳', 'هفته ۴', 'هفته ۵'];
    var _wt=document.getElementById('weekModalTitleText'); if(_wt) _wt.textContent=labels[w] + ' — ' + J.monthName(jm) + ' ' + J.faNum(jy); else $('weekModalTitle').textContent=labels[w] + ' — ' + J.monthName(jm) + ' ' + J.faNum(jy);
    $('weekModalRange').textContent = J.faNum(dayStart) + ' تا ' + J.faNum(dayEnd) + ' ' + J.monthName(jm);

    $('wkSummary').innerHTML =
      '<div class="md-grid">' +
      mdCell('درآمد', fmtMoney(income), 'gold') +
      mdCell('فروش', fnum(sold) + ' عدد', 'blue') +
      mdCell('ساخت', fnum(built) + ' عدد', 'green') +
      '</div>';

    if (weekSales.length) {
      var rows = weekSales.slice().sort(function(a,b){return a.jd-b.jd;}).map(function(s){
        var j={jy:s.jy,jm:s.jm,jd:s.jd};
        return '<tr><td><b>'+s.name+'</b><br><small>'+J.jToStr(j)+' · '+(s.channel||'')+'</small></td><td class="num">'+fnum(s.qty)+' × '+fmtMoney(s.price)+'</td><td class="num" style="color:var(--accent)">'+fmtMoney(s.qty*s.price)+'</td></tr>';
      }).join('');
      $('wkSales').innerHTML = '<table class="wk-table"><thead><tr><th>مجسمه</th><th style="text-align:left">تعداد × قیمت</th><th style="text-align:left">مبلغ</th></tr></thead><tbody>'+rows+'</tbody></table>';
    } else {
      $('wkSales').innerHTML = '<div class="empty small">فروشی در این هفته ثبت نشده</div>';
    }

    if (weekBuilds.length) {
      var brows = weekBuilds.slice().sort(function(a,b){return a.jd-b.jd;}).map(function(b){
        var j={jy:b.jy,jm:b.jm,jd:b.jd};
        return '<tr><td><b>'+b.name+'</b><br><small>'+J.jToStr(j)+'</small></td><td class="num" style="color:var(--green)">+'+fnum(b.qty)+'</td><td class="num">'+ (b.price ? fmtMoney(b.price) : '—') +'</td></tr>';
      }).join('');
      $('wkBuilds').innerHTML = '<table class="wk-table"><thead><tr><th>مجسمه</th><th style="text-align:left">تعداد</th><th style="text-align:left">قیمت واحد</th></tr></thead><tbody>'+brows+'</tbody></table>';
    } else {
      $('wkBuilds').innerHTML = '<div class="empty small">ساختی در این هفته ثبت نشده</div>';
    }

    $('weekModal').classList.add('open');
  }

  /* نمودار روزهای هفته — SVG تمیز با برچسب */
  function renderWeekdayChart() {
    var box = $('chWeekday');
    var counts = [0, 0, 0, 0, 0, 0, 0];
    var names = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
    var fullNames = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
    state.sales.forEach(function (s) {
      var wd = J.weekday(s.jy, s.jm, s.jd);
      counts[wd] += s.qty;
    });
    var total = counts.reduce(function (a, b) { return a + b; }, 0);
    var max = Math.max.apply(null, counts.concat([1]));
    var bestIdx = counts.indexOf(max);

    box.innerHTML = '<div class="wd-bars">' + counts.map(function (c, i) {
      var h = Math.max(Math.round(c / max * 100), c > 0 ? 8 : 2);
      return '<div class="wd-col' + (i === bestIdx && total > 0 ? ' best' : '') + '">' +
        '<div class="wd-bar" style="height:' + h + '%"></div>' +
        '<div class="wd-val">' + (c > 0 ? fnum(c) : '') + '</div>' +
        '<div class="wd-lbl">' + names[i] + '</div>' +
        '</div>';
    }).join('') + '</div>';

    var insight = $('weekdayBest');
    if (!total) {
      insight.innerHTML = '<div class="insight-empty">هنوز فروشی ثبت نشده</div>';
      return;
    }
    insight.innerHTML = '<b>بهترین روز فروش: ' + fullNames[bestIdx] + '</b> — ' + fnum(counts[bestIdx]) + ' فروش (' + fnum(Math.round(counts[bestIdx] / total * 100)) + '٪ از کل)' +
      '<br><span class="insight-sub">از بین روزهای هفته — همه‌ی تاریخ‌ها</span>';
  }

  function renderDonut() {
    var box = $('chDonut');
    var legend = $('chDonutLegend');
    var m = monthOf(J.today());
    var agg = {};
    state.sales.forEach(function (s) {
      if (monthOf(s) !== m) return;
      var ch = s.channel || 'سایر';
      agg[ch] = (agg[ch] || 0) + s.qty * s.price;
    });
    var arr = Object.keys(agg).map(function (k) { return { name: k, val: agg[k] }; }).sort(function (a, b) { return b.val - a.val; });
    var total = arr.reduce(function (s, o) { return s + o.val; }, 0);
    if (!arr.length) {
      box.innerHTML = '<div class="empty small">فروشی در این ماه نیست</div>';
      legend.innerHTML = '';
      return;
    }
    var colors = ['#f0b429', '#3b82f6', '#22d3ee', '#34d399', '#f87171', '#a78bfa'];
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
        '<span class="dl-name">' + o.name + '</span><span class="dl-pct">' + fnum(p) + '٪</span></div>';
    }).join('');
  }

  function renderPareto() {
    var box = $('chPareto');
    var m = monthOf(J.today());
    var agg = {};
    state.sales.forEach(function (s) {
      if (monthOf(s) !== m) return;
      agg[s.name] = (agg[s.name] || 0) + s.qty;
    });
    var arr = Object.keys(agg).map(function (k) { return { name: k, qty: agg[k] }; }).sort(function (a, b) { return b.qty - a.qty; });
    var total = arr.reduce(function (s, o) { return s + o.qty; }, 0);
    if (!arr.length) { box.innerHTML = '<div class="empty">داده‌ای نیست</div>'; return; }
    box.innerHTML = arr.map(function (o, i) {
      var pct = total ? Math.round(o.qty / total * 100) : 0;
      return '<div class="pareto-row"><span class="pareto-rank">' + (i + 1) + '</span>' +
        '<div class="pareto-info"><div class="pareto-name">' + o.name + '</div>' +
        '<div class="pareto-bar"><div class="pareto-fill" style="width:' + pct + '%"></div></div></div>' +
        '<span class="pareto-val">' + fnum(o.qty) + ' · ' + fnum(pct) + '٪</span></div>';
    }).join('');
  }

  /* ================= NAV ================= */
  function bindNav() {
    document.querySelectorAll('.nbtn').forEach(function (b) {
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
    if (name === 'reports') renderReports();
    if (name === 'sell') { renderStockChips(); renderSellForm(); }
    if (name === 'stock') renderStockView();
    if (name === 'dashboard') renderDashboard();
  }

  /* ================= SETTINGS / BACKUP ================= */
  function loadSettings() {
    try {
      var raw = localStorage.getItem('sact_settings');
      if (raw) {
        var s = JSON.parse(raw);
        if (s.goal !== undefined) state.settings.goal = s.goal;
        if (s.lowStock !== undefined) state.settings.lowStock = s.lowStock;
      }
    } catch (e) {}
  }

  function renderLastBackupInfo() {
    try {
      var lb = localStorage.getItem('sact_lastbackup');
      if (lb) $('lastBackupInfo').textContent = lb;
    } catch (e) {}
  }

  function doBackup() {
    var payload = {
      app: 'sculpture-accounting', version: 3, schema: 'v3',
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      stocks: state.stocks, builds: state.builds, sales: state.sales
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'مجسمه‌حساب-پشتیبان-' + J.jToStrEn(J.today()) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    try { localStorage.setItem('sact_lastbackup', J.fullLabel(J.today())); } catch (e) {}
    renderLastBackupInfo();
    toast('پشتیبان دانلود شد');
  }

  function doRestore(file) {
    var fr = new FileReader();
    fr.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!data || data.app !== 'sculpture-accounting') {
          toast('فایل پشتیبان مجسمه‌حساب نیست', 'err');
          return;
        }
        var st = data.stocks || [], bl = data.builds || [], sl = data.sales || [];
        if (!Array.isArray(st) || !Array.isArray(bl) || !Array.isArray(sl)) throw new Error('داده خراب');
        var ops = [DB.clear('stocks'), DB.clear('builds'), DB.clear('sales')];
        st.forEach(function (s) { ops.push(DB.put('stocks', s)); });
        bl.forEach(function (b) { ops.push(DB.put('builds', b)); });
        sl.forEach(function (s) { ops.push(DB.put('sales', s)); });
        Promise.all(ops).then(function () {
          state.stocks = st; state.builds = bl; state.sales = sl;
          if (data.settings) {
            state.settings = data.settings;
            try { localStorage.setItem('sact_settings', JSON.stringify(state.settings)); } catch (e2) {}
          }
          normalizeDates();
          renderAll();
          toast('بازیابی شد — ' + fnum(sl.length) + ' فروش، ' + fnum(bl.length) + ' ساخت');
        });
      } catch (err) {
        toast('خطا: ' + err.message, 'err');
      }
    };
    fr.onerror = function () { toast('خواندن فایل نشد', 'err'); };
    fr.readAsText(file);
  }

  /* ================= TOAST ================= */
  var toastTimer;
  function toast(msg, type) {
    var el = $('toast');
    el.textContent = msg;
    el.className = 'toast show' + (type === 'err' ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  /* ================= BIND ================= */
  function bindButtons() {
    bindBuild();
    bindSell();
    bindMoneyInput($('bPrice'));
    bindMoneyInput($('sPrice'));
    bindMoneyInput($('ePrice'));
    // Stepper -/+ (build + sell)
    document.querySelectorAll('.stepper').forEach(function(wrap){
      var input = wrap.querySelector('.stp-input');
      wrap.querySelectorAll('.stp-btn').forEach(function(btn){
        btn.addEventListener('click', function(){
          var dir = parseInt(btn.dataset.dir,10);
          var v = parseInt(input.value,10) || 1;
          v = Math.max(1, v + dir);
          input.value = v;
        });
      });
    });
    // Also delegate for dynamically created steppers inside edit modal
    document.addEventListener('click', function(e){
      var b = e.target.closest('.stp-btn');
      if(!b) return;
      var wrap = b.closest('.stepper');
      if(!wrap) return;
      // only handle if input is inside modal (editFields)
      var inp = wrap.querySelector('.stp-input');
      if(!inp || inp.id !== 'eQty') return;
      var dir = parseInt(b.dataset.dir,10);
      var v = parseInt(inp.value,10) || 1;
      v = Math.max(1, v + dir);
      inp.value = v;
    });

    $('btnBackup').addEventListener('click', doBackup);
    $('btnRestore').addEventListener('click', function () { $('restoreFile').click(); });
    $('restoreFile').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) doRestore(e.target.files[0]);
      e.target.value = '';
    });
    $('gearBtn').addEventListener('click', function () { $('settingsModal').classList.add('open'); });
    document.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { $(b.dataset.close).classList.remove('open'); });
    });
    $('monthClose').addEventListener('click', function () { $('monthModal').classList.remove('open'); });
    $('weekClose').addEventListener('click', function () { $('weekModal').classList.remove('open'); });

    var seg6mBtn = $('seg6m');
    seg6mBtn.addEventListener('click', function () {
      segViewMode = true;
      seg6mBtn.classList.add('on');
      $('segYear').classList.remove('on');
      renderMonthlyBars();
    });
    $('segYear').addEventListener('click', function () {
      segViewMode = false;
      $('segYear').classList.add('on');
      seg6mBtn.classList.remove('on');
      renderMonthlyBars();
    });
  }

  /* ---------- Start ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();