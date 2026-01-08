
import { CaseState, StoredDocument, Note } from '../types';

/**
 * Service to interact with the File System Access API.
 * This allows the app to Read/Write directly to a user-selected folder on their desktop.
 */

// Types for the File System Access API (Polyfill for TypeScript)
interface FileSystemHandle {
    kind: 'file' | 'directory';
    name: string;
    isSameEntry(other: FileSystemHandle): Promise<boolean>;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
    values(): AsyncIterable<FileSystemHandle>;
}

interface FileSystemFileHandle extends FileSystemHandle {
    createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
    getFile(): Promise<File>;
}

interface FileSystemWritableFileStream extends WritableStream {
    write(data: any): Promise<void>;
    seek(position: number): Promise<void>;
    truncate(size: number): Promise<void>;
    close(): Promise<void>;
}

export const FileSystemService = {
    
    isSupported: (): boolean => {
        return 'showDirectoryPicker' in window;
    },

    /**
     * Prompts the user to select a directory on their local machine.
     * Returns the directory handle.
     */
    selectDirectory: async (): Promise<FileSystemDirectoryHandle | null> => {
        try {
            // @ts-ignore - Window type extension
            const handle = await window.showDirectoryPicker({
                mode: 'readwrite'
            });
            return handle;
        } catch (e) {
            console.error("User cancelled or failed to pick directory", e);
            return null;
        }
    },

    /**
     * Verifies we still have permission to access the handle (e.g. after reload).
     */
    verifyPermission: async (handle: FileSystemDirectoryHandle, readWrite = true): Promise<boolean> => {
        const options: any = {};
        if (readWrite) {
            options.mode = 'readwrite';
        }
        // @ts-ignore
        if ((await handle.queryPermission(options)) === 'granted') {
            return true;
        }
        // @ts-ignore
        if ((await handle.requestPermission(options)) === 'granted') {
            return true;
        }
        return false;
    },

    /**
     * Saves the entire case structure to the local folder.
     * Creates:
     * - /Metadata.json
     * - /Documents/[doc_name].txt
     * - /Notes/[note_title].txt
     */
    syncCaseToLocal: async (caseData: CaseState, dirHandle: FileSystemDirectoryHandle): Promise<void> => {
        if (!dirHandle) throw new Error("No directory handle provided");

        // 1. Save Metadata
        const metadata = {
            id: caseData.id,
            name: caseData.name,
            meta: caseData.caseMeta,
            events: caseData.events,
            lastSynced: new Date().toISOString()
        };
        await writeFile(dirHandle, 'case_metadata.json', JSON.stringify(metadata, null, 2));

        // 2. Save Documents Folder
        const docsDir = await dirHandle.getDirectoryHandle('Documents', { create: true });
        for (const doc of caseData.documents) {
            // Sanitize filename
            const safeName = doc.name.replace(/[^a-z0-9.]/gi, '_');
            const content = `[Type: ${doc.type}] [Side: ${doc.side}]\n\n${doc.content}`;
            await writeFile(docsDir, `${safeName}.txt`, content);
        }

        // 3. Save Notes Folder
        const notesDir = await dirHandle.getDirectoryHandle('Notes', { create: true });
        for (const note of caseData.notes) {
            const safeTitle = note.title.replace(/[^a-z0-9]/gi, '_');
            const content = `Created: ${note.createdAt}\nUpdated: ${note.updatedAt}\n\n${note.content}`;
            await writeFile(notesDir, `${safeTitle}.txt`, content);
        }
        
        // 4. Save Active Analysis Report
        if (caseData.report) {
             const reportDir = await dirHandle.getDirectoryHandle('Reports', { create: true });
             const filename = `Analysis_${new Date().toISOString().split('T')[0]}.json`;
             await writeFile(reportDir, filename, JSON.stringify(caseData.report.igtxDocument, null, 2));
        }
    },

    /**
     * Helper for the chatbot to see file listing
     */
    listFiles: async (dirHandle: FileSystemDirectoryHandle): Promise<string[]> => {
        const files: string[] = [];
        // @ts-ignore
        for await (const entry of dirHandle.values()) {
            files.push(entry.kind === 'directory' ? `[DIR] ${entry.name}` : entry.name);
        }
        return files;
    }
};

// Helper to write file content
async function writeFile(dirHandle: FileSystemDirectoryHandle, filename: string, content: string) {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
}
