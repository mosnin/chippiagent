export type SanitizeResult = {
  safe: boolean;
  sanitized: string;
  violations: string[];
};

// Jailbreak phrases (case-insensitive)
const JAILBREAK_PATTERNS: RegExp[] = [
  /ignore\s+(previous|prior|all)\s+instructions?/gi,
  /forget\s+(your|all|previous)\s+instructions?/gi,
  /system\s*prompt/gi,
  /you\s+are\s+now\s+/gi,
  /act\s+as\s+if\s+/gi,
  /pretend\s+(you\s+are|to\s+be)/gi,
  /\bdisregard\b/gi,
  /\boverride\b.*?\binstructions?\b/gi,
  /new\s+persona/gi,
  /developer\s+mode/gi,
  /\bDAN\b/g,
];

// Role injection patterns (line-level)
const ROLE_INJECTION_PATTERNS: RegExp[] = [
  /^SYSTEM\s*:/gm,
  /^ASSISTANT\s*:/gm,
  /^Human\s*:/gm,
  /^\[INST\]/gm,
  /^<\|im_start\|>/gm,
  /^<\|system\|>/gm,
];

// Exfiltration patterns
const EXFILTRATION_PATTERNS: RegExp[] = [
  /\bbase64\b/gi,
  /[0-9a-fA-F]{40,}/g,       // long hex strings (SHA hashes, encoded data)
  /data:[a-z]+\/[a-z]+;/gi,  // data URIs
  /---BEGIN\s+[A-Z]/g,       // PEM-style markers
];

const MAX_INPUT_LENGTH = 32_000;

const REDACTED = "[REDACTED]";

/**
 * Applies a list of patterns against the input string, replacing every matched
 * span with [REDACTED] and collecting violation labels.
 *
 * Note: patterns must have the global flag set so that repeated `.exec()` calls
 * advance through the string correctly.
 */
function applyPatterns(
  input: string,
  patterns: RegExp[],
  violationLabel: string,
  violations: string[]
): string {
  let output = input;
  let matched = false;

  for (const pattern of patterns) {
    // Reset lastIndex so re-used global regexes always start from index 0.
    pattern.lastIndex = 0;

    const replaced = output.replace(pattern, REDACTED);
    if (replaced !== output) {
      output = replaced;
      matched = true;
    }
  }

  if (matched && !violations.includes(violationLabel)) {
    violations.push(violationLabel);
  }

  return output;
}

export function sanitizeUserInput(input: string): SanitizeResult {
  const violations: string[] = [];
  let sanitized = input;

  // 1. Length check — truncate before doing any regex work.
  if (sanitized.length > MAX_INPUT_LENGTH) {
    violations.push("input_too_long");
    sanitized = sanitized.slice(0, MAX_INPUT_LENGTH);
  }

  // 2. Jailbreak detection.
  sanitized = applyPatterns(sanitized, JAILBREAK_PATTERNS, "jailbreak", violations);

  // 3. Role injection detection.
  sanitized = applyPatterns(sanitized, ROLE_INJECTION_PATTERNS, "role_injection", violations);

  // 4. Exfiltration detection.
  sanitized = applyPatterns(sanitized, EXFILTRATION_PATTERNS, "exfiltration", violations);

  return {
    safe: violations.length === 0,
    sanitized,
    violations,
  };
}

/**
 * Recursively walks all string values in `value`, sanitizing each one and
 * merging violations.  Non-string primitives and arrays are handled correctly.
 */
function sanitizeValue(
  value: unknown,
  allViolations: string[]
): unknown {
  if (typeof value === "string") {
    const result = sanitizeUserInput(value);
    for (const v of result.violations) {
      if (!allViolations.includes(v)) {
        allViolations.push(v);
      }
    }
    return result.sanitized;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, allViolations));
  }

  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeValue(v, allViolations);
    }
    return out;
  }

  // Booleans, numbers, null, undefined — pass through unchanged.
  return value;
}

export function sanitizeToolArgs(args: Record<string, unknown>): SanitizeResult {
  const allViolations: string[] = [];
  const sanitizedObj = sanitizeValue(args, allViolations) as Record<string, unknown>;

  // Reconstruct the sanitized string representation.
  // Callers receive the object directly; we also expose a JSON snapshot as
  // `sanitized` so the SanitizeResult contract is fulfilled.
  const sanitized = JSON.stringify(sanitizedObj);

  return {
    safe: allViolations.length === 0,
    sanitized,
    violations: allViolations,
  };
}
