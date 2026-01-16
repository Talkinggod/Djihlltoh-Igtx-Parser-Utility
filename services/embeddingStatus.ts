
export function startEmbedding(total: number) {
  console.log(`[Embedding] Started processing ${total} texts`);
}

export function markEmbeddingSuccess(count: number, elapsed: number) {
  console.log(`[Embedding] Successfully processed ${count} vectors in ${elapsed}s`);
}

export function markEmbeddingError(msg: string) {
  console.error(`[Embedding] Error: ${msg}`);
}
