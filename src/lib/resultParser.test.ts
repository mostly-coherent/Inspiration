import { describe, it, expect } from 'vitest';
import { parseRankedItems, extractEstimatedCost } from './resultParser';

describe('resultParser', () => {
  describe('parseRankedItems', () => {
    it('should return empty array for empty content', () => {
      expect(parseRankedItems('', 'ideas')).toEqual([]);
      expect(parseRankedItems('', 'insights')).toEqual([]);
    });

    it('should parse ideas format correctly', () => {
      const content = `## Idea 1: Test Idea

**Problem:** Test problem
**Solution:** Test solution

## Idea 2: Another Idea

**Problem:** Another problem
**Solution:** Another solution`;

      const result = parseRankedItems(content, 'ideas');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'idea-1',
        rank: 1,
        isBest: true,
        name: 'Test Idea',
      });
      expect(result[1]).toMatchObject({
        id: 'idea-2',
        rank: 2,
        isBest: false,
        name: 'Another Idea',
      });
    });

    it('should parse insights format correctly', () => {
      const content = `## Post 1: Test Post

**Hook:** Test hook
**Insight:** Test insight

## Post 2: Another Post

**Hook:** Another hook
**Key Insight:** Another insight`;

      const result = parseRankedItems(content, 'insights');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'post-1',
        rank: 1,
        isBest: true,
        name: 'Test Post',
      });
      expect(result[1]).toMatchObject({
        id: 'post-2',
        rank: 2,
        isBest: false,
        name: 'Another Post',
      });
    });

    it('should handle content with "All Generated Candidates" section', () => {
      const content = `## Idea 1: Test

**Problem:** Problem
**Solution:** Solution

## All Generated Candidates

Extra content`;

      const result = parseRankedItems(content, 'ideas');

      expect(result).toHaveLength(1);
      expect(result[0].rawMarkdown).not.toContain('All Generated Candidates');
    });

    it('should sort items by rank', () => {
      const content = `## Idea 3: Third

**Problem:** Problem 3

## Idea 1: First

**Problem:** Problem 1

## Idea 2: Second

**Problem:** Problem 2`;

      const result = parseRankedItems(content, 'ideas');

      expect(result[0].rank).toBe(1);
      expect(result[1].rank).toBe(2);
      expect(result[2].rank).toBe(3);
    });
  });

  describe('extractEstimatedCost', () => {
    it('should extract cost from content if available', () => {
      const content = 'Some content\nEstimated cost: $0.123\nMore content';
      const result = extractEstimatedCost(content, 5);
      expect(result).toBe(0.123);
    });

    it('should handle cost without dollar sign', () => {
      const content = 'Estimated cost: 0.456';
      const result = extractEstimatedCost(content, 5);
      expect(result).toBe(0.456);
    });

    it('should fallback to calculation if cost not found', () => {
      const content = 'No cost mentioned';
      const result = extractEstimatedCost(content, 5);
      // Current: Math.max(0.05, 5 * 0.01) = 0.05
      expect(result).toBe(0.05);
    });

    it('should handle case-insensitive cost extraction', () => {
      const content = 'ESTIMATED COST: $0.789';
      const result = extractEstimatedCost(content, 5);
      expect(result).toBe(0.789);
    });

    it('should calculate correctly for zero candidates', () => {
      const content = 'No cost';
      const result = extractEstimatedCost(content, 0);
      // Current: Math.max(0.05, 0 * 0.01) = 0.05
      expect(result).toBe(0.05);
    });
  });
});

