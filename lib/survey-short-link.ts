const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Preserve all 128 bits of the publication ID; no lookup table or user data is needed.
export function encodeSurveyId(id: string): string {
  if (!uuidPattern.test(id)) throw new Error('問卷編號格式不正確。');
  const bytes = id.replaceAll('-', '').match(/../g)!.map(value => Number.parseInt(value, 16));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function decodeSurveyCode(code: string): string | null {
  if (!/^[A-Za-z0-9_-]{22}$/.test(code)) return null;
  try {
    const bytes = atob(code.replaceAll('-', '+').replaceAll('_', '/') + '==');
    if (bytes.length !== 16) return null;
    const hex = [...bytes].map(value => value.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return encodeSurveyId(id) === code ? id : null;
  } catch { return null; }
}

export function shortSurveyPath(id: string): string {
  return `/q/?s=${encodeSurveyId(id)}`;
}

export function surveyIdFromShortQuery(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.getAll('s').length === 1 ? decodeSurveyCode(params.get('s')!) : null;
}
