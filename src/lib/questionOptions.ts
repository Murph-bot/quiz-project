export function normalizeOptions(options: unknown): number[] | undefined {
  if (Array.isArray(options)) {
    return options.every((v) => typeof v === 'number') ? options : undefined
  }
  if (typeof options === 'string') {
    try {
      const parsed = JSON.parse(options)
      return Array.isArray(parsed) && parsed.every((v) => typeof v === 'number') ? parsed : undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

export function withNormalizedOptions<T extends { options?: unknown }>(question: T): T & { options?: number[] } {
  const options = normalizeOptions(question.options)
  return options ? { ...question, options } : { ...question, options: undefined }
}
