import QRCode from 'qrcode';

export async function generateQrDataUrl(payload: string): Promise<string> {
  const trimmed = (payload || '').trim();
  if (!trimmed) return '';
  return QRCode.toDataURL(trimmed, {
    width: 320,
    margin: 2,
    color: {
      dark: '#142746',
      light: '#ffffff',
    },
  });
}

export async function compressQrImageFile(
  file: File,
  maxDimension = 520
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected QR file.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () =>
        reject(new Error('Invalid image file. Please choose PNG, JPG, or WebP.'));
      img.onload = () => {
        const scale = Math.min(
          1,
          maxDimension / Math.max(img.width || 1, img.height || 1)
        );
        const w = Math.max(1, Math.round((img.width || 300) * scale));
        const h = Math.max(1, Math.round((img.height || 300) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
