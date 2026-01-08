/**
 * Stats Validator - Catches nonsensical stats before displaying to user
 * 
 * This catches bugs where stats don't make logical sense together,
 * even if the code compiles and types check out.
 */

import { GenerateResult } from './types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate that stats make logical sense together
 */
export function validateStats(result: GenerateResult): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const { stats, items } = result;
  const harmonization = stats.harmonization;
  
  // Rule 1: If items were harmonized, success should be true
  if (harmonization && harmonization.itemsAdded > 0 && !result.success) {
    errors.push(
      `Success is false but ${harmonization.itemsAdded} items were added to Library. ` +
      `This should be marked as success.`
    );
  }
  
  // Rule 2: Items generated can't be negative
  if (stats.itemsGenerated < 0) {
    errors.push(`Items generated is negative: ${stats.itemsGenerated}`);
  }
  
  // Rule 3: Days with activity can't exceed days processed
  if (stats.daysWithActivity > stats.daysProcessed) {
    errors.push(
      `Days with activity (${stats.daysWithActivity}) exceeds days processed (${stats.daysProcessed}). ` +
      `This is mathematically impossible.`
    );
  }
  
  // Rule 4: Harmonization items processed should relate to items generated
  if (harmonization && stats.itemsGenerated > 0) {
    if (harmonization.itemsProcessed === 0) {
      warnings.push(
        `Items were generated (${stats.itemsGenerated}) but harmonization processed 0 items. ` +
        `Did harmonization fail?`
      );
    }
    
    // If items were generated but none added and none deduplicated, something is wrong
    if (
      harmonization.itemsProcessed > 0 &&
      harmonization.itemsAdded === 0 &&
      harmonization.itemsUpdated === 0 &&
      harmonization.itemsDeduplicated === 0
    ) {
      warnings.push(
        `Harmonization processed ${harmonization.itemsProcessed} items but ` +
        `none were added, updated, or deduplicated. What happened to them?`
      );
    }
  }
  
  // Rule 5: If no items generated and no harmonization, explain why success=true
  if (
    result.success &&
    stats.itemsGenerated === 0 &&
    (!harmonization || harmonization.itemsAdded === 0)
  ) {
    warnings.push(
      `Marked as success but no items generated and no items added to Library. ` +
      `Should this be success=false with an explanation?`
    );
  }
  
  // Rule 6: Conversations analyzed should be positive if days with activity > 0
  if (stats.daysWithActivity > 0 && (!stats.conversationsAnalyzed || stats.conversationsAnalyzed === 0)) {
    warnings.push(
      `Days with activity: ${stats.daysWithActivity} but conversations analyzed is 0 or undefined. ` +
      `If there were active days, there should be conversations.`
    );
  }
  
  // Rule 7: Items array should match itemsGenerated (approximately)
  if (items && items.length > 0 && stats.itemsGenerated === 0) {
    errors.push(
      `Items array has ${items.length} items but stats show 0 items generated. ` +
      `These numbers should match.`
    );
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(validation: ValidationResult): string {
  const parts: string[] = [];
  
  if (validation.errors.length > 0) {
    parts.push('**Errors:**');
    validation.errors.forEach((err, i) => {
      parts.push(`${i + 1}. ${err}`);
    });
  }
  
  if (validation.warnings.length > 0) {
    if (parts.length > 0) parts.push('');
    parts.push('**Warnings:**');
    validation.warnings.forEach((warn, i) => {
      parts.push(`${i + 1}. ${warn}`);
    });
  }
  
  return parts.join('\n');
}

/**
 * Development mode: Log validation errors to console
 */
export function validateAndLog(result: GenerateResult, context: string): void {
  if (process.env.NODE_ENV !== 'development') return;
  
  const validation = validateStats(result);
  
  if (!validation.isValid) {
    console.error(`[Stats Validation Failed: ${context}]`);
    console.error(formatValidationErrors(validation));
    console.error('Result:', result);
  } else if (validation.warnings.length > 0) {
    console.warn(`[Stats Validation Warnings: ${context}]`);
    console.warn(formatValidationErrors(validation));
  }
}
