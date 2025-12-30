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
document.execCommand = vi.fn(() => true) as any;

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url') as any;
global.URL.revokeObjectURL = vi.fn() as any;

