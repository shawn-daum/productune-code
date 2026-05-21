/** Recommended LLM models by hardware tier (ordered by preference). */
export const MODEL_RECS: Record<'S' | 'A', string[]> = {
  S: ['qwen2.5:14b', 'qwen2.5:7b', 'llama3.1:8b'],
  A: ['qwen2.5:7b', 'llama3.1:8b', 'gemma2:9b'],
}

export function logLineColor(line: string): string {
  if (line.startsWith('OK')) return '#34D399'
  if (line.startsWith('ERR') || line.includes('오류')) return '#EF4444'
  if (line.startsWith('WARN') || line.includes('WARN:')) return '#FBBF24'
  if (line.includes('확인 중') || line.includes('설치 중') || line.includes('pull 중')) return '#FBBF24'
  return '#505050'
}
