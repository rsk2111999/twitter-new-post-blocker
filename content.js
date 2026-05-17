'use strict';

let enabled = true;
let seenTweetIds = new Set();
let observer = null;

const NUDGES = [
  "Go touch grass.",
  "Your life is worth more than this feed.",
  "Take a walk. The tweets will still be bad later.",
  "Drink some water. Seriously.",
  "The world outside has no character limit.",
  "Skill issue: the algorithm. Winner: you.",
  "Those tweets weren't going to change your life.",
  "Outside is still there. Just checking.",
  "New posts blocked. You're welcome.",
  "A good book > 47 hot takes.",
];

let nudgeBanner = null;
let nudgeTimeout = null;

function dismiss(overlay) {
  clearTimeout(nudgeTimeout);
  overlay.style.opacity = '0';
  nudgeBanner.style.opacity = '0';
  nudgeBanner.style.transform = 'translate(-50%, -52%) scale(0.96)';
  setTimeout(() => {
    overlay.remove();
    nudgeBanner?.remove();
    nudgeBanner = null;
  }, 250);
}

function showNudge() {
  if (nudgeBanner) return;

  const msg = NUDGES[Math.floor(Math.random() * NUDGES.length)];

  // Twitter-style dim overlay (no blur — Twitter doesn't use it)
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(91,112,131,0.4)',
    zIndex: '999998',
    opacity: '0',
    transition: 'opacity 0.2s ease',
  });

  nudgeBanner = document.createElement('div');
  nudgeBanner.innerHTML = `
    <div style="
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding:12px 16px 0;
    ">
      <!-- X logo (Twitter brand) -->
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#e7e9ea">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
      <!-- Close button -->
      <button id="nudge-close" style="
        background:none;
        border:none;
        cursor:pointer;
        padding:8px;
        border-radius:50%;
        display:flex;
        align-items:center;
        justify-content:center;
        color:#e7e9ea;
        transition:background 0.2s;
      " onmouseover="this.style.background='rgba(239,243,244,0.1)'"
         onmouseout="this.style.background='none'">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z"/>
        </svg>
      </button>
    </div>

    <!-- Body -->
    <div style="padding:8px 32px 32px;text-align:center;">
      <div style="font-size:15px;font-weight:800;color:#e7e9ea;line-height:1.3;margin-bottom:8px">
        ${msg}
      </div>
      <div style="font-size:14px;color:#71767b;line-height:1.5;margin-bottom:28px">
        New posts were blocked. Your future self says thanks.
      </div>
      <!-- Twitter-style primary button -->
      <button id="nudge-ok" style="
        background:#e7e9ea;
        color:#0f1419;
        border:none;
        border-radius:9999px;
        padding:0 20px;
        height:44px;
        font-size:15px;
        font-weight:700;
        cursor:pointer;
        width:100%;
        font-family:inherit;
        transition:background 0.2s;
      " onmouseover="this.style.background='#d7d9da'"
         onmouseout="this.style.background='#e7e9ea'">
        Got it
      </button>
    </div>
  `;

  Object.assign(nudgeBanner.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -46%) scale(0.94)',
    background: '#000',
    color: '#e7e9ea',
    borderRadius: '16px',
    fontFamily: '"TwitterChirp", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    boxShadow: 'rgba(255,255,255,0.2) 0px 0px 15px, rgba(255,255,255,0.15) 0px 0px 3px 1px',
    zIndex: '999999',
    opacity: '0',
    width: '320px',
    transition: 'opacity 0.2s ease, transform 0.25s cubic-bezier(0.34,1.4,0.64,1)',
  });

  document.body.appendChild(overlay);
  document.body.appendChild(nudgeBanner);

  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    nudgeBanner.style.opacity = '1';
    nudgeBanner.style.transform = 'translate(-50%, -50%) scale(1)';
  });

  // Close on button or overlay click
  nudgeBanner.querySelector('#nudge-close').addEventListener('click', () => dismiss(overlay));
  nudgeBanner.querySelector('#nudge-ok').addEventListener('click', () => dismiss(overlay));
  overlay.addEventListener('click', () => dismiss(overlay));

  nudgeTimeout = setTimeout(() => dismiss(overlay), 5000);
}

