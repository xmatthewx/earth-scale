// === CONSTANTS ===
let KM_PER_PX = 2;
const ORIGIN_KM = 800;
const EARTH_R_KM = 6350;

// Breathing room above the top feature and below the bottom one. Pure padding,
// so it costs no accuracy — it just keeps the highest tick off the top edge.
// Grows with the viewport so a large screen opens on a composed frame.
let ORIGIN_Y = 20;
function topMargin() {
  return Math.round(Math.min(140, Math.max(36, innerHeight * 0.1)));
}

// Distances on the axis are locked to real kilometers, so labels are the only
// thing left to tune for legibility. Every type and label number below is
// written at the size it was originally drawn, times this — one knob for the
// whole annotation layer. Raise it if the diagram reads small.
const LABEL_SCALE = 1.75;
const TICK_HALF = 5 * LABEL_SCALE;
const LEADER_LEN = 30 * LABEL_SCALE;
const LABEL_PAD = 5 * LABEL_SCALE;

// The canvas is measured rather than fixed, so one user unit always renders as
// exactly one CSS pixel. That equality is the whole point: it's what makes the
// "1 px = N km" readout literally true instead of true-at-one-window-width.
// #diagram's width in style.css decides the actual number.
// How far across the canvas the axis sits. It slides left as the canvas narrows
// — a phone needs it well left so labels have somewhere to go, a wide screen
// looks better balanced near centre. Interpolated between these two anchors
// rather than stepped at a breakpoint, so it drifts smoothly during a resize.
const AXIS_NARROW = { width: 400,  ratio: 0.25 };
const AXIS_WIDE   = { width: 1400, ratio: 0.5  };
let AXIS_RATIO_OVERRIDE = null; // set from the console to pin a value while tuning

function axisRatioFor(width) {
  if (AXIS_RATIO_OVERRIDE != null) return AXIS_RATIO_OVERRIDE;
  const t = (width - AXIS_NARROW.width) / (AXIS_WIDE.width - AXIS_NARROW.width);
  const clamped = Math.min(1, Math.max(0, t));
  return AXIS_NARROW.ratio + (AXIS_WIDE.ratio - AXIS_NARROW.ratio) * clamped;
}

const LAYOUT_REF_WIDTH = 680;   // width the labelOffset dx values were tuned against
let SVG_WIDTH = LAYOUT_REF_WIDTH;
let AXIS_RATIO = axisRatioFor(SVG_WIDTH);
let AXIS_X = SVG_WIDTH * AXIS_RATIO;

// Returns true only when something changed, so callers can skip a redraw.
function measureLayout(svg) {
  const w = Math.round(svg.getBoundingClientRect().width);
  const m = topMargin();
  const changed = (!!w && w !== SVG_WIDTH) || m !== ORIGIN_Y;

  if (w) SVG_WIDTH = w;
  ORIGIN_Y = m;

  // Recomputed on every pass rather than only on change, so the axis can be
  // retuned live: set AXIS_RATIO_OVERRIDE in the console, call render(rc, svg),
  // watch it move. Set it back to null to resume tracking the canvas width.
  AXIS_RATIO = axisRatioFor(SVG_WIDTH);
  AXIS_X = SVG_WIDTH * AXIS_RATIO;
  // Published so the CSS gutter tracks the axis instead of hardcoding 41vw and
  // silently drifting the moment AXIS_RATIO changes.
  document.documentElement.style.setProperty('--axis-x', AXIS_X + 'px');

  return changed;
}

function y(km) { return ORIGIN_Y + (ORIGIN_KM - km) / KM_PER_PX; }
function mirrorAltitude(km) { return -(EARTH_R_KM * 2) - km; }

function formatAltitude(km) {
  const abs = Math.abs(km);
  const formatted = abs >= 1000 ? abs.toLocaleString() : String(abs);
  return (km < 0 ? '\u2212' : '') + formatted + ' km';
}

// === SVG HELPER ===
const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, parent) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

// === DRAW HELPERS ===
function drawLine(rc, parent, x1, y1, x2, y2, strokeWidth, { opacity, dashed } = {}) {
  const opts = {
    stroke: resolvedTextColor,
    strokeWidth,
    roughness: 0.8,
  };
  if (dashed) opts.strokeLineDash = [1, 3];
  const node = rc.line(x1, y1, x2, y2, opts);
  if (opacity != null) node.style.opacity = opacity;
  parent.appendChild(node);
}

