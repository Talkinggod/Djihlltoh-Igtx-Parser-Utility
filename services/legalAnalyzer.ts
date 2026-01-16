
import { isValid, differenceInDays, isAfter, addDays, isBefore, parseISO } from 'date-fns';
import { ExtractedDate, Violation, DocumentReference, Signature, LegalAnalysisResult, StoredDocument } from '../types';
import { extractLegalEntities } from './aiService';

// --- Intent Tunnel Adapter ---
/**
 * Bridges the gap between heuristic analysis and AI-powered "Intent Tunnel" extraction.
 * Uses the Intent Tunnel to find dates and references that regex might miss or misinterpret.
 */
export class IntentTunnelAdapter {
    async extract(text: string, apiKey: string): Promise<{ dates: ExtractedDate[], references: DocumentReference[] }> {
        if (!apiKey) return { dates: [], references: [] };

        const aiResult = await extractLegalEntities(text, apiKey);
        
        const dates: ExtractedDate[] = aiResult.dates.map((d: any) => ({
            date: new Date(d.date_normalized),
            text: d.text,
            context: d.context,
            type: d.type,
            location: { start: 0, end: 0 }, // AI doesn't return exact indices easily, fallback to 0
            source: 'ai'
        }));

        const references: DocumentReference[] = aiResult.references.map((r: any) => ({
            text: r.text,
            year: r.year,
            documentType: r.documentType,
            location: { start: 0, end: 0 },
            source: 'ai'
        }));

        return { dates, references };
    }
}

// --- Date Extractor ---
export class DateExtractor {
  private patterns = [
    // MM/DD/YYYY
    /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,
    // Month DD, YYYY
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/gi,
    // YYYY-MM-DD (ISO format)
    /\b(\d{4})-(\d{2})-(\d{2})\b/g,
  ];

  extract(text: string): ExtractedDate[] {
    const dates: ExtractedDate[] = [];
    
    for (const pattern of this.patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const dateStr = match[0];
        const parsedDate = this.parseDate(dateStr);
        
        if (parsedDate && isValid(parsedDate)) {
          // Increased context radius slightly to capture leading keywords
          const context = this.extractContext(text, match.index, 60); 
          const type = this.inferDateType(context);
          
          dates.push({
            date: parsedDate,
            text: dateStr,
            context,
            type,
            location: { start: match.index, end: match.index + dateStr.length },
            source: 'regex'
          });
        }
      }
    }
    
    return dates.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private parseDate(dateStr: string): Date | null {
    const d = new Date(dateStr);
    if (isValid(d)) return d;
    return null;
  }

  private extractContext(text: string, index: number, radius: number): string {
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + radius);
    return text.slice(start, end).replace(/\s+/g, ' ').trim();
  }

  private inferDateType(context: string): ExtractedDate['type'] {
    const lower = context.toLowerCase();
    
    // Jurat / Verification (Highest priority as it defines the document validity)
    if (
        lower.includes('jurat') || 
        lower.includes('sworn to') || 
        lower.includes('sworn before') ||
        lower.includes('notary') || 
        lower.includes('subscribed') || 
        lower.includes('verified') ||
        lower.includes('affirmed')
    ) {
      return 'jurat';
    }

    // Filing Dates (Critical for statutes of limitation)
    if (
        lower.includes('filed') || 
        lower.includes('filing') || 
        lower.includes('entered') || 
        lower.includes('index no') ||
        lower.includes('received by court') ||
        lower.includes('clerk') ||
        lower.includes('docket') ||
        lower.includes('stamp')
    ) {
      return 'filing';
    }

    // Signature Dates
    if (
        lower.includes('signed') || 
        lower.includes('signature') || 
        lower.includes('executed') || 
        lower.includes('dated:') ||
        lower.includes('date:') ||
        lower.includes('undersigned') ||
        (lower.includes('by:') && lower.length < 60)
    ) {
      return 'signature';
    }

    // Service of Process
    if (
        lower.includes('served') || 
        lower.includes('service') || 
        lower.includes('mailed') || 
        lower.includes('mailing') || 
        lower.includes('delivered') ||
        lower.includes('hand delivery') ||
        lower.includes('certified mail') ||
        lower.includes('proof of service') ||
        lower.includes('affidavit of service')
    ) {
      return 'service';
    }

    // Court Appearances / Hearings
    if (
        lower.includes('hearing') || 
        lower.includes('appearance') || 
        lower.includes('returnable') || 
        lower.includes('court date') ||
        lower.includes('adjourned') ||
        lower.includes('argument') ||
        lower.includes('conference') ||
        lower.includes('trial') ||
        lower.includes('motion date')
    ) {
      return 'hearing';
    }
    
    return 'reference';
  }
}

