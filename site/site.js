// The demo page. Everything that moves here is plain CSS and DOM: the glass follows.

// A glass pill that slides under the selected button of a group (the backdrop switcher,
// the segmented control, the tab bar).
function slider(group, indicator, onPick) {
  const place = (button, animate = true) => {
    indicator.classList.toggle('ease', animate);
    indicator.style.left = `${button.offsetLeft}px`;
    indicator.style.width = `${button.offsetWidth}px`;
  };
  const buttons = [...group.querySelectorAll('button')];
  buttons.forEach((button) => button.addEventListener('click', () => {
    buttons.forEach((other) => other.classList.toggle('is-on', other === button));
    place(button);
    onPick?.(button);
  }));
  const settle = () => place(group.querySelector('button.is-on') ?? buttons[0], false);
  settle();
  window.addEventListener('resize', settle);
  document.fonts?.ready.then(settle);
}

const hero = document.getElementById('hero');
slider(hero.querySelector('.switcher'), hero.querySelector('.switch-indicator'), (button) => {
  hero.backdrop = button.dataset.backdrop;
  hero.setAttribute('dim', button.dataset.dim ?? '0');
  hero.dataset.tone = button.dataset.tone ?? 'dark';
});
document.querySelectorAll('.segmented').forEach((group) => slider(group, group.querySelector('.seg-indicator')));
document.querySelectorAll('.tabbar').forEach((group) => slider(group, group.querySelector('.tab-indicator')));

document.querySelectorAll('.toggle').forEach((toggle) => toggle.addEventListener('click', () => {
  toggle.setAttribute('aria-checked', String(toggle.getAttribute('aria-checked') !== 'true'));
}));

document.querySelectorAll('.play').forEach((play) => play.addEventListener('click', () => {
  const playing = play.getAttribute('aria-label') === 'Pause';
  play.setAttribute('aria-label', playing ? 'Play' : 'Pause');
  play.innerHTML = playing ? '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
}));

// The recorder, as in the playground: a capsule with a raised stop button. Tap it to listen and it
// glows with your voice; tap again and it stops and folds into a round button; tap that to open it.
const recorder = hero.querySelector('.recorder');
const timer = recorder.querySelector('.rec-timer');
const hint = document.getElementById('hint');
let collapsed = false;

function placeLens() {
  // The stop button's disc sits under its glyph: 15px from the right end, 48px radius at full size.
  const scale = recorder.getBoundingClientRect().height / 132 || 1;
  recorder.style.setProperty('--glass-lens', collapsed ? `0 0 ${44 * scale}` : `${(470 / 2 - 15 - 48) * scale} 0 ${48 * scale}`);
}
function syncRecorder() {
  const live = hero.microphoneState.status === 'live';
  recorder.classList.toggle('is-collapsed', collapsed);
  recorder.setAttribute('aria-pressed', String(live));
  recorder.setAttribute('aria-label', collapsed ? 'Open the recorder' : live ? 'Stop listening' : 'Listen with the microphone');
  hint.textContent = collapsed ? 'Tap to open it again' : live ? 'Talk, sing or play music · tap to stop' : 'Tap the glass to listen · pull along its edge';
  placeLens();
}
recorder.addEventListener('click', async () => {
  const state = hero.microphoneState.status;
  if (collapsed) { collapsed = false; syncRecorder(); return; }
  if (state === 'live' || state === 'requesting') { hero.stopMicrophone(); collapsed = true; syncRecorder(); return; }
  syncRecorder();
  const live = await hero.startMicrophone();
  if (!live) hint.textContent = hero.microphoneState.message || 'The microphone is unavailable; the glass keeps glowing on its own.';
  syncRecorder();
});
hero.addEventListener('microphone-change', syncRecorder);
window.addEventListener('resize', placeLens);
(function tick() {
  const live = hero.microphoneState.status === 'live';
  const seconds = live ? Math.floor((performance.now() - hero.listeningSince) / 1000) : 0;
  const text = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  if (timer.textContent !== text) timer.textContent = text;
  requestAnimationFrame(tick);
})();
syncRecorder();

document.querySelectorAll('[data-copy]').forEach((block) => {
  const button = block.querySelector('.copy');
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(block.querySelector('code').innerText);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Select & copy';
    }
    setTimeout(() => { button.textContent = 'Copy'; }, 1600);
  });
});
