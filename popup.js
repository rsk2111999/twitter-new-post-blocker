'use strict';

// ── Elements ──────────────────────────────────────────────────────────────────
const toggle         = document.getElementById('toggle');
const schedToggle    = document.getElementById('scheduleToggle');
const schedBody      = document.getElementById('scheduleBody');
const schedDesc      = document.getElementById('scheduleDesc');
const startTimeEl    = document.getElementById('startTime');
const endTimeEl      = document.getElementById('endTime');
const statusPill     = document.getElementById('statusPill');
const statusText     = document.getElementById('statusText');
const quoteEl        = document.getElementById('quote');

// Stats
const statStreak     = document.getElementById('statStreak');
const statToday      = document.getElementById('statToday');
const statTotal      = document.getElementById('statTotal');

// Break
const breakSection   = document.getElementById('breakSection');
const breakBtns      = document.getElementById('breakBtns');
const breakActive    = document.getElementById('breakActive');
const breakTime      = document.getElementById('breakTime');
const breakCancel    = document.getElementById('breakCancel');

// Digest
const digestApiKey      = document.getElementById('digestApiKey');
const digestSaveKey     = document.getElementById('digestSaveKey');
const digestTopics      = document.getElementById('digestTopics');
const digestGenerateBtn = document.getElementById('digestGenerateBtn');
const digestNoKeyHint   = document.getElementById('digestNoKeyHint');

// Allowlist
const allowlistChips    = document.getElementById('allowlistChips');
const allowlistEmpty    = document.getElementById('allowlistEmpty');
const allowlistAddBtn   = document.getElementById('allowlistAddBtn');
const allowlistInputRow = document.getElementById('allowlistInputRow');
const allowlistInput    = document.getElementById('allowlistInput');
const allowlistConfirm  = document.getElementById('allowlistConfirm');

// ── Quotes ────────────────────────────────────────────────────────────────────
const QUOTES = [
  "Your life is worth more than this feed.",
  "Go touch grass. Seriously.",
  "Take a walk. The tweets will still be bad later.",
  "The world outside has no character limit.",
  "Skill issue: the algorithm. Winner: you.",
  "Those tweets weren't going to change your life.",
  "Drink some water. That's the real hot take.",
];
const randomQuote = () => QUOTES[Math.floor(Math.random() * QUOTES.length)];

// ── Formatting ────────────────────────────────────────────────────────────────
function fmt(t) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function fmtMs(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function isWithinSchedule(s, e) {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  const sv = sh * 60 + sm, ev = eh * 60 + em;
  return sv <= ev ? (cur >= sv && cur < ev) : (cur >= sv || cur < ev);
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function loadStats() {
  chrome.storage.local.get(
    { todayBlocked: 0, streak: 0, totalBlocked: 0 },
    ({ todayBlocked, streak, totalBlocked }) => {
      statStreak.textContent = streak;
      statToday.textContent  = todayBlocked;
      statTotal.textContent  = totalBlocked;
    }
  );
}

// ── Break timer ───────────────────────────────────────────────────────────────
let breakInterval = null;

function startBreakCountdown(breakUntil) {
  breakBtns.style.display   = 'none';
  breakActive.classList.add('visible');
  clearInterval(breakInterval);
  breakInterval = setInterval(() => {
    const remaining = breakUntil - Date.now();
    if (remaining <= 0) {
      clearInterval(breakInterval);
      breakBtns.style.display = 'flex';
      breakActive.classList.remove('visible');
      breakTime.textContent = '–';
    } else {
      breakTime.textContent = fmtMs(remaining);
    }
  }, 500);
  breakTime.textContent = fmtMs(breakUntil - Date.now());
}

function stopBreakCountdown() {
  clearInterval(breakInterval);
  breakBtns.style.display = 'flex';
  breakActive.classList.remove('visible');
}

document.querySelectorAll('.break-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mins = parseInt(btn.dataset.mins, 10);
    const breakUntil = Date.now() + mins * 60 * 1000;
    chrome.storage.sync.set({ breakUntil });
    startBreakCountdown(breakUntil);
    updateStatus(toggle.checked, schedToggle.checked, startTimeEl.value, endTimeEl.value, breakUntil);
  });
});

breakCancel.addEventListener('click', () => {
  chrome.storage.sync.set({ breakUntil: 0 });
  stopBreakCountdown();
  updateStatus(toggle.checked, schedToggle.checked, startTimeEl.value, endTimeEl.value, 0);
});

// ── Allowlist ─────────────────────────────────────────────────────────────────
let allowlist = [];

function renderChips() {
  allowlistChips.innerHTML = '';
  if (allowlist.length === 0) {
    allowlistChips.appendChild(allowlistEmpty);
    allowlistEmpty.style.display = 'inline';
    return;
  }
  allowlistEmpty.style.display = 'none';
  allowlist.forEach((handle) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `@${handle} <button class="chip-remove" data-handle="${handle}">×</button>`;
    chip.querySelector('.chip-remove').addEventListener('click', () => {
      allowlist = allowlist.filter(h => h !== handle);
      chrome.storage.sync.set({ allowlist });
      renderChips();
    });
    allowlistChips.appendChild(chip);
  });
}

allowlistAddBtn.addEventListener('click', () => {
  allowlistInputRow.classList.toggle('visible');
  if (allowlistInputRow.classList.contains('visible')) allowlistInput.focus();
});

function addHandle() {
  const val = allowlistInput.value.trim().replace(/^@/, '').toLowerCase();
  if (!val || allowlist.includes(val)) { allowlistInput.value = ''; return; }
  allowlist = [...allowlist, val];
  chrome.storage.sync.set({ allowlist });
  renderChips();
  allowlistInput.value = '';
  allowlistInputRow.classList.remove('visible');
}

