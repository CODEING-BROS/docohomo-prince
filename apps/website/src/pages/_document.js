import Document, { Html, Head, Main, NextScript } from "next/document";

const defaultTitle = "Dochomoeo: Homoeopathic Medicine | Best Deals & Free Shipping";
const defaultDescription = "Buy homoeopathic medicine online in India with DocHomoeo. Get expert homoeopathic consultations & unparalleled service. Free consultation!"
const defaultOGImage = "/favicon.ico"
const oGImage = "https://ibb.co/bsb1zt9"
const defaultOGTitle = "Dochomoeo | Bringing You The Best Healthcare";
const defaultOGURL = "https://dochomoeo.com/";
const seoKeyWords = `online pharmacy, India medicines, discount, Product, sale, cart, view, shop, Dochomoeo,Homoeopathy, Homeopathic Medicine, Homoeopathic Treatment, Homoeopathic Remedies, Homoeopathic Clinic, Homoeopathic Doctor, Homoeopathic Pharmacy, Homoeopathic Consultation, Homoeopathic Remedies for [Specific Condition], Natural Healing with Homoeopathy, Homoeopathic Remedies List, Homoeopathy for [Specific Disease/Condition], Homoeopathy vs Conventional Medicine, Homoeopathic Principles, Benefits of Homoeopathy, Homoeopathy for Allergies, Homoeopathy for Anxiety, Homoeopathy for Skin Problems, Homoeopathy for Digestive Disorders, Homoeopathy for Insomnia, Homoeopathy for Children, Homoeopathy for Women's Health, Homoeopathy for Chronic Pain, Homoeopathy for Hormonal Imbalance, Homoeopathy for Weight Loss, Homoeopathy for Hair Loss, Homoeopathy for Depression, Homoeopathy for Arthritis, Homoeopathy for Respiratory Disorders, Homoeopathy for Stress Management`;
class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx);
    return { ...initialProps };
  }

  render() {
    return (
      <Html lang="en">
        <Head>
          {/* <meta
            name="Description"
            content="We are dedicated to revolutionizing healthcare by bridging the gap between patients and homoeopathic medicine. Our mission is to provide convenient access to high-quality homoeopathic medicines, expert medical consultations, and unparalleled service to people worldwide."
          /> */}

          {/* <title>{defaultTitle}</title> */}
          <meta name="robots" content="index, follow" />
          <meta name="description" content={defaultDescription} />

          <meta property="og:url" content={defaultOGURL} />
          <meta property="og:site_name" content="DocHomoeo" />
          <meta property="og:title" content={defaultOGTitle} />
          <meta property="og:image" content={oGImage} />
          <meta property="og:type" content="website" />
          <meta property="og:description" content={defaultDescription} />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="keywords" content={seoKeyWords} />

          {/* twitter */}
          <meta name="twitter:site" content={defaultOGURL} />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:image" content={oGImage} />

          {/* og image */}
          <meta property="og:image:width" content="270" />
          <meta property="og:image:height" content="270" />
          <link rel="canonical" href={defaultOGURL} />

          <meta
            name="google-site-verification"
            content="NREGhVXMRwYLfs9KHBEl05ve3pZ2pm-B44xQCdw-ZIc"
          />
          <meta
            name="google-site-verification"
            content="pf8AY9OawZhYITx0jUITN3kwz1HqL_qs0PpP1Aiuq1E"
          />
          {/* <link rel="icon" href="/fav.png" /> */}
          {/* <link rel="icon" href="/" /> */}
          <link
            href="https://kit-pro.fontawesome.com/releases/v5.13.0/css/pro.min.css"
            rel="stylesheet"
          />
          <link
            href="https://fonts.googleapis.com/css2?family=Spartan:wght@400;500;600;700;800;900&display=swap"
            rel="stylesheet"
          />
          <link
            href="https://fonts.googleapis.com/css2?family=Cambay:wght@400;700&display=swap"
            rel="stylesheet"
          />
          <script
            id="gtag-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `<!-- Google tag (gtag.js) -->
              <script async src="https://www.googletagmanager.com/gtag/js?id=G-XYY3P3LS4F"></script>
              <script>
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
              
                gtag('config', 'G-XYY3P3LS4F');
              </script>`,
            }}
          />
          <script
            src="https://www.googletagmanager.com/gtag/js?id=G-XYY3P3LS4F"
            async
            crossOrigin="anonymous"
            strategy="lazyOnload"
            id="google-tag-manager"
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: `
              {
                "@context": "http://schema.org",
                "@type": "WebSite",
                "name": "dochomoeo",
                "url": "https://dochomoeo.com"
              }`,
            }}
          />

          {/* <script dangerouslySetInnerHTML={{
            __html:`
            <!-- Google tag (gtag.js) -->
            <script async src="https://www.googletagmanager.com/gtag/js?id=G-2PKDHCQJHC"></script>
            <script>
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());

              gtag('config', 'G-2PKDHCQJHC');
            </script>`
          }} /> */}
        </Head>
        <body>
          <Main />
          <div id="nav-full" />
          <div id="nav-sidebar" />
          <div id="cart-sidebar" />
          <div id="overlay" />
          <div id="modal" />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