// === RENDER ===
function renderStructure(rc, svg, axisTopY, axisBotY) {
  const g = svgEl('g', { class: 'structure' }, svg);

  // Vertical axis
  drawLine(rc, g, AXIS_X, axisTopY, AXIS_X, axisBotY, 1, { opacity: 0.33 });
}

// Washes live in <defs> and are referenced by id. Their stops are in
// objectBoundingBox units — relative to the shape rather than absolute pixels —
// which is the whole reason they survive a body that renders anywhere from 12
// to 12,000 pixels across.
function washId(t) { return 'wash-' + t.name.replace(/\s+/g, '-'); }

// CSS understands hsl but not hsb, and hsb is what design tools speak — so the
// palette is authored in hsb and converted here. h 0-360, s and b 0-100.
function hsbToCss([h, s, b]) {
  const sat = s / 100, bri = b / 100;
  const l = bri * (1 - sat / 2);
  const sl = (l === 0 || l === 1) ? 0 : (bri - l) / Math.min(l, 1 - l);
  return `hsl(${h} ${Math.round(sl * 100)}% ${Math.round(l * 100)}%)`;
}

// Mottling comes from fractal noise rendered into one modest tile and repeated,
// not from a filter over the body itself: at 1 km/px the earth is ~12,700px
// across and a filter region that large risks browser limits. Tiling also keeps
// the texture constant in screen pixels, which is the right model — this is
// paper grain, a property of the surface rather than of the thing drawn on it.
const GRAIN_TILE = 400; // large enough that the repeat doesn't read as a grid
// const GRAIN_FREQ = 0.006;
const GRAIN_FREQ = 0.011;

function renderGrainDefs(defs) {
  const filter = svgEl('filter', {
    id: 'wash-grain', filterUnits: 'userSpaceOnUse',
    x: 0, y: 0, width: GRAIN_TILE, height: GRAIN_TILE,
  }, defs);
  svgEl('feTurbulence', {
    type: 'fractalNoise', baseFrequency: GRAIN_FREQ, numOctaves: 4, seed: 7,
  }, filter);
  // Flatten the noise to white and keep only its alpha, so what tiles across
  // the body is an uneven veil of pigment rather than coloured static.
  svgEl('feColorMatrix', {
    type: 'matrix',
    values: '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0',
  }, filter);

  const pattern = svgEl('pattern', {
    id: 'wash-grain-tile', patternUnits: 'userSpaceOnUse',
    width: GRAIN_TILE, height: GRAIN_TILE,
  }, defs);
  svgEl('rect', {
    width: GRAIN_TILE, height: GRAIN_TILE, filter: 'url(#wash-grain)',
  }, pattern);
}

// Rebuilt on every render rather than cached, so edits to the palette show up
// on the next redraw — same live-tuning affordance as AXIS_RATIO_OVERRIDE.
function renderWashDefs(svg) {
  svg.querySelector('defs')?.remove();
  const defs = svgEl('defs', {}, svg);
  renderGrainDefs(defs);

  for (const t of TERRA) {
    if (!t.wash) continue;
    const grad = svgEl('radialGradient', { id: washId(t) }, defs);
    for (const s of t.wash) {
      svgEl('stop', { offset: s.offset, 'stop-color': hsbToCss(s.hsb) }, grad);
    }
  }
}

function renderTerra(rc, svg) {
  renderWashDefs(svg);
  const g = svgEl('g', { class: 'terra' }, svg);

  for (const t of TERRA) {
    if (KM_PER_PX < t.minScale || KM_PER_PX >= t.maxScale) continue;

    const cy = y(t.center_km);
    const r = t.radius_km / KM_PER_PX;

    // Solid bodies are plain circles, deliberately not rough.js: it approximates
    // an ellipse with nine points, which at a 6350px radius wanders a few
    // hundred pixels off true and sent the old hachure fill out into space.
    if (t.wash) {
      const node = svgEl('circle', {
        cx: AXIS_X, cy, r, fill: `url(#${washId(t)})`,
      }, g);
      if (t.opacity != null) node.style.opacity = t.opacity;

      // Same circle again, veiled in grain. Drawn as its own shape rather than
      // filtered onto the wash so the body's edge stays exact.
      if (t.grain) {
        const mottle = svgEl('circle', {
          cx: AXIS_X, cy, r, fill: 'url(#wash-grain-tile)',
        }, g);
        mottle.style.opacity = t.grain;
        mottle.style.mixBlendMode = 'soft-light';
      }
      continue;
    }

    // Outlines stay hand-drawn — these thin lines are what the diagram is about.
    const node = rc.circle(AXIS_X, cy, r * 2, {
      roughness: t.roughness ?? 0,
      fill: 'none',
      stroke: t.stroke,
      strokeWidth: t.strokeWidth_km / KM_PER_PX,
    });
    if (t.opacity != null) node.style.opacity = t.opacity;
    g.appendChild(node);
  }
}

