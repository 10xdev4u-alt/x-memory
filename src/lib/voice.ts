export interface SpeechBackend {
  cancel: () => void;
  speak: (text: string, onend: () => void, onerror: (reason: string) => void) => void;
}

export function splitDigest(text: string, maxLength = 200): string[] {
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+["”)]?|\S[^.!?]*$/g) ?? [];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (piece === "") continue;
    if ((`${current} ${piece}`.trim().length > maxLength && current !== "") || piece.length > maxLength * 2) {
      if (current !== "") {
        chunks.push(current.trim());
        current = "";
      }
      if (piece.length > maxLength * 2) {
        for (let i = 0; i < piece.length; i += maxLength) chunks.push(piece.slice(i, i + maxLength));
        continue;
      }
    }
    current = `${current} ${piece}`.trim();
  }
  if (current !== "") chunks.push(current.trim());
  return chunks;
}

export interface Playback {
  done: Promise<void>;
  stop: () => void;
}

export function playDigest(
  backend: SpeechBackend,
  chunks: string[],
  onProgress?: (spoken: number, total: number) => void,
): Playback {
  let stopped = false;
  let rejectDone: (reason: Error) => void = () => undefined;
  const done = new Promise<void>((resolve, reject) => {
    rejectDone = reject;
    if (chunks.length === 0) {
      resolve();
      return;
    }
    let index = 0;
    const next = (): void => {
      if (stopped) {
        resolve();
        return;
      }
      const chunk = chunks[index];
      if (chunk === undefined) {
        resolve();
        return;
      }
      onProgress?.(index, chunks.length);
      backend.speak(
        chunk,
        () => {
          index += 1;
          next();
        },
        (reason) => reject(new Error(reason)),
      );
    };
    next();
  });
  return {
    done,
    stop: () => {
      stopped = true;
      try {
        backend.cancel();
      } catch {
        rejectDone(new Error("stop failed"));
      }
    },
  };
}

export function browserBackend(): SpeechBackend | undefined {
  const synthesis = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
  if (synthesis === undefined) return undefined;
  return {
    cancel: () => synthesis.cancel(),
    speak: (text, onend, onerror) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => onend();
      utterance.onerror = () => onerror("speech failed");
      synthesis.speak(utterance);
    },
  };
}
