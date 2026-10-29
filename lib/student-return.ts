import { decodeSurveyCode } from './survey-short-link';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function studentReturnUrl(origin: string, base: string, search: string, reset = false) {
  const url = new URL(`${base.replace(/\/$/, '')}/student/`, origin);
  const params = new URLSearchParams(search);
  const survey = params.getAll('survey').length === 1 ? params.get('survey') : null;
  const short = params.getAll('s').length === 1 ? decodeSurveyCode(params.get('s')!) : null;
  const id = survey && uuid.test(survey) ? survey.toLowerCase() : short;
  if (reset) url.searchParams.set('reset', '1');
  if (id) url.searchParams.set('survey', id);
  return url.href;
}