// === LABEL COLLISION DETECTION ===
const LABEL_GAP = 22 * LABEL_SCALE; // minimum vertical px between label anchors

function computePlacement(feat, altitudeKm, isMirrored) {
  const yPos = y(altitudeKm);
  const offset = feat.labelOffset;
  // Horizontal offsets were hand-tuned against a 680 canvas. Shrink them on
  // narrower ones so labels don't run off the edge; never stretch past the
  // original spacing on wider ones. Note this deliberately does NOT pick up
  // LABEL_SCALE the way the vertical nudges do: dy separates two lines of type
  // and has to grow with it, but dx is a horizontal position and belongs to the
  // width budget. Multiplying dx by both cancelled the shrink out entirely.
  const k = Math.min(1, SVG_WIDTH / LAYOUT_REF_WIDTH);
  let labelX, labelY;

  if (feat.labelSide === 'left') {
    labelX = AXIS_X - TICK_HALF - 8 * LABEL_SCALE;
    labelY = yPos;
  } else if (offset) {
    const dy = (isMirrored ? -offset.dy : offset.dy) * LABEL_SCALE;
    labelX = AXIS_X + TICK_HALF + offset.dx * k + LABEL_PAD;
    labelY = yPos + dy;
  } else {
    labelX = AXIS_X + TICK_HALF + LEADER_LEN * k + LABEL_PAD;
    labelY = yPos;
  }

  return { feat, altitudeKm, isMirrored, yPos, labelX, labelY, side: feat.labelSide };
}

function resolveCollisions(placements) {
  // Separate left and right, resolve each independently
  const left = placements.filter(p => p.side === 'left').sort((a, b) => a.labelY - b.labelY);
  const right = placements.filter(p => p.side === 'right').sort((a, b) => a.labelY - b.labelY);

  for (const group of [left, right]) {
    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1];
      const curr = group[i];
      const overlap = (prev.labelY + LABEL_GAP) - curr.labelY;
      if (overlap > 0) {
        curr.labelY += overlap;
      }
    }
  }
}

function renderFeatures(rc, svg, features) {
  svg.querySelectorAll('.generated').forEach(el => el.remove());
  const g = svgEl('g', { class: 'generated' }, svg);

  // 1. Compute placements
  const placements = [];
  for (const feat of features) {
    if (KM_PER_PX < feat.minScale || KM_PER_PX >= feat.maxScale) continue;
    placements.push(computePlacement(feat, feat.altitude_km, false));
    if (feat.mirror) {
      placements.push(computePlacement(feat, mirrorAltitude(feat.altitude_km), true));
    }
  }

  // 2. Resolve collisions
  resolveCollisions(placements);

  // 3. Render
  for (const p of placements) {
    renderPlacement(rc, g, p);
  }
}

function renderPlacement(rc, parent, p) {
  const { feat, altitudeKm, yPos, labelX, labelY } = p;
  const tickWidth = feat.major ? 1.5 : 1;

  // Tick mark
  drawLine(rc, parent, AXIS_X - TICK_HALF, yPos, AXIS_X + TICK_HALF, yPos, tickWidth);

  // Colored rect (height scales with KM_PER_PX)
  if (feat.color) {
    const h = feat.span_km / KM_PER_PX;
    svgEl('rect', {
      x: AXIS_X - LABEL_SCALE / 2, y: yPos - h / 2,
      width: LABEL_SCALE, height: h,
      fill: feat.color,
    }, parent);
  }

  // Labels
  const nameSize = 14 * LABEL_SCALE;
  const altSize = 10 * LABEL_SCALE;
  const nameY = labelY - 2 * LABEL_SCALE;
  const altY = labelY + 8 * LABEL_SCALE;

  if (feat.labelSide === 'left') {
    svgEl('text', {
      x: labelX, y: nameY,
      'text-anchor': 'end', 'font-size': nameSize,
      fill: 'var(--color-text-primary)',
      'font-family': 'var(--font-hand)',
    }, parent).textContent = feat.name;

    svgEl('text', {
      x: labelX, y: altY,
      'text-anchor': 'end', 'font-size': altSize,
      fill: 'var(--color-text-secondary)',
      'font-family': 'var(--font-hand)',
    }, parent).textContent = formatAltitude(altitudeKm);
  } else {
    // Leader line from tick to label
    const leaderEndX = labelX - LABEL_PAD;
    drawLine(rc, parent, AXIS_X + TICK_HALF, yPos, leaderEndX, labelY, 0.75, { opacity: 0.5, dashed: true });

    svgEl('text', {
      x: labelX, y: nameY,
      'font-size': nameSize,
      fill: 'var(--color-text-primary)',
      'font-family': 'var(--font-hand)',
    }, parent).textContent = feat.name;

    svgEl('text', {
      x: labelX, y: altY,
      'font-size': altSize,
      fill: 'var(--color-text-secondary)',
      'font-family': 'var(--font-hand)',
    }, parent).textContent = formatAltitude(altitudeKm);
  }
}

