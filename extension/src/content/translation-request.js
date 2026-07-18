export function createTranslationRequest({
  sessionId,
  cueId,
  currentText,
  contextLines = [],
  sourceLanguage = "en",
  targetLanguage = "zh-Hant"
}) {
  const numericCue = Number.parseInt(cueId, 10);
  return {
    sessionId: String(sessionId),
    cueId: String(cueId),
    cueSequence: Number.isSafeInteger(numericCue) && numericCue >= 0 ? numericCue : 0,
    currentText,
    contextLines,
    sourceLanguage,
    targetLanguage
  };
}

export function shouldApplyTranslationResult({
  requestId,
  activeRequestId,
  caption,
  currentCaption
}) {
  return requestId === activeRequestId && caption === currentCaption;
}
