export interface PaperResolution {
  evidence: string;
  outcome: string;
  text: string;
}

export interface PaperMiss {
  authorLine: string;
  text: string;
}

export interface PaperClash {
  summary: string;
  topic: string;
}

export interface PaperInput {
  clashes: PaperClash[];
  date: string;
  missed: PaperMiss[];
  resolutions: PaperResolution[];
  reviewsDue: number;
}

export interface PaperSection {
  heading: string;
  lines: string[];
}

export interface MorningPaper {
  date: string;
  generatedAt: number;
  sections: PaperSection[];
}

export function buildMorningPaper(input: PaperInput, now: number): MorningPaper {
  const sections: PaperSection[] = [];
  if (input.resolutions.length > 0) {
    sections.push({
      heading: "Resolved overnight",
      lines: input.resolutions.map((item) => `${item.outcome}: ${item.text} (${item.evidence})`),
    });
  }
  if (input.missed.length > 0) {
    sections.push({
      heading: "You missed",
      lines: input.missed.map((item) => `${item.authorLine}: ${item.text}`),
    });
  }
  if (input.clashes.length > 0) {
    sections.push({
      heading: "Worth your coffee",
      lines: input.clashes.map((item) => `${item.topic}: ${item.summary}`),
    });
  }
  if (input.reviewsDue > 0) {
    sections.push({ heading: "Due for review", lines: [`${input.reviewsDue} saves are due for review.`] });
  }
  if (sections.length === 0) {
    sections.push({ heading: "Quiet night", lines: ["Nothing resolved, missed, or due. The river was calm."] });
  }
  return { date: input.date, generatedAt: now, sections };
}

export function renderPaperMarkdown(paper: MorningPaper): string {
  const parts = [`# Morning paper · ${paper.date}`, ""];
  for (const section of paper.sections) {
    parts.push(`## ${section.heading}`, "");
    for (const line of section.lines) parts.push(`- ${line}`);
    parts.push("");
  }
  return parts.join("\n");
}

export function paperToSpeech(paper: MorningPaper): string {
  const sentences: string[] = [`Here is your morning paper for ${paper.date}.`];
  for (const section of paper.sections) {
    sentences.push(`${section.heading}.`);
    sentences.push(...section.lines);
  }
  return sentences.join(" ");
}
