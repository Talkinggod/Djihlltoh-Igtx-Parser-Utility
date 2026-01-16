// Confidential & Proprietary - (c) 2025 MClaxton Talkinggod AI
// @vssc-skeptic-proof: 2024-07-18
/**
 * @fileoverview High-fidelity embedding provider with normalization and fallbacks.
 * This module replaces the simple mock embedding service with a more robust version
 * that includes explicit provider selection, vector normalization, logging, and error handling.
 */

import { LogEvent, VsscSkepticSettings } from "../../types";
import { ske_structuredLog } from "./utils";
import {
  EmbeddingService,
  EmbeddingResult as EmbeddingServiceResult,
} from "../../services/embeddingService";
import {
  startEmbedding,
  markEmbeddingSuccess,
  markEmbeddingError,
} from "../../services/embeddingStatus";

// Default SLERP Python backend endpoint for embeddings
const SLERP_EMBED_ENDPOINT = "http://localhost:8001";

// Cache for Python backend availability check
let pythonBackendAvailable: boolean | null = null;
let pythonBackendLastCheck = 0;
const PYTHON_BACKEND_CHECK_INTERVAL_MS = 30000; // Re-check every 30s

/**
 * Check if the Python SLERP backend is available for embeddings.
 * Caches result for 30 seconds to avoid spamming health checks.
 */
