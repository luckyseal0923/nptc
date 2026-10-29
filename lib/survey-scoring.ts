import type { SurveyDefinition, SurveyScores } from './surveys';
import { validateSurveyAnswers } from './surveys';
export function scoreSurvey(definition: SurveyDefinition, answers: unknown): SurveyScores {
  const min = definition.minScore ?? 1, max = definition.maxScore ?? 6;
  validateSurveyAnswers(answers, definition.items.length, min, max);
  const itemScores = answers.map((n, i) => definition.reverseItems?.includes(i + 1) ? min + max - n : n);
  const dimensions = Object.fromEntries(Object.entries(definition.dimensions ?? {}).map(([name, items]) => [name, items.reduce((total, i) => total + itemScores[i - 1], 0)]));
  return { itemScores, total: itemScores.reduce((a, b) => a + b, 0), dimensions,
    ...(dimensions.flexibility !== undefined ? { flexibility: dimensions.flexibility } : {}),
    ...(dimensions.structure !== undefined ? { structure: dimensions.structure } : {}) };
}
