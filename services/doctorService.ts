
export const DoctorService = {
    /**
     * Parse a document using a running Doctor instance.
     * @param file The file object to upload
     * @param endpoint The root URL of the Doctor service (e.g. http://localhost:5050)
     * @param token Optional auth token
     */
    extractDocument: async (file: File, endpoint: string, token?: string): Promise<any> => {
        if (!endpoint) throw new Error("Doctor Endpoint URL required.");

        const formData = new FormData();
        formData.append('file', file);

        // Typical Doctor endpoint for extraction might vary based on setup
        // Assuming standard endpoint structure based on typical document microservices
        const url = `${endpoint.replace(/\/$/, '')}/extract/`;

        const headers: Record<string, string> = {};
        if (token) {
            headers['Authorization'] = `Token ${token}`;
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Doctor Service Error: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Doctor Extraction Failed:", error);
            throw error;
        }
    },

    /**
     * Check health of Doctor service
     */
    checkHealth: async (endpoint: string): Promise<boolean> => {
        try {
            const response = await fetch(`${endpoint.replace(/\/$/, '')}/`, { method: 'GET' });
            return response.ok;
        } catch (e) {
            return false;
        }
    }
};