allowlistConfirm.addEventListener('click', addHandle);
allowlistInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addHandle(); });

// ── Status pill ───────────────────────────────────────────────────────────────
function updateStatus(enabled, scheduleEnabled, s, e, breakUntil) {
  if (!enabled) {
    statusPill.className = 'status-pill';
    statusText.textContent = 'Blocking off';
    quoteEl.className = 'quote';
    breakSection.style.opacity = '0.4';
    breakSection.style.pointerEvents = 'none';
    return;
  }
  breakSection.style.opacity = '';
  breakSection.style.pointerEvents = '';

  if (breakUntil && Date.now() < breakUntil) {
    statusPill.className = 'status-pill';
    statusText.textContent = 'On a break · resuming soon';
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
  statusText.textContent = within ? `Blocking · until ${fmt(e)}` : `Paused · resumes ${fmt(s)}`;
  quoteEl.textContent = within ? randomQuote() : '';
  quoteEl.className = within ? 'quote visible' : 'quote';
}

// ── Settings toggles ──────────────────────────────────────────────────────────
function save() {
  const state = {
    enabled:         toggle.checked,
    scheduleEnabled: schedToggle.checked,
    startTime:       startTimeEl.value,
    endTime:         endTimeEl.value,
  };
  chrome.storage.sync.set(state);

  schedBody.classList.toggle('open', state.enabled && state.scheduleEnabled);
  schedDesc.textContent = state.scheduleEnabled && state.enabled
    ? `${fmt(state.startTime)} – ${fmt(state.endTime)}`
    : 'Only block during specific hours';

  chrome.storage.sync.get({ breakUntil: 0 }, ({ breakUntil }) => {
    updateStatus(state.enabled, state.scheduleEnabled, state.startTime, state.endTime, breakUntil);
  });
}

[toggle, schedToggle].forEach(el => el.addEventListener('change', save));
[startTimeEl, endTimeEl].forEach(el => el.addEventListener('change', save));

// ── Digest ────────────────────────────────────────────────────────────────────
function getSelectedTopics() {
  return [...digestTopics.querySelectorAll('.topic-chip.selected')]
    .map(c => c.dataset.topic);
}

function setDigestReady(hasKey) {
  digestGenerateBtn.disabled = !hasKey;
  digestNoKeyHint.style.display = hasKey ? 'none' : 'block';
}

// Topic chip toggles
digestTopics.addEventListener('click', (e) => {
  const chip = e.target.closest('.topic-chip');
  if (!chip) return;
  chip.classList.toggle('selected');
  // Save selection
  const selected = getSelectedTopics();
  chrome.storage.local.set({ digestTopics: selected });
});

// Save / update API key
digestSaveKey.addEventListener('click', () => {
  const val = digestApiKey.value.trim();
  if (!val) return;
  chrome.storage.local.set({ digestApiKey: val }, () => {
    setDigestReady(true);
    digestApiKey.value = '';
    digestSaveKey.textContent = 'Saved ✓';
    setTimeout(() => { digestSaveKey.textContent = 'Save'; }, 1800);
  });
});
digestApiKey.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') digestSaveKey.click();
});

// Generate digest
digestGenerateBtn.addEventListener('click', () => {
  chrome.storage.local.get({ digestApiKey: '', digestTopics: ['AI & ML', 'Tech'] }, ({ digestApiKey: key, digestTopics: topics }) => {
    if (!key) { setDigestReady(false); return; }

    const activeTopics = getSelectedTopics().length > 0 ? getSelectedTopics() : topics;

    digestGenerateBtn.disabled = true;
    digestGenerateBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="animation:spin 0.8s linear infinite"><path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z"/></svg> Generating…`;

    // Inject spin animation if not present
    if (!document.getElementById('spin-style')) {
      const s = document.createElement('style');
      s.id = 'spin-style';
      s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }

    chrome.runtime.sendMessage({ type: 'generateDigest', apiKey: key, topics: activeTopics }, () => {
      digestGenerateBtn.disabled = false;
      digestGenerateBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg> Generate Digest`;
      window.close(); // close popup so user can see the panel
    });
  });
});

// Boot digest state
chrome.storage.local.get({ digestApiKey: '', digestTopics: ['AI & ML', 'Tech'] }, ({ digestApiKey: key, digestTopics: savedTopics }) => {
  setDigestReady(!!key);
  if (key) {
    digestApiKey.placeholder = '••••••••••••••••• (saved)';
  }
  // Restore topic selection
  digestTopics.querySelectorAll('.topic-chip').forEach((chip) => {
    chip.classList.toggle('selected', savedTopics.includes(chip.dataset.topic));
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
chrome.storage.sync.get(
  { enabled: true, scheduleEnabled: false, startTime: '09:00', endTime: '18:00', breakUntil: 0, allowlist: [] },
  (state) => {
    toggle.checked      = state.enabled;
    schedToggle.checked = state.scheduleEnabled;
    startTimeEl.value   = state.startTime;
    endTimeEl.value     = state.endTime;
    allowlist           = state.allowlist || [];

    schedBody.classList.toggle('open', state.enabled && state.scheduleEnabled);
    schedDesc.textContent = state.scheduleEnabled && state.enabled
      ? `${fmt(state.startTime)} – ${fmt(state.endTime)}`
      : 'Only block during specific hours';

    const bu = state.breakUntil || 0;
    if (bu && Date.now() < bu) startBreakCountdown(bu);

    updateStatus(state.enabled, state.scheduleEnabled, state.startTime, state.endTime, bu);
    renderChips();
    loadStats();
  }
);
