const LEFT_L_PATTERNS = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];
const LEFT_G_PATTERNS = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111',
];
const LEFT_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function ean13FromPrefix(prefix: string): string {
  if (!/^\d{12}$/.test(prefix)) throw new Error('EAN-13 prefixes must contain 12 digits.');
  const sum = [...prefix].reduce((total, character, index) => total + Number(character) * (index % 2 === 0 ? 1 : 3), 0);
  return `${prefix}${(10 - (sum % 10)) % 10}`;
}

export function ean13Svg(barcode: string): string {
  if (!/^\d{13}$/.test(barcode)) throw new Error('EAN-13 barcodes must contain 13 digits.');
  const parity = LEFT_PARITY[Number(barcode[0])];
  const left = [...barcode.slice(1, 7)].map((digit, index) =>
    parity[index] === 'L' ? LEFT_L_PATTERNS[Number(digit)] : LEFT_G_PATTERNS[Number(digit)],
  ).join('');
  const right = [...barcode.slice(7)].map((digit) =>
    LEFT_L_PATTERNS[Number(digit)].replace(/[01]/g, (bit) => bit === '0' ? '1' : '0'),
  ).join('');
  const bits = `101${left}01010${right}101`;
  const bars = [...bits].flatMap((bit, index) => bit === '1'
    ? [`<rect x="${index + 10}" y="4" width="1" height="54"/>`]
    : []).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 115 62" role="img" aria-label="EAN-13 ${barcode}"><rect width="115" height="62" fill="white"/><g fill="black">${bars}</g></svg>`;
}
