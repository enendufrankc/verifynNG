import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Fingerprint,
  Layers3,
  PackageCheck,
  ScanLine,
  Sparkles,
  Activity,
} from 'lucide-react';
import { ProductIllustration } from './ProductIllustration';
import styles from './landing.module.css';

function Wordmark() {
  return (
    <span className={styles.wordmark}>
      <span className={styles.mark} aria-hidden="true">
        <i />
        <i />
      </span>
      verify<span className={styles.wordmarkDot}>.</span>
    </span>
  );
}

export function LandingPage({ adminBaseUrl }: { adminBaseUrl: string }) {
  const signupUrl = new URL('/signup', adminBaseUrl).toString();
  const loginUrl = new URL('/login', adminBaseUrl).toString();

  return (
    <div className={styles.page} lang="en">
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>
      <header className={styles.header}>
        <Link href="/" aria-label="Verify home">
          <Wordmark />
        </Link>
        <nav aria-label="Main navigation" className={styles.navigation}>
          <a href="#how-it-works">How it works</a>
          <a href="#for-brands">For brands</a>
        </nav>
        <a href={loginUrl} className={styles.signIn}>
          Sign in <ArrowUpRight aria-hidden="true" />
        </a>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span className={styles.eyebrowLine} /> PRODUCT AUTHENTICITY FOR
              YOUR BRAND
            </p>
            <h1 id="hero-title">
              Build trust into <br />
              every <span className={styles.highlight}>product.</span>
            </h1>
            <p className={styles.heroDescription}>
              Create secure QR codes and hidden verification labels for your
              products. Give customers a simple way to check authenticity, and
              your team a clearer view of every scan.
            </p>
            <div className={styles.actions}>
              <a href={signupUrl} className={styles.primaryButton}>
                Protect your brand
                <ArrowUpRight aria-hidden="true" />
              </a>
              <Link href="/verify" className={styles.secondaryButton}>
                <ScanLine aria-hidden="true" />
                Verify a product
                <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            <p className={styles.heroNote}>
              <span aria-hidden="true" className={styles.noteDot} />
              For product owners. Simple for their customers.
            </p>
          </div>
          <ProductIllustration />
        </section>

        <div className={styles.introStrip}>
          <p>
            Built for product owners.
            <br />
            <strong>Trusted connections, from pack to purchase.</strong>
          </p>
          <div>
            <Fingerprint aria-hidden="true" />
            <span>Secure codes & labels</span>
          </div>
          <div>
            <Activity aria-hidden="true" />
            <span>Scan insights & alerts</span>
          </div>
          <a href="#how-it-works" aria-label="Explore how Verify works">
            <ArrowDown aria-hidden="true" />
          </a>
        </div>

        <section
          id="how-it-works"
          className={styles.howSection}
          aria-labelledby="how-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>FROM YOUR BRAND TO THEIR HANDS</p>
              <h2 id="how-title">
                Your product.
                <br />A verifiable identity.
              </h2>
            </div>
            <p>
              Bring authenticity into your production process, then make it easy
              for customers to check the products they buy.
            </p>
          </div>
          <ol className={styles.steps}>
            <li>
              <span className={styles.stepNumber}>01 / CREATE</span>
              <ScanLine aria-hidden="true" />
              <h3>Create your product codes.</h3>
              <p>
                Add your products and create a batch of secure codes. Each item
                gets a public QR and a hidden code for individual verification.
              </p>
            </li>
            <li>
              <span className={styles.stepNumber}>02 / APPLY</span>
              <Layers3 aria-hidden="true" />
              <h3>Put trust on the packaging.</h3>
              <p>
                Prepare QR labels and send signed code manifests to your
                manufacturer. Keep the unit code under a seal or scratch-off
                panel.
              </p>
            </li>
            <li>
              <span className={styles.stepNumber}>03 / CONNECT</span>
              <PackageCheck aria-hidden="true" />
              <h3>Let customers check. Learn more.</h3>
              <p>
                Customers scan to learn about the product, then reveal the
                hidden code to verify their item. Your team can follow scans and
                investigate alerts.
              </p>
            </li>
          </ol>
          <Link href="/verify" className={styles.textLink}>
            Already holding a product? Verify it here{' '}
            <ArrowRight aria-hidden="true" />
          </Link>
        </section>

        <section
          id="for-brands"
          className={styles.brandSection}
          aria-labelledby="brand-title"
        >
          <div className={styles.brandCopy}>
            <p className={styles.eyebrow}>
              <Sparkles aria-hidden="true" /> FOR THE BRANDS BUILDING TRUST
            </p>
            <h2 id="brand-title">
              You make it.
              <br />
              Help them trust it.
            </h2>
            <p>
              Give every product a verifiable identity. Turn a simple scan into
              a connection between your brand and the people who choose it.
            </p>
            <a href={signupUrl} className={styles.primaryButton}>
              Protect your brand <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
          <div className={styles.brandFeatures}>
            <div>
              <Fingerprint aria-hidden="true" />
              <h3>Codes and labels, ready for production</h3>
              <p>
                Manage products, create code batches, and prepare the
                authenticity materials your manufacturer needs.
              </p>
            </div>
            <div>
              <Activity aria-hidden="true" />
              <h3>Visibility beyond the shelf</h3>
              <p>
                Follow verification activity and investigate unusual scan
                patterns.
              </p>
            </div>
            <div>
              <PackageCheck aria-hidden="true" />
              <h3>Your story, one scan away</h3>
              <p>
                Share product information and help customers know what they’re
                buying.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div>
          <Link href="/" aria-label="Verify home">
            <Wordmark />
          </Link>
          <p>Good products deserve to be trusted.</p>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/terms">Terms</Link>
          <Link href="/support">Support</Link>
          <Link href="/status">System status</Link>
        </nav>
        <p className={styles.footerCredit}>By Tunnel Light Verify Platform</p>
      </footer>
    </div>
  );
}
