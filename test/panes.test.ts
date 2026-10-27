import { describe, expect, it } from 'vitest';
import { clamp, isVideo, parseComputedColor, parseRadius, readNumber, stepSpring } from '../src/core/panes';
import { getBackdropCrop } from '../src/core/backdrop';

describe('parseRadius', () => {
  it('reads px and caps a pill at half the short side', () => {
    expect(parseRadius('24px', 200, 80)).toBe(24);
    expect(parseRadius('9999px', 200, 80)).toBe(40);
  });
  it('resolves percentages against the short side', () => {
    expect(parseRadius('50%', 300, 100)).toBe(50);
    expect(parseRadius('10%', 300, 100)).toBe(10);
  });
  it('uses the first value of an elliptical radius and treats nonsense as square', () => {
    expect(parseRadius('12px 30px', 100, 100)).toBe(12);
    expect(parseRadius('', 100, 100)).toBe(0);
    expect(parseRadius('auto', 100, 100)).toBe(0);
  });
});

describe('readNumber', () => {
  it('parses, clamps and falls back', () => {
    expect(readNumber(' 0.4 ', 1)).toBe(0.4);
    expect(readNumber('5', 1, 0, 1)).toBe(1);
    expect(readNumber('', 0.2)).toBe(0.2);
    expect(readNumber('abc', 0.2)).toBe(0.2);
  });
});

describe('parseComputedColor', () => {
  it('reads rgb, rgba and the space-separated form', () => {
    expect(parseComputedColor('rgb(255, 0, 51)')).toEqual([1, 0, 0.2, 1]);
    expect(parseComputedColor('rgba(0, 0, 0, 0.5)')).toEqual([0, 0, 0, 0.5]);
    expect(parseComputedColor('rgb(255 255 255 / 25%)')).toEqual([1, 1, 1, 0.25]);
    expect(parseComputedColor('transparent')).toBeNull();
  });
});

describe('stepSpring', () => {
  it('settles on its target regardless of frame rate', () => {
    let fast: [number, number] = [0, 0];
    let slow: [number, number] = [0, 0];
    for (let i = 0; i < 240; i += 1) fast = stepSpring(fast[0], fast[1], 1, 1 / 120);
    for (let i = 0; i < 60; i += 1) slow = stepSpring(slow[0], slow[1], 1, 1 / 30);
    expect(fast[0]).toBeCloseTo(1, 3);
    expect(slow[0]).toBeCloseTo(1, 3);
  });
  it('ignores runaway or invalid frame times', () => {
    expect(stepSpring(0, 0, 1, Number.NaN)).toEqual([0, 0]);
    expect(stepSpring(0, 0, 1, 10)[0]).toBeLessThan(1.5);
  });
});

describe('helpers', () => {
  it('clamps', () => { expect(clamp(5, 0, 1)).toBe(1); expect(clamp(-1, 0, 1)).toBe(0); });
  it('spots video backdrops', () => {
    expect(isVideo('/clip.mp4')).toBe(true);
    expect(isVideo('https://cdn.example.com/a.webm?v=2')).toBe(true);
    expect(isVideo('/photo.webp')).toBe(false);
  });
  it('crops a wide image to cover a tall box without stretching', () => {
    const [sx, sy, ox, oy] = getBackdropCrop(400, 800, 1600, 800);
    expect(sy).toBe(1);
    expect(sx).toBeCloseTo(0.25);
    expect(ox).toBeCloseTo(0.375);
    expect(oy).toBe(0);
  });
});
