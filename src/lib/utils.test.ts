// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { copyToClipboard, downloadFile } from './utils';

describe('utils', () => {
  describe('copyToClipboard', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should copy text to clipboard using modern API', async () => {
      const mockWriteText = vi.fn(() => Promise.resolve());
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true,
      });

      await copyToClipboard('test content');

      expect(mockWriteText).toHaveBeenCalledWith('test content');
    });

    it('should fallback to execCommand if clipboard API fails', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn(() => Promise.reject(new Error('not available'))) },
        writable: true,
        configurable: true,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document as any).execCommand = vi.fn(() => true);

      await copyToClipboard('fallback content');

      expect(document.execCommand).toHaveBeenCalledWith('copy');
    });

    it('should throw error if both clipboard API and fallback throw', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn(() => Promise.reject(new Error('no clipboard'))) },
        writable: true,
        configurable: true,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document as any).execCommand = vi.fn(() => {
        throw new Error('execCommand failed');
      });

      await expect(copyToClipboard('test')).rejects.toThrow('Unable to copy to clipboard');
    });
  });

  describe('downloadFile', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should create and trigger download link', () => {
      const clickSpy = vi.fn();
      const realAnchor = document.createElement('a');
      realAnchor.click = clickSpy;

      vi.spyOn(document, 'createElement').mockReturnValue(realAnchor);
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);

      const appendSpy = vi.spyOn(document.body, 'appendChild');
      const removeSpy = vi.spyOn(document.body, 'removeChild');

      downloadFile('test content', 'test.md');

      expect(realAnchor.download).toBe('test.md');
      expect(appendSpy).toHaveBeenCalledWith(realAnchor);
      expect(clickSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalledWith(realAnchor);
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should create blob with correct type', () => {
      const blobSpy = vi.spyOn(global, 'Blob');
      const realAnchor = document.createElement('a');
      realAnchor.click = vi.fn();

      vi.spyOn(document, 'createElement').mockReturnValue(realAnchor);
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);

      downloadFile('content', 'file.txt');

      expect(blobSpy).toHaveBeenCalledWith(['content'], { type: 'text/markdown' });
    });
  });
});