// --- Constraint Checker ---
interface Constraint {
  id: string;
  description: string;
  check: (dates: ExtractedDate[]) => Violation | null;
}

export class ConstraintChecker {
  private constraints: Constraint[] = [
    {
      id: 'jurat_future_check',
      description: 'Jurat cannot be in the future relative to current date (sanity check)',
      check: (dates) => this.checkJuratSanity(dates)
    },
    {
      id: 'jurat_before_filing',
      description: 'Jurat (Verification) date must precede Filing date',
      check: (dates) => this.checkJuratBeforeFiling(dates)
    },
    {
      id: 'signature_before_filing',
      description: 'Signature date must precede Filing date',
      check: (dates) => this.checkSignatureBeforeFiling(dates)
    },
    {
      id: 'service_before_hearing',
      description: 'Service must occur before hearing with adequate notice (min 7 days)',
      check: (dates) => this.checkServiceNotice(dates)
    }
  ];

  check(dates: ExtractedDate[]): Violation[] {
    const violations: Violation[] = [];
    
    for (const constraint of this.constraints) {
      const violation = constraint.check(dates);
      if (violation) {
        violations.push(violation);
      }
    }
    
    return violations;
  }

  private checkJuratSanity(dates: ExtractedDate[]): Violation | null {
    const jurats = dates.filter(d => d.type === 'jurat');
    const now = new Date();
    
    for (const jurat of jurats) {
      if (isAfter(jurat.date, addDays(now, 1))) { // Allow 1 day buffer for timezone
        return {
          constraintId: 'jurat_future_check',
          severity: 'critical',
          description: `Jurat date ${jurat.text} is in the future. Potential fraud or OCR error.`,
          dates: [jurat]
        };
      }
    }
    return null;
  }

  private checkJuratBeforeFiling(dates: ExtractedDate[]): Violation | null {
    const jurats = dates.filter(d => d.type === 'jurat');
    const filings = dates.filter(d => d.type === 'filing');
    
    for (const jurat of jurats) {
      for (const filing of filings) {
        // Jurat date must be <= Filing date
        if (isAfter(jurat.date, filing.date)) {
          return {
            constraintId: 'jurat_before_filing',
            severity: 'critical',
            description: `Procedural Defect: Verification/Jurat (${jurat.text}) is dated AFTER the document was filed (${filing.text}).`,
            dates: [jurat, filing]
          };
        }
      }
    }
    return null;
  }

  private checkSignatureBeforeFiling(dates: ExtractedDate[]): Violation | null {
    const signatures = dates.filter(d => d.type === 'signature');
    const filings = dates.filter(d => d.type === 'filing');
    
    for (const signature of signatures) {
      for (const filing of filings) {
        if (isAfter(signature.date, filing.date)) {
          return {
            constraintId: 'signature_before_filing',
            severity: 'high',
            description: `Document appears signed (${signature.text}) after it was filed (${filing.text}). Check for amended filings.`,
            dates: [signature, filing]
          };
        }
      }
    }
    return null;
  }

  private checkServiceNotice(dates: ExtractedDate[]): Violation | null {
    const services = dates.filter(d => d.type === 'service');
    const hearings = dates.filter(d => d.type === 'hearing');
    
    // Default notice period (e.g. NY CPLR requires 8 days for personal service, more for mail)
    const MIN_NOTICE_DAYS = 7;
    
    for (const hearing of hearings) {
      for (const service of services) {
        const noticeDays = differenceInDays(hearing.date, service.date);
        
        if (isBefore(hearing.date, service.date)) {
             return {
                constraintId: 'service_timing_impossible',
                severity: 'critical',
                description: `Hearing (${hearing.text}) is listed BEFORE service date (${service.text}). Service must precede hearing.`,
                dates: [service, hearing]
             };
        }

        if (noticeDays < MIN_NOTICE_DAYS) {
          return {
            constraintId: 'service_insufficient_notice',
            severity: 'high',
            description: `Insufficient Notice: Only ${noticeDays} days between Service (${service.text}) and Hearing (${hearing.text}). Typically requires ${MIN_NOTICE_DAYS}+ days.`,
            dates: [service, hearing]
          };
        }
      }
    }
    return null;
  }
}

