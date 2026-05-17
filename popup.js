'use strict';

const toggle       = document.getElementById('toggle');
const schedToggle  = document.getElementById('scheduleToggle');
const schedBody    = document.getElementById('scheduleBody');
const schedDesc    = document.getElementById('scheduleDesc');
const startTime    = document.getElementById('startTime');
const endTime      = document.getElementById('endTime');
const statusPill   = document.getElementById('statusPill');
const statusText   = document.getElementById('statusText');
const quoteEl      = document.getElementById('quote');

const QUOTES = [
  "Your life is worth more than this feed.",
  "Go touch grass. Seriously.",
  "Take a walk. The tweets will still be bad later.",
  "The world outside has no character limit.",
  "Skill issue: the algorithm. Winner: you.",
  "Those tweets weren't going to change your life.",
  "Outside is still there. Just checking.",
  "Drink some water. That's the real hot take.",
];

function randomQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

function fmt(t) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function isWithinSchedule(s, e) {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  const sv = sh * 60 + sm, ev = eh * 60 + em;
  return sv <= ev ? (cur >= sv && cur < ev) : (cur >= sv || cur < ev);
}

function updateUI({ enabled, scheduleEnabled, startTime: s, endTime: e }) {
  toggle.checked     = enabled;
  schedToggle.checked = scheduleEnabled;
  startTime.value    = s;
  endTime.value      = e;

  // Show/hide time pickers
  const showPickers = enabled && scheduleEnabled;
  schedBody.classList.toggle('open', showPickers);
  schedToggle.closest('.toggle-wrap').style.opacity = enabled ? '1' : '0.4';
  schedToggle.closest('.toggle-wrap').style.pointerEvents = enabled ? '' : 'none';

  // Schedule description
  schedDesc.textContent = scheduleEnabled && enabled
    ? `${fmt(s)} – ${fmt(e)}`
    : 'Only block during specific hours';

  // Status pill
  if (!enabled) {
    statusPill.className = 'status-pill';
    statusText.textContent = 'Blocking off';
    quoteEl.className = 'quote';
    return;
  }

  if (!scheduleEnabled) {
    statusPill.className = 'status-pill active';
    statusText.textContent = 'Blocking all day';
    quoteEl.textContent = randomQuote();
    quoteEl.className = 'quote visible';
    return;
  }

  const within = isWithinSchedule(s, e);
  statusPill.className = within ? 'status-pill active' : 'status-pill';
  statusText.textContent = within
    ? `Blocking · until ${fmt(e)}`
    : `Paused · resumes ${fmt(s)}`;
  quoteEl.textContent = within ? randomQuote() : '';
  quoteEl.className = within ? 'quote visible' : 'quote';
}

function save() {
  const state = {
    enabled:         toggle.checked,
    scheduleEnabled: schedToggle.checked,
    startTime:       startTime.value,
    endTime:         endTime.value,
  };
  chrome.storage.sync.set(state);
  updateUI(state);
}

chrome.storage.sync.get(
  { enabled: true, scheduleEnabled: false, startTime: '09:00', endTime: '18:00' },
  updateUI
);

[toggle, schedToggle].forEach(el => el.addEventListener('change', save));
[startTime, endTime].forEach(el => el.addEventListener('change', save));
