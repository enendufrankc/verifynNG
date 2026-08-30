import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#5AE9D7',
          color: '#131720',
          fontSize: 20,
          fontWeight: 700,
        }}
      >
        V
      </div>
    ),
    { ...size },
  );
}
