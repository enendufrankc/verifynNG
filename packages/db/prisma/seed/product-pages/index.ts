import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { uploadSeedImage, type SeedMediaRef } from './media';

const ASSETS = resolve(__dirname, 'assets');
const asset = (name: string) => resolve(ASSETS, name);

const THEME = {
  palette: {
    primary: '#C08A2D',
    accent: '#EAD7AE',
    bg: '#F8F3EA',
    ink: '#231C10',
  },
  fontDisplay: 'Cormorant Garamond',
  fontBody: 'Manrope',
};

interface VariantContent {
  slug: string;
  sku: string;
  title: string;
  eyebrow: string;
  sub: string;
  quote: string;
  attribution: string;
  body: string;
  storyHeading: string;
  reg: string;
  no: string;
  ingredients: { name: string; note: string }[];
  frontImage: string;
  backImage: string;
  seoTitle: string;
  seoDescription: string;
}

const TURMERIC: VariantContent = {
  slug: 'turmeric-curcumin',
  sku: 'ig004',
  title: 'Turmeric & Curcumin',
  eyebrow: 'Formulated in the United Kingdom',
  sub: 'A refreshing whitening & moisturizing shower gel formulated with turmeric, curcumin and vitamin C complex. Gently cleanses away dirt and impurities while helping leave skin feeling soft, smooth and refreshed.',
  quote:
    'One pump, and the whole bathroom smells like a garden at golden hour.',
  attribution: 'Adaeze, verified customer · Lagos',
  body: 'Whitening & moisturizing, formulated with turmeric & curcumin. Gently cleanses & nourishes while helping brighten dull-looking skin. A rich, spa-grade lather that rinses clean — never tight, never stripped.',
  storyHeading: 'Skin that remembers the glow.',
  reg: 'A12-0884L',
  no: 'NO:IG004',
  ingredients: [
    {
      name: 'Turmeric Root Oil',
      note: 'Curcuma Longa — the golden root traditionally cherished for its calming, brightening character.',
    },
    {
      name: 'Curcumin',
      note: 'The signature active of the turmeric root, included alongside turmeric oil in the fragrance system.',
    },
    {
      name: 'Vitamin C (3-o-Ethyl Ascorbic Acid)',
      note: 'A stable, oil-soluble vitamin C derivative that helps brighten dull-looking skin.',
    },
    {
      name: 'Centella Asiatica',
      note: 'Flower/leaf/stem extract — the classic soothing botanical for calm, comfortable skin.',
    },
    {
      name: 'Grape Skin Extract',
      note: 'Vitis Vinifera — antioxidant-rich botanical support from wine-country vineyards.',
    },
    {
      name: 'Walnut Shell Powder',
      note: 'Juglans Regia — a natural, gentle exfoliating touch for polished, refreshed skin.',
    },
  ],
  frontImage: 'turmeric-front.webp',
  backImage: 'turmeric-back.webp',
  seoTitle: 'Turmeric & Curcumin — IVORY GLOW',
  seoDescription:
    'IVORY GLOW Whitening & Moisturizing Shower Gel, formulated in the UK with turmeric, curcumin and vitamin C complex.',
};

const RETINOL: VariantContent = {
  slug: 'retinol-amino-acids',
  sku: 'ig005',
  title: 'Retinol & Amino Acids',
  eyebrow: 'Formulated in the United Kingdom',
  sub: 'A refreshing shower gel formulated with retinol, amino acids and ferulic acid. Gently cleanses away dirt and impurities while helping leave skin feeling soft, smooth and comfortable.',
  quote:
    "My shoulders have never felt this smooth — it's like the shower got upgraded.",
  attribution: 'Verified customer',
  body: 'Brightening & smoothing, formulated with retinol and a full complex of 17 skin amino acids. Gently cleanses without drying, helping smooth and soften skin with every wash.',
  storyHeading: 'A shower upgrade, one pump at a time.',
  reg: 'A12-0885L',
  no: 'NO:IG005',
  ingredients: [
    {
      name: 'Retinol',
      note: 'The gold-standard smoothing active — included at cosmetic levels for daily body care.',
    },
    {
      name: 'Amino Acid Complex',
      note: '17 skin-identical amino acids: glycine, serine, glutamic acid, arginine and more.',
    },
    {
      name: 'Ferulic Acid',
      note: 'An antioxidant acid that pairs beautifully with the brightening system.',
    },
  ],
  frontImage: 'retinol-front.webp',
  backImage: 'retinol-back.webp',
  seoTitle: 'Retinol & Amino Acids — IVORY GLOW',
  seoDescription:
    'IVORY GLOW shower gel formulated with retinol, amino acids and ferulic acid.',
};

