
// Wrapper service for client-side tools:
// - mammoth (DOCX -> Text)
// - tesseract.js (Image -> Text)
// - @xenova/transformers (Audio -> Text)
// - pdfjs (PDF -> Text)

import { extractTextFromPdf } from './pdfExtractor';

// Configure Transformers.js
// We use dynamic imports inside the function to avoid loading heavy libraries on initial page load
const WHISPER_MODEL = 'Xenova/whisper-tiny';

export const ConverterService = {
    
    /**
     * Converts a DOCX file to raw text using Mammoth.js
     */
    convertDocxToText: async (file: File): Promise<string> => {
        try {
            // @ts-ignore
            const mammoth = await import('mammoth');
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
            if (result.messages.length > 0) {
                console.warn("Mammoth conversion warnings:", result.messages);
            }
            return result.value;
        } catch (e: any) {
            console.error("DOCX Conversion Failed:", e);
            throw new Error(`Failed to convert DOCX: ${e.message}`);
        }
    },

    /**
     * Converts an image to text using Tesseract.js (WASM).
     */
    convertImageToText: async (file: File, lang: string = 'eng', onProgress?: (status: string) => void): Promise<string> => {
        try {
            // @ts-ignore
            const Tesseract = await import('tesseract.js');
            const worker = await Tesseract.createWorker(lang);
            if (onProgress) onProgress("Initializing Tesseract OCR...");
            const ret = await worker.recognize(file);
            await worker.terminate();
            return ret.data.text;
        } catch (e: any) {
            console.error("Image OCR Failed:", e);
            throw new Error(`OCR Failed: ${e.message}`);
        }
    },

    /**
     * Transcribes audio using in-browser Whisper via Transformers.js
     */
    convertAudioToText: async (file: File, onProgress?: (msg: string) => void): Promise<string> => {
        try {
            if (onProgress) onProgress("Loading Neural Speech Model (Whisper)... this happens once.");
            
            // @ts-ignore
            const { pipeline, env } = await import('@xenova/transformers');
            
            // Configuration for browser environment
            env.allowLocalModels = false; 
            env.useBrowserCache = true;

            const transcriber = await pipeline('automatic-speech-recognition', WHISPER_MODEL, {
                progress_callback: (data: any) => {
                    if (data.status === 'progress' && onProgress) {
                        onProgress(`Loading Model: ${Math.round(data.progress || 0)}%`);
                    }
                }
            });

            if (onProgress) onProgress("Transcribing Audio... (this may take time)");

            // Create a URL for the file to pass to the pipeline
            const url = URL.createObjectURL(file);
            
            // Run transcription
            const output = await transcriber(url, {
                chunk_length_s: 30,
                stride_length_s: 5,
                language: 'english', // Auto-detect usually works, but defaults help
                task: 'transcribe',
                return_timestamps: true
            });

            URL.revokeObjectURL(url);

            // Format output with timestamps for "Interlinear" feel
            if (output && output.text) {
                if (output.chunks) {
                    return output.chunks.map((chunk: any) => 
                        `[${formatTime(chunk.timestamp[0])} -> ${formatTime(chunk.timestamp[1])}] ${chunk.text}`
                    ).join('\n');
                }
                return output.text;
            }
            return "";

        } catch (e: any) {
            console.error("Audio Transcription Failed:", e);
            throw new Error(`Transcription Failed: ${e.message}. Ensure your browser supports WebGPU or WASM.`);
        }
    },

    /**
     * Identifies file type and routes to appropriate client-side converter.
     */
    smartExtract: async (file: File, onProgress?: (msg: string) => void): Promise<string> => {
        const type = file.type.toLowerCase();
        const name = file.name.toLowerCase();

        // 1. PDF
        if (type === 'application/pdf' || name.endsWith('.pdf')) {
            if (onProgress) onProgress("Initializing PDF Engine...");
            const res = await extractTextFromPdf(file);
            return res.text;
        }
        // 2. Word (DOCX)
        else if (
            type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
            name.endsWith('.docx')
        ) {
            if (onProgress) onProgress("Converting DOCX to Text...");
            return await ConverterService.convertDocxToText(file);
        }
        // 3. Images
        else if (type.startsWith('image/') || name.match(/\.(jpg|jpeg|png|bmp|webp)$/)) {
            if (onProgress) onProgress("Running Local OCR...");
            return await ConverterService.convertImageToText(file, 'eng', onProgress);
        }
        // 4. Audio
        else if (type.startsWith('audio/') || name.match(/\.(mp3|wav|m4a|ogg|flac)$/)) {
            return await ConverterService.convertAudioToText(file, onProgress);
        }
        // 5. Fallback Text
        else {
            return await file.text();
        }
    }
};

// Helper for timestamp formatting
function formatTime(seconds: number | null): string {
    if (seconds === null) return "??:??";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
