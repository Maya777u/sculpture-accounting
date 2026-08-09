/* تست jsdom — مجسمه‌حساب: جریان کامل ساخت → فروش → نمودار */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');

// موقعیت‌های تاریخ: 1404/05/16 = جمعه
const JALALI = fs.readFileSync(path.join(ROOT, 'js/jalali.js'), 'utf8');
const DB = fs.readFileSync(path.join(ROOT, 'js/db.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://localhost/',
  pretendToBeVisual: true
});

const { window } = dom;
global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.localStorage = window.localStorage;

// fake indexedDB
const { IDBFactory } = require('fake-indexeddb');
window.indexedDB = new IDBFactory();
global.indexedDB = window.indexedDB;

// شناسنامه برای window.idb
window.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');

// اجرای اسکریپت‌ها
window.eval(JALALI);
window.eval(DB);
window.eval(APP);

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.log('  ❌', msg); }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const $ = (id) => window.document.getElementById(id);

// jsdom پیاده‌سازی scrollTo ندارد
window.scrollTo = function () {};

const todayStr = () => window.Jalali.jToStrEn(window.Jalali.today());

(async () => {
  await sleep(1200); // init

  ok(!!window.Jalali, 'jalali loaded');
  ok(!!window.DB, 'db loaded');

  // ۱. ثبت ساخت (تاریخ = امروز تا در گزارش ماه جاری دیده شود)
  $('bName').value = 'هواپیمای استیم‌پانک';
  $('bQty').value = '3';
  $('bCost').value = '50000';
  $('bPrice').value = '450000';
  $('bDate').value = todayStr();
  $('btnBuild').click();
  await sleep(400);

  const chips = window.document.querySelectorAll('#stockChips .chip');
  ok(chips.length === 1, 'موجودی یک مجسمه دارد');
  ok(chips[0].textContent.includes('هواپیما'), 'نام مجسمه درست است');
  ok(chips[0].textContent.includes('۳'), 'تعداد ۳ است');

  // ۲. ثبت فروش
  $('sName').value = 'هواپیمای استیم‌پانک';
  $('sQty').value = '2';
  $('sPrice').value = '450000';
  $('sChannel').value = 'اینستاگرام';
  $('sDate').value = todayStr();
  $('btnSellAdd').click();
  await sleep(600);

  const chips2 = window.document.querySelectorAll('.chip');
  ok(chips2[0].textContent.includes('۱'), 'موجودی بعد از فروش ۲→۱ شد');

  // ۳. گزارش‌ها
  window.document.querySelector('.nbtn[data-view="reports"]').click();
  await sleep(200);
  ok($('chMonthlyBars').innerHTML.includes('bars-bar'), 'نمودار ماهانه رندر شد');
  ok($('chPareto').innerHTML.includes('هواپیما'), 'پارتو شامل هواپیما است');
  ok($('chDonut').innerHTML.includes('donut'), 'دونات رندر شد');

  // ۴. بکاپ
  const backupBtn = $('btnBackup');
  ok(!!backupBtn, 'دکمه بکاپ موجود است');

  console.log('\n===== ' + pass + ' passed, ' + fail + ' failed =====');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(2); });