const VITAMIN_C: VariantContent = {
  slug: 'vitamin-c-b3',
  sku: 'ig006',
  title: 'Vitamin C & B3 + Peptide 24',
  eyebrow: 'Formulated in the United Kingdom',
  sub: 'A refreshing shower gel formulated with vitamin C, vitamin B3 and collagen peptide 24. Gently cleanses away dirt and impurities while helping leave skin feeling soft, smooth and refreshed.',
  quote:
    "It smells like orange peel and expensive hotels. I'm on my third bottle.",
  attribution: 'Verified customer',
  body: 'Brightening & moisturizing, formulated with the vitamin C complex. This technology deeply cleanses & nourishes — two vitamin C forms, niacinamide and collagen peptide 24 in one wash.',
  storyHeading: 'Brightness, bottled.',
  reg: 'A12-0886L',
  no: 'NO:IG006',
  ingredients: [
    {
      name: 'Vitamin C (3-o-Ethyl Ascorbic Acid)',
      note: 'A stable vitamin C derivative that helps brighten dull-looking skin with every shower.',
    },
    {
      name: 'Vitamin B3 (Niacinamide)',
      note: 'The tone-evening classic — included in the brightening complex.',
    },
    {
      name: 'Collagen Peptide 24',
      note: "Peptide-24 moisture technology that supports the skin's moisture barrier.",
    },
  ],
  frontImage: 'vitc-front.webp',
  backImage: 'vitc-back.webp',
  seoTitle: 'Vitamin C & B3 + Peptide 24 — IVORY GLOW',
  seoDescription:
    'IVORY GLOW shower gel formulated with vitamin C, vitamin B3 and collagen peptide 24.',
};

function registrationBlock(v: VariantContent) {
  return {
    id: randomUUID(),
    type: 'registration' as const,
    heading: 'On the record.',
    items: [
      { label: 'NAFDAC Registration No.', value: v.reg },
      { label: 'Product Reference', value: v.no },
      { label: 'Category', value: 'Whitening & Moisturizing Shower Gel' },
      { label: 'Country of Formulation', value: 'United Kingdom' },
    ],
    cautions: [
      'External use only.',
      'Avoid contact with eyes — rinse thoroughly with water.',
      'Discontinue use if irritation occurs.',
      'Store in a cool, dry place away from direct sunlight.',
    ],
  };
}

function trademarkBlock(letterImage: SeedMediaRef) {
  return {
    id: randomUUID(),
    type: 'trademark' as const,
    heading: 'A name you can look up.',
    marks: [
      {
        name: 'TLG Ivory Glow',
        number: 'NG/TM/O/2020/11950',
        class: '3 — Cosmetics, Soaps & Perfumery',
        jurisdiction: 'Nigeria',
        imageRef: letterImage,
      },
    ],
  };
}

function howToUseBlock() {
  return {
    id: randomUUID(),
    type: 'how-to-use' as const,
    heading: 'Three minutes to ivory.',
    steps: [
      {
        title: 'Lather',
        body: 'Apply to wet skin or a bath sponge. Massage into a rich, creamy lather — a little goes a long way with the 1000ml pump.',
      },
      {
        title: 'Breathe',
        body: 'Let the actives sit for a moment. The warm botanical scent turns your shower into a slow ritual.',
      },
      {
        title: 'Rinse',
        body: 'Rinse thoroughly. Skin feels soft, smooth and refreshed — moisture locked in for up to 48 hours.',
      },
    ],
  };
}

function ingredientsBlock(v: VariantContent) {
  return {
    id: randomUUID(),
    type: 'ingredients' as const,
    heading: 'Actives with intention.',
    items: v.ingredients.map((i) => ({
      name: i.name,
      role: 'Key active',
      note: i.note,
    })),
  };
}

function storyBlock(v: VariantContent) {
  return {
    id: randomUUID(),
    type: 'story' as const,
    kicker: 'The Ritual',
    heading: v.storyHeading,
    paragraphs: [v.quote, v.body],
    attribution: v.attribution,
  };
}

function verificationEducationBlock() {
  return {
    id: randomUUID(),
    type: 'verification-education' as const,
    heading: 'Real product, or nothing.',
    body: 'Every IVORY GLOW bottle carries a unique batch number and verification code. Scan the QR on your bottle, or enter the code manually, to check yours against our registry.',
    showManualEntryLink: true,
  };
}

function batchInfoBlock() {
  return {
    id: randomUUID(),
    type: 'batch-info' as const,
    heading: 'This bottle',
    showOem: true,
    showCommissionDate: true,
  };
}

function heroBlock(v: VariantContent, front: SeedMediaRef, back: SeedMediaRef) {
  return {
    id: randomUUID(),
    type: 'hero' as const,
    eyebrow: v.eyebrow,
    title: v.title,
    subtitle: v.sub,
    stats: [
      { value: '1000ml', label: 'Family Size' },
      { value: '48hrs', label: 'Lasting Moisture' },
      { value: '25+', label: 'Skin Actives' },
    ],
    ctaPrimary: { label: 'Verify Authenticity', href: '#verify' },
    image: front,
    variantImages: [back],
  };
}