// --- State ---
let scheduleEnabled = false;
let startTime = '09:00';
let endTime   = '18:00';
let scheduleCheckInterval = null;

function isWithinSchedule() {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  return s <= e ? (cur >= s && cur < e) : (cur >= s || cur < e);
}

function shouldBlock() {
  if (!enabled) return false;
  if (!scheduleEnabled) return true;
  return isWithinSchedule();
}

function applyState() {
  if (shouldBlock()) {
    start();
  } else {
    stop();
  }
}

// Re-evaluate every minute so the schedule kicks in/out automatically
function startScheduleCheck() {
  clearInterval(scheduleCheckInterval);
  scheduleCheckInterval = setInterval(applyState, 60_000);
}

// Load persisted state
chrome.storage.sync.get(
  { enabled: true, scheduleEnabled: false, startTime: '09:00', endTime: '18:00' },
  (result) => {
    enabled         = result.enabled;
    scheduleEnabled = result.scheduleEnabled;
    startTime       = result.startTime;
    endTime         = result.endTime;
    applyState();
    startScheduleCheck();
  }
);

chrome.storage.sync.onChanged.addListener((changes) => {
  if ('enabled'         in changes) enabled         = changes.enabled.newValue;
  if ('scheduleEnabled' in changes) scheduleEnabled = changes.scheduleEnabled.newValue;
  if ('startTime'       in changes) startTime       = changes.startTime.newValue;
  if ('endTime'         in changes) endTime         = changes.endTime.newValue;
  applyState();
});

function getTweetId(article) {
  const link = article.querySelector('a[href*="/status/"]');
  if (!link) return null;
  const match = link.href.match(/\/status\/(\d+)/);
  return match ? match[1] : null;
}

// Snapshot all tweets currently visible so we don't hide them
function snapshotCurrentTweets() {
  document.querySelectorAll('article[data-testid="tweet"]').forEach((article) => {
    const id = getTweetId(article);
    if (id) seenTweetIds.add(id);
  });
}

// Hide the "X new posts" banner that appears at the top of the timeline
function suppressNewPostsBanner(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  // The banner is a div inside [data-testid="cellInnerDiv"] that contains a link
  // with text like "23 new posts" or "Show 5 new posts"
  const cells = node.matches('[data-testid="cellInnerDiv"]')
    ? [node]
    : [...node.querySelectorAll('[data-testid="cellInnerDiv"]')];

  cells.forEach((cell) => {
    if (/\d+\s+new\s+(post|tweet)s?/i.test(cell.textContent) ||
        /show\s+\d+/i.test(cell.textContent)) {
      cell.style.setProperty('display', 'none', 'important');
      showNudge();
    }
  });
}

// Remove tweets that weren't in the initial snapshot (prepended new ones)
function suppressNewTweets(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const articles = node.matches('article[data-testid="tweet"]')
    ? [node]
    : [...node.querySelectorAll('article[data-testid="tweet"]')];

  articles.forEach((article) => {
    const id = getTweetId(article);
    if (!id) return;

    if (!seenTweetIds.has(id)) {
      const cell = article.closest('[data-testid="cellInnerDiv"]') || article;
      cell.style.setProperty('display', 'none', 'important');
      showNudge();
    }
  });
}

function onMutation(mutations) {
  if (!shouldBlock()) return;
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      suppressNewPostsBanner(node);
      suppressNewTweets(node);
    });
  });
}

function start() {
  snapshotCurrentTweets();
  if (observer) return; // already running
  observer = new MutationObserver(onMutation);
  observer.observe(document.body, { childList: true, subtree: true });
}

function stop() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  document.querySelectorAll('[style*="display: none"]').forEach((el) => {
    el.style.removeProperty('display');
  });
  seenTweetIds.clear();
  clearTimeout(nudgeTimeout);
  nudgeBanner?.remove();
  nudgeBanner = null;
}
