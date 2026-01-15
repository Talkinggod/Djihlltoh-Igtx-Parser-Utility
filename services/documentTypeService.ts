
import { DocumentTypeDefinition } from '../types';

const STORAGE_KEY = 'dziltoo_custom_doc_types';

const DEFAULT_DEFINITIONS: DocumentTypeDefinition[] = [
    // --- A. PLEADINGS (01_Pleadings) ---
    {
        id: 'complaint_civil',
        name: 'Complaint (Civil)',
        category: 'pleading',
        description: 'Initiating document framing the case.',
        actions: [
            { id: 'serve_defendant', label: 'Serve Defendant', type: 'service', priority: 'critical', description: 'Must serve within 120 days (FRCP 4m) or 120 days (CPLR 306-b).' },
            { id: 'request_rji', label: 'File RJI (NY State)', type: 'filing', priority: 'medium', description: 'Request for Judicial Intervention needed for judge assignment in NY Supreme.' }
        ],
        deadlines: [
            { label: 'Service of Process', trigger: 'Filing Date', duration: 120, isJurisdictional: true },
            { label: 'Answer Deadline', trigger: 'Date of Service', duration: 20, isJurisdictional: true }
        ],
        relatedMotions: ['motion_to_dismiss', 'answer'],
        strategies: [
            { scenario: 'Failure to Serve', recommendation: 'File Motion to Extend Time for Service immediately.' }
        ],
        requiredSections: ['Caption', 'Parties', 'Jurisdiction', 'Causes of Action', 'Wherefore Clause']
    },
    {
        id: 'answer_verified',
        name: 'Answer (Verified)',
        category: 'pleading',
        description: 'Responsive pleading addressing allegations. Must verify if Complaint is verified (CPLR 3020).',
        actions: [
            { id: 'assert_affirmative_defenses', label: 'Assert Affirmative Defenses', type: 'internal', priority: 'critical', description: 'Statute of Limitations, Laches, etc. must be raised here.' },
            { id: 'counterclaims', label: 'File Counterclaims', type: 'filing', priority: 'medium' }
        ],
        deadlines: [],
        relatedMotions: ['motion_for_summary_judgment'],
        strategies: [],
        requiredSections: ['Responses to Paragraphs', 'Affirmative Defenses', 'Verification']
    },
    {
        id: 'reply_to_counterclaim',
        name: 'Reply to Counterclaim',
        category: 'pleading',
        description: 'Plaintiff response to Defendant counterclaims.',
        actions: [
            { id: 'file_reply', label: 'File Reply', type: 'filing', priority: 'high' }
        ],
        deadlines: [{ label: 'Reply Deadline', trigger: 'Service of Answer', duration: 20, isJurisdictional: true }],
        relatedMotions: [],
        strategies: [],
        requiredSections: ['Responses']
    },

    // --- B. DISCOVERY DEVICES (02_Discovery) ---
    {
        id: 'notice_to_admit',
        name: 'Notice to Admit (CPLR 3123 / FRCP 36)',
        category: 'discovery',
        description: 'Binary fact-locking tool. Requires Admit/Deny response. Silence = Admission.',
        actions: [
            { id: 'serve_notice', label: 'Serve on Opposing Counsel', type: 'service', priority: 'high' },
            { id: 'track_deadline', label: 'Track 20-Day Window', type: 'internal', priority: 'critical' }
        ],
        deadlines: [
            { label: 'Response Required', trigger: 'Service Date', duration: 20, isJurisdictional: true }
        ],
        relatedMotions: ['motion_for_summary_judgment'],
        strategies: [
            { scenario: 'Authentication', recommendation: 'Use to authenticate exhibits (emails, contracts) to avoid hearsay issues at trial.' }
        ],
        requiredSections: ['Specific Requests']
    },
    {
        id: 'interrogatories',
        name: 'Interrogatories (CPLR 3130 / FRCP 33)',
        category: 'discovery',
        description: 'Written questions requiring narrative answers under oath.',
        actions: [
            { id: 'verify_responses', label: 'Verify Responses', type: 'internal', priority: 'high' }
        ],
        deadlines: [
            { label: 'Response Deadline', trigger: 'Service Date', duration: 30, isJurisdictional: false } // 30 days Fed/NY usually
        ],
        relatedMotions: ['motion_to_compel'],
        strategies: [
            { scenario: 'Identify Witnesses', recommendation: 'Ask for names/addresses of all persons with knowledge.' }
        ],
        requiredSections: ['Definitions', 'Instructions', 'Interrogatories']
    },
    {
        id: 'demand_to_produce',
        name: 'Demand to Produce (CPLR 3120) / RFP (FRCP 34)',
        category: 'discovery',
        description: 'Request for production of documents, ESI, or things.',
        actions: [
            { id: 'produce_log', label: 'Create Privilege Log', type: 'internal', priority: 'medium' }
        ],
        deadlines: [
            { label: 'Response Deadline', trigger: 'Service Date', duration: 20, isJurisdictional: false } // 20 days CPLR, 30 days FRCP
        ],
        relatedMotions: ['motion_to_compel', 'motion_for_protective_order'],
        strategies: [],
        requiredSections: ['Definitions', 'Document Requests']
    },
    {
        id: 'subpoena',
        name: 'Subpoena (Ad Testificandum / Duces Tecum)',
        category: 'discovery',
        description: 'Order for non-party to appear or produce documents.',
        actions: [
            { id: 'serve_subpoena', label: 'Personal Service', type: 'service', priority: 'critical' },
            { id: 'pay_witness_fee', label: 'Tender Witness Fee', type: 'internal', priority: 'critical' }
        ],
        deadlines: [],
        relatedMotions: ['motion_to_quash', 'motion_for_contempt'],
        strategies: [],
        requiredSections: ['Caption', 'Command to Appear', 'Items to Produce']
    },
    {
        id: 'accounting_demand',
        name: 'Verified Accounting Demand',
        category: 'discovery',
        description: 'Hybrid discovery/equitable demand for financial breakdown.',
        actions: [],
        deadlines: [],
        relatedMotions: ['motion_to_compel_accounting'],
        strategies: [],
        requiredSections: ['Fiscal Years', 'Line Items']
    },

    // --- C. MOTIONS (03_Motions) ---
    {
        id: 'motion_to_dismiss',
        name: 'Motion to Dismiss (CPLR 3211 / FRCP 12b)',
        category: 'motion',
        description: 'Pre-answer motion seeking dismissal based on documentary evidence or failure to state a cause of action.',
        actions: [
            { id: 'check_return_date', label: 'Confirm Return Date', type: 'internal', priority: 'high' },
            { id: 'file_affidavit_service', label: 'File Affidavit of Service', type: 'filing', priority: 'critical' }
        ],
        deadlines: [
            { label: 'Opposition Papers', trigger: 'Return Date', duration: -7, isJurisdictional: false },
            { label: 'Reply Papers', trigger: 'Return Date', duration: -1, isJurisdictional: false }
        ],
        relatedMotions: ['cross_motion', 'opposition'],
        strategies: [
            { scenario: 'Documentary Evidence', recommendation: 'Attach all contracts and emails as Exhibits. Ensure Affidavit authenticates them.' }
        ],
        requiredSections: ['Notice of Motion', 'Affidavit in Support', 'Memorandum of Law']
    },
    {
        id: 'motion_to_compel',
        name: 'Motion to Compel (CPLR 3124 / FRCP 37)',
        category: 'motion',
        description: 'Motion to enforce discovery compliance.',
        actions: [
            { id: 'good_faith_affirmation', label: 'Good Faith Affirmation', type: 'filing', priority: 'critical', description: 'Must attest to conferring with opposing counsel before filing.' }
        ],
        deadlines: [],
        relatedMotions: ['motion_for_sanctions'],
        strategies: [],
        requiredSections: ['Notice of Motion', 'Good Faith Affirmation', 'Affidavit in Support']
    },
    {
        id: 'order_show_cause',
        name: 'Order to Show Cause (OSC)',
        category: 'motion',
        description: 'Accelerated motion, often with TRO, directing adversary to appear and show cause why relief should not be granted.',
        actions: [
            { id: 'submit_to_judge', label: 'Submit for Signature', type: 'filing', priority: 'critical' },
            { id: 'strict_service', label: 'Strict Service Compliance', type: 'service', priority: 'critical', description: 'Must serve exactly as ordered by the judge.' }
        ],
        deadlines: [
            { label: 'Service Deadline', trigger: 'Judge Signature', duration: 1, isJurisdictional: true }
        ],
        relatedMotions: ['tro'],
        strategies: [
            { scenario: 'Emergency', recommendation: 'Use for stays of eviction or immediate relief.' }
        ],
        requiredSections: ['Order Block', 'Stay Provision', 'Affidavit of Emergency']
    },
    {
        id: 'motion_summary_judgment',
        name: 'Motion for Summary Judgment (CPLR 3212 / FRCP 56)',
        category: 'motion',
        description: 'Request for judgment as a matter of law because no material facts are disputed.',
        actions: [
            { id: 'statement_material_facts', label: 'Statement of Material Facts', type: 'filing', priority: 'critical' }
        ],
        deadlines: [],
        relatedMotions: [],
        strategies: [
            { scenario: 'Admissions', recommendation: 'Cite unanswered Notices to Admit as established facts.' }
        ],
        requiredSections: ['Notice of Motion', 'Statement of Material Facts', 'Memorandum of Law']
    },

    // --- D. ADMINISTRATIVE (04_Administrative) ---
    {
        id: 'foil_request',
        name: 'FOIL / FOIA Request',
        category: 'administrative',
        description: 'Freedom of Information Law request to agency.',
        actions: [
            { id: 'appeal_denial', label: 'Appeal Denial', type: 'filing', priority: 'high', description: 'Must appeal within 30 days of constructive denial.' }
        ],
        deadlines: [
            { label: 'Agency Acknowledgment', trigger: 'Filing Date', duration: 5, isJurisdictional: false }
        ],
        relatedMotions: ['article_78'],
        strategies: [],
        requiredSections: ['Records Requested']
    },
    {
        id: 'hpd_complaint',
        name: 'HPD / Agency Complaint',
        category: 'administrative',
        description: 'Complaint to Housing Preservation & Development or similar agency.',
        actions: [],
        deadlines: [],
        relatedMotions: [],
        strategies: [],
        requiredSections: []
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

    detectType: (text: string): string | undefined => {
        const lower = text.toLowerCase().slice(0, 3000); 
        // Pleadings
        if (lower.includes('complaint') && lower.includes('plaintiff')) return 'complaint_civil';
        if (lower.includes('verified answer')) return 'answer_verified';
        // Motions
        if (lower.includes('show cause') || lower.includes('osc')) return 'order_show_cause';
        if (lower.includes('motion to dismiss') || lower.includes('cplr 3211')) return 'motion_to_dismiss';
        if (lower.includes('motion to compel') || lower.includes('cplr 3124')) return 'motion_to_compel';
        if (lower.includes('summary judgment') || lower.includes('cplr 3212')) return 'motion_summary_judgment';
        // Discovery
        if (lower.includes('notice to admit') || lower.includes('cplr 3123')) return 'notice_to_admit';
        if (lower.includes('interrogatories') || lower.includes('cplr 3130')) return 'interrogatories';
        if (lower.includes('demand for production') || lower.includes('inspection') || lower.includes('cplr 3120')) return 'demand_to_produce';
        if (lower.includes('subpoena')) return 'subpoena';
        // Admin
        if (lower.includes('foil') || lower.includes('freedom of information')) return 'foil_request';
        
        return undefined;
    }
};
