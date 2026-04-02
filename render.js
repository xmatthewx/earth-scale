// === CONSTANTS ===
let KM_PER_PX = 2;
const ORIGIN_KM = 800;
const ORIGIN_Y = 20;
const EARTH_R_KM = 6350;
const AXIS_X = 240;
const TICK_HALF = 5;
const LEADER_LEN = 30;

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

function renderTerra(rc, svg) {
  const g = svgEl('g', { class: 'terra' }, svg);

  for (const t of TERRA) {
    if (KM_PER_PX < t.minScale || KM_PER_PX >= t.maxScale) continue;

    const cy = y(t.center_km);
    const r = t.radius_km / KM_PER_PX;
    const opts = { roughness: t.roughness ?? 0 };

    if (t.fill) {
      opts.fill = t.fill;
      opts.fillStyle = t.fillStyle ?? 'hachure';
      opts.fillWeight = t.fillWeight ?? 0.5;
      opts.hachureGap = t.hachureGap ?? 4;
    } else {
      opts.fill = 'none';
    }

    if (t.stroke) {
      opts.stroke = t.stroke;
      opts.strokeWidth = t.strokeWidth_km / KM_PER_PX;
    } else {
      opts.stroke = 'none';
      opts.strokeWidth = 0;
    }

    const node = rc.circle(AXIS_X, cy, r * 2, opts);
    if (t.opacity != null) node.style.opacity = t.opacity;
    g.appendChild(node);
  }
}

// === LABEL COLLISION DETECTION ===
const LABEL_GAP = 22; // minimum vertical px between label anchors

function computePlacement(feat, altitudeKm, isMirrored) {
  const yPos = y(altitudeKm);
  const offset = feat.labelOffset;
  let labelX, labelY;

  if (feat.labelSide === 'left') {
    labelX = AXIS_X - TICK_HALF - 8;
    labelY = yPos;
  } else if (offset) {
    const dy = isMirrored ? -offset.dy : offset.dy;
    labelX = AXIS_X + TICK_HALF + offset.dx + 5;
    labelY = yPos + dy;
  } else {
    labelX = AXIS_X + TICK_HALF + LEADER_LEN + 5;
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
      x: AXIS_X - 0.5, y: yPos - h / 2,
      width: 1, height: h,
      fill: feat.color,
    }, parent);
  }

  // Labels
  if (feat.labelSide === 'left') {
    svgEl('text', {
      x: labelX, y: labelY - 2,
      'text-anchor': 'end', 'font-size': 14,
      fill: 'var(--color-text-primary)',
      'font-family': 'var(--font-hand)',
    }, parent).textContent = feat.name;

    svgEl('text', {
      x: labelX, y: labelY + 8,
      'text-anchor': 'end', 'font-size': 10,
      fill: 'var(--color-text-secondary)',
      'font-family': 'var(--font-hand)',
    }, parent).textContent = formatAltitude(altitudeKm);
  } else {
    // Leader line from tick to label
    const leaderEndX = labelX - 5;
    drawLine(rc, parent, AXIS_X + TICK_HALF, yPos, leaderEndX, labelY, 0.75, { opacity: 0.5, dashed: true });

    svgEl('text', {
      x: labelX, y: labelY - 2,
      'font-size': 14,
      fill: 'var(--color-text-primary)',
      'font-family': 'var(--font-hand)',
    }, parent).textContent = feat.name;

    svgEl('text', {
      x: labelX, y: labelY + 8,
      'font-size': 10,
      fill: 'var(--color-text-secondary)',
      'font-family': 'var(--font-hand)',
    }, parent).textContent = formatAltitude(altitudeKm);
  }
}

function render(rc, svg) {
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
  svg.setAttribute('viewBox', '0 0 680 ' + (axisBotY + ORIGIN_Y));

  renderStructure(rc, svg, axisTopY, axisBotY);
  renderTerra(rc, svg);
  renderFeatures(rc, svg, FEATURES);
}
