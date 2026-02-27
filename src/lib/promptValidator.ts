/**
 * Prompt Template Validator
 * 
 * Validates prompt templates before saving to catch issues that would break Python's .format()
 */

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  line: number;
  message: string;
  snippet: string;
}

export interface ValidationWarning {
  line: number;
  message: string;
  snippet: string;
}

/**
 * Validates a prompt template for common issues
 */
export function validatePromptTemplate(content: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const lines = content.split('\n');

  // Check for unescaped braces in JSON examples
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    
    // Pattern 1: Unescaped { or } in JSON examples within code blocks
    // JSON code blocks should use {{ and }} to escape braces for Python .format()
    const jsonBlockRegex = /```json/i;
    const codeBlockEndRegex = /```$/;
    
    let _inJsonBlock = false;
    
    // Check if we're starting/ending a JSON block
    if (jsonBlockRegex.test(line)) {
      _inJsonBlock = true;
    } else if (codeBlockEndRegex.test(line)) {
      _inJsonBlock = false;
    }
    
    // If inside JSON block, check for unescaped braces
    if (line.includes('{') || line.includes('}')) {
      const hasJsonKeywords = /["']?\w+["']?\s*:\s*|^\s*[\[\{]|[\]\}]\s*,?\s*$/.test(line);
      const hasUnescapedBraces = /(?<!\{)\{(?!\{)|(?<!\})\}(?!\})/.test(line);
      
      // If it looks like JSON syntax and has unescaped braces
      if (hasJsonKeywords && hasUnescapedBraces) {
        // Check if it's in a code block (might be intentional)
        const snippet = line.trim().substring(0, 60) + (line.length > 60 ? '...' : '');
        
        errors.push({
          line: lineNum,
          message: 'Unescaped braces in JSON example. Use {{ and }} to escape braces for Python .format()',
          snippet
        });
      }
    }
    
    // Pattern 2: Check for Python format placeholders that might conflict
    const formatPlaceholderRegex = /\{(\w+)\}/g;
    const matches = [...line.matchAll(formatPlaceholderRegex)];
    
    matches.forEach(match => {
      const placeholder = match[1];
      // Valid placeholders that should be allowed (template variables)
      const validPlaceholders = [
        'themes_json', 'theme_name', 'sample_items', 'item_count',
        'query', 'context', 'mode', 'date_range', 'items'
      ];
      
      // If it's a format placeholder but not in our valid list, warn
      if (!validPlaceholders.includes(placeholder)) {
        const snippet = line.trim().substring(0, 60) + (line.length > 60 ? '...' : '');
        
        warnings.push({
          line: lineNum,
          message: `Unknown placeholder {${placeholder}}. If this is a JSON example, escape it as {{${placeholder}}}`,
          snippet
        });
      }
    });
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(result: ValidationResult): string {
  const parts: string[] = [];
  
  if (result.errors.length > 0) {
    parts.push('❌ Errors:');
    result.errors.forEach(error => {
      parts.push(`Line ${error.line}: ${error.message}`);
      parts.push(`  → ${error.snippet}`);
    });
  }
  
  if (result.warnings.length > 0) {
    parts.push('⚠️ Warnings:');
    result.warnings.forEach(warning => {
      parts.push(`Line ${warning.line}: ${warning.message}`);
      parts.push(`  → ${warning.snippet}`);
    });
  }
  
  return parts.join('\n');
}

/**
 * Quick check: Does content have any unescaped JSON braces?
 */
export function hasUnescapedJsonBraces(content: string): boolean {
  // Look for JSON-like patterns with unescaped braces
  const jsonPatterns = [
    /"[^"]+"\s*:\s*[{[]/,  // "key": { or "key": [
    /}\s*,\s*$/m,          // }, at end of line
    /^\s*"[^"]+"\s*:/m,    // "key": at start of line
  ];
  
  const hasJsonSyntax = jsonPatterns.some(pattern => pattern.test(content));
  if (!hasJsonSyntax) return false;
  
  // If it has JSON syntax, check for unescaped braces
  const unescapedBraceRegex = /(?<!\{)\{(?!\{)|(?<!\})\}(?!\})/;
  return unescapedBraceRegex.test(content);
}

/**
 * Auto-fix: Escape braces in JSON code blocks
 */
export function autoEscapeJsonBraces(content: string): string {
  const lines = content.split('\n');
  let inJsonBlock = false;
  
  const fixed = lines.map(line => {
    // Check if we're entering/exiting a JSON code block
    if (/```json/i.test(line)) {
      inJsonBlock = true;
      return line;
    } else if (/```$/.test(line)) {
      inJsonBlock = false;
      return line;
    }
    
    // If inside JSON block, escape braces
    if (inJsonBlock) {
      return line
        .replace(/\{(?!\{)/g, '{{')  // { -> {{
        .replace(/(?<!\})\}/g, '}}'); // } -> }}
    }
    
    return line;
  });
  
  return fixed.join('\n');
}
