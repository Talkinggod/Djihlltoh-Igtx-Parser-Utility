
import { CalibrationEntry } from '../types';

const CALIBRATION_TABLE: Record<string, CalibrationEntry> = {
    'legal_statute': {
        domain: 'Statutory Law',
        λ_baseline: [0.0, 0.01], // Persistent structure
        κ_threshold: 0.05
    },
    'legal_pleading': {
        domain: 'Legal Advocacy',
        λ_baseline: [0.01, 0.04],
        κ_threshold: 0.12
    },
    'scientific_review': {
        domain: 'Scientific Peer Review',
        λ_baseline: [0.03, 0.07],
        κ_threshold: 0.15
    },
    'narrative': {
        domain: 'Narrative/Prose',
        λ_baseline: [0.06, 0.15], // Higher decay as narrative evolves
        κ_threshold: 0.25
    },
    'generic': {
        domain: 'Generic Language Object',
        λ_baseline: [0.02, 0.10],
        κ_threshold: 0.20
    }
};

export const CalibrationService = {
    getBaseline: (id: string): CalibrationEntry => {
        return CALIBRATION_TABLE[id] || CALIBRATION_TABLE['generic'];
    },

    checkAdmissibility: (measured_λ: number, domainId: string): { 
        status: 'calibrated' | 'drift' | 'outlier';
        isOk: boolean;
    } => {
        const baseline = CalibrationService.getBaseline(domainId);
        const [min, max] = baseline.λ_baseline;

        if (measured_λ >= min && measured_λ <= max) return { status: 'calibrated', isOk: true };
        if (measured_λ > max) return { status: 'drift', isOk: false };
        return { status: 'outlier', isOk: false };
    }
};
