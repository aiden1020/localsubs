import type { CSSProperties } from "react";
import { PlayerDemo } from "./player-demo";
import { siteDescription, siteUrl, storeUrl } from "./site";

const reportUrl = "https://arxiv.org/abs/2607.09957";
const fastModelUrl = "https://huggingface.co/Aiden1020/Sotto-EN-ZH-TW-0.6B";
const qualityModelUrl = "https://huggingface.co/Aiden1020/Sotto-EN-ZH-TW-1.7B";
const repoUrl = "https://github.com/aiden1020/localsubs";
const windowsSetupVideoUrl = "https://www.youtube.com/watch?v=GbVWTxgqePA";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "LocalSubs",
      inLanguage: "zh-Hant-TW",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${siteUrl}/#software`,
      name: "LocalSubs",
      url: siteUrl,
      description: siteDescription,
      downloadUrl: storeUrl,
      applicationCategory: "BrowserApplication",
      applicationSubCategory: "Chrome Extension",
      operatingSystem: "macOS, Windows",
      inLanguage: "zh-Hant-TW",
      image: `${siteUrl}/og-warm.png`,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "TWD",
      },
      author: {
        "@type": "Person",
        name: "Aiden Wong",
        url: "https://aidenw.me",
      },
      sameAs: [storeUrl, repoUrl, fastModelUrl, qualityModelUrl, reportUrl],
    },
  ],
};

const phrasing = [
  { en: "That video went viral overnight.", before: "那", term: "影片", after: "一夜之間爆紅" },
  { en: "Check the network settings.", before: "檢查", term: "網路", after: "設定" },
  { en: "Your software needs an update.", before: "你的", term: "軟體", after: "需要更新" },
  { en: "Save it to a USB drive.", before: "存到", term: "隨身碟", after: "裡" },
];

const matchups = [
  { name: "DeepL", note: "目前還追不上的對手", win: 36, tie: 22, loss: 42 },
  { name: "聯發科 Breeze 2", note: "台灣做得最好的繁中模型之一", win: 65, tie: 13, loss: 21 },
];

// Win rate against Google Translate (panel mean of two judges) from the report.
const leaderboard = [
  { name: "DeepL", size: "—", rate: 0.637 },
  { name: "Qwen3.8", size: "27B", rate: 0.598 },
  { name: "LocalSubs 精準模式", size: "1.7B", rate: 0.576, ours: true },
  { name: "LocalSubs 流暢模式", size: "0.6B", rate: 0.529, ours: true },
  { name: "Google 翻譯", size: "—", rate: 0.5, baseline: true },
  { name: "Tower+", size: "9B", rate: 0.403 },
  { name: "騰訊 Hunyuan-MT", size: "7B", rate: 0.358 },
  { name: "聯發科 Breeze 2", size: "8B", rate: 0.339 },
  { name: "Google TranslateGemma", size: "4B", rate: 0.246 },
  { name: "Meta NLLB-200", size: "3.3B", rate: 0.088 },
];

const Arrow = () => <span aria-hidden="true">↗</span>;
const ChromeIcon = () => <img className="chromeIcon" src="/chrome.webp" alt="" width="18" height="18" />;

function ScoreBar({ win, tie, loss, opponent }: { win: number; tie: number; loss: number; opponent: string }) {
  return (
    <div className="scoreBar" role="img" aria-label={`LocalSubs 贏 ${win} 句，平手 ${tie} 句，${opponent} 贏 ${loss} 句`}>
      <span className="scoreWin" style={{ flexGrow: win }}><b>{win}</b> 我們贏</span>
      <span className="scoreTie" style={{ flexGrow: tie }}><b>{tie}</b> 平手</span>
      <span className="scoreLoss" style={{ flexGrow: loss }}><b>{loss}</b> 對手贏</span>
    </div>
  );
}

