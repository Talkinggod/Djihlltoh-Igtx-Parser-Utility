
import { CaseState, StoredDocument, Note, ExplorerItem } from '../types';
import { extractTextFromPdf } from './pdfExtractor';

// Types for the File System Access API
interface FileSystemHandle {
    kind: 'file' | 'directory';
    name: string;
    isSameEntry(other: FileSystemHandle): Promise<boolean>;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
    values(): AsyncIterable<FileSystemDirectoryHandle | FileSystemFileHandle>;
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

    selectDirectory: async (): Promise<FileSystemDirectoryHandle | null> => {
        try {
            // @ts-ignore
            const handle = await window.showDirectoryPicker({
                mode: 'readwrite'
            });
            return handle;
        } catch (e: any) {
            if (e.name === 'AbortError') return null;
            console.error("Directory picker error:", e);
            if (e.message && (e.message.includes('Cross origin sub frames') || e.message.includes('SecurityError'))) {
                alert("BROWSER SECURITY RESTRICTION: Open in New Tab to use Local Drive Sync.");
            } else {
                alert(`Failed to access local directory: ${e.message}`);
            }
            return null;
        }
    },

    verifyPermission: async (handle: FileSystemDirectoryHandle, readWrite = true): Promise<boolean> => {
        const options: any = {};
        if (readWrite) {
            options.mode = 'readwrite';
        }
        // @ts-ignore
        if ((await handle.queryPermission(options)) === 'granted') return true;
        // @ts-ignore
        if ((await handle.requestPermission(options)) === 'granted') return true;
        return false;
    },

    getDirectoryContents: async (dirHandle: FileSystemDirectoryHandle): Promise<ExplorerItem[]> => {
        const items: ExplorerItem[] = [];
        // @ts-ignore
        for await (const entry of dirHandle.values()) {
            items.push({
                id: entry.name,
                name: entry.name,
                kind: entry.kind,
                handle: entry
            });
        }
        return items.sort((a, b) => {
            if (a.kind === b.kind) return a.name.localeCompare(b.name);
            return a.kind === 'directory' ? -1 : 1;
        });
    },

    /**
     * Physically creates the ProSePro / Dziłtǫ́ǫ́ standard litigation folder tree.
     */
    scaffoldCaseStructure: async (rootHandle: FileSystemDirectoryHandle, caseName: string) => {
        
        // Define deep structure
        const structure = {
            '00_Case_Overview': [
                { name: 'Chronology.md', content: '# Chronology\n\n' },
                { name: 'Party_List.md', content: '# Party List\n\n' },
                { name: 'Issues_Map.md', content: '# Issues Map\n\n' }
            ],
            '01_Pleadings': [
                { name: 'Complaint', type: 'dir' },
                { name: 'Answer', type: 'dir' },
                { name: 'Counterclaims', type: 'dir' },
                { name: 'Replies', type: 'dir' }
            ],
            '02_Discovery': [
                { 
                    name: 'Notices_to_Admit', 
                    type: 'dir', 
                    children: ['Fishman', 'Norris_McLaughlin', 'Management', 'Individual_Signatories']
                },
                { 
                    name: 'Interrogatories', 
                    type: 'dir',
                    children: ['Drafts', 'Served']
                },
                { name: 'Demands_to_Produce', type: 'dir' },
                { name: 'Accounting_Demands', type: 'dir' }
            ],
            '03_Motions': [
                { name: 'Motions_to_Compel', type: 'dir' },
                { name: 'Motions_to_Dismiss', type: 'dir' },
                { name: 'Supporting_Affidavits', type: 'dir' }
            ],
            '04_Administrative': [
                { 
                    name: 'HPD', 
                    type: 'dir',
                    children: ['Verification_Letters', 'FOIL_Requests', 'Responses']
                },
                { name: 'Inspector_General', type: 'dir' },
                { name: 'Other_Agencies', type: 'dir' }
            ],
            '05_Exhibits': [
                { name: 'Correspondence', type: 'dir' },
                { name: 'Agreements', type: 'dir' },
                { name: 'Email_Proof', type: 'dir' },
                { name: 'Accounting', type: 'dir' }
            ],
            '06_Court_Transcripts': [],
            '07_Orders_and_Judgments': []
        };

        // Recursive helper
        async function createNode(parentHandle: FileSystemDirectoryHandle, node: any) {
            if (typeof node === 'string') {
                // Simple folder string
                await parentHandle.getDirectoryHandle(node, { create: true });
            } else if (node.type === 'dir') {
                const dir = await parentHandle.getDirectoryHandle(node.name, { create: true });
                if (node.children) {
                    for (const child of node.children) {
                        await createNode(dir, child);
                    }
                }
            } else if (node.content) {
                // File
                const fileHandle = await parentHandle.getFileHandle(node.name, { create: true });
                const file = await fileHandle.getFile();
                if (file.size === 0) {
                    const writable = await fileHandle.createWritable();
                    await writable.write(node.content);
                    await writable.close();
                }
            }
        }

        for (const [folderName, items] of Object.entries(structure)) {
            const dirHandle = await rootHandle.getDirectoryHandle(folderName, { create: true });
            if (Array.isArray(items)) {
                for (const item of items) {
                    await createNode(dirHandle, item);
                }
            }
        }
    },

