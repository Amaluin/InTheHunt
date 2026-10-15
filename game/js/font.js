// 3x5 pixel font for the 320x240 HUD.
window.PixelFont = (() => {
  const GLYPHS = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
    E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
    I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
    M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
    Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
    Y: '101101010010010', Z: '111001010100111',
    0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
    4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
    8: '111101111101111', 9: '111101111001110',
    ':': '000010000010000', '/': '001001010100100', '-': '000000111000000', '.': '000000000000010',
    '!': '010010010000010', '?': '110001010000010', '>': '100010001010100', '<': '001010100010001',
    '+': '000010111010000', '(': '010100100100010', ')': '010001001001010', "'": '010010000000000',
    '*': '000101010101000', ' ': '000000000000000',
  };

  function width(text, scale = 1) {
    return Math.max(0, text.length * 4 * scale - scale);
  }

  function glyphs(ctx, text, x, y, scale) {
    for (let i = 0; i < text.length; i++) {
      const g = GLYPHS[text[i]] || GLYPHS['?'];
      const gx = x + i * 4 * scale;
      for (let p = 0; p < 15; p++) {
        if (g.charCodeAt(p) === 49) ctx.fillRect(gx + (p % 3) * scale, y + ((p / 3) | 0) * scale, scale, scale);
      }
    }
  }

  function draw(ctx, text, x, y, color = '#fff', scale = 1, align = 'left', shadow = '#000') {
    text = String(text).toUpperCase();
    if (align === 'center') x -= width(text, scale) >> 1;
    else if (align === 'right') x -= width(text, scale);
    x = Math.round(x);
    y = Math.round(y);
    if (shadow) {
      ctx.fillStyle = shadow;
      glyphs(ctx, text, x + scale, y + scale, scale);
    }
    ctx.fillStyle = color;
    glyphs(ctx, text, x, y, scale);
  }

  return { draw, width };
})();
