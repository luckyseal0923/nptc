import { useEffect } from 'react';
export function useUnsavedSurvey(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const leave = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.download || link.href === location.href || link.getAttribute('href')?.startsWith('#')) return;
      if (!window.confirm('問卷尚未繳交，離開後目前填答將不會保留。確定離開嗎？')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', leave, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', leave, true); };
  }, [dirty]);
}
