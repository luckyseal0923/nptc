export async function surveyQrDataUrl(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname))) {
    throw new Error('問卷連結格式不正確。');
  }
  const { default: QRCode } = await import('qrcode');
  return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 4, width: 1024, type: 'image/png' });
}

export async function downloadSurveyQr(url: string, scaleCode: string, assignmentId: string) {
  const dataUrl = await surveyQrDataUrl(url);
  const link = document.createElement('a');
  const safeCode = scaleCode.replace(/[^a-zA-Z0-9_-]/g, '_');
  link.href = dataUrl;
  link.download = `NPTC_${safeCode}_${assignmentId}_QRcode.png`;
  document.body.append(link);
  link.click();
  link.remove();
}
