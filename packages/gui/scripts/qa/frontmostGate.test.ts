import { describe, expect, it, vi } from 'vitest';
import { assertFrontmost, FrontmostGateError, getFrontmostProcessName } from './frontmostGate';

describe('assertFrontmost', () => {
  it('does not throw when the expected process is frontmost', () => {
    expect(() => assertFrontmost('Electron', () => 'Electron')).not.toThrow();
  });

  it('throws FrontmostGateError when a different process is frontmost', () => {
    expect(() => assertFrontmost('Electron', () => 'Finder')).toThrow(FrontmostGateError);
  });

  it('error message names both the expected and actual process', () => {
    try {
      assertFrontmost('Electron', () => 'Finder');
      throw new Error('expected assertFrontmost to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmostGateError);
      expect((err as Error).message).toContain('Electron');
      expect((err as Error).message).toContain('Finder');
    }
  });
});

describe('getFrontmostProcessName', () => {
  it('trims the osascript output and passes the System Events query', () => {
    const execFn = vi.fn().mockReturnValue(Buffer.from('Electron\n'));
    const name = getFrontmostProcessName(execFn as never);
    expect(name).toBe('Electron');
    expect(execFn).toHaveBeenCalledWith(
      'osascript',
      expect.arrayContaining([expect.stringContaining('System Events')]),
    );
  });
});