function render(rc, svg) {
  measureLayout(svg);
  svg.querySelectorAll('.structure, .terra, .generated').forEach(el => el.remove());

  // Compute axis extent from earth mirror range + visible features + visible terra
  let minKm = mirrorAltitude(ORIGIN_KM);
  let maxKm = ORIGIN_KM;
  for (const feat of FEATURES) {
    if (KM_PER_PX < feat.minScale || KM_PER_PX >= feat.maxScale) continue;
    if (feat.altitude_km < minKm) minKm = feat.altitude_km;
    if (feat.altitude_km > maxKm) maxKm = feat.altitude_km;
  }
  for (const t of TERRA) {
    if (KM_PER_PX < t.minScale || KM_PER_PX >= t.maxScale) continue;
    const top = t.center_km + t.radius_km;
    const bot = t.center_km - t.radius_km;
    if (bot < minKm) minKm = bot;
    if (top > maxKm) maxKm = top;
  }

  const axisTopY = y(maxKm);
  const axisBotY = y(minKm);
  svg.setAttribute('viewBox', '0 0 ' + SVG_WIDTH + ' ' + (axisBotY + ORIGIN_Y));

  renderStructure(rc, svg, axisTopY, axisBotY);
  renderTerra(rc, svg);
  renderFeatures(rc, svg, FEATURES);
  updateOffscreenHints(svg);
}

// === OFF-SCREEN HINTS ===
// A feature flagged `offscreenHint` gets a corner marker whenever it is drawn
// but sits outside the viewport — so you know it's out there, and which way.
function featureScreenY(svg, altitudeKm) {
  const rect = svg.getBoundingClientRect();
  return rect.top + y(altitudeKm) * (rect.width / SVG_WIDTH);
}

let hintSignature = null;

function updateOffscreenHints(svg) {
  const box = document.getElementById('offscreen-hints');
  if (!box) return;

  const showing = [];
  for (const feat of FEATURES) {
    if (!feat.offscreenHint) continue;
    if (KM_PER_PX < feat.minScale || KM_PER_PX >= feat.maxScale) continue;

    const screenY = featureScreenY(svg, feat.altitude_km);
    if (screenY >= 0 && screenY <= window.innerHeight) continue;

    showing.push({ feat, dir: screenY < 0 ? -1 : 1 });
  }

  // This runs on every scroll event, so only touch the DOM when it changes.
  const signature = showing.map(s => s.feat.name + s.dir).join('|');
  if (signature === hintSignature) return;
  hintSignature = signature;

  box.replaceChildren(...showing.map(s => makeHint(svg, s.feat, s.dir)));
}

function makeHint(svg, feat, dir) {
  const btn = document.createElement('button');
  btn.className = 'oh';
  btn.type = 'button';
  btn.textContent = feat.name;

  const arrow = svgEl('svg', {
    class: 'oh-arrow', width: 14, height: 22, viewBox: '0 0 14 22',
  }, btn);
  svgEl('path', {
    d: 'M7 2 L7 19 M2 13 L7 19.5 L12 13',
    fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, arrow);
  if (dir < 0) arrow.style.transform = 'rotate(180deg)';

  btn.addEventListener('click', () => {
    const target = window.scrollY + featureScreenY(svg, feat.altitude_km)
                 - window.innerHeight / 2;
    window.scrollTo({ top: target, behavior: 'smooth' });
  });

  return btn;
}