// --- Reference Extractor ---
export class ReferenceExtractor {
  private patterns = [
    /(\d{4})\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(Agreement|Contract|Notice|Order|Lease)/gi,
    /(Agreement|Contract|Notice|Order|Lease)[^,]*dated[^,]*(\d{4})/gi,
    /(Exhibit|Attachment|Appendix)\s+([A-Z0-9]+)/gi
  ];

  extract(text: string): DocumentReference[] {
    const references: DocumentReference[] = [];
    for (const pattern of this.patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const refText = match[0];
        references.push({
          text: refText,
          year: this.extractYear(refText),
          documentType: this.extractDocumentType(refText),
          location: { start: match.index, end: match.index + refText.length },
          source: 'regex'
        });
      }
    }
    return references;
  }

  private extractYear(text: string): number | undefined {
    const match = text.match(/\b(19|20)\d{2}\b/);
    return match ? parseInt(match[0]) : undefined;
  }

  private extractDocumentType(text: string): string | undefined {
    const types = ['Agreement', 'Contract', 'Notice', 'Order', 'Exhibit', 'Attachment', 'Lease'];
    for (const type of types) {
      if (text.includes(type)) return type;
    }
    return undefined;
  }
}

// --- Document Graph & Integrity ---
interface GraphNode {
  id: string;
  title: string;
  year?: number;
  content: string;
}

export class DocumentGraph {
  private nodes: Map<string, GraphNode> = new Map();

  addDocument(id: string, title: string, content: string, year?: number) {
    this.nodes.set(id, { id, title, content, year });
  }

  findDocument(criteria: { year?: number; type?: string }): GraphNode | undefined {
    for (const node of this.nodes.values()) {
      if (criteria.year && !node.content.includes(criteria.year.toString()) && !node.title.includes(criteria.year.toString())) continue;
      if (criteria.type && !node.title.toLowerCase().includes(criteria.type.toLowerCase())) continue;
      return node;
    }
    return undefined;
  }
}

export class IntegrityChecker {
  check(documentContent: string, corpus: DocumentGraph): Violation[] {
    const violations: Violation[] = [];
    const extractor = new ReferenceExtractor();
    const references = extractor.extract(documentContent);

    for (const ref of references) {
      if (ref.year || ref.documentType) {
          const referencedDoc = corpus.findDocument({
            year: ref.year,
            type: ref.documentType
          });

          if (!referencedDoc && (ref.year || (ref.documentType && ref.documentType !== 'Exhibit'))) {
            violations.push({
              constraintId: 'reference_not_found',
              severity: 'medium',
              description: `Missing Exhibit/Document: Text references "${ref.text}" which was not found in the case corpus.`,
              dates: []
            });
          }
      }
    }
    return violations;
  }
}

// --- Signature Extractor ---
export class SignatureExtractor {
  extract(text: string): Signature[] {
    const signatures: Signature[] = [];
    const pattern = /(?:Signed by|Signature of|\/s\/|By:)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const party = match[1];
      const context = text.slice(match.index, Math.min(text.length, match.index + 200));
      const dateMatch = context.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
      let signatureDate: Date | undefined;
      
      if (dateMatch) {
        signatureDate = new Date(`${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`);
      }
      
      signatures.push({
        party,
        date: signatureDate,
        location: { start: match.index, end: match.index + match[0].length }
      });
    }
    return signatures;
  }
}

export class CompletenessChecker {
  check(documentType: string, signatures: Signature[]): Violation[] {
    const violations: Violation[] = [];
    const docTypeLower = documentType.toLowerCase();
    
    if ((docTypeLower.includes('lease') || docTypeLower.includes('contract') || docTypeLower.includes('agreement')) && signatures.length === 0) {
         violations.push({
          constraintId: 'missing_signature',
          severity: 'high',
          description: `Execution Defect: No signatures detected in ${documentType}. Unsigned contracts may be unenforceable.`,
          dates: []
        });
    }
    return violations;
  }
}

