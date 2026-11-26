import { LANGUAGES, STRINGS } from './i18n.js';
import {
  clamp,
  rgbToHex,
  hexToRgb,
  rgbToHsl,
  hslToRgb,
  rgbToLab,
  deltaE2000,
  deltaEToAccuracy,
  relativeLuminance,
} from './color.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const STORAGE_KEY = 'color-clash.v1';
const MEMORY_MS = 3000;
const TIMED_MS = 60000;
const WIN_SCORE = 90;
const DEFAULT_RGB = [128, 128, 128];
const MODE_KEYS = { classic: 'classic', daily: 'daily', timed: 'timed', practice: 'practice' };
const CHANNELS = {
  hsl: [
    { label: 'Тон · H', aria: 'Тон', max: 360, step: 0.1, unit: '°' },
    { label: 'Насыщенность · S', aria: 'Насыщенность', max: 100, step: 0.1, unit: '%' },
    { label: 'Светлота · L', aria: 'Светлота', max: 100, step: 0.1, unit: '%' },
  ],
  rgb: [
    { label: 'Красный · R', aria: 'Красный', max: 255, step: 1, unit: '' },
    { label: 'Зелёный · G', aria: 'Зелёный', max: 255, step: 1, unit: '' },
    { label: 'Синий · B', aria: 'Синий', max: 255, step: 1, unit: '' },
  ],
};

const elements = {
  difficulty: $('#difficulty'),
  roundLabel: $('#roundLabel'),
  phaseLabel: $('#phaseLabel'),
  timePill: $('#timePill'),
  sessionClock: $('#sessionClock'),
  arena: $('#colorArena'),
  target: $('#targetSwatch'),
  player: $('#playerSwatch'),
  stageHint: $('#stageHint'),
  memoryCountdown: $('#memoryCountdown'),
  memoryProgress: $('#memoryProgress'),
  lobbyView: $('#lobbyView'),
  mixView: $('#mixView'),
  resultView: $('#resultView'),
  finishedView: $('#finishedView'),
  fieldset: $('#sliderFieldset'),
  currentHex: $('#currentHex'),
  stopSwitch: $('#stopSwitch'),
  checkButton: $('#checkButton'),
  checkButtonText: $('#checkButtonText'),
  resetColor: $('#resetColorButton'),
  nextButton: $('#nextButton'),
  nextButtonText: $('#nextButtonText'),
  copyButton: $('#copyButton'),
  accuracy: $('#accuracyValue'),
  delta: $('#deltaValue'),
  resultTitle: $('#resultTitle'),
  resultMessage: $('#resultMessage'),
  resultCodes: $('#resultCodes'),
  topBest: $('#topBest'),
  bestScore: $('#bestScore'),
  streak: $('#streakScore'),
  bestStreak: $('#bestStreak'),
  attempts: $('#attemptCount'),
  historyList: $('#historyList'),
  toast: $('#toast'),
};

function loadData() {
  const fallback = {
    bestScore: null,
    bestStreak: 0,
    streak: 0,
    history: [],
    daily: {},
    bestClassic: null,
    bestTimed: null,
    language: 'ru',
    sound: false,
    dailyStreak: 0,
    lastDailyDate: null,
  };
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!stored || typeof stored !== 'object') return fallback;
    return {
      ...fallback,
      ...stored,
      history: Array.isArray(stored.history) ? stored.history.slice(0, 80) : [],
      daily: stored.daily && typeof stored.daily === 'object' ? stored.daily : {},
      language: STRINGS[stored.language] ? stored.language : 'ru',
      sound: Boolean(stored.sound),
      dailyStreak: Math.max(0, Number(stored.dailyStreak) || 0),
      lastDailyDate: typeof stored.lastDailyDate === 'string' ? stored.lastDailyDate : null,
    };
  } catch {
    return fallback;
  }
}

let data = loadData();
const state = {
  mode: 'classic',
  difficulty: 'solid',
  format: 'hsl',
  phase: 'idle',
  round: 0,
  results: [],
  target: [],
  player: [[...DEFAULT_RGB], [160, 160, 160]],
  activeStop: 0,
  lastResult: null,
  memoryFrame: null,
  sessionInterval: null,
  sessionEnd: null,
};
let toastTimer;

