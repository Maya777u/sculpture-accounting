/* ============================================================
 * app.js — منطق اصلی مجسمه‌حساب v2.0
 * ساخت، فروش، ویرایش/حذف، تقویم شمسی، گزارش تعاملی، بکاپ
 * ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var J = window.Jalali;

  var state = {
    stocks: [],
    builds: [],
    sales: [],
    settings: { goal: 10000000, lowStock: 3 },
    view: 'dashboard',
    editTarget: null,       // {type:'build'|'sale', id}
    calTarget: null,        // 'bDate'|'sDate'
    calYear: 0, calMonth: 0
  };

  var CHANNELS = ['حضوری (غرفه)', 'سفارش تلفنی', 'اینستاگرام', 'باغ‌فردوس', 'سایر'];

  /* ---------- Init ---------- */
  function init() {
    if (!window.Jalali) { console.error('jalali.js missing'); return; }
    hideSplash();
    bindNav();
    bindButtons();
    bindCalendar();
    bindEdit();

    Promise.all([
      DB.getAll('stocks'), DB.getAll('builds'), DB.getAll('sales')
    ]).then(function (res) {
      state.stocks = res[0] || [];
      state.builds = res[1] || [];
      state.sales = res[2] || [];
      normalizeDates();
      loadSettings();
      renderAll();
    }).catch(function (e) {
      toast('خطا در بارگذاری داده: ' + e.message, 'err');
    });
  }

  function hideSplash() {
    var sp = $('splash');
    if (sp) setTimeout(function () { sp.classList.add('hidden'); }, 700);
  }

  function normalizeDates() {
    state.builds.forEach(function (b) {
      if (!b.dateKey) b.dateKey = JKeyOf(b.jy, b.jm, b.jd);
    });
    state.sales.forEach(function (s) {
      if (!s.dateKey) s.dateKey = JKeyOf(s.jy, s.jm, s.jd);
    });
  }

  function JKeyOf(jy, jm, jd) {
    if (jy === undefined) return 0;
    return jy * 10000 + jm * 100 + jd;
  }

  /* ---------- فرمت‌ها ---------- */
  function fnum(x) {
    if (x === null || x === undefined || isNaN(x)) return '۰';
    return J.faNum(Math.round(x).toLocaleString('en-US').replace(/,/g, '٬'));
  }
  function fmtMoney(x) { return fnum(x) + ' تومان'; }

  /* ---------- رندر کلی ---------- */
  function renderAll() {
    renderHeaderDate();
    renderDashboard();
    renderBuildHistory();
    renderStock();
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
  }

  function monthOf(s) { return (s.jy || 0) * 100 + (s.jm || 0); }

  /* ---------- Dashboard ---------- */
  function renderDashboard() {
    var t = J.today();
    var m = monthOf(t);

    var income = 0, cost = 0, soldCount = 0, stockCount = 0;
    state.sales.forEach(function (s) { if (monthOf(s) === m) { income += s.qty * s.price; soldCount += s.qty; } });
    state.builds.forEach(function (b) { if (monthOf(b) === m) cost += b.qty * b.cost; });
    state.stocks.forEach(function (st) { stockCount += st.qty; });

    $('kpiIncome').textContent = fmtMoney(income);
    $('kpiCost').textContent = fmtMoney(cost);
    $('kpiSold').textContent = fnum(soldCount) + ' عدد';
    $('kpiStock').textContent = fnum(stockCount) + ' عدد';

    var h = new Date().getHours();
    var txt = h < 12 ? 'صبح بخیر استاد ☀️' : (h < 17 ? 'ظهر بخیر استاد 🌤️' : 'شب بخیر استاد 🌙');
    $('greetText').textContent = txt;
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
      box.innerHTML = '<div class="empty small">این ماه هنوز فروشی ثبت نشده — اولین فروش را ثبت کن! 🎯</div>';
      return;
    }
    box.innerHTML = arr.map(function (r, i) {
      return '<div class="trow"><div class="n"><span class="rank-badge">' + (i + 1) + '</span><b>' + r.name + '</b></div><span class="v gold">' + fnum(r.qty) + ' فروش</span></div>';
    }).join('');
  }

  /* ============================================================
   * ساخت — ثبت + تاریخچه + ویرایش/حذف
   * ============================================================ */
  function bindBuild() {
    $('btnBuild').addEventListener('click', function () {
      var name = $('bName').value.trim();
      var qty = parseInt($('bQty').value, 10);
      var cost = parseInt($('bCost').value, 10) || 0;
      var price = parseInt($('bPrice').value, 10) || 0;
      if (!name) { toast('نام مجسمه را وارد کن', 'err'); return; }
      if (!qty || qty < 1) { toast('تعداد نامعتبر است', 'err'); return; }

      var dateStr = $('bDate').value.trim();
      var j = dateStr ? J.parse(dateStr) : J.today();
      if (!j) { toast('تاریخ نامعتبر — نمونه: 1405/05/18', 'err'); return; }

      var build = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        name: name, qty: qty, cost: cost, price: price,
        jy: j.jy, jm: j.jm, jd: j.jd,
        dateKey: JKeyOf(j.jy, j.jm, j.jd)
      };

      var st = state.stocks.filter(function (s) { return s.name === name; })[0];
      if (st) {
        st.qty += qty; st.cost = cost; st.price = price; st.updated = Date.now();
        DB.put('stocks', st);
      } else {
        st = { id: 'st_' + build.id, name: name, qty: qty, cost: cost, price: price, updated: Date.now() };
        DB.add('stocks', st);
        state.stocks.push(st);
      }

      DB.add('builds', build).then(function () {
        state.builds.push(build);
        $('bName').value = ''; $('bQty').value = '1'; $('bCost').value = ''; $('bPrice').value = ''; $('bDate').value = '';
        renderAll();
        toast('✅ «' + name + '» ×' + fnum(qty) + ' به موجودی اضافه شد');
      });
    });
  }

  function renderBuildHistory() {
    var box = $('buildHistory');
    if (!state.builds.length) {
      box.innerHTML = '<div class="empty">هنوز ساخت‌ی ثبت نشده — اولین مجسمه را ثبت کن 🏗️</div>';
      return;
    }
    var sorted = state.builds.slice().sort(function (a, b) { return b.id - a.id; }).slice(0, 15);
    box.innerHTML = sorted.map(function (b) {
      var j = { jy: b.jy, jm: b.jm, jd: b.jd };
      return '<div class="trow clickable" data-type="build" data-id="' + b.id + '">' +
        '<div class="n"><b>' + b.name + '</b><small>' + J.jToStr(j) + ' · ساخت: ' + fnum(b.cost) + '</small></div>' +
        '<span class="v"><span class="v green">+' + fnum(b.qty) + '</span> <span class="edit-ic">✏️</span></span></div>';
    }).join('');

    box.querySelectorAll('.trow.clickable').forEach(function (row) {
      row.addEventListener('click', function () {
        openEditModal({ type: row.dataset.type, id: parseInt(row.dataset.id, 10) });
      });
    });
  }

  /* ---------- فروش ---------- */
  function renderStock() {
    var box = $('stockChips');
    if (!state.stocks.length) {
      box.innerHTML = '<div class="empty small">📦 موجودی خالی است — اول ساخت را ثبت کن</div>';
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

  function renderSellForm() {
    var sel = $('sName');
    sel.innerHTML = '';
    state.stocks.forEach(function (st) {
      var o = document.createElement('option');
      o.value = st.name;
      o.textContent = st.name + ' (موجودی: ' + fnum(st.qty) + ')';
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
      var price = parseInt($('sPrice').value, 10) || 0;
      var channel = $('sChannel').value;
      var st = state.stocks.filter(function (s) { return s.name === name; })[0];
      if (!st) { toast('این مجسمه در موجودی نیست', 'err'); return; }
      if (!qty || qty < 1) { toast('تعداد نامعتبر است', 'err'); return; }
      if (qty > st.qty) { toast('موجودی کافی نیست — فقط ' + fnum(st.qty) + ' عدد دارید', 'err'); return; }
      if (!price) { toast('قیمت فروش را وارد کن', 'err'); return; }

      var dateStr = $('sDate').value.trim();
      var j = dateStr ? J.parse(dateStr) : J.today();
      if (!j) { toast('تاریخ نامعتبر', 'err'); return; }

      var sale = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        name: name, qty: qty, price: price, channel: channel,
        jy: j.jy, jm: j.jm, jd: j.jd,
        dateKey: JKeyOf(j.jy, j.jm, j.jd)
      };

      st.qty -= qty;
      DB.put('stocks', st);
      DB.add('sales', sale).then(function () {
        state.sales.push(sale);
        $('sQty').value = '1'; $('sDate').value = '';
        renderAll();
        toast('✅ فروش ثبت شد: ' + name + ' ×' + fnum(qty) + ' (' + channel + ')');
      });
    });

    // تغییر نام → قیمت پیشنهادی
    $('sName').addEventListener('change', function () {
      var st = state.stocks.filter(function (s) { return s.name === $('sName').value; })[0];
      if (st) $('sPrice').value = st.price || '';
    });
  }

  function renderRecentSales() {
    var box = $('recentSales');
    if (!state.sales.length) {
      box.innerHTML = '<div class="empty small">هنوز فروشی ثبت نشده 🕘</div>';
      return;
    }
    var sorted = state.sales.slice().sort(function (a, b) { return b.id - a.id; }).slice(0, 15);
    box.innerHTML = sorted.map(function (s) {
      var j = { jy: s.jy, jm: s.jm, jd: s.jd };
      return '<div class="trow clickable" data-type="sale" data-id="' + s.id + '">' +
        '<div class="n"><b>' + s.name + '</b><small>' + J.jToStr(j) + ' · ' + (s.channel || '') + '</small></div>' +
        '<span class="v gold">' + fmtMoney(s.qty * s.price) + ' <span class="edit-ic">✏️</span></span></div>';
    }).join('');

    box.querySelectorAll('.trow.clickable').forEach(function (row) {
      row.addEventListener('click', function () {
        openEditModal({ type: row.dataset.type, id: parseInt(row.dataset.id, 10) });
      });
    });
  }

  /* ============================================================
     ویرایش / حذف — ساخت و فروش
     ============================================================ */
  function openEditModal(target) {
    state.editTarget = target;
    var title = $('editModalTitle');
    var fields = $('editFields');
    fields.innerHTML = '';

    if (target.type === 'build') {
      var b = state.builds.filter(function (x) { return x.id === target.id; })[0];
      if (!b) { toast('ردیف پیدا نشد', 'err'); return; }
      title.textContent = '✏️ ویرایش ساخت — ' + b.name;
      fields.innerHTML = makeField('نام', 'eName', 'text', b.name) +
        makeField('تعداد', 'eQty', 'number', b.qty, 1) +
        makeField('هزینه ساخت', 'eCost', 'number', b.cost) +
        makeField('قیمت فروش', 'ePrice', 'number', b.price) +
        makeField('تاریخ (شمسی)', 'eDate', 'text', J.jToStrEn({ jy: b.jy, jm: b.jm, jd: b.jd }));
    } else {
      var s = state.sales.filter(function (x) { return x.id === target.id; })[0];
      if (!s) { toast('ردیف پیدا نشد', 'err'); return; }
      title.textContent = '✏️ ویرایش فروش — ' + s.name;
      var opts = CHANNELS.map(function (c) {
        return '<option' + (c === s.channel ? ' selected' : '') + '>' + c + '</option>';
      }).join('');
      fields.innerHTML = makeField('نام', 'eName', 'text', s.name) +
        makeField('تعداد', 'eQty', 'number', s.qty, 1) +
        makeField('قیمت هر عدد', 'ePrice', 'number', s.price) +
        makeField('تاریخ (شمسی)', 'eDate', 'text', J.jToStrEn(s.jy, s.jm, s.jd)) +
        '<label class="f-full">نحوه فروش<select id="eChannel" class="input">' + opts + '</select></label>';
      $('eChannel').value = s.channel;
    }
    $('editModal').classList.add('open');
  }

  function makeField(lbl, id, type, val, min) {
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
      var j = dateStr ? J.parse(dateStr) : J.today();
      if (!name || !qty || qty < 1 || !j) { toast('مقادیر نامعتبر', 'err'); return; }

      if (t.type === 'build') {
        var b = state.builds.filter(function (x) { return x.id === t.id; })[0];
        if (!b) return;
        var oldQty = b.qty;
        var cost = parseInt($('eCost').value, 10) || 0;
        var price = parseInt($('ePrice').value, 10) || 0;
        b.name = name; b.qty = qty; b.cost = cost; b.price = price;
        b.jy = j.jy; b.jm = j.jm; b.jd = j.jd; b.dateKey = JKeyOf(j.jy, j.jm, j.jd);
        DB.put('builds', b);
        adjustStock(name, qty - oldQty, cost, price);
      } else {
        var s = state.sales.filter(function (x) { return x.id === t.id; })[0];
        if (!s) return;
        var oldQty = s.qty;
        var price2 = parseInt($('ePrice').value, 10) || 0;
        var ch = $('eChannel') ? $('eChannel').value : s.channel;
        s.name = name; s.qty = qty; s.price = price2; s.channel = ch;
        s.jy = j.jy; s.jm = j.jm; s.jd = j.jd; s.dateKey = JKeyOf(j.jy, j.jm, j.jd);
        DB.put('sales', s);
        adjustStock(name, -(qty - oldQty));  // فروش بیشتر → موجودی کمتر
      }
      closeEdit();
      renderAll();
      toast('💾 تغییرات ذخیره شد');
    });

    $('editDelete').addEventListener('click', function () {
      var t = state.editTarget;
      if (!t) return;
      if (t.type === 'build') {
        var b = state.builds.filter(function (x) { return x.id === t.id; })[0];
        if (b) {
          DB.del('builds', b.id);
          adjustStock(b.name, -b.qty);
          state.builds = state.builds.filter(function (x) { return x.id !== b.id; });
        }
      } else {
        var s = state.sales.filter(function (x) { return x.id === t.id; })[0];
        if (s) {
          DB.del('sales', s.id);
          adjustStock(s.name, s.qty); // برگرداندن به موجودی
          state.sales = state.sales.filter(function (x) { return x.id !== s.id; });
        }
      }
      closeEdit();
      renderAll();
      toast('🗑️ حذف شد');
    });

    $('editClose').addEventListener('click', closeEdit);
  }

  function closeEdit() {
    $('editModal').classList.remove('open');
    state.editTarget = null;
  }

  /* تغییر موجودی: نام، دلتا، و در صورت نبود → ساخت stock */
  function adjustStock(name, delta, cost, price) {
    var st = state.stocks.filter(function (s) { return s.name === name; })[0];
    if (st) {
      st.qty += delta;
      if (st.qty < 0) st.qty = 0;
      if (cost !== undefined) { st.cost = cost; }
      if (price !== undefined) { st.price = price; }
      st.updated = Date.now();
      DB.put('stocks', st);
    } else if (delta > 0) {
      st = { id: 'st_' + Date.now(), name: name, qty: delta, cost: cost || 0, price: price || 0, updated: Date.now() };
      DB.add('stocks', st);
      state.stocks.push(st);
    }
  }

  /* ============================================================
     تقویم شمسی
     ============================================================ */
  function bindCalendar() {
    $('bDateBtn').addEventListener('click', function () { openCalendar('bDate'); });
    $('sDateBtn').addEventListener('click', function () { openCalendar('sDate'); });
    $('calClose').addEventListener('click', function () { $('calModal').classList.remove('open'); });
    $('calPrev').addEventListener('click', function () { moveCal(-1); });
    $('calNext').addEventListener('click', function () { moveCal(1); });
    $('calToday').addEventListener('click', function () {
      var t = J.today();
      setDateValue(state.calTargetKey, t);
      $('calModal').classList.remove('open');
    });
  }

  function openCalendar(targetKey) {
    state.calTargetKey = targetKey;
    var input = $(targetKey);
    var j = input && input.value ? J.parse(input.value) : null;
    if (!j) j = J.today();
    state.calYear = j.jy;
    state.calMonth = j.jm;
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
    // سرستون
    ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].forEach(function (d) {
      var h = document.createElement('div');
      h.className = 'cal-hd';
      h.textContent = d;
      grid.appendChild(h);
    });
    var days = (state.calMonth <= 6) ? 31 : 30;
    if (state.calMonth === 12 && !isLeap(state.calYear)) days = 29;
    var firstWd = J.weekday(state.calYear, state.calMonth, 1);
    for (var i = 0; i < firstWd; i++) {
      grid.appendChild(document.createElement('div'));
    }
    var today = J.today();
    for (var d = 1; d <= days; d++) {
      var cell = document.createElement('button');
      cell.className = 'cal-day';
      cell.textContent = J.faNum(d);
      if (d === today.jd && state.calMonth === today.jm && state.calYear === today.jy) {
        cell.classList.add('today');
      }
      (function (day) {
        cell.addEventListener('click', function () {
          $('calModal').classList.remove('open');
          var jsel = { jy: state.calYear, jm: state.calMonth, jd: day };
          $('' + state.calTargetKey).value = J.jToStrEn(jsel);
        });
      })(d);
      grid.appendChild(cell);
    }
  }

  function isLeap(jy) { return J.weekday(jy, 12, 30) !== 0; }

  /* ============================================================
     گزارش‌ها
     ============================================================ */
  function renderReports() {
    renderMonthlyBars();
    renderWeekdayChart();
    renderDonut();
    renderPareto();
  }

  var seg6m = true; // نمای ۶ ماه یا کل سال
  var segViewMode = true;

  function renderMonthlyBars() {
    var box = $('chMonthlyBars');
    var t = J.today();
    var months = [];
    var i;

    if (segViewMode) {
      for (i = 5; i >= 0; i--) {
        var k = t.jy * 100 + t.jm - i;
        var jy = Math.floor(k / 100), jm = k % 100;
        if (jm < 1) { jy--; jm += 12; }
        months.push({ jy: jy, jm: jm, income: 0, cost: 0, sales: 0, builds: 0 });
      }
    } else {
      // کل سال جاری: فروردین تا اسفند
      for (var mo = 1; mo <= 12; mo++) {
        months.push({ jy: t.jy, jm: mo, income: 0, cost: 0, sales: 0, builds: 0 });
      }
    }

    state.sales.forEach(function (s) {
      var k = s.jy * 100 + s.jm;
      for (i = 0; i < months.length; i++) {
        if (months[i].jy * 100 + months[i].jm === k) { months[i].income += s.qty * s.price; months[i].sales += s.qty; }
      }
    });
    state.builds.forEach(function (b) {
      var k = b.jy * 100 + b.jm;
      for (i = 0; i < months.length; i++) {
        if (months[i].jy * 100 + months[i].jm === k) { months[i].cost += b.qty * b.cost; months[i].builds += b.qty; }
      }
    });

    var max = 1;
    months.forEach(function (m) { max = Math.max(max, m.income, m.cost); });

    // تعاملی: کلیک روی ستون → detail
    box.innerHTML = '<div class="bar-chart">' + months.map(function (m) {
      var hi = Math.round(m.income / max * 100);
      var hc = Math.round(m.cost / max * 100);
      return '<div class="bars-col clickable" data-mk="' + (m.jy * 100 + m.jm) + '">' +
        '<span class="bars-val">' + fnum(Math.round(m.income / 1000)) + 'k</span>' +
        '<div class="bars-bar" style="height:' + Math.max(hi, 2) + '%"></div>' +
        '<div class="bars-bar cost" style="height:' + Math.max(hc, 2) + '%"></div>' +
        '<span class="bars-lbl">' + J.monthName(m.jm) + '</span>' +
        '</div>';
    }).join('') + '</div>' +
      '<div class="chart-legend"><span class="lg lg-in">درآمد</span><span class="lg lg-cost">هزینه</span><span class="lg-note">روی ستون بزن تا جزئیات بیاید</span></div>';

    box.querySelectorAll('.bars-col.clickable').forEach(function (col) {
      col.addEventListener('click', function () {
        var k = parseInt(col.dataset.m, 10);
        var m = months.filter(function (x) { return x.jy * 100 + x.jm === k; })[0];
        if (m) showMonthDetail(m);
      });
    });

    if (state.sales.length === 0 && state.builds.length === 0) {
      box.innerHTML = '<div class="empty">هنوز داده‌ای نیست — بعد از اولین ثبت، نمودار ظاهر می‌شود</div>';
    }
  }

  function showMonthDetail(m) {
    var d = $('monthDetail');
    var profit = m.income - m.cost;
    var topDays = topSellingDays(m);
    d.innerHTML = '<div class="md-head">📌 جزئیات ' + J.monthName(m.jm) + ' ' + J.faNum(m.jy) + '</div>' +
      '<div class="md-grid">' +
      mdCell('کل فروش', fmtMoney(m.income), 'gold') +
      mdCell('تعداد ساخت', fnum(m.builds) + ' عدد', 'blue') +
      mdCell('تعداد فروش', fnum(m.sales) + ' عدد', 'green') +
      mdCell('سود خالص', fmtMoney(m.income - m.cost), m.income - m.cost >= 0 ? 'gold' : 'red') +
      '</div>' +
      '<div class="md-days">🔥 روزهای پرفروش: ' + (topDays || '—') + '</div>';
    d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function mdCell(lbl, val, cls) {
    return '<div class="md-cell"><span class="md-val ' + cls + '">' + val + '</span><span class="md-lbl">' + lbl + '</span></div>';
  }

  function topSellingDays(m) {
    var agg = {};
    state.sales.forEach(function (s) {
      if (s.jy * 100 + s.jm === m.jy * 100 + m.jm) {
        var key = J.jToStrEn({ jy: s.jy, jm: s.jm, jd: s.jd });
        agg[key] = (agg[key] || 0) + s.qty;
      }
    });
    return Object.keys(agg).map(function (k) {
      return { d: k, q: agg[k] };
    }).sort(function (a, b) { return b.q - a.q; }).slice(0, 3)
      .map(function (r) { return J.faNum(r.d) + ' (' + fnum(r.q) + ')'; }).join(' ، ');
  }

  function mdCell(lbl, val, cls) {
    return '<div class="md-cell"><span class="md-val ' + cls + '">' + val + '</span><span class="md-lbl">' + lbl + '</span></div>';
  }

  /* ============================================================
     نمودار روزهای هفته — SVG حرفه‌ای
     ============================================================ */
  function renderWeekdayChart() {
    var box = $('chWeekday');
    var counts = [0, 0, 0, 0, 0, 0, 0]; // ش..ج
    state.sales.forEach(function (s) {
      var wd = J.weekday(s.jy, s.jm, s.jd);
      counts[wd] += s.qty;
    });
    var max = Math.max.apply(null, counts.concat([1]));
    var bestIdx = counts.indexOf(max);

    var W = 340, H = 150, pad = 22;
    var bw = (W - pad * 2) / 7;
    var chartH = H - pad - 20;

    var bars = '';
    for (var i = 0; i < 7; i++) {
      var h = Math.max(counts[i] / max * chartH, 3);
      var x = pad + i * bw + bw * 0.2;
      var w = bw * 0.6;
      var y = H - pad - h;
      var gold = i === bestIdx;
      var fill = gold ? 'url(#gg)' : 'url(#bg)';
      bars += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="6" fill="' + fill + '"' + (gold ? ' stroke="#fcd34d" stroke-width="1.5"' : '') + '>';
      bars += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (y - 6) + '" text-anchor="middle" class="ch-txt">' + J.faNum(counts[i]) + '</text>';
      bars += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - pad + 16) + '" text-anchor="middle" class="ch-lbl">' + ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'][i] + '</text>';
    }

    box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart-svg">' +
      '<defs>' +
      '<linearGradient id="bg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#1d4ed8"/><stop offset="1" stop-color="#60a5fa"/></linearGradient>' +
      '<linearGradient id="gg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#b45309"/><stop offset="1" stop-color="#fcd34d"/></linearGradient>' +
      '</defs>' +
      '<line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + (H - pad) + '" stroke="#2b3d61" stroke-width="1"/>' +
      bars +
      '</svg>';

    var insight = $('weekdayBest');
    if (state.sales.length === 0) {
      insight.innerHTML = '<div class="insight-empty">📅 هنوز فروشی ثبت نشده — بعد از ثبت، بهترین روزت اینجا می‌آید</div>';
      return;
    }
    var bestName = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'][bestIdx];
    var total = counts.reduce(function (a, b) { return a + b; }, 0);
    var pct = Math.round(counts[bestIdx] / total * 100);
    insight.innerHTML = '🏆 <b>بهترین روز فروش: ' + bestName + '</b> — ' + fnum(counts[bestIdx]) + ' فروش (' + fnum(pct) + '٪ از کل همه‌ی تاریخ‌ها)' +
      '<br><span class="insight-sub">نمودار بر اساس همه‌ی فروش‌ها — نه فقط امروز</span>';
  }

  /* ---------- Donut ---------- */
  function renderDonut() {
    var box = $('chDonut');
    var legend = $('chDonutLegend');
    var t = J.today();
    var m = monthOf(t);
    var agg = {};
    state.sales.forEach(function (s) {
      if (monthOf(s) !== m) return;
      var ch = s.channel || 'سایر';
      agg[ch] = (agg[ch] || 0) + s.qty * s.price;
    });
    var arr = Object.keys(agg).map(function (k) { return { name: k, val: agg[k] }; })
      .sort(function (a, b) { return b.val - a.val; });
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

  /* ================= Pareto ================= */
  function renderPareto() {
    var box = $('chPareto');
    var m = monthOf(J.today());
    var agg = {};
    state.sales.forEach(function (s) {
      if (monthOf(s) !== m) return;
      agg[s.name] = (agg[s.name] || 0) + s.qty;
    });
    var arr = Object.keys(agg).map(function (k) { return { name: k, qty: agg[k] }; })
      .sort(function (a, b) { return b.qty - a.qty; });
    var total = arr.reduce(function (s, o) { return s + o.qty; }, 0);

    if (!arr.length) {
      box.innerHTML = '<div class="empty">داده‌ای برای پارتو نیست</div>';
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

  /* ================= Nav ================= */
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
    if (name === 'reports') { renderReports(); }
    if (name === 'sell') { renderStock(); renderSellForm(); }
    if (name === 'dashboard') renderDashboard();
  }

  /* ================= Settings / Backup ================= */
  function loadSettings() {
    try {
      var raw = localStorage.getItem('sact_settings');
      if (raw) {
        var s = JSON.parse(raw);
        if (s.goal !== undefined) state.settings.goal = s.goal;
        if (s.lowStock !== undefined) state.settings.lowStock = s.lowStock;
      }
    } catch (e) {}
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
  }

  function renderLastBackupInfo() {
    try {
      var lb = localStorage.getItem('sact_lastbackup');
      if (lb) $('lastBackupInfo').textContent = lb;
    } catch (e) {}
  }

  function doBackup() {
    var payload = {
      app: 'sculpture-accounting',
      version: 2,
      schema: 'v2',
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      stocks: state.stocks,
      builds: state.builds,
      sales: state.sales
    };
    var txt = JSON.stringify(payload, null, 2);
    var blob = new Blob([txt], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'مجسمه‌حساب-پشتیبان-' + J.jToStrEn(J.today()) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    try { localStorage.setItem('sact_lastbackup', J.fullLabel(J.today())); } catch (e) {}
    renderLastBackupInfo();
    toast('پشتیبان دانلود شد 💾');
  }

  function doRestore(file) {
    var fr = new FileReader();
    fr.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!data || data.app !== 'sculpture-accounting') {
          toast('این فایل پشتیبان مجسمه‌حساب نیست', 'err');
          return;
        }
        var st = data.stocks || [];
        var bl = data.builds || [];
        var sl = data.sales || [];
        validateBackup(st, bl, sl);

        var ops = [
          DB.clear('stocks'), DB.clear('builds'), DB.clear('sales')
        ];
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
          var m = J.today();
          var p = monthProfit(m.jy * 100 + m.jm);
          toast('🎉 بازیابی کامل شد — ' + fnum(sl.length) + ' فروش، ' + fnum(bl.length) + ' ساخت');
        });
      } catch (err) {
        toast('خطا در بازیابی: ' + err.message, 'err');
      }
    };
    fr.onerror = function () { toast('خواندن فایل ممکن نشد', 'err'); };
    fr.readAsText(file);
  }

  function monthProfit(m) {
    var income = 0, cost = 0;
    state.sales.forEach(function (s) { if (monthOf(s) === m) income += s.qty * s.price; });
    state.builds.forEach(function (b) { if (monthOf(b) === m) cost += b.qty * b.cost; });
    return income - cost;
  }

  /* اعتبارسنجی داده بازیابی */
  function validateData(stocks, builds, sales) {
    [stocks, builds, sales].forEach(function (arr) {
      if (!Array.isArray(arr)) throw new Error('آرایه‌های داده خراب است');
    });
  }

  /* ================= Toast ================= */
  var toastTimer;
  function toast(msg, type) {
    var el = $('toast');
    el.textContent = msg;
    el.className = 'toast show' + (type === 'err' ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  /* ================= Buttons ================= */
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
    $('gearBtn').addEventListener('click', function () { $('settingsModal').classList.add('open'); });
    document.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { $(b.dataset.close).classList.remove('open'); });
    });

    // نمای ۶ ماه / کل سال
        var seg6mBtn = $('seg6m');
        segViewMode = true;
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