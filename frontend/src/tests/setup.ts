import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock crypto.randomUUID
if (!global.crypto) {
  Object.defineProperty(global, "crypto", {
    value: {
      randomUUID: () => "test-uuid-" + Math.random().toString(36).substring(2, 9),
    },
  });
}

// Mock TextEncoder and TextDecoder
if (typeof TextEncoder === "undefined") {
  global.TextEncoder = require("util").TextEncoder;
}
if (typeof TextDecoder === "undefined") {
  global.TextDecoder = require("util").TextDecoder;
}