function galleryBlock(items: { media: SeedMediaRef; caption: string }[]) {
  return {
    id: randomUUID(),
    type: 'gallery' as const,
    heading: 'Every angle, every drop.',
    items,
  };
}

async function buildPage(
  prisma: PrismaClient,
  tenantId: string,
  actorId: string,
  v: VariantContent,
) {
  const front = await uploadSeedImage(
    prisma,
    tenantId,
    asset(v.frontImage),
    `${v.title} bottle, front`,
    actorId,
  );
  const back = await uploadSeedImage(
    prisma,
    tenantId,
    asset(v.backImage),
    `${v.title} bottle, back`,
    actorId,
  );

  const blocks = [
    heroBlock(v, front, back),
    storyBlock(v),
    ingredientsBlock(v),
    howToUseBlock(),
    batchInfoBlock(),
    verificationEducationBlock(),
    registrationBlock(v),
  ];

  return {
    blocks,
    seo: { title: v.seoTitle, description: v.seoDescription },
  };
}

/**
 * T12 — IVORY GLOW seed content. Turmeric ships published (the AC1 fixture);
 * Retinol/Vitamin C ship draft-only so the builder has a realistic list.
 * Uploads real images through the T4 pipeline (sharp variants, MinIO) —
 * this is what makes it a functional smoke test of the whole epic, not just
 * fixture JSON.
 */
export async function seedProductPages(
  prisma: PrismaClient,
  tenantId: string,
  productIds: string[],
  actorId: string,
): Promise<void> {
  const [turmericProductId, retinolProductId, vitcProductId] = productIds;

  // ── Turmeric & Curcumin — published, with a gallery + trademark letter ──
  const turmericPage = await prisma.productPage.upsert({
    where: { tenantId_slug: { tenantId, slug: TURMERIC.slug } },
    update: {},
    create: {
      tenantId,
      productId: turmericProductId,
      slug: TURMERIC.slug,
      draftTheme: THEME,
      draftBlocks: [],
      draftSeo: {},
      createdById: actorId,
    },
  });

  if (turmericPage.status === 'draft') {
    const { blocks, seo } = await buildPage(
      prisma,
      tenantId,
      actorId,
      TURMERIC,
    );

    const modelImages = await Promise.all(
      ['model-2.webp', 'model-5.webp', 'model-8.webp'].map((f, i) =>
        uploadSeedImage(
          prisma,
          tenantId,
          asset(f),
          `In use, photo ${i + 1}`,
          actorId,
        ),
      ),
    );
    const gallery = galleryBlock(
      modelImages.map((media, i) => ({
        media,
        caption: `In the wild ${i + 1}`,
      })),
    );
    const letter = await uploadSeedImage(
      prisma,
      tenantId,
      asset('trademark-letter.webp'),
      'Trademark acceptance letter — TLG Ivory Glow, File No. NG/TM/O/2020/11950',
      actorId,
    );

    // Insert the gallery before "how-to-use" and swap the plain trademark
    // block for one carrying the registry-letter image.
    const withGallery = [...blocks.slice(0, 3), gallery, ...blocks.slice(3)];
    const withTrademark = [...withGallery, trademarkBlock(letter)];

    await prisma.productPage.update({
      where: { id: turmericPage.id },
      data: { draftBlocks: withGallery, draftSeo: seo },
    });

    const version = await prisma.productPageVersion.create({
      data: {
        tenantId,
        productPageId: turmericPage.id,
        version: 1,
        schemaVersion: 1,
        theme: THEME,
        blocks: withTrademark,
        seo,
        changeNote: 'Initial seed',
        publishedById: actorId,
      },
    });

    await prisma.productPage.update({
      where: { id: turmericPage.id },
      data: {
        status: 'published',
        publishedVersionId: version.id,
        publishedAt: version.publishedAt,
        draftBlocks: withTrademark,
      },
    });
  }

  // ── Retinol / Vitamin C — draft only, so the builder has a realistic list ──
  for (const [productId, v] of [
    [retinolProductId, RETINOL],
    [vitcProductId, VITAMIN_C],
  ] as const) {
    const existing = await prisma.productPage.findUnique({
      where: { tenantId_slug: { tenantId, slug: v.slug } },
    });
    if (existing) continue;

    const { blocks, seo } = await buildPage(prisma, tenantId, actorId, v);
    await prisma.productPage.create({
      data: {
        tenantId,
        productId,
        slug: v.slug,
        draftTheme: THEME,
        draftBlocks: blocks,
        draftSeo: seo,
        createdById: actorId,
      },
    });
  }
}
