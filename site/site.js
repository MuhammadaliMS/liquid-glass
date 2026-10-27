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
  hero.toggleAttribute('data-busy', button.hasAttribute('data-busy'));
});
document.querySelectorAll('.segmented').forEach((group) => slider(group, group.querySelector('.seg-indicator')));
document.querySelectorAll('.tabbar').forEach((group) => slider(group, group.querySelector('.tab-indicator')));

document.querySelectorAll('.toggle').forEach((toggle) => toggle.addEventListener('click', () => {
  toggle.setAttribute('aria-checked', String(toggle.getAttribute('aria-checked') !== 'true'));
}));

const play = hero.querySelector('.play');
play.addEventListener('click', () => {
  const playing = play.getAttribute('aria-label') === 'Pause';
  play.setAttribute('aria-label', playing ? 'Play' : 'Pause');
  play.innerHTML = playing ? '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
});

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
