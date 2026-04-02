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

  // Earth body — rough fill, no stroke
  const earthCY = y(-EARTH_R_KM);
  const EARTH_R_PX = EARTH_R_KM / KM_PER_PX;
  const earthDiam = EARTH_R_PX * 2;
  const body = rc.circle(AXIS_X, earthCY, earthDiam, {
    stroke: 'none', strokeWidth: 0,
    fill: 'white',
    fillStyle: 'cross-hatch',
    fillWeight: 0.1,
    hachureGap: 4,
    roughness: 0.5,
  });
  body.style.opacity = 0.2;
  g.appendChild(body);

  // Habitable zone ring (0–10 km) — green
  const habitableStroke = 10 / KM_PER_PX;
  const habitableR = (EARTH_R_KM + 6) / KM_PER_PX;
  g.appendChild(rc.circle(AXIS_X, earthCY, habitableR * 2, {
    stroke: '#3B6D11',
    strokeWidth: habitableStroke,
    fill: 'none',
    roughness: 0,
  }));

  // Ocean ring (0 to −10 km) — blue
  const oceanStroke = 10 / KM_PER_PX;
  const oceanR = (EARTH_R_KM - 6) / KM_PER_PX;
  g.appendChild(rc.circle(AXIS_X, earthCY, oceanR * 2, {
    stroke: '#185FA5',
    strokeWidth: oceanStroke,
    fill: 'none',
    roughness: 0,
  }));
}

function renderFeatures(rc, svg, features) {
  svg.querySelectorAll('.generated').forEach(el => el.remove());
  const g = svgEl('g', { class: 'generated' }, svg);

  for (const feat of features) {
    if (KM_PER_PX < feat.minScale || KM_PER_PX >= feat.maxScale) continue;
    renderOneFeature(rc, g, feat, feat.altitude_km, false);
    if (feat.mirror) {
      renderOneFeature(rc, g, feat, mirrorAltitude(feat.altitude_km), true);
    }
  }
}

function renderOneFeature(rc, parent, feat, altitudeKm, isMirrored) {
  const yPos = y(altitudeKm);
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
    const labelX = AXIS_X - TICK_HALF - 8;

    svgEl('text', {
      x: labelX, y: yPos - 2,
      'text-anchor': 'end', 'font-size': 14,
      fill: 'var(--color-text-primary)',
      'font-family': 'var(--font-hand)',
    }, parent).textContent = feat.name;

    svgEl('text', {
      x: labelX, y: yPos + 8,
      'text-anchor': 'end', 'font-size': 10,
      fill: 'var(--color-text-secondary)',
      'font-family': 'var(--font-hand)',
    }, parent).textContent = formatAltitude(altitudeKm);
  } else {
    // Right-side: leader line + labels
    const offset = feat.labelOffset;
    let leaderEndX, leaderEndY;

    if (offset) {
      const dy = isMirrored ? -offset.dy : offset.dy;
      leaderEndX = AXIS_X + TICK_HALF + offset.dx;
      leaderEndY = yPos + dy;
    } else {
      leaderEndX = AXIS_X + TICK_HALF + LEADER_LEN;
      leaderEndY = yPos;
    }

    drawLine(rc, parent, AXIS_X + TICK_HALF, yPos, leaderEndX, leaderEndY, 0.75, { opacity: 0.5, dashed: true });

    svgEl('text', {
      x: leaderEndX + 5, y: leaderEndY - 2,
      'font-size': 14,
      fill: 'var(--color-text-primary)',
      'font-family': 'var(--font-hand)',
    }, parent).textContent = feat.name;

    svgEl('text', {
      x: leaderEndX + 5, y: leaderEndY + 8,
      'font-size': 10,
      fill: 'var(--color-text-secondary)',
      'font-family': 'var(--font-hand)',
    }, parent).textContent = formatAltitude(altitudeKm);
  }
}

function render(rc, svg) {
  svg.querySelectorAll('.structure, .generated').forEach(el => el.remove());

  // Compute axis extent from earth mirror range + any visible features beyond it
  let minKm = mirrorAltitude(ORIGIN_KM); // bottom of earth mirror
  let maxKm = ORIGIN_KM;                 // top of earth mirror
  for (const feat of FEATURES) {
    if (KM_PER_PX < feat.minScale || KM_PER_PX >= feat.maxScale) continue;
    if (feat.altitude_km < minKm) minKm = feat.altitude_km;
    if (feat.altitude_km > maxKm) maxKm = feat.altitude_km;
  }

  const axisTopY = y(maxKm);
  const axisBotY = y(minKm);
  svg.setAttribute('viewBox', '0 0 680 ' + (axisBotY + ORIGIN_Y));

  renderStructure(rc, svg, axisTopY, axisBotY);
  renderFeatures(rc, svg, FEATURES);
}
