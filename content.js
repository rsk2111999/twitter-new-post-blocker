'use strict';

// ── Nudge messages ────────────────────────────────────────────────────────────
const NUDGES = [
  "Go touch grass.",
  "Your life is worth more than this feed.",
  "Take a walk. The tweets will still be bad later.",
  "The world outside has no character limit.",
  "Skill issue: the algorithm. Winner: you.",
  "Those tweets weren't going to change your life.",
  "Outside is still there. Just checking.",
  "Drink some water. That's the real hot take.",
  "A good book > 47 hot takes.",
  "New posts blocked. You're welcome.",
];

// ── State ─────────────────────────────────────────────────────────────────────
let enabled         = true;
let scheduleEnabled = false;
let startTime       = '09:00';
let endTime         = '18:00';
let breakUntil      = 0;
let allowlist       = [];

let seenTweetIds    = new Set();
let observer        = null;
let scheduleCheckInterval = null;
let breakTimeout    = null;
let nudgeBanner     = null;
let nudgeTimeout    = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function isWithinSchedule() {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const s = sh * 60 + sm, e = eh * 60 + em;
  return s <= e ? (cur >= s && cur < e) : (cur >= s || cur < e);
}

function shouldBlock() {
  if (!enabled) return false;
  if (breakUntil && Date.now() < breakUntil) return false;
  if (!scheduleEnabled) return true;
  return isWithinSchedule();
}

// ── Stats recording ───────────────────────────────────────────────────────────
function recordBlock() {
  chrome.storage.local.get(
    { todayDate: '', todayBlocked: 0, streak: 0, lastActiveDate: '', totalBlocked: 0 },
    (stats) => {
      const today = todayStr();
      let { todayDate, todayBlocked, streak, lastActiveDate, totalBlocked } = stats;

      if (todayDate !== today) {
        // New day — check streak continuity
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        streak = lastActiveDate === yesterday ? streak + 1 : 1;
        todayDate    = today;
        todayBlocked = 0;
        lastActiveDate = today;
      } else if (!lastActiveDate) {
        streak = 1;
        lastActiveDate = today;
      }

      todayBlocked  += 1;
      totalBlocked  += 1;

      chrome.storage.local.set({ todayDate, todayBlocked, streak, lastActiveDate, totalBlocked });
    }
  );
}

// ── Tweet author extraction ───────────────────────────────────────────────────
function getTweetAuthor(article) {
  const anchors = article.querySelectorAll('a[href^="/"]');
  for (const a of anchors) {
    try {
      const parts = new URL(a.href).pathname.split('/').filter(Boolean);
      if (parts.length === 1) {
        const h = parts[0].toLowerCase();
        if (!['home','explore','notifications','messages','i','settings','search'].includes(h))
          return h;
      }
    } catch { /* skip */ }
  }
  return null;
}

function getTweetId(article) {
  const link = article.querySelector('a[href*="/status/"]');
  if (!link) return null;
  const match = link.href.match(/\/status\/(\d+)/);
  return match ? match[1] : null;
}

// ── Nudge modal ───────────────────────────────────────────────────────────────
function dismiss(overlay) {
  clearTimeout(nudgeTimeout);
  overlay.style.opacity = '0';
  nudgeBanner.style.opacity = '0';
  nudgeBanner.style.transform = 'translate(-50%, -52%) scale(0.96)';
  setTimeout(() => { overlay.remove(); nudgeBanner?.remove(); nudgeBanner = null; }, 250);
}

