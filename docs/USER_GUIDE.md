
# Dziłtǫ́ǫ́ (Djihlltoh) IGTX Parser - User Guide

**Version 1.9**

## Introduction

Dziłtǫ́ǫ́ is a scientific-grade utility designed to solve the "Garbage In" problem in computational linguistics. It provides a deterministic pipeline for extracting clean target language text from messy, heterogeneous Interlinear Glossed Text (IGT) sources, such as PDFs, field notes, and legacy text files.

Unlike black-box AI tools, Dziłtǫ́ǫ́ uses transparent heuristic algorithms to separate target language (L1) from glosses (L2) and translations (L3), ensuring reproducible datasets for low-resource language modeling.

## Getting Started

### 1. Input Methods
The tool accepts data via two primary methods in the **Stage 0 Ingestion** panel:

*   **Text Paste**: Copy and paste raw text directly from your source document.
*   **File Upload**:
    *   **Text Files** (`.txt`, `.igt`, `.md`): Parsed immediately.
    *   **PDF Documents** (`.pdf`): 
        *   **Standard PDFs**: Text is extracted with layout analysis to preserve line breaks.
        *   **Scanned PDFs**: If the document is an image scan, the tool automatically engages the **OCR Engine (Tesseract)** to recognize text. *Note: OCR requires an internet connection for the initial worker download.*

### 2. Configuration
Before extracting, you can configure the parser to optimize results:

*   **Transcription Profiles**:
    *   **Generic**: Balanced weights for general use.
    *   **Polysynthetic**: Optimized for morphologically complex languages with long word forms (e.g. Inuit, Salish).
    *   **Analytic / Isolating**: Optimized for analytic, low-morphology languages, supporting tone numbers and short words (e.g. Sinitic romanization).
    *   **Morphologically Dense**: Optimized for clitic-heavy and segmented forms (e.g. Arabic, Hebrew, Athabaskan).

    *Note: Profiles tune parsing heuristics based on transcription conventions, not language identity.*

*   **Source Metadata**: Click "Source Metadata" to expand the form. Inputting Title, Author, and Year is recommended for citation purposes in the exported dataset.

### 3. Extraction Process
Click the **Extract** button.

The pipeline performs the following "Stage 1" operations:
1.  **Unicode Normalization (NFC)**: Converts all text to canonical form (e.g., combining characters are fused).
2.  **Line Evaluation**: Each line is scored based on the selected Transcription Profile.
3.  **Filtration**: Lines with low confidence (< 60%)—usually translations or glosses—are discarded or flagged.
4.  **Hashing**: A deterministic hash ID is generated for every extracted block.

### 4. Analyzing Output
The **Output Section** offers three views:

*   **Clean Text**: The raw, extracted target language lines suitable for copy-pasting into training corpora.
*   **Pipeline View**:
    *   **Stats**: Total lines vs. extracted lines.
    *   **Confidence**: Average algorithm certainty.
    *   **Extraction Log**: A detailed list of every extracted block with its confidence score and specific warnings (e.g., "High density of gloss markers").
*   **IGTX Schema**: The rigorous JSON representation of the data, including provenance hashes and empty slots for future semantic analysis (Stage 2/3).

### 5. Exporting Data
Click the **Export** button to download your data in standard formats:

*   **IGTX (JSON)**: The full scientific schema for archival.
*   **LaTeX (gb4e)**: Formatted for linguistics papers.
*   **ELAN (.eaf)**: XML format for time-aligned annotation software.
*   **FLEx / SFM (.db)**: Standard Format Markers for FieldWorks Language Explorer.
*   **CSV**: Tabular data including Block IDs and Confidence scores.
*   **Plain Text**: Simple line-by-line output.
