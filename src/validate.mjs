/**
 * Minimal JSON-Schema subset validator for tool arguments.
 * Supports: type (incl. arrays of types), enum, minimum, maximum, minLength,
 * maxLength, pattern, minItems, maxItems, items, required, properties,
 * additionalProperties:false, default (via applyDefaults).
 */

const TYPE_CHECKS = Object.freeze({
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  array: (v) => Array.isArray(v),
  null: (v) => v === null,
});

function checkType(schema, value, path) {
  if (!schema.type) return null;
  const types = [].concat(schema.type);
  const ok = types.some((t) => TYPE_CHECKS[t] && TYPE_CHECKS[t](value));
  return ok ? null : `${path} must be ${types.join(' or ')} (got ${describe(value)})`;
}

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function checkNumber(schema, value, path) {
  const errors = [];
  if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} must be >= ${schema.minimum}`);
  if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} must be <= ${schema.maximum}`);
  if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
    errors.push(`${path} must be > ${schema.exclusiveMinimum}`);
  }
  return errors;
}

function checkString(schema, value, path) {
  const errors = [];
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push(`${path} must have at least ${schema.minLength} characters`);
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    errors.push(`${path} must have at most ${schema.maxLength} characters`);
  }
  if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) {
    errors.push(`${path} must match ${schema.pattern}`);
  }
  return errors;
}

function checkArray(schema, value, path) {
  const errors = [];
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    errors.push(`${path} must have at least ${schema.minItems} items`);
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    errors.push(`${path} must have at most ${schema.maxItems} items`);
  }
  if (schema.items) {
    value.forEach((item, i) => errors.push(...validate(schema.items, item, `${path}[${i}]`)));
  }
  return errors;
}

function checkObject(schema, value, path) {
  const errors = [];
  const props = schema.properties || {};
  for (const key of schema.required || []) {
    if (value[key] === undefined) errors.push(`${path}.${key} is required`);
  }
  for (const [key, sub] of Object.entries(props)) {
    if (value[key] !== undefined) errors.push(...validate(sub, value[key], `${path}.${key}`));
  }
  if (schema.additionalProperties === false) {
    const known = Object.keys(props);
    for (const key of Object.keys(value)) {
      if (!props[key]) errors.push(`${path}.${key} is not a known property (allowed: ${known.join(', ') || 'none'})`);
    }
  }
  return errors;
}

/** Returns a list of human-readable problems; empty when the value is valid. */
export function validate(schema, value, path = 'arguments') {
  if (!schema) return [];
  const typeError = checkType(schema, value, path);
  if (typeError) return [typeError];

  const errors = [];
  if (schema.enum && !schema.enum.some((e) => e === value)) {
    errors.push(`${path} must be one of: ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`);
  }
  if (typeof value === 'number') errors.push(...checkNumber(schema, value, path));
  if (typeof value === 'string') errors.push(...checkString(schema, value, path));
  if (Array.isArray(value)) errors.push(...checkArray(schema, value, path));
  if (TYPE_CHECKS.object(value)) errors.push(...checkObject(schema, value, path));
  return errors;
}

/** Returns a new value with schema defaults filled in. Never mutates the input. */
export function applyDefaults(schema, value) {
  if (!schema) return value;
  if (value === undefined && schema.default !== undefined) return structuredClone(schema.default);
  if (Array.isArray(value) && schema.items) return value.map((item) => applyDefaults(schema.items, item));
  if (!TYPE_CHECKS.object(value) || !schema.properties) return value;

  const result = { ...value };
  for (const [key, sub] of Object.entries(schema.properties)) {
    const filled = applyDefaults(sub, value[key]);
    if (filled !== undefined) result[key] = filled;
  }
  return result;
}