function t(key, vars = {}) {
  const template = STRINGS[data.language]?.[key] ?? STRINGS.en[key] ?? STRINGS.ru[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

function applyLanguage() {
  const language = data.language;
  const locale = LANGUAGES.find(([code]) => code === language)?.[2] || 'en-US';
  const isRtl = language === 'ar';
  document.documentElement.lang = language;
  document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
  $('#languageSelect').value = language;
  const text = (id, key) => { const element = $(`#${id}`); if (element) element.textContent = t(key); };
  const html = (id, key) => { const element = $(`#${id}`); if (element) element.innerHTML = t(key); };
  text('languageLabel', 'language'); text('topRecordLabel', 'record');
  text('phaseLabel', 'phaseReady'); text('idleTarget', 'target'); text('deltaLabel', 'delta');
  text('lobbyEyebrow', 'lobby'); text('paletteEyebrow', 'palette'); text('mixHeading', 'mix');
  text('stopALabel', 'stopA'); text('stopBLabel', 'stopB');
  $('#formatSwitch').setAttribute('aria-label', t('colorModel'));
  text('speedTip', 'speedTip'); text('resetColorButton', 'reset'); text('endPracticeLabel', 'endPractice');
  text('historyButtonLabel', 'history'); text('eyebrowText', 'eyebrow');
  text('titleLine1', 'title1'); text('titleLine2', 'title2'); text('formatLabel', 'format');
  text('classicModeLabel', 'classic'); text('classicModeMeta', 'classicMeta');
  text('dailyModeLabel', 'daily'); text('dailyModeSubtitle', 'dailyMeta');
  text('timedModeLabel', 'timed'); text('timedModeMeta', 'timedMeta');
  text('practiceModeLabel', 'practice'); text('practiceModeMeta', 'practiceMeta');
  text('bestStatLabel', 'statBest'); text('bestAccuracyLabel', 'bestAccuracy');
  text('winStreakLabel', 'statStreak'); text('winStreakDescription', 'hitStreak'); text('maxLabel', 'max');
  text('dailyStreakLabel', 'dailyStreak'); text('dailyStreakDescription', 'days');
  text('experienceLabel', 'statExperience'); text('colorsRecreatedLabel', 'colorsRecreated');
  text('footerDesign', 'footerDesign'); text('footerLocal', 'footerLocal');
  text('helpEyebrow', 'help'); html('helpTitle', 'helpTitle');
  text('helpRemember', 'remember'); text('helpRememberText', 'rememberText');
  text('helpRecreate', 'recreate'); text('helpRecreateText', 'recreateText');
  text('helpCompare', 'compare'); text('helpCompareText', 'compareText');
  text('helpNote', 'helpNote'); text('helpGotIt', 'gotIt');
  text('historyEyebrow', 'archive'); text('historyTitle', 'historyTitle');
  text('historyLastLabel', 'last80'); text('clearHistoryButton', 'clearHistory');
  $('#modeSwitch').setAttribute('aria-label', t('lobbyChoose'));
  $('#helpButton').setAttribute('aria-label', t('help')); $('#helpButton').title = t('help');
  $('#historyButton').setAttribute('aria-label', t('history'));
  $('#restartButton').setAttribute('aria-label', t('restart')); $('#restartButton').title = t('restart');
  const difficultyOptions = [...elements.difficulty.options];
  difficultyOptions[0].textContent = t('solid');
  difficultyOptions[1].textContent = t('gradient');
  CHANNELS.hsl[0].label = t('hue'); CHANNELS.hsl[0].aria = t('hue').split(' · ')[0];
  CHANNELS.hsl[1].label = t('saturation'); CHANNELS.hsl[1].aria = t('saturation').split(' · ')[0];
  CHANNELS.hsl[2].label = t('lightness'); CHANNELS.hsl[2].aria = t('lightness').split(' · ')[0];
  CHANNELS.rgb[0].label = t('red'); CHANNELS.rgb[0].aria = t('red').split(' · ')[0];
  CHANNELS.rgb[1].label = t('green'); CHANNELS.rgb[1].aria = t('green').split(' · ')[0];
  CHANNELS.rgb[2].label = t('blue'); CHANNELS.rgb[2].aria = t('blue').split(' · ')[0];
  const soundButton = $('#soundToggle');
  soundButton.setAttribute('aria-label', t(data.sound ? 'soundOn' : 'soundOff'));
  soundButton.title = t(data.sound ? 'soundOn' : 'soundOff');
  soundButton.setAttribute('aria-pressed', String(data.sound));
  soundButton.querySelector('use').setAttribute('href', data.sound ? '#i-volume' : '#i-volume-off');
  if (state) {
    updateFormatDescription();
    if (state.phase === 'idle') updateLobby();
    updateRoundLabels(); updatePhaseLabel(); renderArena(); renderControls();
    if (state.phase === 'result') renderResult();
    if ($('#historyDialog').open) renderHistory();
  }
  updateStats();
}

function updateFormatDescription() {
  $('#formatDescription').innerHTML = t(state.difficulty === 'gradient' ? 'blurbGradient' : 'blurb');
}

function updateLobby() {
  const titles = { classic: 'lobbyClassicTitle', daily: 'lobbyDailyTitle', timed: 'lobbyTimedTitle', practice: 'lobbyPracticeTitle' };
  const descriptions = { classic: state.difficulty === 'gradient' ? 'lobbyClassicGradient' : 'lobbyClassic', daily: 'lobbyDaily', timed: 'lobbyTimed', practice: 'lobbyPractice' };
  $('#lobbyTitle').textContent = t(titles[state.mode]);
  $('#lobbyDescription').textContent = t(descriptions[state.mode], { date: displayDailyDate() });
  const startKey = state.mode === 'daily' ? 'startDaily' : state.mode === 'practice' ? 'startPractice' : 'start';
  $('#startMatchButton').querySelector('span').textContent = t(startKey);
  $('#startMatchButton').disabled = state.mode === 'daily' && Boolean(data.daily[dailyStorageKey()]);
  if ($('#startMatchButton').disabled) $('#startMatchButton').querySelector('span').textContent = t('todayReady');
}

let audioContext;
function playTone(frequency, duration = 0.11, delay = 0) {
  if (!data.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + delay + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + delay + duration);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(audioContext.currentTime + delay); oscillator.stop(audioContext.currentTime + delay + duration + 0.02);
  } catch { /* Audio is an optional enhancement. */ }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // The game remains fully playable when storage is blocked or full.
  }
}

function utcDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function dailyStorageKey() {
  return `${utcDateKey()}:${state.difficulty}`;
}

function displayDailyDate() {
  const locale = LANGUAGES.find(([code]) => code === data.language)?.[2] || 'en-US';
  return new Date(`${utcDateKey()}T00:00:00Z`).toLocaleDateString(locale, {
    day: 'numeric', month: 'long', timeZone: 'UTC',
  });
}

function scoreText(value) {
  const locale = LANGUAGES.find(([code]) => code === data.language)?.[2] || 'en-US';
  return Number(value).toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function hashSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function makeTarget(random = Math.random) {
  const firstHsl = [random() * 360, 48 + random() * 38, 32 + random() * 37];
  const first = hslToRgb(firstHsl).map(Math.round);
  if (state.difficulty === 'solid') return [first];
  const direction = random() > 0.5 ? 1 : -1;
  const secondHsl = [
    (firstHsl[0] + direction * (38 + random() * 82) + 360) % 360,
    clamp(firstHsl[1] + (random() - 0.5) * 24, 40, 92),
    clamp(firstHsl[2] + (random() - 0.5) * 36, 25, 76),
  ];
  return [first, hslToRgb(secondHsl).map(Math.round)];
}

function swatchBackground(stops) {
  const colors = stops.map(rgbToHex);
  return colors.length === 1 ? colors[0] : `linear-gradient(135deg, ${colors.join(', ')})`;
}

function setSwatch(element, stops) {
  element.classList.remove('is-hidden');
  element.style.background = swatchBackground(stops);
  const averageLuminance = stops.reduce((sum, rgb) => sum + relativeLuminance(rgb), 0) / stops.length;
  element.style.color = averageLuminance > 0.32 ? '#181b16' : '#ffffff';
}

function resultHexMarkup(stops) {
  return stops.map((rgb, index) => {
    const prefix = stops.length > 1 ? `${index === 0 ? 'A' : 'B'} · ` : '';
    return `${prefix}${rgbToHex(rgb)}`;
  }).join('<br>');
}

function updateRoundLabels() {
  const date = displayDailyDate();
  if (state.phase === 'idle') {
    const key = state.mode === 'daily' ? 'roundDaily' : state.mode === 'timed' ? 'timedSummary' : state.mode === 'practice' ? 'practiceSummary' : 'lobby';
    elements.roundLabel.textContent = t(key, { n: 1, date });
  } else if (state.mode === 'classic') elements.roundLabel.textContent = t('roundClassic', { n: String(Math.max(1, state.round)).padStart(2, '0') });
  else if (state.mode === 'timed') elements.roundLabel.textContent = t('roundTimed', { n: String(Math.max(1, state.round)).padStart(2, '0') });
  else if (state.mode === 'practice') elements.roundLabel.textContent = t('roundPractice', { n: String(Math.max(1, state.round)).padStart(2, '0') });
  else elements.roundLabel.textContent = t('roundDaily', { date: date.toUpperCase() });
  elements.timePill.hidden = state.mode !== 'timed';
  if (state.phase === 'idle' && state.mode === 'timed') elements.sessionClock.textContent = '01:00';
}

function renderArena() {
  const showingResult = state.phase === 'result' || (state.phase === 'finished' && Boolean(state.lastResult));
  elements.arena.className = `color-arena is-${state.phase === 'idle' ? 'idle' : state.phase === 'memorize' ? 'memorizing' : showingResult ? 'result' : 'mixing'}`;

  if (state.phase === 'idle') {
    elements.target.setAttribute('role', 'button');
    elements.target.setAttribute('tabindex', '0');
    elements.target.setAttribute('aria-label', t(state.mode === 'daily' ? 'idleDaily' : 'idleHint'));
    elements.target.classList.remove('is-hidden');
    elements.target.style.background = '#e9eae4';
    elements.target.style.color = '#5e6358';
    elements.target.innerHTML = `<div class="idle-content"><span class="idle-orbit"><i></i><i></i></span><strong>${t('idleTitle')}</strong><span>${t('idleHint')}</span></div>`;
    elements.player.innerHTML = '';
    elements.player.style.background = '';
    elements.stageHint.innerHTML = `<span class="caption-dot"></span> ${t('stageIdle')}`;
    return;
  }

  if (state.phase === 'memorize') {
    elements.target.removeAttribute('role');
    elements.target.removeAttribute('tabindex');
    elements.target.removeAttribute('aria-label');
    setSwatch(elements.target, state.target);
    elements.target.innerHTML = `
      <div class="memorize-content">
        <span class="swatch-kicker">${t(state.difficulty === 'gradient' ? 'targetGradient' : 'target')}</span>
        <strong id="memoryCountdown">3</strong>
        <span class="memorize-caption">${t(state.difficulty === 'gradient' ? 'holdGradient' : 'holdColor')}</span>
      </div>
      <div class="memory-track"><span id="memoryProgress"></span></div>`;
    elements.player.innerHTML = '';
    elements.player.style.background = '';
    elements.memoryCountdown = $('#memoryCountdown');
    elements.memoryProgress = $('#memoryProgress');
    elements.stageHint.innerHTML = `<span class="caption-dot"></span> ${t('stageMemorize')}`;
    return;
  }

  if (showingResult) {
    elements.target.removeAttribute('role');
    elements.target.removeAttribute('tabindex');
    elements.target.removeAttribute('aria-label');
    const resultTarget = state.lastResult ? state.lastResult.targetHex.map(hexToRgb) : state.target;
    const resultPlayer = state.lastResult ? state.lastResult.playerHex.map(hexToRgb) : currentPlayerStops();
    setSwatch(elements.target, resultTarget);
    elements.target.innerHTML = `<div class="swatch-result-content"><span class="result-swatch-label">${t('targetResult')}</span><div class="swatch-hex">${resultHexMarkup(resultTarget)}</div></div>`;
    setSwatch(elements.player, resultPlayer);
    elements.player.innerHTML = `<div class="swatch-result-content"><span class="result-swatch-label">${t('yourResult')}</span><div class="swatch-hex">${resultHexMarkup(resultPlayer)}</div></div>`;
    elements.stageHint.innerHTML = `<span class="caption-dot"></span> ${t('stageResult')}`;
    return;
  }

  elements.target.removeAttribute('role');
  elements.target.removeAttribute('tabindex');
  elements.target.removeAttribute('aria-label');
  elements.target.classList.add('is-hidden');
  elements.target.style.background = '';
  elements.target.style.color = '';
  elements.target.innerHTML = `<div class="hidden-target-content"><svg><use href="#i-eye-off"/></svg><span>${t('hidden')}</span></div>`;
  setSwatch(elements.player, currentPlayerStops());
  elements.player.innerHTML = `<div class="player-live-content"><span>${t('player')}</span></div>`;
  elements.stageHint.innerHTML = `<span class="caption-dot"></span> ${t('stageMix')}`;
}

function currentPlayerStops() {
  return state.difficulty === 'gradient' ? state.player : [state.player[0]];
}

function activeValues() {
  const rgb = state.player[state.activeStop];
  return state.format === 'hsl' ? rgbToHsl(rgb) : [...rgb];
}

function channelGradient(channel, values) {
  const stops = [];
  const count = channel === 0 ? 6 : 4;
  for (let index = 0; index <= count; index += 1) {
    const sample = [...values];
    sample[channel] = CHANNELS[state.format][channel].max * index / count;
    if (state.format === 'hsl' && channel === 2 && index > 0 && index < count) {
      sample[1] = values[1];
    }
    const rgb = state.format === 'hsl' ? hslToRgb(sample) : sample;
    stops.push(`${rgbToHex(rgb)} ${100 * index / count}%`);
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

function renderControls() {
  const enabled = state.phase === 'mixing';
  elements.lobbyView.hidden = state.phase !== 'idle';
  elements.mixView.hidden = state.phase === 'idle' || state.phase === 'result' || state.phase === 'finished';
  elements.resultView.hidden = state.phase !== 'result';
  elements.finishedView.hidden = state.phase !== 'finished';
  elements.fieldset.disabled = !enabled;
  elements.resetColor.disabled = !enabled;
  elements.checkButton.disabled = !enabled;
  elements.checkButtonText.textContent = state.phase === 'memorize' ? t('waitColor') : t('check');
  elements.stopSwitch.hidden = state.difficulty !== 'gradient';
  elements.currentHex.textContent = rgbToHex(state.player[state.activeStop]);

  $$('[data-format]').forEach((button) => {
    const active = button.dataset.format === state.format;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $$('[data-stop]').forEach((button) => {
    const stop = Number(button.dataset.stop);
    const active = stop === state.activeStop;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.disabled = !enabled;
    button.querySelector('span').style.background = rgbToHex(state.player[stop]);
  });

  const values = activeValues();
  CHANNELS[state.format].forEach((channel, index) => {
    const input = $(`#channel${index}`);
    const value = clamp(values[index], 0, channel.max);
    const shownValue = state.format === 'hsl' ? value.toFixed(1).replace('.0', '') : Math.round(value);
    input.max = channel.max;
    input.step = channel.step;
    input.value = value;
    input.setAttribute('aria-label', channel.aria);
    input.style.setProperty('--range-color', channelGradient(index, values));
    $(`#channelLabel${index}`).textContent = channel.label;
    $(`#channelValue${index}`).textContent = `${shownValue}${channel.unit}`;
  });
}

function updatePhaseLabel() {
  const labels = { idle: 'phaseReady', memorize: 'phaseRemember', mixing: 'phaseMix', result: 'phaseResult', finished: 'phaseDone' };
  elements.phaseLabel.textContent = t(labels[state.phase] || 'phaseReady');
}

function startMemorize() {
  cancelAnimationFrame(state.memoryFrame);
  playTone(660, 0.12);
  state.phase = 'memorize';
  updateRoundLabels();
  updatePhaseLabel();
  renderArena();
  renderControls();

  const now = Date.now();
  const regularEnd = now + MEMORY_MS;
  const deadline = state.mode === 'timed' ? Math.min(regularEnd, state.sessionEnd) : regularEnd;
  const duration = Math.max(1, deadline - now);

  const tick = () => {
    if (state.phase !== 'memorize') return;
    const remaining = Math.max(0, deadline - Date.now());
    elements.memoryCountdown.textContent = Math.max(1, Math.ceil(remaining / 1000));
    elements.memoryProgress.style.transform = `scaleX(${remaining / duration})`;
    if (remaining <= 0) {
      if (state.mode === 'timed' && Date.now() >= state.sessionEnd) finishTimed();
      else beginMixing();
      return;
    }
    state.memoryFrame = requestAnimationFrame(tick);
  };
  tick();
}

function beginMixing() {
  cancelAnimationFrame(state.memoryFrame);
  playTone(440, 0.14);
  state.phase = 'mixing';
  updatePhaseLabel();
  renderArena();
  renderControls();
}

function startRound() {
  if (state.mode === 'daily' && data.daily[dailyStorageKey()]) {
    restoreDailyResult(data.daily[dailyStorageKey()]);
    return;
  }
  if (state.mode === 'timed' && Date.now() >= state.sessionEnd) {
    finishTimed();
    return;
  }
  state.round += 1;
  state.target = state.mode === 'daily'
    ? makeTarget(seededRandom(hashSeed(`color-clash:${utcDateKey()}:${state.difficulty}`)))
    : makeTarget();
  state.player = [[...DEFAULT_RGB], [160, 160, 160]];
  state.activeStop = 0;
  state.lastResult = null;
  startMemorize();
}

function cancelSessionTimers() {
  cancelAnimationFrame(state.memoryFrame);
  clearInterval(state.sessionInterval);
  state.memoryFrame = null;
  state.sessionInterval = null;
}

function startSession() {
  cancelSessionTimers();
  if ($('#summaryDialog').open) $('#summaryDialog').close();
  state.round = 0;
  state.results = [];
  state.lastResult = null;
  state.phase = 'idle';
  state.sessionEnd = null;
  elements.timePill.classList.remove('urgent');
  updateLobby();
  $('#endPracticeButton').hidden = true;
  $$('.mode-button').forEach((button) => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#dailyModeSubtitle').textContent = `${t('daily')}: ${displayDailyDate()}`;
  updateFormatDescription();
  updateRoundLabels();
  renderControls();

  if (state.mode === 'daily' && data.daily[dailyStorageKey()]) {
    restoreDailyResult(data.daily[dailyStorageKey()]);
  } else {
    updatePhaseLabel();
    renderArena();
    renderControls();
  }
}

function beginSession() {
  if (state.phase !== 'idle') return;
  if (state.mode === 'daily' && data.daily[dailyStorageKey()]) {
    restoreDailyResult(data.daily[dailyStorageKey()]);
    return;
  }
  if (state.mode === 'timed') {
    state.sessionEnd = Date.now() + TIMED_MS;
    updateSessionClock();
    state.sessionInterval = setInterval(updateSessionClock, 100);
  }
  startRound();
}

function resultMessage(accuracy) {
  if (accuracy >= 98) return t('messagePerfect');
  if (accuracy >= 95) return t('messageClose');
  if (accuracy >= 90) return t('messageHit');
  if (accuracy >= 75) return t('messageNear');
  return t('messageMiss');
}

function checkResult() {
  if (state.phase !== 'mixing') return;
  if (state.mode === 'timed' && Date.now() >= state.sessionEnd) {
    finishTimed();
    return;
  }

  const player = currentPlayerStops().map((rgb) => [...rgb]);
  const differences = state.target.map((rgb, index) => deltaE2000(rgbToLab(rgb), rgbToLab(player[index])));
  const deltaE = differences.reduce((sum, value) => sum + value, 0) / differences.length;
  const accuracy = deltaEToAccuracy(deltaE);
  const result = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mode: state.mode,
    difficulty: state.difficulty,
    date: new Date().toISOString(),
    dailyDate: state.mode === 'daily' ? utcDateKey() : null,
    targetHex: state.target.map(rgbToHex),
    playerHex: player.map(rgbToHex),
    accuracy,
    deltaE,
  };

  state.phase = 'result';
  state.lastResult = result;
  state.results.push(result);
  if (state.mode !== 'practice') {
    data.bestScore = data.bestScore === null ? accuracy : Math.max(data.bestScore, accuracy);
    data.streak = accuracy >= WIN_SCORE ? (Number(data.streak) || 0) + 1 : 0;
    data.bestStreak = Math.max(Number(data.bestStreak) || 0, data.streak);
  }
  data.history.unshift(result);
  data.history = data.history.slice(0, 80);
  if (state.mode === 'daily') {
    data.daily[dailyStorageKey()] = result;
    const yesterday = new Date(`${utcDateKey()}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    data.dailyStreak = data.lastDailyDate === yesterday.toISOString().slice(0, 10) ? (Number(data.dailyStreak) || 0) + 1 : data.lastDailyDate === utcDateKey() ? data.dailyStreak : 1;
    data.lastDailyDate = utcDateKey();
  }
  saveData();

  playTone(accuracy >= WIN_SCORE ? 880 : 330, 0.18);
  if (state.mode === 'practice') {
    elements.nextButton.hidden = true;
    elements.endPracticeButton.hidden = false;
  }
  updatePhaseLabel();
  renderArena();
  renderResult();
  updateStats();
  if (state.mode === 'daily') showToast(t('dailyStreakToast', { n: data.dailyStreak }));
}

function renderResult() {
  const result = state.lastResult;
  renderControls();
  elements.accuracy.textContent = scoreText(result.accuracy);
  elements.delta.textContent = result.deltaE.toFixed(2);
  elements.resultTitle.textContent = result.accuracy >= WIN_SCORE ? t('hit') : t('accuracy');
  elements.resultMessage.textContent = resultMessage(result.accuracy);
  elements.resultCodes.innerHTML = `
    <span>${t('targetResult')}<b>${result.targetHex.join(' · ')}</b></span>
    <span>${t('yourResult')}<b>${result.playerHex.join(' · ')}</b></span>`;
  elements.nextButton.hidden = state.mode === 'daily' || state.mode === 'practice';
  elements.nextButtonText.textContent = state.mode === 'classic'
    ? state.round >= 5 ? t('seriesResult') : t('nextRound')
    : t('nextColor');
  elements.endPracticeButton.hidden = state.mode !== 'practice';
  elements.copyButton.hidden = state.mode !== 'daily';
}

function restoreDailyResult(result) {
  try {
    state.target = result.targetHex.map(hexToRgb);
    state.player = [hexToRgb(result.playerHex[0]), hexToRgb(result.playerHex[1] || result.playerHex[0])];
    state.round = 1;
    state.results = [result];
    state.lastResult = result;
    state.phase = 'result';
    updateRoundLabels();
    updatePhaseLabel();
    renderArena();
    renderResult();
  } catch {
    delete data.daily[dailyStorageKey()];
    saveData();
    startRound();
  }
}

function finishClassic() {
  cancelSessionTimers();
  state.phase = 'finished';
  const average = state.results.reduce((sum, result) => sum + result.accuracy, 0) / state.results.length;
  const previousBest = data.bestClassic;
  data.bestClassic = previousBest === null ? average : Math.max(previousBest, average);
  saveData();
  showSummary({
    eyebrow: t('classicSummary'),
    value: scoreText(average),
    unit: '%',
    title: t('averageAccuracy'),
    message: previousBest === null || average > previousBest
      ? t('classicNewRecord')
      : t('classicBestMessage', { score: scoreText(data.bestClassic) }),
    details: [
      [t('bestRound'), `${scoreText(Math.max(...state.results.map((result) => result.accuracy)))}%`],
      [t('seriesRecord'), `${scoreText(data.bestClassic)}%`],
    ],
  });
}

function finishTimed() {
  if (state.phase === 'finished') return;
  cancelSessionTimers();
  state.phase = 'finished';
  elements.sessionClock.textContent = '00:00';
  const count = state.results.length;
  if (state.lastResult) {
    state.target = state.lastResult.targetHex.map(hexToRgb);
    state.player = [hexToRgb(state.lastResult.playerHex[0]), hexToRgb(state.lastResult.playerHex[1] || state.lastResult.playerHex[0])];
  }
  const previousBest = data.bestTimed;
  data.bestTimed = previousBest === null ? count : Math.max(previousBest, count);
  saveData();
  const average = count
    ? state.results.reduce((sum, result) => sum + result.accuracy, 0) / count
    : 0;
  showSummary({
    eyebrow: t('timedSummary'),
    value: String(count),
    unit: t(count === 1 ? 'colorSingular' : 'colorPlural'),
    title: t('timedTitle'),
    message: previousBest === null || count > previousBest
      ? t('timedNewRecord')
      : t('timedBestMessage', { count: data.bestTimed, average: scoreText(average) }),
    details: [
      [t('averageAccuracy'), `${scoreText(average)}%`],
      [t('timedRecord'), `${data.bestTimed}`],
    ],
  });
  updatePhaseLabel();
  renderArena();
  renderControls();
}

function updateSessionClock() {
  if (state.mode !== 'timed' || !state.sessionEnd) return;
  const remaining = Math.max(0, state.sessionEnd - Date.now());
  const seconds = Math.ceil(remaining / 1000);
  elements.sessionClock.textContent = `00:${String(seconds).padStart(2, '0')}`;
  elements.timePill.classList.toggle('urgent', seconds <= 10);
  if (remaining <= 0) finishTimed();
}

function showSummary({ eyebrow, value, unit, title, message, details }) {
  $('#finishedEyebrow').textContent = eyebrow;
  $('#finishedTitle').textContent = state.mode === 'timed'
    ? `${value} ${unit} · ${t('timedTitle')}`
    : state.mode === 'practice' ? t('practiceDoneTitle') : `${value}${unit} · ${t('averageAccuracy')}`;
  $('#finishedMessage').textContent = message;
  $('#finishedButtonText').textContent = state.mode === 'timed' ? t('replayTimed') : state.mode === 'practice' ? t('continuePractice') : t('newSeries');
  renderArena();
  renderControls();
  $('#summaryEyebrow').textContent = eyebrow;
  $('#summaryValue').textContent = value;
  $('#summaryUnit').textContent = unit;
  $('#summaryTitle').textContent = title;
  $('#summaryMessage').textContent = message;
  $('#summaryDetails').innerHTML = details.map(([label, detail]) => `<span>${label}<b>${detail}</b></span>`).join('');
  if (!$('#summaryDialog').open) $('#summaryDialog').showModal();
}

function updateStats() {
  const best = data.bestScore === null ? '—' : `${scoreText(data.bestScore)}%`;
  elements.topBest.textContent = best;
  elements.bestScore.textContent = best;
  elements.streak.textContent = Number(data.streak) || 0;
  elements.bestStreak.textContent = Number(data.bestStreak) || 0;
  elements.attempts.textContent = data.history.length;
  $('#dailyStreakScore').textContent = Number(data.dailyStreak) || 0;
}

function historySwatch(colors) {
  const safeColors = Array.isArray(colors) && colors.length ? colors : ['#808080'];
  return safeColors.length === 1 ? safeColors[0] : `linear-gradient(135deg, ${safeColors.join(', ')})`;
}

function renderHistory() {
  elements.historyList.replaceChildren();
  if (!data.history.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = t('historyEmpty');
    elements.historyList.append(empty);
    return;
  }

  data.history.forEach((attempt) => {
    const item = document.createElement('article');
    item.className = 'history-item';
    const colors = document.createElement('div');
    colors.className = 'history-colors';
    const target = document.createElement('i');
    const player = document.createElement('i');
    target.style.background = historySwatch(attempt.targetHex);
    player.style.background = historySwatch(attempt.playerHex);
    colors.append(target, player);

    const description = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `${t(MODE_KEYS[attempt.mode] || 'classicLabel')} · ${t(attempt.difficulty === 'gradient' ? 'gradientLabel' : 'solidLabel')}`;
    const codes = document.createElement('p');
    codes.textContent = `${(attempt.playerHex || []).join(' · ')}`;
    const date = document.createElement('small');
    date.textContent = new Date(attempt.date).toLocaleString(LANGUAGES.find(([code]) => code === data.language)?.[2] || 'en-US', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
    description.append(title, codes, date);

    const score = document.createElement('div');
    score.className = 'history-score';
    const scoreValue = document.createElement('strong');
    scoreValue.textContent = `${scoreText(Number(attempt.accuracy) || 0)}%`;
    const delta = document.createElement('small');
    delta.textContent = `ΔE ${(Number(attempt.deltaE) || 0).toFixed(2)}`;
    score.append(scoreValue, delta);
    item.append(colors, description, score);
    elements.historyList.append(item);
  });
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  toastTimer = setTimeout(() => elements.toast.classList.remove('visible'), 2600);
}

async function copyDailyResult() {
  const result = state.lastResult;
  if (!result) return;
  const text = [
    `COLOR CLASH · ${t('dailyLabel')}`,
    `${displayDailyDate()} · ${t(state.difficulty === 'gradient' ? 'gradientLabel' : 'solidLabel')}`,
    `${t('accuracy')}: ${scoreText(result.accuracy)}% · ΔE ${result.deltaE.toFixed(2)}`,
    `${t('yourResult')}: ${result.playerHex.join(' → ')}`,
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
  showToast(t('copied'));
}

$$('.mode-button').forEach((button) => {
  button.addEventListener('click', () => {
    state.mode = button.dataset.mode;
    startSession();
  });
});

elements.difficulty.addEventListener('change', () => {
  state.difficulty = elements.difficulty.value;
  startSession();
});

$$('[data-format]').forEach((button) => {
  button.addEventListener('click', () => {
    state.format = button.dataset.format;
    renderControls();
  });
});

$$('[data-stop]').forEach((button) => {
  button.addEventListener('click', () => {
    state.activeStop = Number(button.dataset.stop);
    renderControls();
  });
});

$$('[data-channel]').forEach((input) => {
  input.addEventListener('input', () => {
    if (state.phase !== 'mixing') return;
    const channel = Number(input.dataset.channel);
    const values = activeValues();
    values[channel] = Number(input.value);
    const rgb = state.format === 'hsl' ? hslToRgb(values) : values;
    state.player[state.activeStop] = rgb.map((value) => Math.round(clamp(value, 0, 255)));
    renderArena();
    renderControls();
  });
});

elements.resetColor.addEventListener('click', () => {
  state.player[state.activeStop] = [...DEFAULT_RGB];
  renderArena();
  renderControls();
});

elements.checkButton.addEventListener('click', checkResult);
elements.nextButton.addEventListener('click', () => {
  if (state.phase !== 'result') return;
  if (state.mode === 'classic' && state.round >= 5) finishClassic();
  else if (state.mode === 'timed' && Date.now() >= state.sessionEnd) finishTimed();
  else startRound();
});

$('#restartButton').addEventListener('click', () => {
  startSession();
  if (state.mode === 'daily' && state.phase === 'result') showToast('Цвет дня уже записан. Возвращайтесь завтра!');
});

$('#brandButton').addEventListener('click', () => {
  state.mode = 'classic';
  startSession();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('#historyButton').addEventListener('click', () => {
  renderHistory();
  $('#historyDialog').showModal();
});

$('#helpButton').addEventListener('click', () => $('#helpDialog').showModal());
$('#languageSelect').addEventListener('change', (event) => {
  data.language = STRINGS[event.target.value] ? event.target.value : 'en';
  saveData(); applyLanguage();
});
$('#soundToggle').addEventListener('click', () => {
  data.sound = !data.sound;
  saveData(); applyLanguage();
  if (data.sound) playTone(660, 0.12);
});
$('#languageSelect').addEventListener('change', (event) => {
  data.language = STRINGS[event.target.value] ? event.target.value : 'en';
  saveData(); applyLanguage();
});
$('#soundToggle').addEventListener('click', () => {
  data.sound = !data.sound;
  saveData(); applyLanguage();
  if (data.sound) playTone(660, 0.12);
});
$('#endPracticeButton').addEventListener('click', () => {
  if (state.mode !== 'practice') return;
  cancelSessionTimers(); state.phase = 'finished';
  const count = state.results.length;
  const average = count ? state.results.reduce((sum, result) => sum + result.accuracy, 0) / count : 0;
  showSummary({ eyebrow: t('practiceSummary'), value: String(count), unit: '', title: t('practiceDoneTitle'), message: t('practiceDone', { n: count }), details: [[t('averageAccuracy'), `${scoreText(average)}%`]] });
});
elements.copyButton.addEventListener('click', copyDailyResult);
$('#playAgainButton').addEventListener('click', startSession);
$('#finishedRestartButton').addEventListener('click', startSession);
$('#startMatchButton').addEventListener('click', beginSession);
elements.target.addEventListener('click', () => {
  if (state.phase === 'idle') beginSession();
});
elements.target.addEventListener('keydown', (event) => {
  if (state.phase !== 'idle' || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  beginSession();
});

$('#clearHistoryButton').addEventListener('click', () => {
  if (!data.history.length) return;
  if (!window.confirm(t('clearConfirm'))) return;
  data.history = [];
  saveData();
  renderHistory();
  updateStats();
  showToast(t('historyDeleted'));
});

$$('[data-close]').forEach((button) => {
  button.addEventListener('click', () => $(`#${button.dataset.close}`).close());
});

$$('dialog').forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.target.matches('input, button, select, textarea') || $('dialog[open]')) return;
  if (state.phase === 'mixing') checkResult();
  else if (state.phase === 'result' && state.mode !== 'daily') elements.nextButton.click();
});

applyLanguage();
updateStats();
startSession();
