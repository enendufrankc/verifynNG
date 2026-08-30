import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

// A minimal 100x100 red JPEG with GPS EXIF, built via sharp's withExif option.
const buf = await sharp({
  create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 30, b: 30 } },
})
  .jpeg()
  .withExif({
    IFD0: { Make: 'TestCam' },
    // sharp keys the GPS IFD as IFD3, not "GPS" — see sharp's own
    // withExif() doc example (lib/output.js).
    IFD3: {
      GPSLatitudeRef: 'N',
      GPSLatitude: '37/1 46/1 2000/100',
      GPSLongitudeRef: 'W',
      GPSLongitude: '122/1 25/1 1000/100',
    },
  })
  .toBuffer();
writeFileSync('apps/api/test/fixtures/photo-with-gps.jpg', buf);

// Not actually a JPEG — PDF magic bytes with a .jpg extension, for the
// magic-byte-mismatch rejection test.
writeFileSync('apps/api/test/fixtures/not-an-image.jpg', Buffer.from('%PDF-1.4\n%fake pdf bytes for testing\n'));
console.log('Fixtures written.');
