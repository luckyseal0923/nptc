import { useId } from 'react';
import { DOMAINS, radarValues } from '@/lib/domains';
import '@/app/domain-scores.css';

export function DomainRadar({ scores, maximum, title = '五大面向表現' }: { scores: unknown; maximum: unknown; title?: string }) {
  const id=useId(), values=radarValues(scores,maximum);
  if (!values) return <p className="domain-missing">尚無完整五面向成績，暫無雷達圖；既有總分不會推算成分項得分。</p>;
  const point=(i:number,r:number)=>{const a=-Math.PI/2+i*Math.PI*2/5;return [210+Math.cos(a)*r,150+Math.sin(a)*r];};
  const points=(r:number)=>DOMAINS.map((_,i)=>point(i,r).join(',')).join(' ');
  return <figure className="domain-radar" aria-labelledby={`${id}-caption`}>
    <figcaption id={`${id}-caption`}>{title}</figcaption>
    <svg viewBox="0 0 420 300" role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>{title}，各軸最高 5 分</title><desc id={`${id}-description`}>{DOMAINS.map((d,i)=>`${d.label} ${values[i].toFixed(2)} / 5`).join('；')}</desc>
      {[1,2,3,4,5].map(level=><g key={level}><polygon points={points(level*20)} fill={level===5?'#f5f8f2':'none'} stroke="#ccd9d0"/><text x="215" y={150-level*20+4} fontSize="10" fill="#5f7469">{level}</text></g>).reverse()}
      {DOMAINS.map((d,i)=>{const [x,y]=point(i,100),[tx,ty]=point(i,138);return <g key={d.key}><line x1="210" y1="150" x2={x} y2={y} stroke="#ccd9d0"/><text x={tx} y={ty} textAnchor={i===0?'middle':i<3?'start':'end'} dominantBaseline="middle" fontSize="18" fontWeight="600" fill="#133b38">{d.label}</text></g>;})}
      <polygon points={values.map((v,i)=>point(i,v*20).join(',')).join(' ')} fill="#398274" fillOpacity="0.22" stroke="#176b57" strokeWidth="2"/>
      {values.map((v,i)=>{const [cx,cy]=point(i,v*20);return <circle key={i} cx={cx} cy={cy} r="3" fill="#176b57"/>;})}
    </svg>
  </figure>;
}
