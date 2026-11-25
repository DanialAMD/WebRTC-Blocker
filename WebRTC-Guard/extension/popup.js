'use strict';

const $ = id => document.getElementById(id);
const protection = $('protection');
let busy = false;

function displayPill(id, text, kind) {
  const el = $(id);
  el.textContent = text;
  el.className = `state-pill ${kind || ''}`;
}

function setBusy(value) {
  busy = value;
  protection.disabled = value;
  $('busy-label').textContent = value ? 'در حال اعمال…' : '';
}

async function send(type, more = {}) {
  const response = await chrome.runtime.sendMessage({type, ...more});
  if (!response?.ok) throw new Error(response?.error || 'خطای نامشخص');
  return response.data;
}

function render(data) {
  protection.checked = data.enabled;
  $('indicator').className = `indicator ${data.enabled ? 'blocked' : 'allowed'}`;
  $('mode-title').textContent = data.enabled ? 'مسدودسازی روشن است' : 'WebRTC مجاز است';
  $('mode-subtitle').textContent = data.enabled ? 'BLOCKED' : 'ALLOWED';

  const apiOk = data.registered === data.enabled;
  displayPill('api-status', apiOk ? (data.enabled ? 'فعال' : 'غیرفعال') : 'خطا',
    apiOk ? (data.enabled ? 'good' : 'off') : 'bad');

  const policyOwned = data.policy?.control === 'controlled_by_this_extension';
  if (data.enabled && data.policy?.effective) {
    displayPill('udp-status', 'محدود شده', 'good');
  } else if (data.enabled) {
    displayPill('udp-status', 'اعمال نشده', 'bad');
  } else {
    displayPill('udp-status', policyOwned ? 'نیازمند بررسی' : 'تنظیم مرورگر', 'off');
  }

  const warnings = [];
  if (data.privacyError) warnings.push(`تنظیم شبکه اعمال نشد: ${data.privacyError}`);
  if (data.enabled && data.policy?.effective && !policyOwned) {
    warnings.push('محدودیت UDP برقرار است، ولی کنترل این تنظیم در اختیار افزونه نیست.');
  }
  $('privacy-note').hidden = warnings.length === 0;
  $('privacy-note').textContent = warnings.join(' ');

  const needsReload = data.pendingReload && data.tabCount > 0;
  $('reload-section').hidden = !needsReload;
  $('reload-button').textContent = `بارگذاری مجدد ${data.tabCount} تب وب‌سایت`;
  $('confirm-section').hidden = true;
}

async function perform(task) {
  if (busy) return;
  setBusy(true);
  $('error').hidden = true;
  try {
    render(await task());
  } catch (error) {
    $('error').textContent = `خطا: ${error.message || error}`;
    $('error').hidden = false;
    try { render(await send('getStatus')); } catch (_) {}
  } finally {
    setBusy(false);
  }
}

protection.addEventListener('change', () => {
  const enabled = protection.checked;
  perform(() => send('setProtection', {enabled}));
});

$('reload-button').addEventListener('click', () => {
  $('confirm-section').hidden = false;
});
$('cancel-reload').addEventListener('click', () => {
  $('confirm-section').hidden = true;
});
$('confirm-reload').addEventListener('click', () => {
  perform(() => send('reloadTabs'));
});

perform(() => send('getStatus'));
