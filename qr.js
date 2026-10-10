/* KART — dependency-free QR encoder (byte mode, Reed–Solomon ECC).
 * Port of the battle-tested qrcode-generator algorithm so handover passes scan
 * for real with no build step and no npm install. Exposes a global `QR`.
 */
const QR = (function () {
  'use strict';

  /* ---------- GF(256) arithmetic for Reed–Solomon ---------- */
  const QRMath = (function () {
    const EXP = new Array(256);
    const LOG = new Array(256);
    (function () {
      for (let i = 0; i < 8; i++) EXP[i] = 1 << i;
      for (let i = 8; i < 256; i++) EXP[i] = EXP[i - 4] ^ EXP[i - 5] ^ EXP[i - 6] ^ EXP[i - 8];
      for (let i = 0; i < 255; i++) LOG[EXP[i]] = i;
    })();
    return {
      glog(n) { if (n < 1) throw new Error('glog(' + n + ')'); return LOG[n]; },
      gexp(n) { while (n < 0) n += 255; while (n >= 256) n -= 255; return EXP[n]; },
    };
  })();

  const QRErrorCorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };
  const QRMaskPattern = { P000: 0, P001: 1, P010: 2, P011: 3, P100: 4, P101: 5, P110: 6, P111: 7 };

  function polyMultiply(a, b) {
    const out = new Array(a.length + b.length - 1).fill(0);
    for (let i = 0; i < a.length; i++) {
      if (a[i] === 0) continue;
      for (let j = 0; j < b.length; j++) {
        if (b[j] === 0) continue;
        out[i + j] ^= QRMath.gexp(QRMath.glog(a[i]) + QRMath.glog(b[j]));
      }
    }
    return out;
  }

  function rsGeneratorPoly(ecCount) {
    let poly = [1];
    for (let i = 0; i < ecCount; i++) poly = polyMultiply(poly, [1, QRMath.gexp(i)]);
    return poly;
  }

  function rsEncode(data, ecCount) {
    const gen = rsGeneratorPoly(ecCount);
    const res = new Array(ecCount).fill(0);
    for (let k = 0; k < data.length; k++) {
      const factor = data[k] ^ res[0];
      res.shift();
      res.push(0);
      if (factor !== 0) {
        for (let i = 0; i < ecCount; i++) res[i] ^= QRMath.gexp(QRMath.glog(gen[i + 1]) + QRMath.glog(factor));
      }
    }
    return res;
  }

  /* RS block layout per version at ECC level M:
   * [ecCodewordsPerBlock, group1Blocks, group1DataCw, group2Blocks, group2DataCw] */
  const RS_M = [
    [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
  ];
  // byte-mode data capacity (chars) at ECC level M, versions 1..10
  const CAP_M = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213];

  function toUtf8Bytes(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        const next = str.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (next - 0xdc00); i += 1; }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return out;
  }

  function encodeCodewords(bytes, version) {
    const [ecPerBlock, g1, dc1, g2, dc2] = RS_M[version - 1];
    const blocks = [];
    for (let i = 0; i < g1; i++) blocks.push(dc1);
    for (let i = 0; i < g2; i++) blocks.push(dc2);
    const totalData = blocks.reduce((a, b) => a + b, 0);

    // bit stream: mode 0100 + char count (8 bits for v1-9) + bytes + terminator + pad
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(0b0100, 4);
    push(bytes.length, version >= 10 ? 16 : 8);
    bytes.forEach(b => push(b, 8));
    const capBits = totalData * 8;
    push(0, Math.min(4, capBits - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);
    const pads = [0xec, 0x11];
    let pi = 0;
    while (bits.length < capBits) { push(pads[pi % 2], 8); pi += 1; }

    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      codewords.push(b);
    }

    // split into blocks, compute EC, interleave
    const dataBlocks = [];
    const ecBlocks = [];
    let off = 0;
    blocks.forEach(size => {
      const chunk = codewords.slice(off, off + size);
      off += size;
      dataBlocks.push(chunk);
      ecBlocks.push(rsEncode(chunk, ecPerBlock));
    });
    const result = [];
    const maxData = Math.max(...blocks);
    for (let i = 0; i < maxData; i++) dataBlocks.forEach(blk => { if (i < blk.length) result.push(blk[i]); });
    for (let i = 0; i < ecPerBlock; i++) ecBlocks.forEach(blk => result.push(blk[i]));
    return result;
  }

  /* ---------- matrix construction ---------- */
  const ALIGN = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  const MASKS = [
    (r, c) => (r + c) % 2 === 0,
    (r, c) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  function bchTypeInfo(data) {
    let d = data << 10;
    while (digitOf(d) - digitOf(0x537) >= 0) d ^= (0x537 << (digitOf(d) - digitOf(0x537)));
    return ((data << 10) | d) ^ 0x5412;
  }
  function bchTypeNumber(data) {
    let d = data << 12;
    while (digitOf(d) - digitOf(0x1f25) >= 0) d ^= (0x1f25 << (digitOf(d) - digitOf(0x1f25)));
    return (data << 12) | d;
  }
  function digitOf(n) { let d = 0; while (n !== 0) { d += 1; n >>>= 1; } return d; }

  function buildMatrix(version, codewords, mask) {
    const size = version * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(null));
    const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
    const setFn = (r, c, v) => { mod[r][c] = v; reserved[r][c] = true; };

    const finder = (row, col) => {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const rr = row + r, cc = col + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const ring = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6));
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setFn(rr, cc, ring || core);
      }
    };
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

    for (let i = 8; i < size - 8; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }

    const centers = ALIGN[version - 1];
    for (const r of centers) for (const c of centers) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        setFn(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
      }
    }

    // reserve format areas
    for (let i = 0; i < 9; i++) { if (mod[8][i] === null) setFn(8, i, false); if (mod[i][8] === null) setFn(i, 8, false); }
    for (let i = 0; i < 8; i++) { if (mod[8][size - 1 - i] === null) setFn(8, size - 1 - i, false); if (mod[size - 1 - i][8] === null) setFn(size - 1 - i, 8, false); }
    setFn(size - 8, 8, true); // dark module

    if (version >= 7) {
      const vbits = bchTypeNumber(version);
      for (let i = 0; i < 18; i++) {
        const bit = ((vbits >>> i) & 1) === 1;
        const a = size - 11 + (i % 3), b = Math.floor(i / 3);
        setFn(b, a, bit); setFn(a, b, bit);
      }
    }

    // data placement (zigzag from bottom-right, skipping column 6)
    let bitIdx = 0;
    const totalBits = codewords.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const c = right - j;
          const upward = ((right + 1) & 2) === 0;
          const r = upward ? size - 1 - vert : vert;
          if (!reserved[r][c]) {
            let dark = false;
            if (bitIdx < totalBits) dark = ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) === 1;
            bitIdx += 1;
            if (MASKS[mask](r, c)) dark = !dark;
            mod[r][c] = dark;
          }
        }
      }
    }

    // format info (two copies, standard placement)
    const fbits = bchTypeInfo((QRErrorCorrectLevel.M << 3) | mask);
    const fget = i => ((fbits >>> i) & 1) === 1;
    // vertical copy in column 8
    for (let i = 0; i < 15; i++) {
      if (i < 6) mod[i][8] = fget(i);
      else if (i < 8) mod[i + 1][8] = fget(i);
      else mod[size - 15 + i][8] = fget(i);
    }
    // horizontal copy in row 8
    for (let i = 0; i < 15; i++) {
      if (i < 8) mod[8][size - i - 1] = fget(i);
      else if (i < 9) mod[8][15 - i - 1 + 1] = fget(i);
      else mod[8][15 - i - 1] = fget(i);
    }
    mod[size - 8][8] = true;

    return { size, mod, reserved };
  }

  function penalty(mod, size) {
    let score = 0;
    const dark = r => r;
    let darkCount = 0;
    for (let r = 0; r < size; r++) {
      let run = 1;
      for (let c = 0; c < size; c++) {
        if (mod[r][c]) darkCount += 1;
        if (c > 0) { if (mod[r][c] === mod[r][c - 1]) { run += 1; if (run === 5) score += 3; else if (run > 5) score += 1; } else run = 1; }
      }
    }
    for (let c = 0; c < size; c++) {
      let run = 1;
      for (let r = 0; r < size; r++) {
        if (r > 0) { if (mod[r][c] === mod[r - 1][c]) { run += 1; if (run === 5) score += 3; else if (run > 5) score += 1; } else run = 1; }
      }
    }
    for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
      const v = mod[r][c];
      if (v === mod[r][c + 1] && v === mod[r + 1][c] && v === mod[r + 1][c + 1]) score += 3;
    }
    const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
    const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
    const match = (get, i) => {
      let m1 = true, m2 = true;
      for (let k = 0; k < 11; k++) { if (get(i + k) !== pat1[k]) m1 = false; if (get(i + k) !== pat2[k]) m2 = false; }
      return m1 || m2;
    };
    for (let r = 0; r < size; r++) for (let c = 0; c + 11 <= size; c++) if (match(i => mod[r][i], c)) score += 40;
    for (let c = 0; c < size; c++) for (let r = 0; r + 11 <= size; r++) if (match(i => mod[i][c], r)) score += 40;
    const ratio = Math.abs(100 * darkCount / (size * size) - 50) / 5;
    score += ratio * 10;
    void dark;
    return score;
  }

  function makeQr(text) {
    const bytes = toUtf8Bytes(text);
    let version = 0;
    for (let v = 1; v <= 10; v++) { if (bytes.length <= CAP_M[v - 1]) { version = v; break; } }
    if (!version) throw new Error('QR payload is too long');
    const codewords = encodeCodewords(bytes, version);
    let best = null, bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const candidate = buildMatrix(version, codewords, mask);
      const score = penalty(candidate.mod, candidate.size);
      if (score < bestScore) { bestScore = score; best = candidate; }
    }
    return { size: best.size, mod: best.mod };
  }

  /* ---------- public helpers ---------- */

  /** Build a QR matrix for `text`. Returns { size, dark(row, col) }. */
  function qrMatrix(text) {
    const { size, mod } = makeQr(String(text));
    return { size, dark: (row, col) => mod[row][col] };
  }

  /** Render the QR as a crisp SVG string (white background, dark modules). */
  function qrToSvg(text, opts) {
    const options = opts || {};
    const px = options.px || 200;
    const darkColor = options.dark || '#102c24';
    const quiet = options.quiet == null ? 4 : options.quiet;
    const m = qrMatrix(text);
    const view = m.size + quiet * 2;
    let path = '';
    for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark(r, c)) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    const title = options.title ? `<title>${String(options.title).replace(/[<>&]/g, '')}</title>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${view} ${view}" shape-rendering="crispEdges" role="img">${title}<rect width="${view}" height="${view}" fill="#ffffff"/><path d="${path}" fill="${darkColor}"/></svg>`;
  }

  /** Unique 8-character handover code (unambiguous alphabet: no 0/O/1/I). */
  function newCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
  }

  /** Payload written into an order's QR — a link back to the order page. */
  function passPayload(orderId, code) {
    const base = (typeof location !== 'undefined' && location.origin)
      ? location.origin + location.pathname
      : 'kart://order';
    return `${base}#/order/${encodeURIComponent(orderId)}?code=${encodeURIComponent(code)}`;
  }

  /** Download the QR as a PNG via an off-screen canvas. Returns false if unavailable. */
  function qrDownloadPng(text, filename, caption) {
    try {
      const m = qrMatrix(text);
      const quiet = 4;
      const scale = 12;
      const view = m.size + quiet * 2;
      const captionLines = caption ? [].concat(caption) : [];
      const textH = captionLines.length ? 10 + captionLines.length * 18 : 0;
      const canvas = document.createElement('canvas');
      canvas.width = view * scale;
      canvas.height = view * scale + textH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#102c24';
      for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
      if (captionLines.length) {
        ctx.fillStyle = '#102c24';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        let y = view * scale + 8;
        captionLines.forEach((line, i) => {
          ctx.font = (i === 0 ? 'bold 15px' : 'bold 13px') + ' monospace';
          ctx.fillText(String(line), canvas.width / 2, y);
          y += 18;
        });
      }
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = (filename || 'kart-pass') + '.png';
      document.body.append(link);
      link.click();
      link.remove();
      return true;
    } catch { return false; }
  }

  return { qrMatrix, qrToSvg, newCode, passPayload, qrDownloadPng, QRErrorCorrectLevel };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = QR;
