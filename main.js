const svg = document.getElementById('diagram');
const rc = rough.svg(svg);

const resolvedTextColor = getComputedStyle(document.documentElement)
  .getPropertyValue('--color-text-primary').trim();

// Scale picker
const picker = document.getElementById('scale-picker');
picker.value = String(KM_PER_PX);
picker.addEventListener('change', () => {
  KM_PER_PX = Number(picker.value);
  render(rc, svg);
});

render(rc, svg);
