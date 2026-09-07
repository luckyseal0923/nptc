import type { Metadata } from 'next';
import './globals.css';
import './portal.css';
export const metadata: Metadata={title:'為國考而訓｜專科護理師 OSCE 工作坊',description:'透過情境模擬、專業回饋與臨床推理，將臨床經驗練成考場上的清晰判斷。探索專科護理師 OSCE 工作坊與開課資訊。'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="zh-Hant"><body>{children}</body></html>}
