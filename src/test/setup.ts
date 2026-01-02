/**
 * Vitest setup file
 * Configures test environment and mocks
 */

import { vi } from 'vitest';

// Mock window methods for clipboard API
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(() => Promise.resolve()),
  },
  writable: true,
  configurable: true,
});

// Mock document.execCommand for fallback clipboard
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(document as any).execCommand = vi.fn(() => true);

// Mock URL.createObjectURL and revokeObjectURL
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global.URL as any).createObjectURL = vi.fn(() => 'blob:mock-url');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global.URL as any).revokeObjectURL = vi.fn();

