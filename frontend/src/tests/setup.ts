import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";

// Mock crypto.randomUUID with deterministic value
const originalCrypto = global.crypto;
const originalRandomUUID = originalCrypto?.randomUUID;

if (!global.crypto) {
  global.crypto = {} as Crypto;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.crypto.randomUUID = () => "00000000-0000-0000-0000-000000000000" as any;

// Restore original in teardown if needed
if (typeof afterAll !== "undefined") {
  afterAll(() => {
    if (originalRandomUUID) {
      global.crypto.randomUUID = originalRandomUUID;
    } else if (originalCrypto) {
      global.crypto = originalCrypto;
    }
  });
}

// Mock TextEncoder and TextDecoder
if (typeof global.TextEncoder === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.TextEncoder = TextEncoder as any;
}
if (typeof global.TextDecoder === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.TextDecoder = TextDecoder as any;
}
