import Link from '@/components/link';
import { appPath } from '@/lib/routes';
import {
  ArrowUpRight,
  ArrowRight,
  Activity,
  Focus,
  MessagesSquare,
  ScanLine,
  Brain,
} from 'lucide-react';
const features = [
  {
    n: '01',
    Icon: ScanLine,
    title: '在情境中，練出應答節奏',
    text: '透過 OSCE 情境模擬，練習從主訴出發，串起問診、評估與判斷，讓臨床經驗有條理地呈現。',
  },
  {
    n: '02',
    Icon: Focus,
    title: '讓每一次回饋，都有方向',
    text: '由導師提供具體回饋，搭配考題解析與討論，看見容易遺漏的細節，釐清下一步練習重點。',
  },
  {
    n: '03',
    Icon: Brain,
    title: '拆解線索，深化臨床推理',
    text: '從單一主訴到複雜情境，練習辨識認知偏誤，重新檢視推論與依據，建立更周全的思考路徑。',
  },
];
export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main">
        跳至主要內容
      </a>
      <header className="header">
        <Link href="/" className="brand">
          <span className="brand-symbol">
            <Activity size={25} />
          </span>
          <span>
            為國考而訓<small>NP · OSCE WORKSHOP</small>
          </span>
        </Link>
        <nav aria-label="主要導覽">
          <a href="#about">關於工作坊</a>
          <a href="#features">課程特色</a>
          <a href="#information">開課資訊</a>
          <Link href="/teacher">老師專區</Link>
        </nav>
        <Link className="login-link" href="/student">
          學員專區 <ArrowUpRight size={17} />
        </Link>
      </header>
      <main id="main">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="dot" /> 專科護理師 OSCE 訓練工作坊
            </div>
            <h1>
              把臨床經驗，
              <br />
              練成考場上的
              <br />
              <span>清晰判斷。</span>
            </h1>
            <p>
              每一次練習，都更接近從容應答的自己。
              <br />
              用情境模擬、專業回饋與臨床推理，
              <br />
              陪你將經驗轉化為有條理的表現。
            </p>
            <a className="button" href="#features">
              探索工作坊 <ArrowUpRight size={19} />
            </a>
            <div className="hero-footnote">
              <span>FOR YOUR NEXT STEP</span>
              <span>從練習，走向更有把握。</span>
            </div>
          </div>
          <figure className="hero-visual">
            <img
              src={appPath('/images/medical-study.jpg')}
              alt="書本與聽診器，醫療學習情境示意"
              width="1100"
              height="1300"
            />
            <div className="photo-shade" />
            <div className="photo-title">
              <span>PREPARE WITH PURPOSE.</span>
              <p>
                讓專業，
                <br />
                在練習中更篤定。
              </p>
            </div>
            <figcaption>情境示意照片，非本工作坊活動紀錄</figcaption>
            <div className="photo-index">
              NP<span>OSCE</span>
            </div>
          </figure>
        </section>
        <div className="principles">
          <span>
            <i>01</i> 情境模擬
          </span>
          <span>
            <i>02</i> 即時回饋
          </span>
          <span>
            <i>03</i> 臨床推理
          </span>
          <span>
            <i>04</i> 同儕共學
          </span>
        </div>
        <section className="intro section" id="about">
          <div className="section-label">
            THE WORKSHOP <span>關於工作坊</span>
          </div>
          <div>
            <h2>
              知道怎麼做，
              <br />
              也練習如何清楚地做到。
            </h2>
            <p>
              面對
              OSCE，如何抓住主訴重點、安排問診與評估順序，並說明自己的判斷？我們把這些挑戰放進練習裡。
            </p>
            <p>
              從基礎架構到進階思維，透過兩天分階段訓練，陪你整理已有的臨床經驗，在實作與討論中找到更清楚的應答方向。
            </p>
            <span className="audience">為準備專科護理師 OSCE 的你而設計</span>
          </div>
        </section>
        <section className="features section" id="features">
          <div className="section-top">
            <div>
              <div className="section-label">
                LEARN THROUGH PRACTICE <span>課程特色</span>
              </div>
              <h2>
                每一次練習，
                <br />
                都有值得帶走的進步。
              </h2>
            </div>
            <p>
              實作、回饋、再思考。
              <br />
              把學到的，變成做得到的。
            </p>
          </div>
          <div className="feature-grid">
            {features.map(({ n, Icon, title, text }) => (
              <article className="feature" key={n}>
                <div className="feature-top">
                  <Icon size={30} strokeWidth={1.3} />
                  <span>{n}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <div className="community">
            <MessagesSquare size={30} strokeWidth={1.4} />
            <div>
              <h3>課堂之外，也有人一起思考。</h3>
              <p>
                透過 LINE 共學群組，與同儕及老師交流問題，將學習延續至考前。
              </p>
            </div>
            <span>KEEP LEARNING ↗</span>
          </div>
        </section>
        <section className="information section" id="information">
          <div>
            <div className="section-label">
              YOUR NEXT STEP <span>開課資訊</span>
            </div>
            <h2>
              為下一步，
              <br />
              做好更有方向的準備。
            </h2>
            <p>
              新一期工作坊資訊整理中。
              <br />
              課程日期、費用及報名方式，將於本頁公告。
            </p>
            <span className="status">
              <span className="dot" /> 新一期資訊即將公布
            </span>
          </div>
          <aside className="student-card">
            <span className="card-label">STUDENT PORTAL</span>
            <h3>
              把每一次練習，
              <br />
              留成自己的學習紀錄。
            </h3>
            <p>
              登入學員專區，查詢工作坊個人成績，陪你回顧成果、整理下一步練習方向。
            </p>
            <Link href="/student">
              前往學員專區 <ArrowRight size={19} />
            </Link>
          </aside>
        </section>
      </main>
      <footer>
        <Link href="/" className="footer-brand">
          為國考而訓<span>讓每一次練習都有方向。</span>
        </Link>
        <div>
          專科護理師 OSCE 訓練工作坊
          <small>
            圖片：
            <a
              href="https://unsplash.com/photos/a-stethoscope-sitting-on-top-of-a-pile-of-books-vT-Hkq0_FBU"
              target="_blank"
              rel="noreferrer"
            >
              Bermix Studio / Unsplash
            </a>
          </small>
        </div>
      </footer>
    </>
  );
}
