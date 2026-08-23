import { siteDescription, siteUrl, storeUrl } from "./site";

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
      sameAs: [
        storeUrl,
        "https://github.com/aiden1020/localsubs",
        "https://huggingface.co/Aiden1020/LocalSubs-EN-ZH-TW-0.6B",
        "https://arxiv.org/abs/2607.09957",
      ],
    },
  ],
};

const Arrow = () => <span aria-hidden="true">↗</span>;
const ChromeIcon = () => <img className="chromeIcon" src="/chrome.webp" alt="" width="18" height="18" />;

export default function Home() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <nav className="nav shell" aria-label="主要導覽">
        <a className="brand" href="#top" aria-label="LocalSubs 首頁">
          <img src="/localsubs-logo.png" alt="" width="42" height="42" />
          <span>LocalSubs</span>
        </a>
        <div className="navLinks">
          <a href="#experience">雙字幕體驗</a>
          <a href="#how">使用方式</a>
          <a href="#privacy">隱私</a>
          <a href="#quality">品質評測</a>
          <a className="button buttonDark buttonSmall" href={storeUrl} target="_blank" rel="noreferrer">
            <ChromeIcon /> 免費加到 Chrome <Arrow />
          </a>
        </div>
      </nav>

      <section className="hero shell" id="top">
        <div className="heroCopy">
          <div className="eyebrow"><span /> 免費 HBO MAX 英文 × 繁中雙字幕 CHROME 擴充功能</div>
          <h1>在 HBO Max 看原文，<br /><em>也跟得上劇情。</em></h1>
          <p className="lede">
            LocalSubs 是免費 Chrome 擴充功能，在 HBO Max 同步閱讀英文原句與針對台灣用語優化的繁中翻譯。
          </p>
          <div className="heroActions">
            <a className="button buttonAccent" href={storeUrl} target="_blank" rel="noreferrer">
              <ChromeIcon /> 免費加到 Chrome <Arrow />
            </a>
            <a className="textLink" href="#experience">看看怎麼運作 <span aria-hidden="true">↓</span></a>
          </div>
          <div className="trustLine"><span>完全免費</span><span>台灣繁中優化</span><span>英文＋繁中同步</span></div>
        </div>

        <div className="playerWrap" aria-label="LocalSubs 雙字幕效果示意">
          <div className="orbit orbitOne" /><div className="orbit orbitTwo" />
          <div className="player">
            <div className="playerTop"><span className="live"><i /> 即時雙字幕</span><span className="quality">原文優先</span></div>
            <div className="sceneGlow" /><div className="sceneFigure figureOne" /><div className="sceneFigure figureTwo" />
            <div className="subtitleGroup">
              <p className="subtitleOriginal">We don&apos;t need to leave this room.</p>
              <p className="subtitleTranslated">我們不需要離開這個房間。</p>
              <div className="translationMeta"><span>英文原文</span><b>＋</b><span>繁中輔助</span><i>裝置內翻譯</i></div>
            </div>
            <div className="playerControls"><span>▶</span><div><i /></div><time>18:24 / 42:08</time><b>CC</b></div>
          </div>
          <div className="modelChip"><img src="/localsubs-logo.png" alt="" width="36" height="36" /><div><strong>完全免費</strong><span>不用月費，也不需帳號</span></div><i /></div>
        </div>
      </section>

      <section className="qualityProof shell" id="quality">
        <div className="qualityCopy">
          <p className="kicker">針對台灣繁中優化</p>
          <h2>不是簡轉繁，<br />是台灣人會讀的字幕。</h2>
          <p>針對台灣常用詞、語序與影集對白口吻調校，讓繁中不只是看得懂，也讀得自然。</p>
        </div>
        <div className="qualityMetric" aria-label="LocalSubs 與 GPT-4o mini 字幕評測比較">
          <div><strong>91.7%</strong><span>相對 GPT-4o mini<br />基準勝率</span></div>
          <p>500 句字幕評測中，LocalSubs 為 <b>59.2%</b>，GPT-4o mini 為 <b>64.6%</b>，只差 5.4 個百分點。</p>
          <details>
            <summary>查看評測方法與限制 <b>＋</b></summary>
            <p>OpenSubtitles2024 固定 500 句；兩者分別與 Google Translate 成對比較，由 GPT-4o 評審並排除平手，並非兩者逐句直接對決。實驗未保留 GPT-4o 的精確 API 快照與逐字評審提示。</p>
            <div><a href="https://arxiv.org/abs/2607.09957" target="_blank" rel="noreferrer">技術報告 <Arrow /></a><a href="https://huggingface.co/Aiden1020/LocalSubs-EN-ZH-TW-0.6B" target="_blank" rel="noreferrer">模型 <Arrow /></a><a href="https://github.com/aiden1020/localsubs" target="_blank" rel="noreferrer">開源專案 <Arrow /></a></div>
          </details>
        </div>
      </section>

      <section className="experience shell" id="experience">
        <div className="sectionHeading">
          <p className="kicker">HBO Max 已經有字幕，為什麼還需要 LocalSubs？</p>
          <h2>不用在英文和繁中之間二選一。</h2>
          <p>HBO Max 一次只能顯示一種字幕。LocalSubs 保留英文原句，再用繁中補上沒聽懂的地方。</p>
        </div>
        <div className="dualChoice" aria-label="HBO Max 單字幕與 LocalSubs 雙字幕比較">
          <div className="singleChoice">
            <span className="choiceLabel">HBO MAX 原生字幕</span>
            <div><b>只看英文</b><strong>看見原句</strong><p>但沒聽懂的關鍵句只能靠猜。</p></div>
            <div><b>只看繁中</b><strong>跟上劇情</strong><p>但看不到演員真正說了什麼。</p></div>
          </div>
          <div className="dualChoiceAnswer">
            <span className="choiceLabel">LOCALSUBS 雙字幕</span>
            <h3>英文原句一直在，<br />繁中在需要時補上。</h3>
            <div className="choiceSubtitles"><strong>I wouldn&apos;t count on it.</strong><span>我不會抱太大希望。</span></div>
            <div className="choiceBenefits"><span>保留原文語感</span><span>補上理解缺口</span><span>追劇不中斷</span></div>
          </div>
        </div>
      </section>

      <section className="how shell" id="how">
        <div className="howIntro">
          <p className="kicker">第一次設定後，就能直接追劇</p>
          <h2>三個步驟，<br />開始用原文看進去。</h2>
          <p>支援 macOS 與 Windows 桌面版 Chrome、Chromium 和 Microsoft Edge。</p>
        </div>
        <ol className="stepList">
          <li><span>01</span><div><h3>免費加到 Chrome</h3><p>從 Chrome 線上應用程式商店免費安裝 LocalSubs，不用月費。</p></div><b>安裝擴充功能</b></li>
          <li><span>02</span><div><h3>完成一次本機設定</h3><p>首次開啟時下載離線翻譯功能，之後字幕就能直接在裝置上處理。</p></div><b>只需設定一次</b></li>
          <li><span>03</span><div><h3>打開 HBO Max</h3><p>開啟英文字幕並開始播放，LocalSubs 會同步加入繁中翻譯。</p></div><b>開始雙字幕</b></li>
        </ol>
      </section>

      <section className="privacy" id="privacy">
        <div className="shell privacyGrid">
          <div className="privacyCopy">
            <p className="kicker">不用把字幕送出去</p>
            <h2>直接在電腦上翻，<br />不必呼叫外部服務。</h2>
            <p>LocalSubs 直接使用你的電腦完成翻譯，不需要連線呼叫外部翻譯服務，也不會把字幕文字送出去。</p>
            <div className="privacyPoints"><span>不需建立帳號</span><span>不記錄觀看內容</span><span>不含廣告或追蹤分析</span></div>
          </div>
          <div className="privacyVisual" aria-label="字幕翻譯全程只在你的電腦上完成，不會傳送給外部翻譯服務">
            <div className="localMachine">
              <div className="machineHeader"><span>全部在你的電腦裡完成</span><b><i /> 不呼叫外部服務</b></div>
              <div className="privateFlow">
                <div className="flowStep"><small>HBO MAX 英文字幕</small><strong>How did you know?</strong></div>
                <span className="flowArrow" aria-hidden="true">→</span>
                <div className="flowStep flowLocal"><img src="/localsubs-logo.png" alt="" width="38" height="38" /><small>LOCALSUBS</small><strong>本機翻譯</strong></div>
                <span className="flowArrow" aria-hidden="true">→</span>
                <div className="flowStep flowResult"><small>繁中字幕</small><strong>你怎麼知道的？</strong></div>
              </div>
              <div className="machineStatus"><span>字幕文字</span><i /><b>全程留在這台電腦</b></div>
            </div>
          </div>
        </div>
      </section>

      <section className="learning shell">
        <div className="sectionHeading learningHeading">
          <p className="kicker">保持接觸，不必把追劇變成上課</p>
          <h2>每天多看懂一點原文，<br />語感就在不知不覺中累積。</h2>
        </div>
        <div className="audienceGrid">
          <article>
            <span className="audienceTag">輕鬆追劇</span>
            <h3>想保留原音、原句的觀眾</h3>
            <p>用英文字幕對上演員的聲音，再用繁中快速確認。不是為了上課，只是不想放棄原文的感覺。</p>
          </article>
          <article>
            <span className="audienceTag">持續學習</span>
            <h3>想用影集維持英文接觸的人</h3>
            <p>不用另外安排學習時間。每一集都是自然輸入，讓熟悉的句型和用字慢慢累積起來。</p>
          </article>
        </div>
      </section>

      <section className="faq shell" id="faq">
        <div className="sectionHeading faqHeading">
          <p className="kicker">常見問題</p>
          <h2>安裝前，先確認這幾件事。</h2>
        </div>
        <div className="faqList">
          <details>
            <summary>HBO Max 可以同時顯示中英雙字幕嗎？<b>＋</b></summary>
            <p>HBO Max 原生一次只能顯示一種字幕。安裝 LocalSubs 後，開啟英文字幕即可在同一個播放畫面同步加入繁中翻譯。</p>
          </details>
          <details>
            <summary>LocalSubs 需要付費或建立帳號嗎？<b>＋</b></summary>
            <p>不需要。LocalSubs 完全免費，不收月費，也不需要註冊帳號。</p>
          </details>
          <details>
            <summary>支援哪些電腦與瀏覽器？<b>＋</b></summary>
            <p>支援 macOS 與 Windows 桌面版 Chrome、Chromium 和 Microsoft Edge。</p>
          </details>
          <details>
            <summary>字幕文字會傳送到外部翻譯服務嗎？<b>＋</b></summary>
            <p>不會。翻譯直接在你的電腦上完成，不需要呼叫外部翻譯服務。</p>
          </details>
        </div>
      </section>

      <section className="finalCta shell">
        <div className="ctaMarquee" aria-hidden="true">原文 · 繁中 · 原文 · 繁中</div>
        <div className="ctaContent">
          <img src="/localsubs-logo.png" alt="LocalSubs 圖示" width="78" height="78" />
          <h2>免費開啟 HBO Max<br />英文＋繁中雙字幕。</h2>
          <p>不用月費，也不需建立帳號。</p>
          <a className="button buttonDark" href={storeUrl} target="_blank" rel="noreferrer"><ChromeIcon /> 免費加到 Chrome，開啟雙語字幕 <Arrow /></a>
        </div>
      </section>

      <footer className="footer shell">
        <a className="brand footerBrand" href="#top"><img src="/localsubs-logo.png" alt="" width="34" height="34" /><span>LocalSubs</span></a>
        <p>在 HBO Max 看原文，也跟得上劇情。</p>
        <div><a href="https://github.com/aiden1020/localsubs" target="_blank" rel="noreferrer">GitHub</a><a href="https://github.com/aiden1020/localsubs/blob/main/PRIVACY.md" target="_blank" rel="noreferrer">隱私</a><a href={storeUrl} target="_blank" rel="noreferrer">Chrome 商店</a></div>
      </footer>
    </main>
  );
}
