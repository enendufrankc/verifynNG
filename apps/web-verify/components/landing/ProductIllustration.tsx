import { ArrowUpRight, Check, Fingerprint, ScanLine } from 'lucide-react';
import styles from './landing.module.css';

/** Decorative product example: contains no scannable or usable unit code. */
export function ProductIllustration() {
  return (
    <figure className={styles.illustration}>
      <div className={styles.scene} aria-hidden="true">
        <div className={styles.orbit} />
        <div className={styles.orbitInner} />
        <span className={styles.sceneCross}>+</span>
        <div className={styles.scanTag}>
          <ScanLine />
          <span>A story in every scan</span>
          <ArrowUpRight />
        </div>
        <div className={styles.carton}>
          <div className={styles.cartonTop} />
          <span className={styles.cartonBrand}>
            everyday
            <br />
            <b>essentials.</b>
          </span>
          <div className={styles.cartonArt}>
            <span />
            <span />
            <span />
          </div>
          <span className={styles.cartonBottom}>
            MADE WITH CARE.
            <br />
            CHECK WITH VERIFY.
          </span>
        </div>
        <div className={styles.bottle}>
          <div className={styles.bottleCap} />
          <div className={styles.bottleBody}>
            <span>
              everyday
              <br />
              <b>essentials.</b>
            </span>
            <div className={styles.bottleLabel}>
              <Fingerprint />
              <span>
                GOOD FROM
                <br />
                THE INSIDE OUT.
              </span>
            </div>
            <small>DAILY CARE</small>
          </div>
        </div>
        <div className={styles.phone}>
          <div className={styles.phoneCamera} />
          <div className={styles.phoneHeader}>
            verify<span>.</span>
            <span>EXAMPLE</span>
          </div>
          <div className={styles.resultBand}>
            <div className={styles.resultIcon}>
              <Check />
            </div>
            <strong>Authentic</strong>
            <p>First verification of this item</p>
          </div>
          <div className={styles.phoneProduct}>
            <span className={styles.miniProduct}>
              <Fingerprint />
            </span>
            <div>
              <strong>Everyday essentials</strong>
              <span>Daily care collection</span>
            </div>
          </div>
          <div className={styles.phoneDetails}>
            <span>
              Product identity
              <strong>
                Recognised <Check />
              </strong>
            </span>
            <span>
              Verification history<strong>First check</strong>
            </span>
          </div>
          <div className={styles.phoneFoot}>
            <Fingerprint /> A unique code. A clearer story.
          </div>
        </div>
        <div className={styles.identityTag}>
          <Fingerprint />
          <div>
            <strong>One product.</strong>
            <span>Its own identity.</span>
          </div>
        </div>
        <div className={styles.sceneDot} />
      </div>
      <figcaption>Illustrative verification result</figcaption>
    </figure>
  );
}
