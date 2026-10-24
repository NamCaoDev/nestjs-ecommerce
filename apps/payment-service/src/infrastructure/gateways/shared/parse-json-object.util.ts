/**
 * @param text - JSON text.
 * @returns The parsed object, or `undefined` when the text is not a JSON object.
 */
export function parseJsonObject(
  text: string,
): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
