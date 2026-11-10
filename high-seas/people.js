// High Seas: people and flags, drawn in code in the game's flat style. Sizes are in iso-plane px
// (the camera zooms them with everything else). A person is about 14 px tall: legs, a coat, a
// head, and arms that wave; they can hold a little flag of their destination, sit in a boat, or
// tread water.

const SKIN = ['#f3d2b3', '#e0b48f', '#c68e63', '#8d5a3b'];

// A flag's cloth: its colour and its shape, so destinations can be told apart without colour.
// (x, y) is the top of the pole; the cloth flies towards fx (+1 right, -1 left).
export function flagCloth(ctx, x, y, w, h, shape, colour, fx = 1, wave = 0) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  const X = (u) => x + fx * u * w;
  const bend = (u) => wave * Math.sin(u * 3.2);
  if (shape === 'pennant') {
    ctx.moveTo(X(0), y);
    ctx.quadraticCurveTo(X(0.5), y + h * 0.25 + bend(0.5), X(1), y + h * 0.45 + bend(1));
    ctx.lineTo(X(0), y + h);
  } else if (shape === 'triangle') {
    ctx.moveTo(X(0), y);
    ctx.lineTo(X(0.62), y + h * 0.5 + bend(0.6));
    ctx.lineTo(X(0), y + h);
  } else if (shape === 'swallow') {
    ctx.moveTo(X(0), y);
    ctx.quadraticCurveTo(X(0.5), y + bend(0.5), X(1), y + bend(1));
    ctx.lineTo(X(0.7), y + h * 0.5 + bend(0.7));
    ctx.lineTo(X(1), y + h + bend(1));
    ctx.quadraticCurveTo(X(0.5), y + h + bend(0.5), X(0), y + h);
  } else {
    // square (and the star flag's cloth)
    ctx.moveTo(X(0), y);
    ctx.quadraticCurveTo(X(0.5), y + bend(0.5), X(1), y + bend(1));
    ctx.lineTo(X(1), y + h + bend(1));
    ctx.quadraticCurveTo(X(0.5), y + h + bend(0.5), X(0), y + h);
  }
  ctx.closePath();
  ctx.fill();
  if (shape === 'star') {
    const cx = X(0.5);
    const cy = y + h / 2 + bend(0.5);
    const r = h * 0.32;
    ctx.fillStyle = '#e8a91c';
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 ? r * 0.45 : r;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(15,42,63,0.35)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

// A person standing at screen point (x, y) (their feet). o: { coat, skin (0..3), t, wave (0..1),
// flag: { colour, shape } | null, bags (0..3), face (-1 left, 1 right), sit, swim, scale }.
export function drawPerson(ctx, x, y, o = {}) {
  const s = (o.scale || 1) * 1.7; // about 24 px tall: readable on a phone
  const t = o.t || 0;
  const coat = o.coat || '#3d5a80';
  const skin = SKIN[(o.skin || 0) % SKIN.length];
  const face = o.face || 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineCap = 'round';
  if (o.swim) {
    // Treading water: a ripple, shoulders, head, both arms waving overhead.
    const bob = Math.sin(t * 4) * 0.8;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 7 + Math.sin(t * 3) * 0.8, 2.6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.ellipse(0, -1.5 + bob, 3.6, 2.2, 0, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = coat;
    ctx.lineWidth = 1.6;
    const a = Math.sin(t * 9) * 2;
    ctx.beginPath();
    ctx.moveTo(-2.5, -2 + bob);
    ctx.lineTo(-5 + a, -8 + bob);
    ctx.moveTo(2.5, -2 + bob);
    ctx.lineTo(5 - a, -8 + bob);
    ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -5 + bob, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const sit = !!o.sit;
  const hip = sit ? -2 : -5;
  // Shadow.
  if (!sit) {
    ctx.fillStyle = 'rgba(20,40,60,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.8, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Coin bags at their feet: what the fare is worth.
  for (let k = 0; k < (o.bags || 0); k++) {
    const bx = face * (-5 - k * 3.4);
    ctx.fillStyle = '#d49a1a';
    ctx.beginPath();
    ctx.arc(bx, -1.6, 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(bx - 0.4, -2, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Legs.
  if (!sit) {
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-1.1, hip);
    ctx.lineTo(-1.3, 0);
    ctx.moveTo(1.1, hip);
    ctx.lineTo(1.3, 0);
    ctx.stroke();
  }
  // Coat.
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.moveTo(-2.9, hip + 0.5);
  ctx.lineTo(-2.4, hip - 6);
  ctx.quadraticCurveTo(0, hip - 7.4, 2.4, hip - 6);
  ctx.lineTo(2.9, hip + 0.5);
  ctx.closePath();
  ctx.fill();
  // Arms: one holds the flag (if any), the other waves (o.wave of the time).
  const sh = hip - 5.4;
  ctx.strokeStyle = coat;
  ctx.lineWidth = 1.5;
  const waving = (o.wave || 0) > 0 && Math.sin(t * 2.1) > 1 - 2 * (o.wave || 0);
  const wa = waving ? Math.sin(t * 11) * 0.5 : 0;
  ctx.beginPath();
  // Waving arm (away from the flag).
  ctx.moveTo(-face * 2.3, sh);
  if (waving) ctx.lineTo(-face * (3.6 + wa * 2), sh - 5);
  else ctx.lineTo(-face * 3.1, sh + 4.2);
  // Flag arm.
  ctx.moveTo(face * 2.3, sh);
  ctx.lineTo(face * 3.9, sh + (o.flag ? 1.5 : 4.2));
  ctx.stroke();
  // Head.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, sh - 2.6, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Flag on a little pole.
  if (o.flag) {
    const px = face * 4.2;
    ctx.strokeStyle = '#5b4a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, sh + 3);
    ctx.lineTo(px, sh - 11);
    ctx.stroke();
    flagCloth(ctx, px, sh - 11, 9, 6.5, o.flag.shape, o.flag.colour, face, Math.sin(t * 6) * 0.8);
  }
  ctx.restore();
}
