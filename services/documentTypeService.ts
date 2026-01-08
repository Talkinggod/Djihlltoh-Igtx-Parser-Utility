
import { DocumentTypeDefinition } from '../types';

const STORAGE_KEY = 'dziltoo_custom_doc_types';

const DEFAULT_DEFINITIONS: DocumentTypeDefinition[] = [
    {
        id: 'complaint_civil',
        name: 'Complaint (Civil)',
        category: 'pleading',
        description: 'Initiating document for a civil lawsuit.',
        actions: [
            { id: 'serve_defendant', label: 'Serve Defendant', type: 'service', priority: 'critical', description: 'Must serve within 120 days of filing.' },
            { id: 'request_rji', label: 'File RJI', type: 'filing', priority: 'medium', description: 'Request for Judicial Intervention needed for judge assignment.' }
        ],
        deadlines: [
            { label: 'Service of Process', trigger: 'Filing Date', duration: 120, isJurisdictional: true },
            { label: 'Answer Deadline', trigger: 'Date of Service', duration: 30, isJurisdictional: true }
        ],
        relatedMotions: ['motion_to_dismiss', 'answer'],
        strategies: [
            { scenario: 'Failure to Serve', recommendation: 'File Motion to Extend Time for Service immediately.' }
        ],
        requiredSections: ['Caption', 'Parties', 'Jurisdiction', 'Causes of Action', 'Wherefore Clause']
    },
    {
        id: 'motion_to_dismiss',
        name: 'Motion to Dismiss (CPLR 3211)',
        category: 'motion',
        description: 'Pre-answer motion seeking dismissal based on documentary evidence or failure to state a cause of action.',
        actions: [
            { id: 'check_return_date', label: 'Confirm Return Date', type: 'internal', priority: 'high' },
            { id: 'file_affidavit_service', label: 'File Affidavit of Service', type: 'filing', priority: 'critical' }
        ],
        deadlines: [
            { label: 'Opposition Papers', trigger: 'Return Date', duration: -7, isJurisdictional: false }, // Negative means prior
            { label: 'Reply Papers', trigger: 'Return Date', duration: -1, isJurisdictional: false }
        ],
        relatedMotions: ['cross_motion', 'opposition'],
        strategies: [
            { scenario: 'Documentary Evidence', recommendation: 'Attach all contracts and emails as Exhibits. Ensure Affidavit authenticates them.' }
        ],
        requiredSections: ['Notice of Motion', 'Affidavit in Support', 'Memorandum of Law']
    },
    {
        id: 'answer_verified',
        name: 'Verified Answer',
        category: 'pleading',
        description: 'Responsive pleading addressing allegations in the Complaint.',
        actions: [
            { id: 'assert_affirmative_defenses', label: 'Assert Affirmative Defenses', type: 'internal', priority: 'critical', description: 'Defenses like Statute of Limitations must be raised or waived.' },
            { id: 'counterclaims', label: 'File Counterclaims', type: 'filing', priority: 'medium' }
        ],
        deadlines: [],
        relatedMotions: ['motion_for_summary_judgment'],
        strategies: [],
        requiredSections: ['Responses to Paragraphs', 'Affirmative Defenses', 'Verification']
    },
    {
        id: 'lease_agreement',
        name: 'Lease Agreement',
        category: 'contract',
        description: 'Real property rental contract.',
        actions: [
            { id: 'review_riders', label: 'Review Riders', type: 'internal', priority: 'high' }
        ],
        deadlines: [],
        relatedMotions: [],
        strategies: [
            { scenario: 'Non-Payment', recommendation: 'Verify default notice provisions.' }
        ],
        requiredSections: ['Parties', 'Demised Premises', 'Rent Schedule', 'Signature Page']
    }
];

export const DocumentTypeService = {
    getAll: (): DocumentTypeDefinition[] => {
        let custom: DocumentTypeDefinition[] = [];
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                custom = JSON.parse(stored);
            }
        } catch (e) {
            console.error("Failed to load custom doc types", e);
        }
        return [...DEFAULT_DEFINITIONS, ...custom];
    },

    getById: (id: string): DocumentTypeDefinition | undefined => {
        const all = DocumentTypeService.getAll();
        return all.find(d => d.id === id);
    },

    addCustomType: (def: DocumentTypeDefinition): void => {
        try {
            const current = DocumentTypeService.getAll();
            const customs = current.filter(d => d.isUserDefined);
            customs.push({ ...def, isUserDefined: true });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(customs));
        } catch (e) {
            console.error("Failed to save custom doc type", e);
        }
    },

    // Simple heuristic to guess type from filename or raw text snippet
    detectType: (text: string): string | undefined => {
        const lower = text.toLowerCase().slice(0, 2000); // Check header
        if (lower.includes('complaint') && lower.includes('plaintiff')) return 'complaint_civil';
        if (lower.includes('motion to dismiss') || lower.includes('cplr 3211')) return 'motion_to_dismiss';
        if (lower.includes('answer') && lower.includes('verified')) return 'answer_verified';
        if (lower.includes('lease') && lower.includes('agreement')) return 'lease_agreement';
        return undefined;
    }
};
