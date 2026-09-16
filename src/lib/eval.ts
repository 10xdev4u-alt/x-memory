export interface EvalSample {
  id: string;
  input: string;
  output: string;
}

export interface EvalScores {
  brevity: number;
  grounding: number;
  structure: number;
}

export interface EvalGrade {
  passed: boolean;
  sampleId: string;
  scores: EvalScores;
}

export interface EvalReport {
  failures: EvalGrade[];
  passed: number;
  total: number;
}

function bulletLines(output: string): number {
  return output.split("\n").filter((line) => /^\s*[-•*]\s+\S/.test(line)).length;
}

function sharesTerms(input: string, output: string): boolean {
  const inputTokens = new Set(input.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 5));
  const outputTokens = new Set(output.toLowerCase().split(/[^\p{L}\p{N}]+/u));
  let shared = 0;
  for (const token of inputTokens) {
    if (outputTokens.has(token)) shared += 1;
    if (shared >= 2) return true;
  }
  return false;
}

export function gradeBrief(sample: EvalSample): EvalGrade {
  const bullets = bulletLines(sample.output);
  const structure = bullets === 3 ? 1 : bullets >= 2 ? 0.5 : 0;
  const grounding = sharesTerms(sample.input, sample.output) ? 1 : 0;
  const brevity = sample.output.length <= 1200 ? 1 : sample.output.length <= 2500 ? 0.5 : 0;
  const scores: EvalScores = { brevity, grounding, structure };
  const passed = structure >= 0.5 && grounding === 1 && brevity >= 0.5;
  return { passed, sampleId: sample.id, scores };
}

export function runEval(samples: EvalSample[]): EvalReport {
  const failures: EvalGrade[] = [];
  let passed = 0;
  for (const sample of samples) {
    const grade = gradeBrief(sample);
    if (grade.passed) passed += 1;
    else failures.push(grade);
  }
  return { failures, passed, total: samples.length };
}

export function compareEvals(before: EvalReport, after: EvalReport): { delta: number; regressed: boolean } {
  const delta = after.passed - before.passed;
  return { delta, regressed: delta < 0 };
}
