
import { GoogleUser, ExplorerItem } from "../types";

/**
 * Service to handle Google Identity Services (OAuth) and Google Picker API.
 * Allows importing files directly from Google Drive/Docs.
 */

// Define global types for Google APIs
declare global {
    interface Window {
        google: any;
        gapi: any;
    }
}

export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    content?: string;
}

export const GoogleDriveService = {
    
    isLoaded: () => {
        return !!window.google && !!window.gapi;
    },

    /**
     * Initialize the Token Client and GAPI Client.
     * Must be called after the scripts are loaded.
     */
    init: async (clientId: string, apiKey: string) => {
        if (!window.gapi) {
            throw new Error("Google API script not loaded.");
        }

        return new Promise<void>((resolve, reject) => {
            window.gapi.load('picker', () => {
                if(window.google) resolve();
                else reject("Google Identity Services script not loaded.");
            });
        });
    },

    /**
     * Trigger the Login Flow.
     * Returns the access token and simple user profile if available.
     */
    signIn: (clientId: string): Promise<GoogleUser> => {
        return new Promise((resolve, reject) => {
            if (!window.google) return reject("Google scripts not loaded");

            const client = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file',
                callback: (tokenResponse: any) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        // Fetch user info using the token
                        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                            headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
                        })
                        .then(res => res.json())
                        .then(userInfo => {
                            resolve({
                                name: userInfo.name,
                                email: userInfo.email,
                                picture: userInfo.picture,
                                accessToken: tokenResponse.access_token
                            });
                        })
                        .catch(() => {
                            // Fallback if userinfo fails
                            resolve({
                                name: 'Google User',
                                email: 'unknown',
                                picture: '',
                                accessToken: tokenResponse.access_token
                            });
                        });
                    } else {
                        reject("Failed to obtain access token");
                    }
                },
            });

            client.requestAccessToken();
        });
    },

    /**
     * List folder contents for the File Explorer
     */
    listFolderContents: async (folderId: string = 'root', accessToken: string): Promise<ExplorerItem[]> => {
        const q = `'${folderId}' in parents and trashed = false`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,modifiedTime)&pageSize=100&orderBy=folder,name`;
        
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) throw new Error("Failed to fetch folder contents");
        const data = await response.json();
        
        return data.files.map((f: any) => ({
            id: f.id,
            name: f.name,
            kind: f.mimeType === 'application/vnd.google-apps.folder' ? 'directory' : 'file',
            mimeType: f.mimeType,
            size: f.size,
            modified: f.modifiedTime
        }));
    },

    /**
     * Open the Google Drive Picker for Documents/PDFs.
     */
    openPicker: (accessToken: string, apiKey: string): Promise<DriveFile> => {
        return new Promise((resolve, reject) => {
            if (!window.google || !window.google.picker) {
                return reject("Google Picker API not loaded");
            }

            const view = new window.google.picker.View(window.google.picker.ViewId.DOCS);
            view.setMimeTypes("application/vnd.google-apps.document,application/pdf,text/plain,application/vnd.google-apps.spreadsheet");

            const picker = new window.google.picker.PickerBuilder()
                .addView(view)
                .setOAuthToken(accessToken)
                .setDeveloperKey(apiKey)
                .setCallback(async (data: any) => {
                    if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
                        const doc = data[window.google.picker.Response.DOCUMENTS][0];
                        resolve({
                            id: doc.id,
                            name: doc.name,
                            mimeType: doc.mimeType
                        });
                    } else if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.CANCEL) {
                        reject("Picker cancelled");
                    }
                })
                .build();
            
            picker.setVisible(true);
        });
    },

    /**
     * Open Picker specifically for Folders to set scope.
     */
    pickFolder: (accessToken: string, apiKey: string): Promise<{ id: string, name: string }> => {
        return new Promise((resolve, reject) => {
            if (!window.google || !window.google.picker) {
                return reject("Google Picker API not loaded");
            }

            // ViewId.FOLDERS lets you select folders
            const view = new window.google.picker.View(window.google.picker.ViewId.FOLDERS);
            view.setSelectFolderEnabled(true);

            const picker = new window.google.picker.PickerBuilder()
                .addView(view)
                .setOAuthToken(accessToken)
                .setDeveloperKey(apiKey)
                .setTitle("Select Sync Folder")
                .setCallback(async (data: any) => {
                    if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.PICKED) {
                        const doc = data[window.google.picker.Response.DOCUMENTS][0];
                        resolve({
                            id: doc.id,
                            name: doc.name
                        });
                    } else if (data[window.google.picker.Response.ACTION] === window.google.picker.Action.CANCEL) {
                        reject("Picker cancelled");
                    }
                })
                .build();
            
            picker.setVisible(true);
        });
    },

    /**
     * Download or Export file content as text.
     */
    downloadFile: async (fileId: string, mimeType: string, accessToken: string): Promise<string> => {
        let url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        
        // Handle Google Docs/Sheets conversion
        if (mimeType.includes('google-apps.document')) {
            url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
        } else if (mimeType.includes('google-apps.spreadsheet')) {
            url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
        }

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) {
            throw new Error(`Failed to download file: ${response.statusText}`);
        }

        return await response.text();
    },

    /**
     * Download file content as Blob (for images, PDFs).
     */
    downloadFileBlob: async (fileId: string, mimeType: string, accessToken: string): Promise<Blob> => {
        let url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        
        // Convert Google Docs to PDF for blob download if needed
        if (mimeType.includes('google-apps.document')) {
            url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
        } else if (mimeType.includes('google-apps.spreadsheet')) {
            url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
        }

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) {
            throw new Error(`Failed to download file blob: ${response.statusText}`);
        }

        return await response.blob();
    },

    /**
     * List files from Drive for the AI Agent.
     * Supports optional parent folder ID for "Intent Tunnel" scoping.
     */
    listFiles: async (query: string, accessToken: string, parentFolderId?: string): Promise<string> => {
        // Construct query
        let q = `name contains '${query}' and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'text/plain' or mimeType = 'application/pdf') and trashed = false`;
        
        // Apply Scope Protocol
        if (parentFolderId) {
            q += ` and '${parentFolderId}' in parents`;
        }
        
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&pageSize=15`;
        
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) throw new Error("Failed to search Drive");
        
        const data = await response.json();
        return JSON.stringify(data.files);
    }
};