function showNudge() {
  if (nudgeBanner) return;
  const msg = NUDGES[Math.floor(Math.random() * NUDGES.length)];

  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0',
    background: 'rgba(91,112,131,0.4)',
    zIndex: '999998', opacity: '0',
    transition: 'opacity 0.2s ease',
  });

  nudgeBanner = document.createElement('div');
  nudgeBanner.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px 0">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#e7e9ea">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
      <button id="nudge-close" style="background:none;border:none;cursor:pointer;padding:8px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#e7e9ea;transition:background 0.2s"
        onmouseover="this.style.background='rgba(239,243,244,0.1)'" onmouseout="this.style.background='none'">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z"/>
        </svg>
      </button>
    </div>
    <div style="padding:8px 32px 32px;text-align:center">
      <div style="font-size:15px;font-weight:800;color:#e7e9ea;line-height:1.3;margin-bottom:8px">${msg}</div>
      <div style="font-size:14px;color:#71767b;line-height:1.5;margin-bottom:28px">New posts were blocked. Your future self says thanks.</div>
      <button id="nudge-ok" style="background:#e7e9ea;color:#0f1419;border:none;border-radius:9999px;padding:0 20px;height:44px;font-size:15px;font-weight:700;cursor:pointer;width:100%;font-family:inherit;transition:background 0.2s"
        onmouseover="this.style.background='#d7d9da'" onmouseout="this.style.background='#e7e9ea'">Got it</button>
    </div>`;

  Object.assign(nudgeBanner.style, {
    position: 'fixed', top: '50%', left: '50%',
    transform: 'translate(-50%, -46%) scale(0.94)',
    background: '#000', color: '#e7e9ea', borderRadius: '16px',
    fontFamily: '"TwitterChirp", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    boxShadow: 'rgba(255,255,255,0.2) 0px 0px 15px, rgba(255,255,255,0.15) 0px 0px 3px 1px',
    zIndex: '999999', opacity: '0', width: '320px',
    transition: 'opacity 0.2s ease, transform 0.25s cubic-bezier(0.34,1.4,0.64,1)',
  });

  document.body.appendChild(overlay);
  document.body.appendChild(nudgeBanner);

  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    nudgeBanner.style.opacity = '1';
    nudgeBanner.style.transform = 'translate(-50%, -50%) scale(1)';
  });

  nudgeBanner.querySelector('#nudge-close').addEventListener('click', () => dismiss(overlay));
  nudgeBanner.querySelector('#nudge-ok').addEventListener('click', () => dismiss(overlay));
  overlay.addEventListener('click', () => dismiss(overlay));
  nudgeTimeout = setTimeout(() => dismiss(overlay), 5000);
}

// ── Snapshot & suppression ────────────────────────────────────────────────────
function snapshotCurrentTweets() {
  document.querySelectorAll('article[data-testid="tweet"]').forEach((a) => {
    const id = getTweetId(a);
    if (id) seenTweetIds.add(id);
  });
}

function suppressNewPostsBanner(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const cells = node.matches('[data-testid="cellInnerDiv"]')
    ? [node] : [...node.querySelectorAll('[data-testid="cellInnerDiv"]')];
  cells.forEach((cell) => {
    if (/\d+\s+new\s+(post|tweet)s?/i.test(cell.textContent) ||
        /show\s+\d+/i.test(cell.textContent)) {
      cell.style.setProperty('display', 'none', 'important');
      showNudge();
    }
  });
}

function suppressNewTweets(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const articles = node.matches('article[data-testid="tweet"]')
    ? [node] : [...node.querySelectorAll('article[data-testid="tweet"]')];

  articles.forEach((article) => {
    const id = getTweetId(article);
    if (!id) return;
    if (seenTweetIds.has(id)) return;

    // Check allowlist — always show posts from these accounts
    const author = getTweetAuthor(article);
    if (author && allowlist.map(h => h.toLowerCase()).includes(author)) {
      seenTweetIds.add(id); // treat as seen so it won't be re-evaluated
      return;
    }

    const cell = article.closest('[data-testid="cellInnerDiv"]') || article;
    cell.style.setProperty('display', 'none', 'important');
    showNudge();
    recordBlock();
  });
}

function onMutation(mutations) {
  if (!shouldBlock()) return;
  mutations.forEach((m) => m.addedNodes.forEach((n) => {
    suppressNewPostsBanner(n);
    suppressNewTweets(n);
  }));
}

// ── Start / stop ──────────────────────────────────────────────────────────────
function start() {
  snapshotCurrentTweets();
  if (observer) return;
  observer = new MutationObserver(onMutation);
  observer.observe(document.body, { childList: true, subtree: true });
}

function stop() {
  if (observer) { observer.disconnect(); observer = null; }
  document.querySelectorAll('[style*="display: none"]').forEach((el) => el.style.removeProperty('display'));
  seenTweetIds.clear();
  clearTimeout(nudgeTimeout);
  nudgeBanner?.remove(); nudgeBanner = null;
}

function applyState() {
  shouldBlock() ? start() : stop();
}

function startScheduleCheck() {
  clearInterval(scheduleCheckInterval);
  scheduleCheckInterval = setInterval(applyState, 60_000);
}

// ── Break timer ───────────────────────────────────────────────────────────────
function setBreakTimeout() {
  clearTimeout(breakTimeout);
  const remaining = breakUntil - Date.now();
  if (remaining > 0) {
    breakTimeout = setTimeout(() => {
      breakUntil = 0;
      chrome.storage.sync.set({ breakUntil: 0 });
      applyState();
    }, remaining);
  }
}

// ── Storage bootstrap ─────────────────────────────────────────────────────────
chrome.storage.sync.get(
  { enabled: true, scheduleEnabled: false, startTime: '09:00', endTime: '18:00', breakUntil: 0, allowlist: [] },
  (result) => {
    enabled         = result.enabled;
    scheduleEnabled = result.scheduleEnabled;
    startTime       = result.startTime;
    endTime         = result.endTime;
    breakUntil      = result.breakUntil || 0;
    allowlist       = result.allowlist || [];
    applyState();
    if (breakUntil && Date.now() < breakUntil) setBreakTimeout();
    startScheduleCheck();
  }
);

chrome.storage.sync.onChanged.addListener((changes) => {
  if ('enabled'         in changes) enabled         = changes.enabled.newValue;
  if ('scheduleEnabled' in changes) scheduleEnabled = changes.scheduleEnabled.newValue;
  if ('startTime'       in changes) startTime       = changes.startTime.newValue;
  if ('endTime'         in changes) endTime         = changes.endTime.newValue;
  if ('allowlist'       in changes) allowlist       = changes.allowlist.newValue || [];
  if ('breakUntil'      in changes) {
    breakUntil = changes.breakUntil.newValue || 0;
    clearTimeout(breakTimeout);
    if (breakUntil && Date.now() < breakUntil) setBreakTimeout();
  }
  applyState();
});
