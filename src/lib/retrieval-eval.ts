export interface RetrievalEvaluationCase {
  name: string;
  question: string;
  expectedIds: string[];
}

export interface RetrievalEvaluationResult {
  name: string;
  question: string;
  expectedIds: string[];
  retrievedIds: string[];
  precision: number;
  recall: number;
  emptyContext: boolean;
}

export interface RetrievalEvaluationReport {
  cases: RetrievalEvaluationResult[];
  precision: number;
  recall: number;
  emptyContextPassed: boolean;
}

export interface RetrievalThresholds {
  minPrecision: number;
  minRecall: number;
  requireEmptyContext: boolean;
}

export function evaluateRetrieval(
  cases: RetrievalEvaluationCase[],
  retrieve: (question: string) => string[],
): RetrievalEvaluationReport {
  const results = cases.map((testCase) => {
    const expected = new Set(testCase.expectedIds);
    const retrievedIds = [...new Set(retrieve(testCase.question))];
    const retrieved = new Set(retrievedIds);
    const overlap = [...expected].filter((id) => retrieved.has(id)).length;
    const precision = retrieved.size === 0 ? 1 : expected.size === 0 ? 0 : overlap / retrieved.size;
    const recall = expected.size === 0 ? retrieved.size === 0 ? 1 : 0 : overlap / expected.size;
    return {
      ...testCase,
      retrievedIds,
      precision,
      recall,
      emptyContext: expected.size === 0,
    };
  });
  const count = results.length;
  return {
    cases: results,
    precision: count === 0 ? 0 : results.reduce((sum, result) => sum + result.precision, 0) / count,
    recall: count === 0 ? 0 : results.reduce((sum, result) => sum + result.recall, 0) / count,
    emptyContextPassed: results
      .filter((result) => result.emptyContext)
      .every((result) => result.retrievedIds.length === 0),
  };
}

export function assertRetrievalThreshold(report: RetrievalEvaluationReport, thresholds: RetrievalThresholds): void {
  const failures: string[] = [];
  if (report.precision < thresholds.minPrecision) failures.push(`precision ${report.precision} < ${thresholds.minPrecision}`);
  if (report.recall < thresholds.minRecall) failures.push(`recall ${report.recall} < ${thresholds.minRecall}`);
  if (thresholds.requireEmptyContext && !report.emptyContextPassed) failures.push("empty-context cases returned results");
  if (failures.length > 0) throw new Error(`Retrieval threshold failed: ${failures.join(", ")}`);
}