// --- Orchestrator ---
export class LegalAnalyzer {
  private dateExtractor = new DateExtractor();
  private constraintChecker = new ConstraintChecker();
  private referenceExtractor = new ReferenceExtractor();
  private integrityChecker = new IntegrityChecker();
  private signatureExtractor = new SignatureExtractor();
  private completenessChecker = new CompletenessChecker();
  private intentTunnel = new IntentTunnelAdapter();

  /**
   * Standard Synchronous Analysis (Heuristics only)
   */
  analyze(document: { id: string; content: string; documentType: string }, allDocs?: StoredDocument[]): LegalAnalysisResult {
    const dates = this.dateExtractor.extract(document.content);
    const temporalViolations = this.constraintChecker.check(dates);
    
    const references = this.referenceExtractor.extract(document.content);
    let referenceViolations: Violation[] = [];
    
    if (allDocs) {
      const corpus = new DocumentGraph();
      allDocs.forEach(d => corpus.addDocument(d.id, d.name, d.content));
      referenceViolations = this.integrityChecker.check(document.content, corpus);
    }
    
    const signatures = this.signatureExtractor.extract(document.content);
    const signatureViolations = this.completenessChecker.check(document.documentType, signatures);
    
    const allViolations = [...temporalViolations, ...referenceViolations, ...signatureViolations];
    
    return {
      documentId: document.id,
      dates,
      references,
      signatures,
      violations: allViolations,
      criticalCount: allViolations.filter(v => v.severity === 'critical').length,
      timestamp: new Date(),
      isAiAugmented: false
    };
  }

  /**
   * Asynchronous Analysis utilizing Intent Tunnel (AI) for deep extraction.
   * Merges Heuristic results with AI results.
   */
  async analyzeWithIntentTunnel(document: { id: string; content: string; documentType: string }, apiKey: string, allDocs?: StoredDocument[]): Promise<LegalAnalysisResult> {
      // 1. Run basic heuristics
      const baseResult = this.analyze(document, allDocs);

      // 2. Run Intent Tunnel Extraction
      const aiExtraction = await this.intentTunnel.extract(document.content, apiKey);

      // 3. Merge Results (Deduplicate)
      
      // Merge Dates
      const mergedDates = [...baseResult.dates];
      for (const aiDate of aiExtraction.dates) {
          // Check if date already exists (fuzzy match on date object)
          const exists = mergedDates.some(d => d.date.getTime() === aiDate.date.getTime() && d.type === aiDate.type);
          if (!exists) {
              mergedDates.push(aiDate);
          }
      }
      // Re-sort
      mergedDates.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Merge References
      const mergedRefs = [...baseResult.references];
      for (const aiRef of aiExtraction.references) {
          const exists = mergedRefs.some(r => r.text.includes(aiRef.text) || aiRef.text.includes(r.text));
          if (!exists) {
              mergedRefs.push(aiRef);
          }
      }

      // 4. Re-run Constraints on ENRICHED data
      // This is the key value add: new dates might trigger new violations
      const temporalViolations = this.constraintChecker.check(mergedDates);
      const signatureViolations = this.completenessChecker.check(document.documentType, baseResult.signatures); // Signatures still heuristic for now
      
      // We keep old ref violations unless we re-run integrity checker, but integrity checker uses Regex extractor internally.
      // Ideally we'd update integrity checker to accept passed references, but for now we'll concatenate.
      // (Simplified logic: assuming AI refs don't trigger graph violations yet without corpus update)
      const baseViolationsWithoutTemporal = baseResult.violations.filter(v => !['jurat_future_check', 'jurat_before_filing', 'signature_before_filing', 'service_before_hearing', 'service_timing_impossible', 'service_insufficient_notice'].includes(v.constraintId));
      
      const allViolations = [...baseViolationsWithoutTemporal, ...temporalViolations, ...signatureViolations];

      return {
          ...baseResult,
          dates: mergedDates,
          references: mergedRefs,
          violations: allViolations,
          criticalCount: allViolations.filter(v => v.severity === 'critical').length,
          isAiAugmented: true
      };
  }
}
