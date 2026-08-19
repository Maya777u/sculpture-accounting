/* ============================================================
 * db.js — لایه داده (IndexedDB) برای مجسمه‌حساب
 * storeها: stocks (موجودی هر مجسمه) / builds (ثبت ساخت) / sales (فروش)
 * ============================================================ */
(function (global) {
  'use strict';

  var DB_NAME = 'sculpture-accounting';
  var DB_VER = 1;
  var STORES = ['stocks', 'builds', 'sales'];
  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    if (!global.indexedDB) {
      dbPromise = Promise.reject(new Error('IndexedDB not supported'));
      return dbPromise;
    }
    dbPromise = new Promise(function (resolve, reject) {
      var req = global.indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('stocks')) {
          var s = db.createObjectStore('stocks', { keyPath: 'id' });
          s.createIndex('name', 'name', { unique: false });
        }
        if (!db.objectStoreNames.contains('builds')) {
          var b = db.createObjectStore('builds', { keyPath: 'id' });
          b.createIndex('dateKey', 'dateKey', { unique: false });
          b.createIndex('name', 'name', { unique: false });
        }
        if (!db.objectStoreNames.contains('sales')) {
          var sl = db.createObjectStore('sales', { keyPath: 'id' });
          sl.createIndex('dateKey', 'dateKey', { unique: false });
          sl.createIndex('name', 'name', { unique: false });
        }
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function (e) { dbPromise = null; reject(e.target.error); };
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode);
        var s = t.objectStore(store);
        var out = fn(s);
        t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
        t.onerror = function (e) { reject(e.target.error); };
        t.onabort = function (e) { reject(e.target.error || new Error('abort')); };
      });
    });
  }

  function getAll(store) {
    return tx(store, 'readonly', function (s) { return s.getAll(); });
  }

  function add(store, obj) {
    return tx(store, 'readwrite', function (s) { return s.add(obj); });
  }

  function put(store, obj) {
    return tx(store, 'readwrite', function (s) { return s.put(obj); });
  }

  function del(store, id) {
    return tx(store, 'readwrite', function (s) { return s.delete(id); });
  }

  function clear(store) {
    return tx(store, 'readwrite', function (s) { return s.clear(); });
  }

  /* ===== تنظیمات ===== */
  function getSettings() {
    return getAll('settings').then(function () { return null; });
  }

  global.DB = {
    open: open,
    getAll: getAll,
    add: add,
    put: put,
    del: del,
    clear: clear
  };
})(typeof window !== 'undefined' ? window : globalThis);