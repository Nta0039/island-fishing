/**
 * QR code rendering for the "join on your phone" card.
 *
 * Uses the `qrcode-generator` script loaded in index.html. If that script
 * never arrives — offline, blocked, CDN down — `render` reports failure
 * and the card is hidden, so nothing else in the UI is affected.
 */

/** Highest error-correction level that still fits, so the code scans easily. */
const ECC = 'M';

function makeCode(text) {
  const qr = window.qrcode;
  if (typeof qr !== 'function') return null;
  /* Type 0 lets the library pick the smallest version that fits. */
  const code = qr(0, ECC);
  code.addData(text);
  code.make();
  return code;
}

/**
 * Draws `text` into the canvas. Returns false when no encoder is available
 * or the text is too long for a version the library supports.
 */
export function render(canvas, text) {
  if (!canvas || !text) return false;
  let code;
  try {
    code = makeCode(text);
  } catch (_) {
    return false;
  }
  if (!code) return false;

  const count = code.getModuleCount();
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  /* Crisp modules: one canvas pixel block per module, plus the quiet zone
     the spec asks for so cameras can lock on. */
  const QUIET = 4;
  const size = count + QUIET * 2;
  canvas.width = size;
  canvas.height = size;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#0b2239';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (code.isDark(row, col)) ctx.fillRect(col + QUIET, row + QUIET, 1, 1);
    }
  }
  return true;
}
