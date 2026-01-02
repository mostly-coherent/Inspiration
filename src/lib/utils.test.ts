import { describe, it, expect, vi, beforeEach } from 'vitest';
import { copyToClipboard, downloadFile } from './utils';

describe('utils', () => {
  describe('copyToClipboard', () => {
    beforeEach(() => {
      vi.clearAllMocks();
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
      const mockWriteText = vi.fn(() => Promise.reject(new Error('Clipboard API not available')));
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true,
      });

      const execCommandSpy = vi.spyOn(document, 'execCommand').mockReturnValue(true);
      const createElementSpy = vi.spyOn(document, 'createElement');
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');
      const removeChildSpy = vi.spyOn(document.body, 'removeChild');

      await copyToClipboard('fallback content');

      expect(mockWriteText).toHaveBeenCalled();
      expect(createElementSpy).toHaveBeenCalledWith('textarea');
      expect(execCommandSpy).toHaveBeenCalledWith('copy');
      expect(removeChildSpy).toHaveBeenCalled();

      execCommandSpy.mockRestore();
      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });

    it('should throw error if both clipboard API and fallback fail', async () => {
      const mockWriteText = vi.fn(() => Promise.reject(new Error('Clipboard API failed')));
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true,
      });

      const execCommandSpy = vi.spyOn(document, 'execCommand').mockReturnValue(false);

      await expect(copyToClipboard('test')).rejects.toThrow('Unable to copy to clipboard');

      execCommandSpy.mockRestore();
    });
  });

  describe('downloadFile', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should create and trigger download link', () => {
      const createElementSpy = vi.spyOn(document, 'createElement');
      const appendChildSpy = vi.spyOn(document.body, 'appendChild');
      const removeChildSpy = vi.spyOn(document.body, 'removeChild');
      const clickSpy = vi.fn();

      // Mock anchor element
      const mockAnchor = {
        href: '',
        download: '',
        click: clickSpy,
      } as unknown as HTMLAnchorElement;

      createElementSpy.mockReturnValue(mockAnchor);

      downloadFile('test content', 'test.md');

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(mockAnchor.download).toBe('test.md');
      expect(appendChildSpy).toHaveBeenCalledWith(mockAnchor);
      expect(clickSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalledWith(mockAnchor);
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();

      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });

    it('should create blob with correct type', () => {
      const BlobSpy = vi.spyOn(global, 'Blob');
      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
        href: '',
        download: '',
        click: vi.fn(),
      } as unknown as HTMLAnchorElement);

      downloadFile('content', 'file.txt');

      expect(BlobSpy).toHaveBeenCalledWith(['content'], { type: 'text/markdown' });

      BlobSpy.mockRestore();
      createElementSpy.mockRestore();
    });
  });
});