    syncCaseToLocal: async (caseData: CaseState, dirHandle: FileSystemDirectoryHandle): Promise<void> => {
        if (!dirHandle) throw new Error("No directory handle provided");

        // 1. Save Metadata (Root)
        const metadata = {
            id: caseData.id,
            name: caseData.name,
            meta: caseData.caseMeta,
            events: caseData.events,
            lastSynced: new Date().toISOString()
        };
        await writeFile(dirHandle, 'case_metadata.json', JSON.stringify(metadata, null, 2));

        // 2. Save Documents into Structured Folders
        for (const doc of caseData.documents) {
            // Determine Target Folder based on Category
            let targetDirName = '05_Exhibits'; // Default
            
            if (doc.category === 'pleading') targetDirName = '01_Pleadings';
            else if (doc.category === 'discovery') targetDirName = '02_Discovery';
            else if (doc.category === 'motion') targetDirName = '03_Motions';
            else if (doc.category === 'administrative') targetDirName = '04_Administrative';
            else if (doc.category === 'transcript') targetDirName = '06_Court_Transcripts';
            else if (doc.category === 'order') targetDirName = '07_Orders_and_Judgments';
            else if (doc.category === 'overview') targetDirName = '00_Case_Overview';

            // Get or Create the folder
            const targetDir = await dirHandle.getDirectoryHandle(targetDirName, { create: true });
            
            // Subfolder logic (if path provided in doc)
            let finalDir = targetDir;
            if (doc.folderPath) {
                // handle "Notices_to_Admit" inside "02_Discovery"
                const parts = doc.folderPath.split('/').filter(p => p !== targetDirName);
                for (const part of parts) {
                    finalDir = await finalDir.getDirectoryHandle(part, { create: true });
                }
            }

            const safeName = doc.name.replace(/[^a-z0-9.]/gi, '_');
            const content = `[Type: ${doc.type}] [Side: ${doc.side}]\n\n${doc.content}`;
            
            // Write (Text file for simplicity, in real app would write binary for PDF)
            // Ensure .txt extension if not present
            const fileName = safeName.endsWith('.txt') || safeName.endsWith('.pdf') ? safeName : `${safeName}.txt`;
            
            // If it's a PDF stored as text in our app, we save as .txt locally so user can read content
            // Real PDF binary sync requires Blob handling which we simulate here
            await writeFile(finalDir, fileName + (fileName.endsWith('.pdf') ? '.txt' : ''), content);
        }

        // 3. Save Notes (Into Overview or separate)
        const notesDir = await dirHandle.getDirectoryHandle('00_Case_Overview', { create: true });
        for (const note of caseData.notes) {
            const safeTitle = note.title.replace(/[^a-z0-9]/gi, '_');
            const content = `Created: ${note.createdAt}\nUpdated: ${note.updatedAt}\n\n${note.content}`;
            await writeFile(notesDir, `NOTE_${safeTitle}.txt`, content);
        }
    },

    importFilesFromDirectory: async (
        dirHandle: FileSystemDirectoryHandle, 
        existingDocs: StoredDocument[],
        onProgress?: (msg: string) => void
    ): Promise<StoredDocument[]> => {
        const newDocs: StoredDocument[] = [];
        
        async function traverse(handle: FileSystemDirectoryHandle | FileSystemFileHandle, path: string) {
            if (handle.kind === 'file') {
                const fileHandle = handle as FileSystemFileHandle;
                if (fileHandle.name.startsWith('.') || fileHandle.name === 'case_metadata.json') return;
                
                // Avoid dupes
                if (existingDocs.some(d => d.name === fileHandle.name) || newDocs.some(d => d.name === fileHandle.name)) {
                    return;
                }

                const file = await fileHandle.getFile();
                const type = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'text/plain');
                
                if (type.includes('pdf') || type.includes('text') || file.name.endsWith('.md') || type.includes('image')) {
                    if (onProgress) onProgress(`Importing ${file.name}...`);
                    
                    let content = "";
                    if (type.includes('pdf')) {
                        try {
                            const res = await extractTextFromPdf(file);
                            content = res.text;
                        } catch (e) { content = `[Error extracting PDF]`; }
                    } else if (type.includes('image')) {
                         content = `[Image File: ${file.name}]`;
                    } else {
                        content = await file.text();
                    }

                    // Infer Category from Path
                    let category: any = 'other';
                    if (path.includes('01_Pleadings')) category = 'pleading';
                    else if (path.includes('02_Discovery')) category = 'discovery';
                    else if (path.includes('03_Motions')) category = 'motion';
                    else if (path.includes('04_Administrative')) category = 'administrative';
                    else if (path.includes('05_Exhibits')) category = 'exhibit';
                    else if (path.includes('06_Court_Transcripts')) category = 'transcript';
                    else if (path.includes('07_Orders')) category = 'order';

                    newDocs.push({
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                        name: file.name,
                        type: type,
                        content: content,
                        side: 'neutral',
                        dateAdded: new Date().toISOString(),
                        category: category,
                        folderPath: path // Store the relative path
                    });
                }
            } else if (handle.kind === 'directory') {
                const dir = handle as FileSystemDirectoryHandle;
                // @ts-ignore
                for await (const entry of dir.values()) {
                    await traverse(entry, path ? `${path}/${entry.name}` : entry.name);
                }
            }
        }

        await traverse(dirHandle, '');
        return newDocs;
    },

    listFiles: async (dirHandle: FileSystemDirectoryHandle): Promise<string[]> => {
        const files: string[] = [];
        // @ts-ignore
        for await (const entry of dirHandle.values()) {
            files.push(entry.kind === 'directory' ? `[DIR] ${entry.name}` : entry.name);
        }
        return files;
    }
};

async function writeFile(dirHandle: FileSystemDirectoryHandle, filename: string, content: string) {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
}