export default function Home() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <header className="navBar">
        <nav className="nav shell" aria-label="主要導覽">
          <a className="brand" href="#top" aria-label="LocalSubs 首頁">
            <img src="/localsubs-logo.png" alt="" width="42" height="42" />
            <span>LocalSubs</span>
          </a>
          <div className="navLinks">
            <a href="#how">怎麼用</a>
            <a href="#quality">翻譯品質</a>
            <a href="#faq">常見問題</a>
            <a className="button buttonDark buttonSmall" href={storeUrl} target="_blank" rel="noreferrer">
              <ChromeIcon /> 免費加到 Chrome <Arrow />
            </a>
          </div>
        </nav>
      </header>

      <section className="hero shell" id="top">
        <div className="heroHead">
          <p className="eyebrow"><span /> HBO Max 中英雙字幕・免費 Chrome 擴充功能</p>
          <h1><span>英文字幕上面，</span><em>多一行台灣中文。</em></h1>
        </div>

        <div className="playerStage">
          <PlayerDemo />
        </div>

        <div className="heroActions">
          <a className="button buttonAccent" href={storeUrl} target="_blank" rel="noreferrer">
            <ChromeIcon /> 免費加到 Chrome <Arrow />
          </a>
          <p className="trustLine"><span>永遠免費</span><span>不限集數</span><span>不用註冊</span></p>
        </div>
      </section>

      <section className="how shell" id="how">
        <div className="howIntro">
          <p className="kicker">不用另外裝程式</p>
          <h2>裝好之後，<br />打開 HBO Max <span className="nowrap">就能用。</span></h2>
          <p>支援 macOS 和 Windows 上的 Chrome、Edge。</p>
        </div>
        <ol className="stepList">
          <li>
            <span>01</span>
            <div><h3>加到 Chrome</h3><p>從 Chrome 線上應用程式商店安裝，免費。</p></div>
            <div className="stepVisual stepStore" aria-hidden="true"><ChromeIcon /> 加到 Chrome</div>
          </li>
          <li>
            <span>02</span>
            <div><h3>準備翻譯</h3><p>第一次使用時，會先把翻譯模型下載到電腦上，約 290 MB，大概幾分鐘。只需要做這一次。</p></div>
            <div className="stepVisual stepProgress" aria-hidden="true"><small>準備翻譯</small><div><i /></div></div>
          </li>
          <li>
            <span>03</span>
            <div><h3>打開 HBO Max</h3><p>開英文字幕，按下播放，中文就會出現在英文上面。</p></div>
            <div className="stepVisual stepCue" aria-hidden="true"><span>饒了我吧</span><b>Cut me some slack.</b></div>
          </li>
        </ol>
      </section>

      <section className="quality" id="quality">
        <div className="shell">
          <div className="qualityHead">
            <div>
              <p className="kicker">翻譯品質</p>
              <h2>100 句字幕對決，<br />DeepL 只多贏 6 句。</h2>
            </div>
            <p>我們拿 1,820 句英文影視字幕，請兩個 AI 評審盲選：同一句台詞，哪個翻譯比較好。下面是精準模式的成績，換算成每 100 句：</p>
          </div>
          <div className="matchups">
            {matchups.map((match) => (
              <article className="matchup" key={match.name}>
                <div className="matchupHead">
                  <h3>LocalSubs <span>vs</span> {match.name}</h3>
                  <p>{match.note}</p>
                </div>
                <ScoreBar win={match.win} tie={match.tie} loss={match.loss} opponent={match.name} />
              </article>
            ))}
          </div>

          <div className="phrasing">
            <div className="phrasingCopy">
              <h3>是台灣人會講的話。</h3>
              <p>我們拿台灣的字幕來訓練。下面這幾句，都是 LocalSubs 實際翻出來的。</p>
            </div>
            <div className="phrasingGrid">
              {phrasing.map((line) => (
                <figure key={line.en}>
                  <figcaption>{line.en}</figcaption>
                  <p>{line.before}<mark>{line.term}</mark>{line.after}</p>
                </figure>
              ))}
            </div>
          </div>

          <details className="method">
            <summary>評測方法與限制 <b>＋</b></summary>
            <ul>
              <li>1,820 句字幕，來自 309 部影片，都沒有用在訓練。</li>
              <li>評審是 Claude 和 Gemini。每一句都把兩個翻譯對調順序再評一次，避免順序造成偏好。</li>
              <li>平手算各半。</li>
              <li>上面是精準模式的成績。預設的流暢模式對 DeepL 是 31 勝、20 平、49 敗。</li>
              <li>評審是 AI，不是真人。完整的數據和限制都寫在技術報告裡。</li>
            </ul>
            <div>
              <a href={reportUrl} target="_blank" rel="noreferrer">技術報告 <Arrow /></a>
              <a href={fastModelUrl} target="_blank" rel="noreferrer">Sotto 0.6B 模型 <Arrow /></a>
              <a href={qualityModelUrl} target="_blank" rel="noreferrer">Sotto 1.7B 模型 <Arrow /></a>
              <a href={repoUrl} target="_blank" rel="noreferrer">GitHub <Arrow /></a>
            </div>
          </details>

          <details className="method leaderboard">
            <summary>完整排行榜 <b>＋</b></summary>
            <p>每個系統都和 Google 翻譯逐句比較，數字是勝率。50% 代表和 Google 翻譯打平，平手算各半。</p>
            <table>
              <thead>
                <tr><th scope="col">#</th><th scope="col">系統</th><th scope="col">大小</th><th scope="col">對 Google 翻譯勝率</th></tr>
              </thead>
              <tbody>
                {leaderboard.map((row, index) => (
                  <tr key={row.name} className={row.ours ? "isOurs" : row.baseline ? "isBaseline" : undefined}>
                    <td>{row.baseline ? "—" : index + (index > 4 ? 0 : 1)}</td>
                    <th scope="row">{row.name}</th>
                    <td>{row.size}</td>
                    <td>
                      <div className="rateCell">
                        <div className="rateTrack"><i style={{ width: `${row.rate * 100}%` }} /><span className="rateMid" /></div>
                        <b>{(row.rate * 100).toFixed(1)}%</b>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>          </details>
        </div>
      </section>

      <section className="free shell" id="free">
        <div className="freeCopy">
          <p className="kicker">為什麼可以免費？</p>
          <h2>翻譯是你的電腦在做，<br />我們沒有伺服器要養。</h2>
          <p>一般翻譯服務每翻一個字都要付雲端的錢，所以會有月費、免費額度或字數上限。LocalSubs 直接用你的電腦來翻譯，我們這邊沒有成本，也就不用跟你收錢，更不用限制你一天看幾集。</p>
          <ul className="freePoints"><li>沒有付費版</li><li>不限集數</li><li>不用註冊</li></ul>
        </div>
        <div className="receipt" aria-label="LocalSubs 的月帳單是 0 元">
          <div className="receiptHead"><img src="/localsubs-logo.png" alt="" width="34" height="34" /><div><strong>LocalSubs</strong><span>本月帳單</span></div></div>
          <dl>
            <div><dt>看了幾集</dt><dd>不限</dd></div>
            <div><dt>翻了幾句</dt><dd>不限</dd></div>
            <div><dt>字數上限</dt><dd>沒有</dd></div>
            <div><dt>月費</dt><dd>NT$0</dd></div>
          </dl>
          <div className="receiptTotal"><span>合計</span><strong>NT$0</strong></div>
          <p className="receiptStamp">永遠免費</p>
        </div>
      </section>

      <section className="learning shell">
        <div className="sectionHeading learningHeading">
          <p className="kicker">追劇，順便讓英文不要生疏</p>
          <h2>不用特別撥時間學，<br />看劇的時候就在練了。</h2>
        </div>
        <div className="audienceGrid">
          <article className="audienceVoice">
            <span className="audienceTag">想聽原音的人</span>
            <div className="voiceDemo" aria-hidden="true">
              <div className="wave">{Array.from({ length: 28 }, (_, index) => <i key={index} style={{ "--i": index, height: 12 + ((index * 37) % 40) } as CSSProperties} />)}</div>
              <span>開什麼玩笑</span>
              <b>You&apos;ve got to be kidding me.</b>
            </div>
            <h3>聽演員本人怎麼說</h3>
            <p>喜歡原音的語氣，但英文還沒好到可以只看英文字幕。英文照看，卡住的時候往上看一眼就好。</p>
          </article>
          <article className="audienceHabit">
            <span className="audienceTag">想維持英文的人</span>
            <ol className="episodeTrail" aria-label="同一句話在不同集數的示意">
              <li><small>第 1 集</small><span style={{ opacity: 1 }}>今天就到此為止吧</span><b>Let&apos;s call it a day.</b><em>要看中文</em></li>
              <li><small>第 4 集</small><span style={{ opacity: .45 }}>今天就到此為止吧</span><b>Let&apos;s call it a day.</b><em>瞄一眼確認</em></li>
              <li><small>第 9 集</small><span style={{ opacity: .12 }}>今天就到此為止吧</span><b>Let&apos;s call it a day.</b><em>不用看了</em></li>
            </ol>
            <h3>同一句話，看久了就記住</h3>
            <p>沒時間上課，但每天都會看一兩集。常出現的說法一再遇到，慢慢就不用看中文了。</p>
          </article>
        </div>
      </section>

      <section className="faq shell" id="faq">
        <div className="sectionHeading faqHeading">
          <p className="kicker">常見問題</p>
          <h2>安裝前，你可能會想問</h2>
        </div>
        <div className="faqList">
          <details>
            <summary>HBO Max 可以同時開中英字幕嗎？<b>＋</b></summary>
            <p>原本不行，一次只能選一種。裝了 LocalSubs 之後開英文字幕，中文會自動加在英文上面。</p>
          </details>
          <details>
            <summary>真的免費嗎？以後會收費嗎？<b>＋</b></summary>
            <p>免費，也不用註冊。翻譯是在你的電腦上做的，我們沒有雲端成本，所以沒有收費的理由。</p>
          </details>
          <details>
            <summary>流暢模式和精準模式差在哪？<b>＋</b></summary>
            <p>流暢模式是預設，模型比較小，下載快，大部分電腦都跑得順。精準模式翻得比較好，但模型比較大（約 900 MB），適合效能比較好的電腦。在設定頁就能切換。</p>
          </details>
          <details>
            <summary>我的電腦跑得動嗎？<b>＋</b></summary>
            <p>近幾年的 Mac 和大部分 Windows 筆電都可以。如果瀏覽器不支援，設定頁會提示你改裝桌面元件，用 CPU 也能跑。</p>
          </details>
          <details>
            <summary>Windows 電腦沒有獨立顯示卡，要怎麼裝桌面元件？<b>＋</b></summary>
            <p>
              沒有獨立顯示卡也能用，桌面元件會改用 CPU 翻譯。安裝步驟比較多，我們錄了一支專門給這種情況的 Windows 安裝教學，照著做就好。
              <a className="faqLink" href={windowsSetupVideoUrl} target="_blank" rel="noreferrer">看安裝教學影片 <Arrow /></a>
            </p>
          </details>
          <details>
            <summary>支援哪些瀏覽器？<b>＋</b></summary>
            <p>macOS 和 Windows 上的 Chrome、Edge，以及其他 Chromium 瀏覽器。</p>
          </details>
          <details>
            <summary>有支援 Netflix 或 Disney+ 嗎？<b>＋</b></summary>
            <p>目前只支援 HBO Max。</p>
          </details>
          <details>
            <summary>字幕會被上傳嗎？<b>＋</b></summary>
            <p>不會。翻譯都在你的電腦上完成。</p>
          </details>
        </div>
      </section>

      <section className="finalCta shell">
        <div className="ctaMarquee" aria-hidden="true"><span>原文 · 中文 · 原文 · 中文 · 原文 · 中文 · </span><span>原文 · 中文 · 原文 · 中文 · 原文 · 中文 · </span></div>
        <div className="ctaContent">
          <img src="/localsubs-logo.png" alt="LocalSubs 圖示" width="78" height="78" />
          <h2>下一集，<br />開著雙字幕看。</h2>
          <p>免費，不用帳號，裝好就能用。</p>
          <a className="button buttonDark" href={storeUrl} target="_blank" rel="noreferrer"><ChromeIcon /> 免費加到 Chrome <Arrow /></a>
        </div>
      </section>

      <footer className="footer shell">
        <a className="brand footerBrand" href="#top"><img src="/localsubs-logo.png" alt="" width="34" height="34" /><span>LocalSubs</span></a>
        <p>免費的 HBO Max 中英雙字幕。</p>
        <div>
          <a href={repoUrl} target="_blank" rel="noreferrer">GitHub</a>
          <a href={`${repoUrl}/blob/main/PRIVACY.md`} target="_blank" rel="noreferrer">隱私權政策</a>
          <a href={storeUrl} target="_blank" rel="noreferrer">Chrome 商店</a>
          <a href={reportUrl} target="_blank" rel="noreferrer">技術報告</a>
        </div>
      </footer>
    </main>
  );
}
