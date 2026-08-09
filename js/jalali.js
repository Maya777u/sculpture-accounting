/* ============================================================
 * jalali.js — تبدیل تاریخ شمسی و روز هفته (بدون وابستگی)
 * الگوریتم استاندارد جلالی (مبنای تقویم رسمی ایران)
 * ============================================================ */
(function (global) {
  'use strict';

  var BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  var FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  var MONTHS_FA = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  var WEEKDAYS_FA = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  var WEEK_SHORT = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];

  function div(a, b) { return ~~(a / b); }
  function mod(a, b) { return a - ~~(a / b) * b; }
  function pad2(x) { return (x < 10 ? '0' : '') + x; }

  /* ===== گاهشمار جلالی کبیسه ===== */
  function jalCal(jy) {
    var bl = BREAKS.length;
    var gy = jy + 621;
    var leapJ = -14;
    var jp = BREAKS[0];
    var jump = 0;
    for (var i = 1; i < bl; i += 1) {
      var jm = BREAKS[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    var n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    var leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    var march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    var leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap: leap, gy: gy, march: march };
  }

  /* ===== میلادی → عدد روز ژولیانی ===== */
  function g2d(gy, gm, gd) {
    var d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
      + div(153 * mod(gm + 9, 12) + 2, 5)
      + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }

  /* ===== عدد ژولیانی → میلادی ===== */
  function d2g(jdn) {
    var j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    var i = div(mod(j, 1461), 4) * 5 + 308;
    var gd = div(mod(i, 153), 5) + 1;
    var gm = mod(div(i, 153), 12) + 1;
    var gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy: gy, gm: gm, gd: gd };
  }

  /* ===== شمسی → ژولیانی ===== */
  function j2d(jy, jm, jd) {
    var r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }

  /* ===== ژولیانی → شمسی ===== */
  function d2j(jdn) {
    var gy = d2g(jdn).gy;
    var jy = gy - 621;
    var r = jalCal(jy);
    var jdn1f = g2d(gy, 3, r.march);
    var k = jdn - jdn1f;
    var jm, jd;
    if (k >= 0) {
      if (k <= 185) { jm = 1 + div(k, 31); jd = mod(k, 31) + 1; return { jy: jy, jm: jm, jd: jd }; }
      k -= 186;
    } else {
      jy -= 1;
      k += 179;
      if (r.leap === 1) k += 1;
    }
    jm = 7 + div(k, 30);
    jd = mod(k, 30) + 1;
    return { jy: jy, jm: jm, jd: jd };
  }

  /* ===== API عمومی ===== */
  function toJalali(date) {
    return d2j(g2d(date.getFullYear(), date.getMonth() + 1, date.getDate()));
  }

  function toGregorian(jy, jm, jd) {
    var r = d2g(j2d(jy, jm, jd));
    return new Date(r.gy, r.gm - 1, r.gd);
  }

  function today() {
    return toJalali(new Date());
  }

  /* روز هفته: 0=شنبه ... 6=جمعه (برای تاریخ شمسی) */
  function weekday(jy, jm, jd) {
    var g = d2g(j2d(jy, jm, jd));
    var dt = new Date(g.gy, g.gm - 1, g.gd);
    var wd = dt.getDay(); // 0=Sun..6=Sat
    return (wd + 1) % 7;  // شنبه=0
  }

  function weekdayName(jy, jm, jd) {
    return WEEKDAYS_FA[weekday(jy, jm, jd)];
  }

  function weekdayShort(jy, jm, jd) {
    return WEEKDAYS[weekday(jy, jm, jd)];
  }

  function faNum(n) {
    return String(n).replace(/[0-9]/g, function (d) { return FA_DIGITS[+d]; });
  }

  function jToStr(j) {
    return faNum(j.jy) + '/' + faNum(j.jm) + '/' + faNum(j.jd);
  }

  function jToStrEn(j) {
    return j.jy + '/' + pad2(j.jm) + '/' + pad2(j.jd);
  }

  function fullLabel(j) {
    return weekdayName(j.jy, j.jm, j.jd) + ' ' + jToStr(j);
  }

  /* `14040516` برای مقایسه عددی تاریخ‌ها */
  function jKey(j) {
    return j.jy * 10000 + j.jm * 100 + j.jd;
  }

  function monthKey(jy, jm) { return jy * 100 + jm; }

  function monthName(jm) { return MONTHS_FA[jm - 1]; }

  /* اعتبارسنجی رشته: «1404/05/16» یا «1404-5-16» */
  function parseJalali(str) {
    if (!str) return null;
    var parts = String(str).replace(/[۰-۹]/g, function (d) {
      return String(FA_DIGITS.indexOf(d));
    }).trim().split(/[\/\-\.،]/).filter(Boolean);
    if (parts.length !== 3) return null;
    var jy = parseInt(parts[0], 10);
    var jm = parseInt(parts[1], 10);
    var jd = parseInt(parts[2], 10);
    if (!jy || !jm || !jd) return null;
    if (jm < 1 || jm > 12) return null;
    if (jd < 1 || jd > 31) return null;
    if (jm > 6 && jd > 30) return null;
    try {
      var g = d2g(j2d(jy, jm, jd));
      var dt = new Date(g.gy, g.gm - 1, g.gd);
      if (isNaN(dt.getTime())) return null;
    } catch (e) { return null; }
    return { jy: jy, jm: jm, jd: jd };
  }

  global.Jalali = {
    toJalali: toJalali,
    toGregorian: toGregorian,
    today: today,
    weekday: weekday,
    weekdayName: weekdayName,
    weekdayShort: weekdayShort,
    jToStr: jToStr,
    jToStrEn: jToStrEn,
    fullLabel: fullLabel,
    parse: parseJalali,
    jKey: jKey,
    monthKey: monthKey,
    monthName: monthName,
    faNum: faNum,
    MONTHS: MONTHS_FA
  };
})(typeof window !== 'undefined' ? window : globalThis);