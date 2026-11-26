/**
 * DSH lossless JSON rejects `undefined` anywhere in a tool result.
 * Object keys with `undefined` are omitted. Array holes become `null` so
 * indexes stay put. Existing `null` values are preserved.
 */
export function losslessJson(value) {
  if (value === undefined) return null;
  if (typeof value !== 'object' || value === null) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : losslessJson(item)));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    out[key] = losslessJson(item);
  }
  return out;
}

export function findUndefined(value, path = '$', hits = []) {
  if (value === undefined) {
    hits.push(path);
    return hits;
  }
  if (typeof value !== 'object' || value === null) return hits;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findUndefined(item, `${path}[${index}]`, hits));
    return hits;
  }
  for (const [key, item] of Object.entries(value)) findUndefined(item, `${path}.${key}`, hits);
  return hits;
}
