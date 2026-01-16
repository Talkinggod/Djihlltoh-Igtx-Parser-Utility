
export interface CitationResult {
    cites: string[];
    scdb_id?: string;
    description?: string;
}

export const CourtListenerService = {
    lookupCitation: async (citation: string, token: string): Promise<any> => {
        if (!token) throw new Error("Court Listener API Token required.");
        
        // Using the Citation Lookup endpoint structure
        const url = `https://www.courtlistener.com/api/rest/v3/citations/?q=${encodeURIComponent(citation)}`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Token ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Court Listener API Error: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Court Listener Lookup Failed:", error);
            throw error;
        }
    },

    searchOpinions: async (query: string, token: string): Promise<any> => {
        if (!token) throw new Error("Court Listener API Token required.");
        
        const url = `https://www.courtlistener.com/api/rest/v3/search/?q=${encodeURIComponent(query)}`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Token ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Court Listener API Error: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Court Listener Search Failed:", error);
            throw error;
        }
    }
};
