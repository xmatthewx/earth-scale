const svg = document.getElementById('diagram');
const rc = rough.svg(svg);

const resolvedTextColor = getComputedStyle(document.documentElement)
  .getPropertyValue('--color-text-primary').trim();

// Scale slider — stops come from the markup, evenly spaced by index
const wrap = document.getElementById('scale-slider-wrap');
const SCALES = wrap.dataset.scales.trim().split(/\s+/).map(Number);
const slider = document.getElementById('scale-slider');
const marks = document.getElementById('ss-marks');
const readout = document.getElementById('ss-value');

slider.max = String(SCALES.length - 1);
SCALES.forEach((km, i) => {
  const frac = i / (SCALES.length - 1);
  const mark = document.createElement('button');
  mark.className = 'ss-mark';
  mark.type = 'button';
  mark.tabIndex = -1; // the slider itself is the keyboard control
  mark.style.left = `calc(var(--ss-thumb) / 2 + (100% - var(--ss-thumb)) * ${frac})`;
  mark.textContent = km;
  mark.addEventListener('click', () => setScale(km));
  marks.appendChild(mark);
});

slider.addEventListener('input', () => {
  setScale(SCALES[Number(slider.value)]);
});

function setScale(km) {
  KM_PER_PX = km;
  const i = SCALES.indexOf(km);
  slider.value = String(i);
  readout.textContent = km + ' km';
  [...marks.children].forEach((m, j) => m.classList.toggle('is-current', j === i));
  render(rc, svg);
}

setScale(KM_PER_PX);

// Off-screen hints depend on where you're scrolled, not just the scale
const refreshHints = () => updateOffscreenHints(svg);
addEventListener('scroll', refreshHints, { passive: true });
addEventListener('resize', refreshHints);
