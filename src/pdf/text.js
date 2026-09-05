/*
 * Small, dependency-free PDF text-layer reader.
 *
 * This intentionally handles the common PDF case (BT/ET text streams,
 * optionally Flate-compressed) and does not attempt OCR or full font
 * decoding.  It is used to turn selectable text into a reviewable draft;
 * callers should keep the extracted text visible so a parent can correct it.
 */

const textDecoder = new TextDecoder('utf-8', { fatal: false });

export async function extractPdfText(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('请选择 PDF 文件');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = textDecoder.decode(bytes.slice(0, 8));
  if (!header.startsWith('%PDF-')) {
    throw new Error('文件不是有效的 PDF');
  }

  const binary = bytesToBinary(bytes);
  const streams = findStreams(binary);
  const chunks = [];
  let compressedCount = 0;
  let unsupportedCompression = false;

  for (const stream of streams) {
    let data = bytes.slice(stream.start, stream.end);
    if (stream.filter) {
      if (!/FlateDecode/i.test(stream.filter)) {
        unsupportedCompression = true;
        continue;
      }
      compressedCount += 1;
      data = await inflate(data);
    }
    const decoded = bytesToBinary(data);
    const text = extractTextOperators(decoded);
    if (text) chunks.push(text);
  }

  const text = chunks.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) {
    const suffix = unsupportedCompression
      ? '，文件使用了暂不支持的压缩方式'
      : compressedCount && typeof DecompressionStream === 'undefined'
        ? '，当前浏览器不支持解压文本流'
        : '';
    throw new Error(`未找到可读取的文字层${suffix}。扫描图片 PDF 暂不支持`);
  }
  return { text };
}

function findStreams(binary) {
  const streams = [];
  const marker = /stream\r?\n/g;
  let match;
  while ((match = marker.exec(binary))) {
    const start = match.index + match[0].length;
    const end = binary.indexOf('endstream', start);
    if (end < 0) break;
    const dictStart = Math.max(0, binary.lastIndexOf('<<', match.index));
    const dict = binary.slice(dictStart, match.index);
    const filterMatch = dict.match(/\/Filter\s*(\[[^\]]+\]|\/\w+)/i);
    const lengthMatch = dict.match(/\/Length\s+(\d+)/i);
    const declaredEnd = lengthMatch ? start + Number(lengthMatch[1]) : end;
    // Prefer the declared byte length: compressed data may legitimately end
    // in CR/LF, which must not be trimmed as a separator.
    const payloadEnd = declaredEnd <= end ? declaredEnd : trimStreamEnd(binary, start, end);
    streams.push({ start, end: payloadEnd, filter: filterMatch?.[1] || '' });
    marker.lastIndex = end + 9;
  }
  return streams;
}

function trimStreamEnd(binary, start, end) {
  // A PDF may place CR/LF immediately before endstream; it is not payload.
  let trimmed = end;
  while (trimmed > start && (binary[trimmed - 1] === '\n' || binary[trimmed - 1] === '\r')) trimmed -= 1;
  return trimmed;
}

async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前浏览器不支持 PDF 文本流解压');
  }
  try {
    const ds = new DecompressionStream('deflate');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new Error('PDF 文字层解压失败，文件可能已损坏或使用了不兼容的编码');
  }
}

function extractTextOperators(source) {
  const out = [];
  // Literal/hex string followed by Tj.
  const tj = /(\((?:\\.|[^\\)])*\)|<[\da-fA-F\s]+>)\s*Tj\b/g;
  let match;
  while ((match = tj.exec(source))) out.push(decodePdfString(match[1]));

  // Text arrays ([ (foo) 120 (bar) ] TJ) are common in generated PDFs.
  const tjArray = /\[([\s\S]*?)\]\s*TJ\b/g;
  while ((match = tjArray.exec(source))) {
    const strings = match[1].match(/\((?:\\.|[^\\)])*\)|<[\da-fA-F\s]+>/g) || [];
    if (strings.length) out.push(strings.map(decodePdfString).join(''));
  }

  return out
    .map((s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim())
    .filter(Boolean)
    .join(' ');
}

function decodePdfString(token) {
  if (token.startsWith('<')) {
    const hex = token.slice(1, -1).replace(/\s/g, '');
    const padded = hex.length % 2 ? `${hex}0` : hex;
    const bytes = new Uint8Array(padded.length / 2);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16) || 0;
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      let result = '';
      for (let i = 2; i + 1 < bytes.length; i += 2) result += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
      return result;
    }
    return textDecoder.decode(bytes);
  }

  const body = token.slice(1, -1);
  let result = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch !== '\\') {
      result += ch;
      continue;
    }
    const next = body[++i];
    if (next === 'n') result += '\n';
    else if (next === 'r') result += '\r';
    else if (next === 't') result += '\t';
    else if (next === 'b') result += '\b';
    else if (next === 'f') result += '\f';
    else if (next === '\n' || next === '\r') {
      if (next === '\r' && body[i + 1] === '\n') i += 1;
    } else if (/[0-7]/.test(next || '')) {
      let octal = next;
      while (octal.length < 3 && /[0-7]/.test(body[i + 1] || '')) octal += body[++i];
      result += String.fromCharCode(parseInt(octal, 8));
    } else result += next || '';
  }
  return result;
}

function bytesToBinary(bytes) {
  // Chunking avoids call-stack limits for larger PDFs.
  let out = '';
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    out += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return out;
}
