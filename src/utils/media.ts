import type {
  Bundle,
  CertificateTemplateConfig,
  Course,
  CustomCertificateRecord,
  PortalSettings,
  User,
} from '../types/lms';

/**
 * Crops and compresses any image into YouTube 16:9 thumbnail ratio (1280x720).
 */
export async function compressThumbnail16x9(
  file: File,
  targetW = 1280,
  targetH = 720
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error('Could not read the selected thumbnail image.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () =>
        reject(new Error('Invalid image file. Please select PNG, JPG, or WebP.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        const srcW = img.width || targetW;
        const srcH = img.height || targetH;
        const targetRatio = targetW / targetH;
        const srcRatio = srcW / srcH;

        let sx = 0;
        let sy = 0;
        let sw = srcW;
        let sh = srcH;

        if (srcRatio > targetRatio) {
          sw = srcH * targetRatio;
          sx = (srcW - sw) / 2;
        } else {
          sh = srcW / targetRatio;
          sy = (srcH - sh) / 2;
        }

        ctx.fillStyle = '#142746';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses Admin signature photo while preserving PNG transparency.
 */
export async function compressSignatureImage(
  file: File,
  maxW = 600,
  maxH = 240
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error('Could not read selected signature photo.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onerror = () =>
        reject(new Error('Invalid image. Upload PNG, JPG, or WebP signature.'));
      img.onload = () => {
        const scale = Math.min(
          1,
          maxW / (img.width || maxW),
          maxH / (img.height || maxH)
        );
        const w = Math.max(1, Math.round((img.width || 300) * scale));
        const h = Math.max(1, Math.round((img.height || 120) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Reads an Admin-uploaded custom certificate artwork (High-res image up to 2480px wide or PDF).
 */
export async function readCertificateAssetFile(file: File): Promise<{
  dataUrl: string;
  isPdf: boolean;
  fileName: string;
}> {
  const fileName = file.name || 'certificate';
  const isPdf =
    file.type === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    if (file.size > 6 * 1024 * 1024) {
      throw new Error('PDF certificate must be under 6 MB.');
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read PDF file.'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(file);
    });
    return { dataUrl, isPdf: true, fileName };
  }

  // Image: keep crisp high-resolution A4 print detail (up to 2480px)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error('Could not read certificate image.'));
    reader.onload = () => {
      const raw = String(reader.result || '');
      const img = new Image();
      img.onerror = () =>
        reject(new Error('Please select a valid PNG, JPG, WebP, or PDF file.'));
      img.onload = () => {
        const maxDim = 2480;
        const scale = Math.min(
          1,
          maxDim / Math.max(img.width || 1, img.height || 1)
        );
        const w = Math.max(1, Math.round((img.width || 1600) * scale));
        const h = Math.max(1, Math.round((img.height || 1131) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(raw);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });

  return { dataUrl, isPdf: false, fileName };
}

export interface ResolvedCertificateView {
  targetType: 'course' | 'bundle';
  targetId: string;
  targetTitle: string;
  categoryLabel: string;
  includedCourses?: string[];
  certificateNo: string;
  issuedDate: string;
  mode: 'template' | 'uploaded';
  uploadedUrl?: string;
  uploadedFileName?: string;
  heading: string;
  subheading: string;
  recipientName: string;
  recipientGuardian?: string;
  recipientAddressLine?: string;
  recipientEnrollmentNo?: string;
  bodyText: string;
  signerName: string;
  signatureUrl?: string;
  footerText: string;
  sealText: string;
  brandName: string;
  notes?: string;
}

export function resolveCertificateViewData(params: {
  targetType: 'course' | 'bundle';
  course?: Course | null;
  bundle?: Bundle | null;
  allCourses?: Course[];
  user: User;
  settings: PortalSettings;
  customRecords?: CustomCertificateRecord[];
}): ResolvedCertificateView {
  const {
    targetType,
    course,
    bundle,
    allCourses = [],
    user,
    settings,
    customRecords = [],
  } = params;

  const targetId = targetType === 'bundle' ? bundle?.id || '' : course?.id || '';
  const targetRecord = customRecords.find(
    (r) =>
      r.studentId === user.id &&
      r.targetType === targetType &&
      r.targetId === targetId
  );

  const tpl: CertificateTemplateConfig =
    (targetType === 'bundle'
      ? bundle?.certificateConfig
      : course?.certificateConfig) || {};

  const isUploaded =
    (targetRecord?.mode === 'uploaded' && Boolean(targetRecord.fileUrl)) ||
    (tpl.mode === 'uploaded' && Boolean(tpl.customTemplateUrl));

  const uploadedUrl =
    targetRecord?.mode === 'uploaded' && targetRecord.fileUrl
      ? targetRecord.fileUrl
      : tpl.customTemplateUrl || '';

  const uploadedFileName =
    targetRecord?.mode === 'uploaded' && targetRecord.fileName
      ? targetRecord.fileName
      : tpl.customTemplateName || '';

  const baseTitle =
    targetRecord?.targetTitle ||
    tpl.certificateTitle ||
    (targetType === 'bundle' ? bundle?.name || 'Bundle Certification' : course?.title || 'Course Certification');

  const rawHeading =
    targetRecord?.customHeading ||
    tpl.heading ||
    settings.certHeading ||
    'Certificate of Achievement';

  // Split heading nicely into gold main line + secondary line
  const parts = rawHeading.trim().split(/\s+of\s+/i);
  const heading = parts.length >= 2 ? 'CERTIFICATE' : rawHeading.toUpperCase();
  const subheading =
    parts.length >= 2 ? `OF ${parts.slice(1).join(' OF ').toUpperCase()}` : 'OF ACHIEVEMENT';

  const defaultBody =
    targetType === 'bundle'
      ? `has successfully completed all tax & compliance modules included in the comprehensive bundle program`
      : settings.certSub || 'has successfully completed the practical course curriculum';

  const bodyText = targetRecord?.customSubtitle || tpl.subtitle || defaultBody;

  const addressParts = [user.address, user.city, user.state, user.pincode]
    .map((x) => (x || '').trim())
    .filter(Boolean);

  const issuedDate = targetRecord?.issuedDate
    ? new Date(targetRecord.issuedDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });

  const shortSuffix = (targetId || 'ATP').slice(-4).toUpperCase();
  const userSuffix = (user.id || '001').slice(-4).toUpperCase();
  const defaultCertNo = `ATP-${new Date().getFullYear()}-${userSuffix}-${shortSuffix}`;

  const includedCourses =
    targetType === 'bundle' && bundle
      ? bundle.courseIds
          .map((id) => allCourses.find((c) => c.id === id)?.title)
          .filter((x): x is string => Boolean(x))
      : undefined;

  return {
    targetType,
    targetId,
    targetTitle: baseTitle,
    categoryLabel:
      targetType === 'bundle'
        ? 'Complete Bundle Certification'
        : course?.category || 'Tax & Compliance',
    includedCourses,
    certificateNo: targetRecord?.certificateNo || defaultCertNo,
    issuedDate,
    mode: isUploaded ? 'uploaded' : 'template',
    uploadedUrl,
    uploadedFileName,
    heading,
    subheading,
    recipientName:
      user.role === 'admin' ? 'Student Full Name (Preview)' : user.name,
    recipientGuardian:
      user.role === 'admin'
        ? user.guardianName || 'Guardian Name'
        : user.guardianName || undefined,
    recipientAddressLine:
      addressParts.length > 0
        ? addressParts.join(', ')
        : user.role === 'admin'
          ? 'Student Postal Address, City, State - PIN'
          : undefined,
    recipientEnrollmentNo: user.enrollmentNo || `REG-${userSuffix}`,
    bodyText,
    signerName: tpl.signerName || settings.certSigner || 'Authorized Signatory',
    signatureUrl: settings.certSignatureUrl || '',
    footerText:
      tpl.footerText ||
      settings.certFooter ||
      `This certificate is issued by ${settings.brand}`,
    sealText: settings.certSealText || 'CERTIFIED',
    brandName: settings.brand || 'ARYA TAX PATHSHALA',
    notes: targetRecord?.notes || undefined,
  };
}

function loadImgElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Renders and downloads an exact A4 Landscape (3508 x 2480 px at 300 DPI)
 * high-resolution certificate PNG matching the Navy & Metallic Gold diagonal template.
 */
export async function downloadA4CertificatePng(
  data: ResolvedCertificateView
): Promise<void> {
  if (data.mode === 'uploaded' && data.uploadedUrl) {
    const a = document.createElement('a');
    a.href = data.uploadedUrl;
    const isPdf = data.uploadedUrl.startsWith('data:application/pdf');
    a.download = isPdf
      ? `${data.certificateNo}_${data.targetTitle.replace(/\W+/g, '_')}.pdf`
      : `${data.certificateNo}_${data.targetTitle.replace(/\W+/g, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  // Exact A4 Landscape at 300 DPI: 297mm x 210mm => 3508 x 2480 px
  const W = 3508;
  const H = 2480;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Base warm ivory card background
  ctx.fillStyle = '#fdfcf8';
  ctx.fillRect(0, 0, W, H);

  // Subtle radial warmth
  const bgGrad = ctx.createRadialGradient(W * 0.45, H * 0.45, 100, W * 0.5, H * 0.5, W * 0.7);
  bgGrad.addColorStop(0, '#ffffff');
  bgGrad.addColorStop(1, '#f4efe4');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Outer Navy Frame border & inner gold frame
  ctx.strokeStyle = '#13243f';
  ctx.lineWidth = 28;
  ctx.strokeRect(14, 14, W - 28, H - 28);

  ctx.strokeStyle = '#c89b3c';
  ctx.lineWidth = 6;
  ctx.strokeRect(64, 64, W - 128, H - 128);

  // Top-right Navy & Gold diagonal sweep (matches reference image)
  ctx.save();
  const goldGradTop = ctx.createLinearGradient(W * 0.55, 0, W, H * 0.36);
  goldGradTop.addColorStop(0, '#b8862d');
  goldGradTop.addColorStop(0.5, '#f2da91');
  goldGradTop.addColorStop(1, '#a67622');

  ctx.fillStyle = goldGradTop;
  ctx.beginPath();
  ctx.moveTo(W * 0.54, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H * 0.37);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#13243f';
  ctx.beginPath();
  ctx.moveTo(W * 0.60, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H * 0.31);
  ctx.closePath();
  ctx.fill();

  // Bottom-left Navy & Gold diagonal ribbon
  const goldGradBot = ctx.createLinearGradient(0, H * 0.72, W, H);
  goldGradBot.addColorStop(0, '#b5842a');
  goldGradBot.addColorStop(0.45, '#f4dd95');
  goldGradBot.addColorStop(1, '#9e6d1c');

  ctx.fillStyle = goldGradBot;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.63);
  ctx.lineTo(W * 0.38, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#13243f';
  ctx.beginPath();
  ctx.moveTo(0, H * 0.69);
  ctx.lineTo(W * 0.31, H);
  ctx.lineTo(W, H);
  ctx.lineTo(W, H * 0.85);
  ctx.lineTo(0, H * 0.92);
  ctx.closePath();
  ctx.fill();

  // Accent thin gold stripe along bottom navy seam
  ctx.strokeStyle = goldGradBot;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.89);
  ctx.lineTo(W, H * 0.82);
  ctx.stroke();
  ctx.restore();

  // Top Header Text (Brand + Certificate Serial)
  ctx.fillStyle = '#13243f';
  ctx.font = 'bold 46px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillText(data.brandName.toUpperCase(), 210, 210);

  ctx.fillStyle = '#64748b';
  ctx.font = '600 32px "JetBrains Mono", monospace';
  ctx.fillText(
    `Certificate No: ${data.certificateNo}   ·   ID: ${data.recipientEnrollmentNo || ''}`,
    210,
    270
  );

  // CERTIFICATE Heading in Gold
  ctx.fillStyle = '#c4963b';
  ctx.font = 'bold 148px Georgia, "Times New Roman", serif';
  ctx.fillText(data.heading, 210, 480);

  // Subheading (OF ACHIEVEMENT) + horizontal gold rule
  ctx.fillStyle = '#13243f';
  ctx.font = '700 54px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillText(data.subheading, 214, 575);
  const subW = ctx.measureText(data.subheading).width;
  ctx.strokeStyle = '#c4963b';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(214 + subW + 40, 558);
  ctx.lineTo(1550, 558);
  ctx.stroke();

  // Presented to
  ctx.fillStyle = '#475569';
  ctx.font = '500 46px Georgia, serif';
  ctx.fillText('This certificate is proudly presented to', 214, 730);

  // Student Full Name
  ctx.fillStyle = '#13243f';
  ctx.font = 'bold 124px Georgia, "Times New Roman", serif';
  ctx.fillText(data.recipientName, 214, 900);

  // Underline under name
  ctx.strokeStyle = '#d4a64a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(214, 940);
  ctx.lineTo(2200, 940);
  ctx.stroke();

  let cursorY = 1020;

  // Student Guardian & Address details (from Student profile)
  const metaParts: string[] = [];
  if (data.recipientGuardian) {
    metaParts.push(`S/O / D/O: ${data.recipientGuardian}`);
  }
  if (data.recipientAddressLine) {
    metaParts.push(`Address: ${data.recipientAddressLine}`);
  }
  if (metaParts.length > 0) {
    ctx.fillStyle = '#334155';
    ctx.font = '500 38px "DM Sans", Arial, sans-serif';
    const metaLines = wrapCanvasText(ctx, metaParts.join('  ·  '), 2500);
    for (const line of metaLines.slice(0, 2)) {
      ctx.fillText(line, 214, cursorY);
      cursorY += 54;
    }
    cursorY += 24;
  }

  // Course / Bundle completion wording
  ctx.fillStyle = '#475569';
  ctx.font = '400 44px "DM Sans", Arial, sans-serif';
  const bodyLines = wrapCanvasText(ctx, data.bodyText, 2400);
  for (const line of bodyLines.slice(0, 3)) {
    ctx.fillText(line, 214, cursorY);
    cursorY += 64;
  }

  cursorY += 35;
  ctx.fillStyle = '#8c6826';
  ctx.font = 'bold 38px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillText(data.categoryLabel.toUpperCase(), 214, cursorY);

  cursorY += 78;
  ctx.fillStyle = '#13243f';
  ctx.font = 'bold 74px Georgia, serif';
  const titleLines = wrapCanvasText(ctx, data.targetTitle, 2500);
  for (const line of titleLines.slice(0, 2)) {
    ctx.fillText(line, 214, cursorY);
    cursorY += 86;
  }

  if (data.includedCourses && data.includedCourses.length > 0) {
    ctx.fillStyle = '#475569';
    ctx.font = '500 34px "DM Sans", Arial, sans-serif';
    const incText = `Includes: ${data.includedCourses.join(' · ')}`;
    const incLines = wrapCanvasText(ctx, incText, 2350);
    for (const line of incLines.slice(0, 2)) {
      ctx.fillText(line, 214, cursorY);
      cursorY += 46;
    }
  }

  // Authorized Signature Image & Signatory Block + Date
  const sigY = 1910;
  const sigImg = await loadImgElement(data.signatureUrl || '');
  if (sigImg) {
    const maxSigW = 460;
    const maxSigH = 165;
    const scale = Math.min(
      maxSigW / (sigImg.width || maxSigW),
      maxSigH / (sigImg.height || maxSigH)
    );
    const sw = (sigImg.width || 300) * scale;
    const sh = (sigImg.height || 100) * scale;
    ctx.drawImage(sigImg, 480 - sw / 2, sigY - sh - 20, sw, sh);
  }

  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(240, sigY);
  ctx.lineTo(740, sigY);
  ctx.stroke();

  ctx.fillStyle = '#13243f';
  ctx.font = 'bold 42px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(data.signerName, 490, sigY + 62);
  ctx.fillStyle = '#64748b';
  ctx.font = '600 30px "DM Sans", Arial, sans-serif';
  ctx.fillText('AUTHORIZED SIGNATORY', 490, sigY + 108);

  // Date & Institute Column
  ctx.strokeStyle = '#475569';
  ctx.beginPath();
  ctx.moveTo(1100, sigY);
  ctx.lineTo(1660, sigY);
  ctx.stroke();

  ctx.fillStyle = '#13243f';
  ctx.font = 'bold 42px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillText(data.issuedDate, 1380, sigY + 62);
  ctx.fillStyle = '#64748b';
  ctx.font = '600 30px "DM Sans", Arial, sans-serif';
  ctx.fillText('DATE OF ISSUE', 1380, sigY + 108);
  ctx.textAlign = 'left';

  // Bottom-Right Gold Rosette Seal
  const sealX = 2940;
  const sealY = 1880;

  // Ribbon tails
  ctx.fillStyle = '#b48228';
  ctx.beginPath();
  ctx.moveTo(sealX - 95, sealY + 120);
  ctx.lineTo(sealX - 150, sealY + 370);
  ctx.lineTo(sealX - 55, sealY + 305);
  ctx.lineTo(sealX + 15, sealY + 370);
  ctx.lineTo(sealX + 10, sealY + 120);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#d7a84b';
  ctx.beginPath();
  ctx.moveTo(sealX + 10, sealY + 120);
  ctx.lineTo(sealX + 15, sealY + 370);
  ctx.lineTo(sealX + 85, sealY + 305);
  ctx.lineTo(sealX + 165, sealY + 370);
  ctx.lineTo(sealX + 105, sealY + 120);
  ctx.closePath();
  ctx.fill();

  // Scalloped rosette edge
  const outerR = 200;
  ctx.fillStyle = '#c59231';
  ctx.beginPath();
  for (let i = 0; i < 48; i++) {
    const angle = (i * Math.PI) / 24;
    const r = i % 2 === 0 ? outerR : outerR - 18;
    const px = sealX + Math.cos(angle) * r;
    const py = sealY + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  const sealGrad = ctx.createRadialGradient(sealX - 45, sealY - 45, 20, sealX, sealY, 170);
  sealGrad.addColorStop(0, '#fae6a2');
  sealGrad.addColorStop(0.6, '#d7a84b');
  sealGrad.addColorStop(1, '#9d6d1b');
  ctx.fillStyle = sealGrad;
  ctx.beginPath();
  ctx.arc(sealX, sealY, 165, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#785012';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(sealX, sealY, 136, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#533508';
  ctx.textAlign = 'center';
  ctx.font = 'bold 34px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillText(data.sealText.toUpperCase().slice(0, 12), sealX, sealY + 12);
  ctx.textAlign = 'left';

  // Footer
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '500 30px "DM Sans", Arial, sans-serif';
  ctx.fillText(data.footerText, 214, H - 105);

  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `${data.certificateNo}_A4_Certificate.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