async function checkPythonBackendAvailable(): Promise<boolean> {
  const now = Date.now();
  if (
    pythonBackendAvailable !== null &&
    now - pythonBackendLastCheck < PYTHON_BACKEND_CHECK_INTERVAL_MS
  ) {
    return pythonBackendAvailable;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${SLERP_EMBED_ENDPOINT}/health`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      // Check various possible health response formats
      pythonBackendAvailable =
        data.status === "healthy" &&
        (data.embeddings_available === true ||
          data.embeddings === "available" ||
          data.ready === true);
      console.log(
        `[ske_embeddings] ✅ Python backend check: status=${data.status}, embeddings=${data.embeddings}, ready=${data.ready} → available=${pythonBackendAvailable}`
      );
    } else {
      pythonBackendAvailable = false;
    }
  } catch {
    pythonBackendAvailable = false;
  }

  pythonBackendLastCheck = now;
  return pythonBackendAvailable;
}

/**
 * Get embeddings directly from the Python SLERP backend.
 * Uses BAAI/bge-m3 model with GPU acceleration.
 * Automatically chunks large requests to respect the 100-text limit.
 */
const PYTHON_BACKEND_BATCH_LIMIT = 80; // Safety margin below 100

async function getPythonBackendEmbeddings(
  texts: string[],
  timeoutMs: number = 60000
): Promise<Map<string, number[]> | null> {
  try {
    const allVectors = new Map<string, number[]>();
    
    // Chunk texts into batches to respect backend limit
    const chunks: string[][] = [];
    for (let i = 0; i < texts.length; i += PYTHON_BACKEND_BATCH_LIMIT) {
      chunks.push(texts.slice(i, i + PYTHON_BACKEND_BATCH_LIMIT));
    }
    
    console.log(
      `[ske_embeddings] 🔗 Calling Python backend for ${texts.length} texts in ${chunks.length} chunks...`
    );

    let totalComputeTime = 0;
    
    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx];
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(`${SLERP_EMBED_ENDPOINT}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: chunk }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(
          `[ske_embeddings] ⚠️ Python backend returned ${response.status} for chunk ${chunkIdx + 1}/${chunks.length}`
        );
        return null;
      }

      const data = (await response.json()) as {
        embeddings: Array<{ vector: number[]; dimensions: number }>;
        model: string;
        compute_time_ms: number;
        batch_size: number;
      };

      totalComputeTime += data.compute_time_ms;

      data.embeddings.forEach((emb, idx) => {
        if (idx < chunk.length) {
          allVectors.set(chunk[idx], emb.vector);
        }
      });
    }

    console.log(
      `[ske_embeddings] ✅ Got ${allVectors.size} embeddings from Python (BAAI/bge-m3) in ${totalComputeTime}ms`
    );

    return allVectors;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[ske_embeddings] ⚠️ Python backend failed: ${msg}`);
    return null;
  }
}

const resolveProvider = (
  provider?: string
):
  | "local-transformers"
  | "huggingface-endpoint"
  | "cloudflare-ai"
  | "semantic-galaxy"
  | "huggingface-endpoint"
  | "cloudflare-ai"
  | "semantic-galaxy"
  | "hf-inference"
  | "google"
  | "cohere" => {
  if (!provider) {
    return "local-transformers";
  }
  const normalized = provider.toLowerCase();
  if (normalized === "huggingface" || normalized === "huggingface-endpoint") {
    return "huggingface-endpoint";
  }
  if (normalized === "cloudflare" || normalized === "cloudflare-ai") {
    return "cloudflare-ai";
  }
  if (normalized === "semantic-galaxy") {
    return "semantic-galaxy";
  }
  if (normalized === "hf-inference" || normalized === "huggingface-inference") {
    return "hf-inference";
  }
  if (normalized === "google" || normalized === "gemini" || normalized === "google-genai") {
    return "google";
  }
  if (normalized === "cohere") {
    return "cohere";
  }
  return "local-transformers";
};

export interface SkepticEmbeddingResult {
  vector: number[];
  usedFallback: boolean;
  magnitude: number;
  energy: number;
}

export async function ske_getEmbedding(
  run_id: string,
  text: string,
  settings: VsscSkepticSettings
): Promise<SkepticEmbeddingResult> {
  const provider = resolveProvider(settings.embeddingProvider);

  const response: EmbeddingServiceResult = await EmbeddingService.embed(text, {
    domain: "compression",
    provider,
    model: settings.embeddingModel,
    dimension: settings.embeddingDimension,
    timeoutMs: settings.embeddingTimeoutMs,
    simulateFailure: settings.simulateApiFailure === "embeddings",
    targetModelHint: settings.targetModel,
    metadata: {
      runId: run_id,
      logger: (event, payload) => {
        ske_structuredLog(run_id, event as LogEvent, {
          ...payload,
          text,
        });
      },
    },
  });

  return {
    vector: response.vector,
    usedFallback: response.metadata.usedFallback,
    magnitude: response.metadata.magnitude ?? 1,
    energy: Math.pow(response.metadata.magnitude ?? 1, 2),
  };
}

// Chunking constants for batch embedding to prevent stalls
const EMBEDDING_BATCH_CHUNK_SIZE = 16; // Process 16 texts at a time (smaller = more responsive)
const EMBEDDING_CHUNK_DELAY_MS = 50; // Brief delay between chunks to allow UI updates
const EMBEDDING_BATCH_TIMEOUT_MS = 60000; // 60s timeout per chunk (first chunk may need to download model)

// Track if model has been loaded for faster subsequent requests
let modelLoaded = false;

/**
 * Batched embedding with chunking to prevent stalls on large inputs.
 * Splits large batches into smaller chunks and processes sequentially with
 * timeout protection per chunk.
 */
export async function ske_getEmbeddingsBatch(
  run_id: string,
  texts: string[],
  settings: VsscSkepticSettings,
  onProgress?: (processed: number, total: number) => void
): Promise<Map<string, number[]>> {
  if (texts.length === 0) {
    return new Map();
  }

  // Deduplicate texts first
  const uniqueTexts = [...new Set(texts.filter((t) => t?.trim()))];
  if (uniqueTexts.length === 0) {
    return new Map();
  }

  // =========================================================================
  // PRIORITY 1: Try Python SLERP backend (GPU-accelerated, real embeddings)
  // ONLY if provider is NOT explicitly set to local-transformers
  // This prevents dimension mismatch (bge-m3=1024 vs MiniLM=384)
  // =========================================================================
  const requestedProvider = resolveProvider(settings.embeddingProvider);
  const pythonAvailable = await checkPythonBackendAvailable();
  
  // Only use Python backend if:
  // 1. It's available
  // 2. Provider is NOT explicitly set to local-transformers
  // 3. Dimension is compatible (1024 or not specified)
  const usePythonBackend = pythonAvailable && 
                           requestedProvider !== "local-transformers" &&
                           requestedProvider !== "google" &&
                           requestedProvider !== "cohere" &&
                           requestedProvider !== "cloudflare-ai" &&
                           (settings.embeddingDimension === undefined || 
                            settings.embeddingDimension === 1024);
  
  if (usePythonBackend) {
    console.log(
      `[ske_getEmbeddingsBatch] 🚀 Using Python backend (GPU-accelerated BAAI/bge-m3)`
    );

    ske_structuredLog(run_id, "EMBEDDING_BATCH_START", {
      totalTexts: uniqueTexts.length,
      provider: "python-backend",
      model: "BAAI/bge-m3",
    });

    startEmbedding(uniqueTexts.length);
    const startTime = Date.now();

    const pythonResult = await getPythonBackendEmbeddings(
      uniqueTexts,
      settings.embeddingTimeoutMs ?? 60000
    );

    if (pythonResult && pythonResult.size > 0) {
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      markEmbeddingSuccess(pythonResult.size, parseFloat(elapsedSec));

      ske_structuredLog(run_id, "EMBEDDING_BATCH_COMPLETE", {
        totalTexts: uniqueTexts.length,
        successfulVectors: pythonResult.size,
        provider: "python-backend",
        model: "BAAI/bge-m3",
        elapsedSec,
      });

      onProgress?.(uniqueTexts.length, uniqueTexts.length);
      return pythonResult;
    }

    console.warn(
      `[ske_getEmbeddingsBatch] ⚠️ Python backend returned no results, falling back...`
    );
  } else if (pythonAvailable && requestedProvider === "local-transformers") {
    console.log(
      `[ske_getEmbeddingsBatch] 📍 Using local-transformers (explicitly requested, skipping Python backend to avoid dimension mismatch)`
    );
  }

  // =========================================================================
  // FALLBACK: Use configured provider (local-transformers, hf-inference, etc.)
  // =========================================================================
  const provider = resolveProvider(settings.embeddingProvider);

  // DEBUG: Log provider resolution
  console.log(`[ske_getEmbeddingsBatch] Provider resolved:`, {
    requested: settings.embeddingProvider,
    resolved: provider,
    hasHfToken: !!settings.huggingfaceToken,
    tokenLength: settings.huggingfaceToken?.length || 0,
    pythonBackendTried: pythonAvailable,
  });

  const vectors = new Map<string, number[]>();

  // Track if we need to fallback to local models
  let shouldFallbackToLocal = false;
  let hfApiFailed = false;

  // Configure EmbeddingService with HF token if provided
  if (settings.huggingfaceToken && provider === "hf-inference") {
    EmbeddingService.configure({
      huggingfaceToken: settings.huggingfaceToken,
    });
    console.log(
      `[ske_getEmbeddingsBatch] ✅ Configured HF token for hf-inference provider`
    );
  } else if (provider === "hf-inference" && !settings.huggingfaceToken) {
    console.warn(
      `[ske_getEmbeddingsBatch] ⚠️ hf-inference selected but no token provided!`
    );
  }

  // Convert Xenova/ model names to HF Inference API compatible names
  // HF Inference API uses the original model names, not Xenova/ prefixed ones
  let effectiveModel = settings.embeddingModel;
  if (provider === "hf-inference" && effectiveModel?.startsWith("Xenova/")) {
    // Map Xenova models to their HF Inference equivalents
    const modelMappings: Record<string, string> = {
      "Xenova/paraphrase-multilingual-MiniLM-L12-v2":
        "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
      "Xenova/all-MiniLM-L6-v2": "sentence-transformers/all-MiniLM-L6-v2",
      "Xenova/multilingual-e5-small": "intfloat/multilingual-e5-small",
      "Xenova/paraphrase-multilingual-mpnet-base-v2":
        "sentence-transformers/paraphrase-multilingual-mpnet-base-v2",
    };
    effectiveModel =
      modelMappings[effectiveModel] ||
      effectiveModel.replace("Xenova/", "sentence-transformers/");
    console.log(
      `[ske_getEmbeddingsBatch] Mapped model for HF Inference: ${settings.embeddingModel} → ${effectiveModel}`
    );
  }

  // Create modified settings with the effective model
  const effectiveSettings = {
    ...settings,
    embeddingModel: effectiveModel,
  };

  // uniqueTexts already deduplicated at the start of the function

  ske_structuredLog(run_id, "EMBEDDING_BATCH_START", {
    totalTexts: uniqueTexts.length,
    chunkSize: EMBEDDING_BATCH_CHUNK_SIZE,
  });

  // Update UI status
  startEmbedding(uniqueTexts.length);
  const startTime = Date.now();

  // Process in chunks to prevent stalls
  const chunks: string[][] = [];
  for (let i = 0; i < uniqueTexts.length; i += EMBEDDING_BATCH_CHUNK_SIZE) {
    chunks.push(uniqueTexts.slice(i, i + EMBEDDING_BATCH_CHUNK_SIZE));
  }

  let processed = 0;
  let failedChunks = 0;

  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const chunk = chunks[chunkIdx];

    // Use local provider if HF API failed
    const effectiveProvider = shouldFallbackToLocal
      ? "local-transformers"
      : provider;
    const effectiveModelForProvider = shouldFallbackToLocal
      ? settings.embeddingModel // Use original Xenova model name for local
      : effectiveSettings.embeddingModel; // Use mapped name for HF API

    try {
      // Add timeout protection per chunk
      const chunkPromise = EmbeddingService.embedBatch(chunk, {
        domain: "compression",
        provider: effectiveProvider,
        model: effectiveModelForProvider,
        dimension: effectiveSettings.embeddingDimension,
        timeoutMs: Math.min(
          effectiveSettings.embeddingTimeoutMs ?? 4000,
          EMBEDDING_BATCH_TIMEOUT_MS
        ),
        simulateFailure: settings.simulateApiFailure === "embeddings",
        targetModelHint: settings.targetModel,
        metadata: {
          runId: run_id,
          logger: (event, payload) => {
            ske_structuredLog(run_id, event as LogEvent, {
              ...payload,
              chunkIndex: chunkIdx,
              chunkSize: chunk.length,
            });
          },
        },
      });

      // First chunk may need to download the model - use longer timeout
      const isFirstChunk = chunkIdx === 0 && !modelLoaded;
      const chunkTimeout = isFirstChunk
        ? EMBEDDING_BATCH_TIMEOUT_MS * 2
        : EMBEDDING_BATCH_TIMEOUT_MS;

      if (isFirstChunk) {
        console.log(
          `[ske_getEmbeddingsBatch] First chunk - model may need to download (timeout: ${
            chunkTimeout / 1000
          }s)`
        );
      }

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Embedding chunk ${chunkIdx + 1} timeout (${
                  chunkTimeout / 1000
                }s)`
              )
            ),
          chunkTimeout
        )
      );

      const response = await Promise.race([chunkPromise, timeoutPromise]);

      response.embeddings.forEach((embedding, idx) => {
        vectors.set(chunk[idx], embedding.vector);
      });

      // Mark model as loaded after successful first chunk
      if (!modelLoaded) {
        modelLoaded = true;
        console.log(`[ske_getEmbeddingsBatch] ✅ Model loaded successfully`);
      }

      processed += chunk.length;
      onProgress?.(processed, uniqueTexts.length);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isCorsOrNetworkError =
        errorMsg.includes("Failed to fetch") ||
        errorMsg.includes("Network error") ||
        errorMsg.includes("CORS");

      // If using HF Inference API and getting CORS/network errors, switch to local for remaining chunks
      if (provider === "hf-inference" && isCorsOrNetworkError && !hfApiFailed) {
        hfApiFailed = true;
        shouldFallbackToLocal = true;
        console.warn(
          `[ske_getEmbeddingsBatch] ⚠️ HF Inference API blocked (CORS/network). Switching to local models for remaining chunks...`
        );
        console.warn(
          `[ske_getEmbeddingsBatch] This chunk will be retried with local provider in next iteration.`
        );

        // Retry this same chunk with local provider immediately
        try {
          const localModel = settings.embeddingModel; // Use original Xenova model name

          console.log(
            `[ske_getEmbeddingsBatch] Retrying chunk ${
              chunkIdx + 1
            } with local provider: ${localModel}`
          );

          const localResponse = await EmbeddingService.embedBatch(chunk, {
            domain: "compression",
            provider: "local-transformers",
            model: localModel,
            dimension: effectiveSettings.embeddingDimension,
            timeoutMs: Math.min(
              effectiveSettings.embeddingTimeoutMs ?? 4000,
              EMBEDDING_BATCH_TIMEOUT_MS * 2 // Longer timeout for local model download
            ),
            simulateFailure: settings.simulateApiFailure === "embeddings",
            targetModelHint: settings.targetModel,
            metadata: {
              runId: run_id,
              logger: (event, payload) => {
                ske_structuredLog(run_id, event as LogEvent, {
                  ...payload,
                  chunkIndex: chunkIdx,
                  chunkSize: chunk.length,
                  fallback: "local-transformers",
                });
              },
            },
          });

          localResponse.embeddings.forEach((embedding, idx) => {
            vectors.set(chunk[idx], embedding.vector);
          });

          processed += chunk.length;
          onProgress?.(processed, uniqueTexts.length);
          continue; // Success with local fallback, move to next chunk
        } catch (localError) {
          console.error(
            `[ske_getEmbeddingsBatch] Local fallback also failed:`,
            localError instanceof Error ? localError.message : localError
          );
          // Fall through to zero-vector generation
        }
      }

      failedChunks++;
      console.warn(
        `[ske_getEmbeddingsBatch] Chunk ${chunkIdx + 1}/${
          chunks.length
        } failed:`,
        errorMsg
      );

      ske_structuredLog(run_id, "EMBEDDING_CHUNK_FAILED", {
        chunkIndex: chunkIdx,
        chunkSize: chunk.length,
        error: errorMsg,
        attemptedFallback: shouldFallbackToLocal,
      });

      // Generate zero vectors for failed chunk items so pipeline can continue
      const dimension = effectiveSettings.embeddingDimension ?? 384;
      chunk.forEach((text) => {
        if (!vectors.has(text)) {
          vectors.set(text, new Array(dimension).fill(0));
        }
      });

      processed += chunk.length;
      onProgress?.(processed, uniqueTexts.length);
    }

    // Brief delay between chunks to allow UI updates and prevent rate limiting
    if (chunkIdx < chunks.length - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, EMBEDDING_CHUNK_DELAY_MS)
      );
    }
  }

  ske_structuredLog(run_id, "EMBEDDING_BATCH_COMPLETE", {
    totalTexts: uniqueTexts.length,
    successfulVectors: vectors.size,
    failedChunks,
    usedFallback: shouldFallbackToLocal,
    originalProvider: provider,
  });

  // Log summary
  if (shouldFallbackToLocal) {
    console.log(
      `[ske_getEmbeddingsBatch] ✅ Completed with automatic fallback: HF API → Local models`
    );
    console.log(
      `[ske_getEmbeddingsBatch] Summary: ${vectors.size}/${uniqueTexts.length} vectors, ${failedChunks} failed chunks`
    );
  }

  // Update UI status
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  if (failedChunks === chunks.length) {
    markEmbeddingError(`All ${chunks.length} chunks failed`);
  } else {
    markEmbeddingSuccess(vectors.size, parseFloat(elapsedSec));
  }

  return vectors;
}
