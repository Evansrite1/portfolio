/* Weather for almost any place, from Open-Meteo (free, no key). Search a place, use your location, keep favourites, switch units. */
(function () {
  'use strict';
  var root = document.getElementById('wx'); if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var ST = { place: null, units: 'metric', favs: [], recent: [] };
  try { var sv = JSON.parse(localStorage.getItem('wx.v1') || 'null'); if (sv) ST = Object.assign(ST, sv); } catch (e) { /* ignore */ }
  function save() { try { localStorage.setItem('wx.v1', JSON.stringify({ place: ST.place, units: ST.units, favs: ST.favs, recent: ST.recent })); } catch (e) { /* ignore */ } }

  var CODES = { 0: ['Clear sky', 'sun'], 1: ['Mostly clear', 'sun'], 2: ['Partly cloudy', 'pc'], 3: ['Overcast', 'cloud'], 45: ['Fog', 'fog'], 48: ['Freezing fog', 'fog'], 51: ['Light drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Heavy drizzle', 'rain'],
    56: ['Freezing drizzle', 'rain'], 57: ['Freezing drizzle', 'rain'], 61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'], 66: ['Freezing rain', 'rain'], 67: ['Freezing rain', 'rain'], 71: ['Light snow', 'snow'], 73: ['Snow', 'snow'],
    75: ['Heavy snow', 'snow'], 77: ['Snow grains', 'snow'], 80: ['Rain showers', 'rain'], 81: ['Rain showers', 'rain'], 82: ['Violent showers', 'rain'], 85: ['Snow showers', 'snow'], 86: ['Heavy snow showers', 'snow'], 95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm with hail', 'storm'], 99: ['Thunderstorm with hail', 'storm'] };
  function icon(kind, night, size) {
    var s = size || 48, sun = '<circle cx="24" cy="24" r="9" fill="#ffc83d"/><g stroke="#ffc83d" stroke-width="3" stroke-linecap="round"><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.5 10.5l4 4M33.5 33.5l4 4M37.5 10.5l-4 4M14.5 33.5l-4 4"/></g>';
    var moon = '<path d="M30 8a16 16 0 1 0 10 28A14 14 0 0 1 30 8z" fill="#cfd8ea"/>';
    var cloud = '<path d="M14 36h20a8 8 0 0 0 .8-16A11 11 0 0 0 13 22a7 7 0 0 0 1 14z" fill="#aeb8c7"/>';
    var body = { sun: night ? moon : sun, pc: (night ? '<g transform="translate(-6 -6) scale(.8)">' + moon + '</g>' : '<g transform="translate(-6 -6) scale(.8)">' + sun + '</g>') + cloud, cloud: cloud, fog: cloud + '<g stroke="#aeb8c7" stroke-width="3" stroke-linecap="round"><path d="M10 41h28M14 46h20"/></g>',
      rain: cloud + '<g stroke="#4aa3ff" stroke-width="3" stroke-linecap="round"><path d="M17 40l-2 5M25 40l-2 5M33 40l-2 5"/></g>', snow: cloud + '<g fill="#fff"><circle cx="17" cy="42" r="2.3"/><circle cx="25" cy="45" r="2.3"/><circle cx="33" cy="42" r="2.3"/></g>',
      storm: cloud + '<path d="M25 33l-6 9h5l-2 7 8-10h-5z" fill="#ffc83d"/>' }[kind] || cloud;
    return '<svg viewBox="0 0 48 52" width="' + s + '" height="' + s + '" aria-hidden="true">' + body + '</svg>';
  }
  var deg = function (d) { return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8]; };
  var T = function (v) { return Math.round(v) + '°'; };
  function placeName(p) { return [p.name, p.admin1, p.country].filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(', '); }
  function err(t) { $('wx-out').innerHTML = '<p class="help err" role="alert">' + esc(t) + '</p>'; }

  function load(p) {
    ST.place = p; save(); renderLists();
    $('wx-out').innerHTML = '<p class="help">Loading the weather for ' + esc(placeName(p)) + '...</p>';
    var u = 'https://api.open-meteo.com/v1/forecast?latitude=' + p.latitude + '&longitude=' + p.longitude +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day,pressure_msl,uv_index,cloud_cover' +
      '&hourly=temperature_2m,precipitation_probability,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max' +
      '&timezone=auto&forecast_days=7' + (ST.units === 'imperial' ? '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch' : '&wind_speed_unit=kmh');
    fetch(u).then(function (r) { if (!r.ok) throw new Error('The weather service said ' + r.status); return r.json(); }).then(function (d) { show(p, d); })
      .catch(function (e) { err('Could not load the weather. Check your internet connection and try again. (' + e.message + ')'); });
  }
  function hm(iso) { return String(iso).slice(11, 16); }
  function show(p, d) {
    var c = d.current, info = CODES[c.weather_code] || ['Unknown', 'cloud'], night = !c.is_day, wu = ST.units === 'imperial' ? 'mph' : 'km/h', pu = ST.units === 'imperial' ? 'in' : 'mm';
    var nowIdx = d.hourly.time.findIndex(function (t) { return t >= c.time; }); if (nowIdx < 0) nowIdx = 0;
    var hours = '';
    for (var i = nowIdx; i < nowIdx + 24 && i < d.hourly.time.length; i++) {
      var ci = (CODES[d.hourly.weather_code[i]] || ['', 'cloud'])[1];
      hours += '<div class="wx-h"><span>' + (i === nowIdx ? 'Now' : hm(d.hourly.time[i])) + '</span>' + icon(ci, !d.hourly.is_day[i], 30) + '<b>' + T(d.hourly.temperature_2m[i]) + '</b><small>' + (d.hourly.precipitation_probability[i] || 0) + '%</small></div>';
    }
    var lo = Math.min.apply(null, d.daily.temperature_2m_min), hi = Math.max.apply(null, d.daily.temperature_2m_max), days = '';
    d.daily.time.forEach(function (t, k) {
      var dd = new Date(t + 'T12:00'), ci = (CODES[d.daily.weather_code[k]] || ['', 'cloud'])[1], a = (d.daily.temperature_2m_min[k] - lo) / (hi - lo || 1) * 100, b = (d.daily.temperature_2m_max[k] - lo) / (hi - lo || 1) * 100;
      days += '<div class="wx-d"><span class="wx-dn">' + (k === 0 ? 'Today' : dd.toLocaleDateString(undefined, { weekday: 'short' })) + '</span>' + icon(ci, false, 28) + '<span class="wx-pop">' + (d.daily.precipitation_probability_max[k] || 0) + '%</span>' +
        '<span class="wx-lo">' + T(d.daily.temperature_2m_min[k]) + '</span><span class="wx-bar"><i style="left:' + a + '%;width:' + Math.max(6, b - a) + '%"></i></span><span class="wx-hi">' + T(d.daily.temperature_2m_max[k]) + '</span></div>';
    });
    $('wx-out').innerHTML = '<div class="wx-now"><div><h2 class="wx-place">' + esc(placeName(p)) + '</h2><p class="help" style="margin:0">Local time ' + hm(c.time) + '</p>' +
      '<div class="wx-big">' + T(c.temperature_2m) + '<small>' + (ST.units === 'imperial' ? 'F' : 'C') + '</small></div><div class="wx-desc">' + esc(info[0]) + '. Feels like ' + T(c.apparent_temperature) + '</div></div><div class="wx-ico">' + icon(info[1], night, 110) + '</div></div>' +
      '<div class="wx-grid"><div><span>Humidity</span><b>' + c.relative_humidity_2m + '%</b></div><div><span>Wind</span><b>' + Math.round(c.wind_speed_10m) + ' ' + wu + ' ' + deg(c.wind_direction_10m) + '</b></div><div><span>Rain now</span><b>' + c.precipitation + ' ' + pu + '</b></div>' +
      '<div><span>Cloud cover</span><b>' + c.cloud_cover + '%</b></div><div><span>Pressure</span><b>' + Math.round(c.pressure_msl) + ' hPa</b></div><div><span>UV index</span><b>' + (c.uv_index == null ? '-' : c.uv_index.toFixed(1)) + '</b></div>' +
      '<div><span>Sunrise</span><b>' + hm(d.daily.sunrise[0]) + '</b></div><div><span>Sunset</span><b>' + hm(d.daily.sunset[0]) + '</b></div></div>' +
      '<h3 class="wx-h3">Next 24 hours</h3><div class="wx-hours">' + hours + '</div><h3 class="wx-h3">7 days</h3><div class="wx-days">' + days + '</div>';
    $('wx-fav').textContent = ST.favs.some(function (f) { return f.id === p.id; }) ? 'Remove from favourites' : 'Add to favourites'; $('wx-fav').hidden = false;
  }
  function renderLists() {
    var box = $('wx-saved'); box.innerHTML = '';
    var all = ST.favs.map(function (f) { return [f, true]; }).concat(ST.recent.filter(function (r) { return !ST.favs.some(function (f) { return f.id === r.id; }); }).slice(0, 5).map(function (r) { return [r, false]; }));
    all.forEach(function (pr) { var b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (pr[1] ? ' on' : ''); b.textContent = (pr[1] ? '* ' : '') + pr[0].name; b.onclick = function () { choose(pr[0]); }; box.appendChild(b); });
  }
  function choose(p) { p.id = p.id || (p.latitude + ',' + p.longitude); ST.recent = [p].concat(ST.recent.filter(function (r) { return r.id !== p.id; })).slice(0, 8); $('wx-q').value = ''; $('wx-list').hidden = true; load(p); }
  var timer = 0;
  $('wx-q').addEventListener('input', function () {
    clearTimeout(timer); var q = $('wx-q').value.trim(); if (q.length < 2) { $('wx-list').hidden = true; return; }
    timer = setTimeout(function () {
      fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=8&language=en&format=json').then(function (r) { return r.json(); }).then(function (j) {
        var box = $('wx-list'); box.innerHTML = ''; var res = j.results || [];
        if (!res.length) { box.innerHTML = '<li class="none">No place found. Try another spelling.</li>'; box.hidden = false; return; }
        res.forEach(function (p) { var li = document.createElement('li'); li.textContent = placeName(p); li.onmousedown = function (e) { e.preventDefault(); choose(p); }; box.appendChild(li); });
        var r = $('wx-q').getBoundingClientRect(); box.classList.toggle('up', window.innerHeight - r.bottom < 260 && r.top > window.innerHeight - r.bottom); box.hidden = false;
      }).catch(function () { /* the next key press tries again */ });
    }, 250);
  });
  $('wx-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') { var f = $('wx-list').querySelector('li:not(.none)'); if (f) f.dispatchEvent(new MouseEvent('mousedown')); } });
  $('wx-q').addEventListener('blur', function () { setTimeout(function () { $('wx-list').hidden = true; }, 150); });
  $('wx-loc').addEventListener('click', function () {
    if (!navigator.geolocation) return err('Your browser cannot tell where you are. Search for a place instead.');
    navigator.geolocation.getCurrentPosition(function (pos) { choose({ name: 'My location', latitude: Math.round(pos.coords.latitude * 100) / 100, longitude: Math.round(pos.coords.longitude * 100) / 100, id: 'here' }); }, function () { err('Location was not allowed. Search for a place instead.'); }, { timeout: 12000 });
  });
  $('wx-fav').addEventListener('click', function () { var p = ST.place; if (!p) return; if (ST.favs.some(function (f) { return f.id === p.id; })) ST.favs = ST.favs.filter(function (f) { return f.id !== p.id; }); else ST.favs.push(p); save(); renderLists(); $('wx-fav').textContent = ST.favs.some(function (f) { return f.id === p.id; }) ? 'Remove from favourites' : 'Add to favourites'; });
  [].forEach.call(document.querySelectorAll('[data-wu]'), function (b) { b.classList.toggle('on', b.dataset.wu === ST.units); b.addEventListener('click', function () { ST.units = b.dataset.wu; [].forEach.call(document.querySelectorAll('[data-wu]'), function (x) { x.classList.toggle('on', x.dataset.wu === ST.units); }); save(); if (ST.place) load(ST.place); }); });
  renderLists();
  load(ST.place || { name: 'Lagos', admin1: 'Lagos', country: 'Nigeria', latitude: 6.5244, longitude: 3.3792, id: '6.5244,3.3792' });
})();
