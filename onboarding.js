'use strict';

const radios      = document.querySelectorAll('input[type="radio"]');
const optAlways   = document.getElementById('opt-always');
const optSchedule = document.getElementById('opt-schedule');
const optOff      = document.getElementById('opt-off');
const timePickers = document.getElementById('timePickers');
const startTime   = document.getElementById('startTime');
const endTime     = document.getElementById('endTime');
const saveBtn     = document.getElementById('saveBtn');

const allOpts = [optAlways, optSchedule, optOff];

function getMode() {
  return [...radios].find(r => r.checked)?.value ?? 'always';
}

function updateUI() {
  const mode = getMode();
  allOpts.forEach(opt => {
    const radio = opt.querySelector('input[type="radio"]');
    opt.classList.toggle('selected', radio.checked);
  });
  timePickers.classList.toggle('visible', mode === 'schedule');
  saveBtn.textContent = mode === 'off' ? 'Got it' : 'Get started';
}

allOpts.forEach(opt => {
  opt.addEventListener('click', () => {
    opt.querySelector('input[type="radio"]').checked = true;
    updateUI();
  });
});

saveBtn.addEventListener('click', () => {
  const mode = getMode();
  chrome.storage.sync.set({
    enabled:         mode !== 'off',
    scheduleEnabled: mode === 'schedule',
    startTime:       startTime.value,
    endTime:         endTime.value,
  }, () => window.close());
});
