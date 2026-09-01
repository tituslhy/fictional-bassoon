import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

const originalCrypto = global.crypto;
const originalRandomUUID = originalCrypto?.randomUUID;

if (!global.crypto) {
  global.crypto = {} as Crypto;
}

global.crypto.randomUUID = (() => '00000000-0000-0000-0000-000000000000') as Crypto['randomUUID'];

if (typeof afterAll !== 'undefined') {
  afterAll(() => {
    if (originalRandomUUID) {
      global.crypto.randomUUID = originalRandomUUID;
    } else if (originalCrypto) {
      global.crypto = originalCrypto;
    }
  });
}

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder as typeof global.TextEncoder;
}

if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder as typeof global.TextDecoder;
}
