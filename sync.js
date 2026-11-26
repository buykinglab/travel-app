/**
 * sync.js — 체크·찜 상태만 백그라운드로 올리고 내려받는 얇은 층.
 *
 *   local  : 아무 데도 안 보냄 (기본)
 *   gas    : 기존 Apps Script /exec 를 상태 저장소로만 사용  {api:"state", action:"put"|"get"}
 *   worker : Cloudflare Worker + KV        PUT/GET <url>/state
 *
 * 화면은 이 파일이 무엇을 쓰는지 모릅니다. 나중에 Supabase 로 바꿔도 app.js 는 그대로.
 */
(function () {
  'use strict';

  var KEY = 'sync.cfg';
  function cfg() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function set(c) { localStorage.setItem(KEY, JSON.stringify(c)); }
  function ready() { var c = cfg(); return !!(c.mode && c.mode !== 'local' && c.url); }
  function base(c) { return String(c.url || '').replace(/\/+$/, ''); }

  function push(id, state) {
    var c = cfg();
    if (!ready()) return Promise.resolve(false);
    try {
      if (c.mode === 'gas') {
        return fetch(base(c), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ api: 'state', k: c.key, v: 1, action: 'put', trip: id, state: state }),
          redirect: 'follow'
        }).then(function (r) { return r.ok; }).catch(function () { return false; });
      }
      if (c.mode === 'worker') {
        return fetch(base(c) + '/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (c.key || '') },
          body: JSON.stringify({ id: id, state: state })
        }).then(function (r) { return r.ok; }).catch(function () { return false; });
      }
    } catch (e) {}
    return Promise.resolve(false);
  }

  function pull(id) {
    var c = cfg();
    if (!ready()) return Promise.resolve(null);
    try {
      if (c.mode === 'gas') {
        return fetch(base(c), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ api: 'state', k: c.key, v: 1, action: 'get', trip: id }),
          redirect: 'follow'
        }).then(function (r) { return r.json(); }).then(function (j) {
          return (j && j.ok && j.state) ? j.state : null;
        }).catch(function () { return null; });
      }
      if (c.mode === 'worker') {
        return fetch(base(c) + '/state?id=' + encodeURIComponent(id), {
          headers: { 'Authorization': 'Bearer ' + (c.key || '') }
        }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
          return (j && j.state) ? j.state : null;
        }).catch(function () { return null; });
      }
    } catch (e) {}
    return Promise.resolve(null);
  }

  function setup() {
    var c = cfg();
    var m = prompt('동기화 방식\nlocal = 이 기기만 (지금)\ngas = Apps Script 저장소\nworker = Cloudflare Worker', c.mode || 'local');
    if (m === null) return;
    m = String(m).trim();
    if (m === 'local') { set({ mode: 'local' }); alert('이 기기에만 저장합니다.'); return; }
    var url = prompt('주소\ngas: …/exec 주소\nworker: https://이름.workers.dev', c.url || '');
    if (url === null) return;
    var key = prompt('키\ngas: 자동화 키(또는 연결 코드)\nworker: 발급한 토큰', c.key || '');
    if (key === null) return;
    set({ mode: m, url: String(url).trim(), key: String(key).trim() });
    alert('저장했습니다. 이제 체크할 때마다 백그라운드로 올라갑니다.');
  }

  window.Sync = { cfg: cfg, set: set, push: push, pull: pull, setup: setup, ready: ready };
})();
