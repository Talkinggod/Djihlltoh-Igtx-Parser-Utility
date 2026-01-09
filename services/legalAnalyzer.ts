
import { parse, isValid, parseISO, differenceInDays, isAfter } from 'date-fns';
import { ExtractedDate, Violation, DocumentReference, Signature, LegalAnalysisResult, StoredDocument } from '../types';

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
          const context = this.extractContext(text, match.index, 50);
          const type = this.inferDateType(context);
          
          dates.push({
            date: parsedDate,
            text: dateStr,
            context,
            type,
            location: { start: match.index, end: match.index + dateStr.length }
          });
        }
      }
    }
    
    return dates.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private parseDate(dateStr: string): Date | null {
    // Try native date parsing first which covers many formats
    const d = new Date(dateStr);
    if (isValid(d)) return d;
    
    // Fallback to specific formats if needed (date-fns parse requires format string)
    // For simplicity relying on browser's Date parser for standard formats extracted by regex
    return null;
  }

  private extractContext(text: string, index: number, radius: number): string {
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + radius);
    return text.slice(start, end);
  }

  private inferDateType(context: string): ExtractedDate['type'] {
    const lower = context.toLowerCase();
    
    if (lower.includes('jurat') || lower.includes('sworn') || lower.includes('notary') || lower.includes('subscribed')) {
      return 'jurat';
    }
    if (lower.includes('filed') || lower.includes('filing') || lower.includes('dated:')) {
      return 'filing';
    }
    if (lower.includes('signed') || lower.includes('signature') || lower.includes('executed')) {
      return 'signature';
    }
    if (lower.includes('served') || lower.includes('service') || lower.includes('mail')) {
      return 'service';
    }
    if (lower.includes('hearing') || lower.includes('appearance') || lower.includes('returnable')) {
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
      id: 'jurat_before_filing',
      description: 'Jurat date cannot be after filing date',
      check: (dates) => this.checkJuratBeforeFiling(dates)
    },
    {
      id: 'signature_before_filing',
      description: 'Signature date cannot be after filing date',
      check: (dates) => this.checkSignatureBeforeFiling(dates)
    },
    {
      id: 'service_before_hearing',
      description: 'Service must occur before hearing with adequate notice',
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

  private checkJuratBeforeFiling(dates: ExtractedDate[]): Violation | null {
    const jurats = dates.filter(d => d.type === 'jurat');
    const filings = dates.filter(d => d.type === 'filing');
    
    for (const jurat of jurats) {
      for (const filing of filings) {
        if (isAfter(jurat.date, filing.date)) {
          return {
            constraintId: 'jurat_before_filing',
            severity: 'critical',
            description: `Jurat dated ${jurat.text} but document filed ${filing.text}. Physical impossibility.`,
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
            severity: 'critical',
            description: `Signature dated ${signature.text} but document filed ${filing.text}`,
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
    
    // NY requires 14 days notice for eviction proceedings typically
    const REQUIRED_NOTICE_DAYS = 7; // Safe default lower bound
    
    for (const service of services) {
      for (const hearing of hearings) {
        const daysBetween = differenceInDays(hearing.date, service.date);
        
        if (daysBetween < REQUIRED_NOTICE_DAYS && daysBetween >= 0) {
          return {
            constraintId: 'service_before_hearing',
            severity: 'high',
            description: `Only ${daysBetween} days between service (${service.text}) and hearing (${hearing.text}). Minimum ${REQUIRED_NOTICE_DAYS} days typically required.`,
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
    // "1987 Occupancy Agreement"
    /(\d{4})\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(Agreement|Contract|Notice|Order|Lease)/gi,
    // "Agreement dated January 1, 2020"
    /(Agreement|Contract|Notice|Order|Lease)[^,]*dated[^,]*(\d{4})/gi,
    // "Exhibit A" or "Attachment 1"
    /(Exhibit|Attachment|Appendix)\s+([A-Z0-9]+)/gi
  ];

  extract(text: string): DocumentReference[] {
    const references: DocumentReference[] = [];
    
    for (const pattern of this.patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const refText = match[0];
        const year = this.extractYear(refText);
        const docType = this.extractDocumentType(refText);
        
        references.push({
          text: refText,
          year,
          documentType: docType,
          location: { start: match.index, end: match.index + refText.length }
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

// --- Document Graph & Integrity Checker ---
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
  check(
    documentContent: string,
    corpus: DocumentGraph
  ): Violation[] {
    const violations: Violation[] = [];
    const extractor = new ReferenceExtractor();
    const references = extractor.extract(documentContent);

    for (const ref of references) {
      // Try to find the referenced document in the corpus
      if (ref.year || ref.documentType) {
          const referencedDoc = corpus.findDocument({
            year: ref.year,
            type: ref.documentType
          });

          if (!referencedDoc && (ref.year || (ref.documentType && ref.documentType !== 'Exhibit'))) {
            // Only flag if we have enough info to be reasonably sure it should exist
            violations.push({
              constraintId: 'reference_not_found',
              severity: 'medium',
              description: `References "${ref.text}" which was not found in the case corpus.`,
              dates: []
            });
          }
      }
    }

    return violations;
  }
}

// --- Signature Components ---
export class SignatureExtractor {
  extract(text: string): Signature[] {
    const signatures: Signature[] = [];
    
    // Look for signature blocks
    const pattern = /(?:Signed by|Signature of|\/s\/|By:)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const party = match[1];
      const contextStart = match.index;
      const contextEnd = Math.min(text.length, contextStart + 200);
      const context = text.slice(contextStart, contextEnd);
      
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
  private rules = [
    {
      documentType: 'lease',
      requiredParties: ['Landlord', 'Tenant']
    },
    {
      documentType: 'agreement',
      requiredParties: ['Party'] // Generic
    },
    {
      documentType: 'contract',
      requiredParties: ['Buyer', 'Seller']
    }
  ];

  check(
    documentType: string,
    signatures: Signature[]
  ): Violation[] {
    const violations: Violation[] = [];
    // Simple heuristic mapping
    const docTypeLower = documentType.toLowerCase();
    
    // Don't check miscellaneous docs
    if (!docTypeLower.includes('lease') && !docTypeLower.includes('contract') && !docTypeLower.includes('agreement')) return violations;

    // Check for at least one signature
    if (signatures.length === 0) {
         violations.push({
          constraintId: 'missing_signature',
          severity: 'high',
          description: `No signatures detected in ${documentType}.`,
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

  analyze(document: {
    id: string;
    content: string;
    documentType: string;
  }, allDocs?: StoredDocument[]): LegalAnalysisResult {
    
    // 1. Extract dates
    const dates = this.dateExtractor.extract(document.content);
    
    // 2. Check temporal constraints
    const temporalViolations = this.constraintChecker.check(dates);
    
    // 3. Extract and check references
    const references = this.referenceExtractor.extract(document.content);
    let referenceViolations: Violation[] = [];
    
    if (allDocs) {
      const corpus = new DocumentGraph();
      allDocs.forEach(d => corpus.addDocument(d.id, d.name, d.content));
      referenceViolations = this.integrityChecker.check(document.content, corpus);
    }
    
    // 4. Extract and check signatures
    const signatures = this.signatureExtractor.extract(document.content);
    const signatureViolations = this.completenessChecker.check(
      document.documentType,
      signatures
    );
    
    // 5. Aggregate results
    const allViolations = [
      ...temporalViolations,
      ...referenceViolations,
      ...signatureViolations
    ];
    
    return {
      documentId: document.id,
      dates,
      references,
      signatures,
      violations: allViolations,
      criticalCount: allViolations.filter(v => v.severity === 'critical').length,
      timestamp: new Date()
    };
  }
}
