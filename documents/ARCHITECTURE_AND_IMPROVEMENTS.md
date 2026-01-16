# Dziłtǫ́ǫ́ (Djihlltoh) System Architecture & Improvement Log

**Version:** 2.1.0-Physics-Integrated
**Date:** Current

## 1. Core Application Architecture

Dziłtǫ́ǫ́ is a client-side, single-page application (SPA) designed for rigorous linguistic and legal text analysis. It operates on a **Zero-Knowledge** architecture where all heuristic processing occurs within the browser, utilizing Google Gemini only for semantic enrichment and reasoning.

### 1.1 Tech Stack
*   **Runtime**: React 19 (TypeScript)
*   **Build Tool**: Vite
*   **Styling**: Tailwind CSS + Lucide React Icons
*   **AI Integration**: Google GenAI SDK (Gemini 2.5/3.0 Models)
*   **PDF Engine**: PDF.js (Layout Analysis) + Tesseract.js (WASM OCR)

### 1.2 The "Two-Layer" IGTX Philosophy
The application implements a bifurcated analysis pipeline:

1.  **Layer 1: Measurement (The Physics Kernel)**
    *   *Nature:* Passive, Descriptive, Non-Interventionist.
    *   *Responsibility:* Measures the "Semantic Gravity" of text without altering it.
    *   *Metrics:* 
        *   **Decay Rate ($\lambda$):** How quickly semantic coherence drops over distance.
        *   **Asymmetry ($\kappa$):** The difference between forward and backward flow.
        *   **Structural Fit ($R^2$):** Consistency of the logical flow.

2.  **Layer 2: Application (The Control Layer)**
    *   *Nature:* Active, Goal-Directed.
    *   *Responsibility:* Applies constraints, flags errors, and structures data based on user intent (Legal vs. Linguistic).

---

## 2. Recent Architectural Improvements

The following modules were recently upgraded to enhance heuristic precision and AI context awareness.

### A. Temporal Constraint & Integrity Engine
*   **Goal**: To deterministically validate the procedural validity of legal documents.
*   **Implementation**: A `ConstraintChecker` class was added to the `LegalAnalyzer`.
*   **Logic**:
    1.  **Extraction**: Regex patterns identify specific date types (Jurat, Filing, Service, Hearing).
    2.  **Validation**: 
        *   *Jurat $\prec$ Filing*: A document cannot be filed before it is sworn.
        *   *Service $\prec$ Hearing*: Service must occur $N$ days before a hearing.
        *   *Sanity*: Dates cannot be in the future.
*   **Files Touched**: `services/legalAnalyzer.ts`

### B. Heuristic Clause Structure Analysis
*   **Goal**: To classify text complexity without calling an LLM, allowing for fast "Tier 1" segmentation.
*   **Implementation**: An `analyzeStructure` function within the IGTX Parser.
*   **Logic**:
    *   Analyzes punctuation density, conjunction usage, and token count.
    *   Classifies segments as `simple`, `compound`, `complex_embedded`, or `fragment`.
    *   Assigns a `complexityScore` (0.0 - 1.0).
*   **Files Touched**: `services/igtxParser.ts`

### C. Physics-Aware AI Persona
*   **Goal**: To bridge the gap between hard metrics (Layer 1) and LLM reasoning (Layer 2).
*   **Implementation**: 
    1.  The `ParseReport` is injected into the ChatBot context.
    2.  The System Instruction is dynamically updated with "Semantic Coherence Analyst" guidelines.
*   **Behavior**:
    *   The AI can now "see" the $\lambda$ and $R^2$ values.
    *   It interprets high $\lambda$ (>0.1) as "flight of ideas" or poor drafting.
    *   It uses these metrics to flag documents as "vulnerable to dismissal" based on structural incoherence.
*   **Files Touched**: `components/ChatBot.tsx`, `App.tsx`, `services/aiService.ts`

---

## 3. File Map & Responsibilities

### Core Services
| File | Responsibility | Recent Changes |
| :--- | :--- | :--- |
| `services/igtxParser.ts` | Main pipeline orchestrator. Handles hashing, block extraction, and calls the Physics Kernel. | Added `analyzeStructure` for clause classification. |
| `services/legalAnalyzer.ts` | Heuristic engine for legal documents. | Added `ConstraintChecker` (Temporal rules) and `IntegrityChecker` (Reference validation). |
| `services/aiService.ts` | Interface to Google Gemini. Defines tools and personas. | Added "Semantic Coherence Analyst" persona and context injection instructions. |
| `core/vssc_skeptic/linguistic_physics.ts` | The mathematical core calculating $\lambda$ and $\kappa$. | (Existing) Calculates the metrics utilized by the ChatBot. |

### Components
| File | Responsibility | Recent Changes |
| :--- | :--- | :--- |
| `components/ChatBot.tsx` | UI for the AI Assistant and Live API. | Accepts `report` prop; injects Physics metrics into the context window. |
| `App.tsx` | Main application layout and state container. | Passes `activeCase.report` down to `ChatBot`. |

### Types
| File | Responsibility | Recent Changes |
| :--- | :--- | :--- |
| `types.ts` | TypeScript definitions. | Updated `StructuralAnalysis` and `LegalAnalysisResult` interfaces. |
