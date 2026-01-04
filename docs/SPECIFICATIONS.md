
# Technical Specifications: Dziłtǫ́ǫ́ IGTX Parser v1.9

## 1. System Overview
Dziłtǫ́ǫ́ is a client-side, single-page application (SPA) built to rigorously transform raw linguistic field data into machine-readable datasets. It enforces a "Stage 0 to Stage 1" data transition with cryptographic provenance.

*   **Stack**: React 19, TypeScript, Vite, Tailwind CSS.
*   **Deployment**: Static Export (Vercel/Netlify compatible).
*   **Privacy**: Zero-knowledge architecture. All processing (including OCR) occurs in the browser memory. No data is sent to external servers.
*   **Internationalization**: Supports English, Chinese (Simplified/Traditional), and Arabic UI.

## 2. Scientific Features (SOTA Compliance)

### A. Determinism
*   **Principle**: The same input text + same profile + same version **must** produce the exact same JSON output and Block IDs.
*   **Implementation**: 
    *   Uses a seeded `cyrb53` hashing algorithm to generate IDs.
    *   Avoids `Math.random()` or time-based UUIDs for data objects.

### B. Unicode Handling
*   **Standard**: NFC (Normalization Form C) is enforced on ingestion.
*   **Rationale**: Ensures vector embeddings treat `e` + `´` and `é` as identical vectors downstream.

### C. Heuristic Scoring Engine
The parser uses a weighted rule-based system to calculate $P(L_{target} | Line)$.

**Positive Signals (+):**
*   Presence of Native Orthography ranges (e.g., Unicode Latin Extended-B, IPA Extensions).
*   Profile-specific features:
    *   **Polysynthetic**: Sentence length > 15 chars.
    *   **Analytic**: Short average word length, presence of tone numbers.
    *   **Morphologically Dense**: Presence of clitic markers, glottals (`’`, `ʔ`), and high punctuation density within words.

**Negative Signals (-):**
*   High density of Gloss Markers (`-`, `=`, `:`, `.` ).
*   Presence of ALL CAPS words (likely POS tags like `NOM`, `ACC`).
*   Presence of high-frequency English/Spanish/French stop words (Translation detection).
*   Wrapping quotes `""` (often indicates free translation).

### D. IGTX Schema (The "Semantic Gravity" Format)
The output JSON conforms to the IGTX v1.1 spec, designed to bridge the gap between human readability and vector space ingestion.

```typescript
interface IGTXBlock {
  block_id: string;        // Deterministic Hash
  position: number;
  clean_text: string;      // Normalized L1
  segmentation: {
    type: 'clause';
    confidence: number;
  };
  // Future-proofing for Stage 2 (Morphology) & Stage 3 (Semantics)
  semantic_state: {
    predicate: null;
    arguments: [];
  };
  integrity: {
    hash: string;
    warnings: string[];
  };
}
```

## 3. PDF & OCR Subsystem
*   **Standard PDF**: Uses `pdfjs-dist` to extract text. Implements custom layout analysis to distinguish between semantic line breaks (poetry/lists) and layout line breaks (wrapping).
*   **OCR**: Uses `tesseract.js` (WASM).
    *   Triggered automatically when page text density is low (< 5 items).
    *   Renders page to HTML5 Canvas -> Tesseract -> Text.

## 4. Export Formats
| Format | Extension | Use Case |
| :--- | :--- | :--- |
| **IGTX** | `.json` | Archival, Machine Learning Training |
| **LaTeX** | `.tex` | `gb4e` formatted examples for publication |
| **ELAN** | `.eaf` | Time-aligned annotation software |
| **FLEx** | `.db` | Import into FieldWorks Language Explorer |
| **CSV** | `.csv` | Spreadsheet analysis of confidence scores |

## 5. Performance Targets
*   **Throughput**: ~10,000 lines/second (Text Mode, M1 Air).
*   **OCR Speed**: ~2-5 seconds per page (depending on device).
*   **Bundle Size**: Optimized via lazy loading of PDF.js and Tesseract workers.
