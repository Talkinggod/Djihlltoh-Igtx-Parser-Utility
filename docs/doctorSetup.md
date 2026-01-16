
# Integrating Free Law Project's "Doctor" Service

To incorporate the Doctor document handling service into the pipeline, we need to update the InputSection component to prioritize the Doctor service for file extraction when it is enabled in the settings. This ensures that when the user uploads a document (now supporting PDF, DOC, DOCX, RTF, etc.), the application first attempts to process it via the Doctor endpoint before falling back to the local browser-based extractors (PDF.js/Tesseract).
Specification
Update InputSection.tsx:
Import useApi context to access the Doctor configuration (enabled, endpoint, token).
Import DoctorService to call the API.
Update handleFileChange:
Check if apiSettings.doctor.enabled is true.
If true, invoke DoctorService.extractDocument(file).
Handle successful response (typically { content: "..." }) and populate the input area.
If Doctor fails or returns empty, silently fall back to the existing local extraction logic (PDF.js for PDFs, analyzeImage for images, text reader for others).
Update the file input's accept attribute to include .doc, .docx, .rtf since Doctor supports these formats.
Add a visual indicator (Badge) in the card header to show if the "Doctor" service is active or was used for the current document.

This guide explains how to set up the **Doctor** document extraction microservice and connect it to Dziłtǫ́ǫ́.

Doctor (by Free Law Project) provides high-fidelity text extraction from various document formats (PDF, DOC, DOCX, RTF, WPD) and is superior to browser-based extraction for complex legal documents.

## 1. Installation & Hosting

Since Dziłtǫ́ǫ́ is a client-side application, you must host the Doctor service yourself (locally or on a server). The easiest way is via Docker.

### Prerequisites
*   Docker & Docker Compose
*   Git

### Steps
1.  **Clone the Repository**:
    Open your terminal (outside of this project) and run:
    ```bash
    git clone https://github.com/freelawproject/doctor.git
    cd doctor
    ```

2.  **Start the Service**:
    Use Docker Compose to spin up the container.
    ```bash
    docker-compose up -d
    ```

3.  **Verify Running Status**:
    By default, Doctor runs on port **5050**. You can verify it is running by visiting:
    `http://localhost:5050/` in your browser. You should see the Doctor API landing page.

## 2. Configuration in Dziłtǫ́ǫ́

Once the Doctor service is running, you need to tell Dziłtǫ́ǫ́ where to find it.

1.  Open the **Settings** menu (Gear icon in the top right).
2.  Navigate to the **Integrations** tab.
3.  Locate the **Doctor (Free Law Project)** section.
4.  Toggle the switch to **Enabled**.
5.  Enter the **Endpoint URL**:
    *   If running locally: `http://localhost:5050`
    *   If running on a remote server: `https://your-server-ip:5050`
6.  **Auth Token**:
    *   If you configured an authentication token in your Doctor `docker-compose.yml` (recommended for public servers), enter it here.
    *   If running strictly locally without auth, leave blank.

## 3. Usage

Once enabled, the integration is seamless:

1.  Go to the **Analysis** tab in Dziłtǫ́ǫ́.
2.  Click **Upload Artifact**.
3.  Select a file (PDF, DOCX, RTF, etc.).
4.  The system will automatically attempt to send the file to your local Doctor instance.
    *   **Success**: You will see a green "Doctor Active" badge, and the high-quality extracted text will appear in the editor.
    *   **Failure**: If the connection fails (e.g., Docker is down), the system will silently fall back to the browser-based PDF extractor.

## Troubleshooting

*   **CORS Errors**: If you are running Dziłtǫ́ǫ́ in a browser and Doctor on `localhost`, you might encounter Cross-Origin Resource Sharing (CORS) issues. Ensure your Doctor instance is configured to allow requests from your Dziłtǫ́ǫ́ origin, or use a browser extension to bypass CORS for local development testing.
*   **"Failed to fetch"**: Ensure Docker is running and port 5050 is not blocked by a firewall.
