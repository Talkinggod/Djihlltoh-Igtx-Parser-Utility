
/**
 * Layer Separation Validator
 * 
 * Implements Protocol 10.8: Automated Validation Suite
 * Verifies that λ_measured is independent of λ_control and observer expectations.
 * 
 * @module layer_separation_validator
 * @version 1.0.0
 * @since 2026-01-20
 */

// ============================================================================
// STATISTICAL HELPERS
// ============================================================================

const mean = (data: number[]): number => {
    if (data.length === 0) return 0;
    return data.reduce((a, b) => a + b, 0) / data.length;
};

const std = (data: number[]): number => {
    if (data.length < 2) return 0;
    const m = mean(data);
    return Math.sqrt(data.reduce((sq, n) => sq + Math.pow(n - m, 2), 0) / (data.length - 1));
};

const correlation = (x: number[], y: number[]): number => {
    if (x.length !== y.length || x.length === 0) return 0;
    const mx = mean(x);
    const my = mean(y);
    let num = 0;
    let den1 = 0;
    let den2 = 0;
    
    for (let i = 0; i < x.length; i++) {
        const dx = x[i] - mx;
        const dy = y[i] - my;
        num += dx * dy;
        den1 += dx * dx;
        den2 += dy * dy;
    }
    
    if (den1 === 0 || den2 === 0) return 0;
    return num / Math.sqrt(den1 * den2);
};

const spearmanRank = (x: number[], y: number[]): number => {
    const rank = (data: number[]) => {
        const sorted = data.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
        const ranks = new Array(data.length);
        for (let i = 0; i < sorted.length; i++) {
            // Handle ties if strict accuracy needed, but simple rank sufficient for this test
            ranks[sorted[i].i] = i + 1;
        }
        return ranks;
    };
    return correlation(rank(x), rank(y));
};

// ============================================================================
// VALIDATOR CLASS
// ============================================================================

export interface IndependenceResult {
    passed: boolean;
    correlation: number;
    meanDifference: number;
}

export interface StabilityResult {
    passed: boolean;
    virginMean: number;
    transformedMean: number;
    zScore: number;
}

export interface CrossModelResult {
    passed: boolean;
    meanRankCorrelation: number;
    minRankCorrelation: number;
}

export class LayerSeparationValidator {
    /**
     * @param measureEngine Function that computes lambda given a text. Optional context can be passed (e.g. for Aware mode).
     * @param transformEngine Function that applies transformation T_lambda to text.
     */
    constructor(
        private measureEngine: (text: string, context?: any) => Promise<number>,
        private transformEngine: (text: string, lambdaControl: number) => Promise<string>
    ) {}

    /**
     * Protocol 1: Blind Measurement Validation
     * Checks if knowing lambda_control influences lambda_measured.
     */
    async validateIndependence(corpus: string[], lambdaValues: number[]): Promise<IndependenceResult> {
        const resultsBlind: number[] = [];
        const resultsAware: number[] = [];

        for (const text of corpus) {
            for (const lambdaControl of lambdaValues) {
                const transformed = await this.transformEngine(text, lambdaControl);

                // Blind measurement (no metadata)
                const lambdaBlind = await this.measureEngine(transformed);

                // Aware measurement (with lambda_control context)
                const lambdaAware = await this.measureEngine(transformed, { lambdaControl });

                resultsBlind.push(lambdaBlind);
                resultsAware.push(lambdaAware);
            }
        }

        const corr = correlation(resultsBlind, resultsAware);
        
        let sumDiff = 0;
        for (let i = 0; i < resultsBlind.length; i++) {
            sumDiff += Math.abs(resultsBlind[i] - resultsAware[i]);
        }
        const meanDiff = sumDiff / resultsBlind.length;

        // Pass if highly correlated (>0.99) and negligible difference (<0.001)
        const passed = corr > 0.99 && meanDiff < 0.001;

        return {
            passed,
            correlation: corr,
            meanDifference: meanDiff
        };
    }

    /**
     * Protocol 2: Baseline Stability
     * Checks if lambda measurement shifts significantly when run on transformed data vs virgin data
     * (specifically checking statistical consistency).
     */
    async validateBaselineStability(virginCorpus: string[], transformedCorpus: string[]): Promise<StabilityResult> {
        // Measure virgin corpus
        const lambdaVirgin: number[] = [];
        for (const text of virginCorpus) {
            lambdaVirgin.push(await this.measureEngine(text));
        }

        // Measure transformed corpus
        const lambdaTransformed: number[] = [];
        for (const text of transformedCorpus) {
            lambdaTransformed.push(await this.measureEngine(text));
        }

        const muV = mean(lambdaVirgin);
        const sigmaV = std(lambdaVirgin);
        
        const muT = mean(lambdaTransformed);
        
        // Z-test for means: (mu_transformed - mu_virgin) / standard_error
        const standardError = sigmaV / Math.sqrt(virginCorpus.length);
        const zScore = standardError === 0 ? 0 : (muT - muV) / standardError;

        // Pass if within 2 sigma (95% CI)
        const passed = Math.abs(zScore) < 2.0;

        return {
            passed,
            virginMean: muV,
            transformedMean: muT,
            zScore
        };
    }

    /**
     * Protocol 3: Cross-Model Invariance
     * Verifies that rank ordering of lambda is preserved across different embedding models.
     * Note: This requires the measureEngine to support switching models via context or a separate provider.
     */
    async validateCrossModel(
        texts: string[], 
        models: string[], 
        measureWithModel: (text: string, model: string) => Promise<number>
    ): Promise<CrossModelResult> {
        const results: Record<string, number[]> = {};
        
        // Initialize arrays
        for (const model of models) {
            results[model] = [];
        }

        // Measure all texts with all models
        for (const text of texts) {
            for (const model of models) {
                const lambda = await measureWithModel(text, model);
                results[model].push(lambda);
            }
        }

        // Compute pairwise rank correlations
        const correlations: number[] = [];
        for (let i = 0; i < models.length; i++) {
            for (let j = i + 1; j < models.length; j++) {
                const m1 = models[i];
                const m2 = models[j];
                const rho = spearmanRank(results[m1], results[m2]);
                correlations.push(rho);
            }
        }

        const meanRho = mean(correlations);
        const minRho = Math.min(...correlations);

        // Pass if average rank correlation is high (>0.90)
        const passed = meanRho > 0.90;

        return {
            passed,
            meanRankCorrelation: meanRho,
            minRankCorrelation: minRho
        };
    }
}
