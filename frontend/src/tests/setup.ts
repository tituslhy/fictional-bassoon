import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock crypto.randomUUID with deterministic value
const originalCrypto = global.crypto;
const originalRandomUUID = originalCrypto?.randomUUID;

if (!global.crypto) {
  global.crypto = {} as Crypto;
}

global.crypto.randomUUID = () => "test-uuid-0000000";

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
if (typeof TextEncoder === "undefined") {
  global.TextEncoder = require("util").TextEncoder;
}
if (typeof TextDecoder === "undefined") {
  global.TextDecoder = require("util").TextDecoder;
}