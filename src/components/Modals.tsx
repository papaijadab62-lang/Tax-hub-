import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Mail,
  Maximize2,
  MessageCircle,
  Pencil,
  PlayCircle,
  Plus,
  Printer,
  QrCode,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  Announcement,
  AnnouncementCategory,
  Bundle,
  CertificateTemplateConfig,
  Chapter,
  Course,
  CoursePaymentPlan,
  CustomCertificateRecord,
  Lesson,
  LiveClassSession,
  LivePlatformType,
  Order,
  PaymentMethod,
  PaymentMethodType,
  PlatformLink,
  PlatformLinksConfig,
  PortalSettings,
  SocialPlatformType,
  User,
  WelcomeShowcase,
} from '../types/lms';
import {
  INDIAN_GST_STATES,
  buildGmailComposeUrl,
  buildGpayUpiUri,
  buildUpiUri,
  buildWhatsAppBillText,
  buildWhatsAppUrl,
  calculatePriceBreakdown,
  getGstStateCode,
  isValidHttpUrl,
  money,
  normalizeVideoUrl,
  resolveMethodUpiId,
  uid,
  validateTransactionProof,
  youtubeId,
  type PriceBreakdown,
} from '../utils/lms';
import { compressQrImageFile, generateQrDataUrl } from '../utils/qr';
import {
  compressThumbnail16x9,
  downloadA4CertificatePng,
  readCertificateAssetFile,
  resolveCertificateViewData,
} from '../utils/media';

function ModalShell({
  open,
  title,
  onClose,
  maxWidth = 'max-w-[640px]',
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  maxWidth?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="print-modal-backdrop fixed inset-0 z-40 flex items-center justify-center bg-[#101a2d]/75 p-4"
      onClick={onClose}
    >
      <div
        className={`print-modal-box w-full ${maxWidth} max-h-[92vh] overflow-y-auto rounded-[17px] border border-[#e3e9f2] bg-white p-6 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="no-print flex items-center justify-between gap-4 pb-4 border-b border-[#e3e9f2]">
          <h2 className="text-lg font-bold text-[#142746]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#718096] hover:bg-[#f3f6fb] hover:text-[#142746] transition-colors"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="pt-4">{children}</div>
      </div>
    </div>
  );
}

/* 1. Course Modal */
export function CourseModal({
  open,
  course,
  canEditPricingAndPublish = true,
  canEditPricing,
  canPublish,
  onClose,
  onSave,
}: {
  open: boolean;
  course: Course | null;
  canEditPricingAndPublish?: boolean;
  canEditPricing?: boolean;
  canPublish?: boolean;
  onClose: () => void;
  onSave: (data: {
    id?: string;
    title: string;
    category: string;
    description: string;
    thumbnailUrl?: string;
    price: number;
    paymentPlans: CoursePaymentPlan[];
    certificateConfig?: CertificateTemplateConfig;
    visibility: 'draft' | 'published';
  }) => Promise<void> | void;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [thumbError, setThumbError] = useState('');
  const [price, setPrice] = useState('0');
  const [paymentPlans, setPaymentPlans] = useState<CoursePaymentPlan[]>([]);
  const [visibility, setVisibility] = useState<'draft' | 'published'>('draft');
  const [certMode, setCertMode] = useState<'template' | 'uploaded'>('template');
  const [certTitle, setCertTitle] = useState('');
  const [certHeading, setCertHeading] = useState('');
  const [certSubtitle, setCertSubtitle] = useState('');
  const [certCustomUrl, setCertCustomUrl] = useState('');
  const [certCustomName, setCertCustomName] = useState('');
  const [certUploadError, setCertUploadError] = useState('');

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setTitle(course?.title || '');
      setCategory(course?.category || '');
      setDescription(course?.description || '');
      setThumbnailUrl(course?.thumbnailUrl || '');
      setThumbError('');
      setPrice(String(course?.price ?? 0));
      setPaymentPlans(
        (course?.paymentPlans || []).map((p) => ({ ...p }))
      );
      const allowPublish = canPublish ?? canEditPricingAndPublish;
      setVisibility(
        course?.visibility || (allowPublish ? 'published' : 'draft')
      );
      setCertMode(course?.certificateConfig?.mode || 'template');
      setCertTitle(course?.certificateConfig?.certificateTitle || '');
      setCertHeading(course?.certificateConfig?.heading || '');
      setCertSubtitle(course?.certificateConfig?.subtitle || '');
      setCertCustomUrl(course?.certificateConfig?.customTemplateUrl || '');
      setCertCustomName(course?.certificateConfig?.customTemplateName || '');
      setCertUploadError('');
    }
    wasOpen.current = open;
  }, [open, course]);

  const handleThumbnailUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbError('');
    try {
      const dataUrl = await compressThumbnail16x9(file);
      setThumbnailUrl(dataUrl);
    } catch (err) {
      setThumbError(
        err instanceof Error ? err.message : 'Could not process thumbnail.'
      );
    }
    e.target.value = '';
  };

  const handleCertFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCertUploadError('');
    try {
      const parsed = await readCertificateAssetFile(file);
      setCertCustomUrl(parsed.dataUrl);
      setCertCustomName(parsed.fileName);
      setCertMode('uploaded');
    } catch (err) {
      setCertUploadError(
        err instanceof Error ? err.message : 'Could not load certificate file.'
      );
    }
    e.target.value = '';
  };

  const addPlan = (months: number) => {
    const baseNum = Math.max(0, Number(price) || 0);
    const suggested = baseNum > 0 ? Math.round((baseNum / 6) * months) : 0;
    setPaymentPlans((prev) => [
      ...prev,
      {
        id: uid(),
        months,
        label: `${months} ${months === 1 ? 'Month' : 'Months'} Plan`,
        price: suggested,
      },
    ]);
  };

  const updatePlan = (
    planId: string,
    patch: Partial<CoursePaymentPlan>
  ) => {
    setPaymentPlans((prev) =>
      prev.map((p) => (p.id === planId ? { ...p, ...patch } : p))
    );
  };

  const removePlan = (planId: string) => {
    setPaymentPlans((prev) => prev.filter((p) => p.id !== planId));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanedPlans = paymentPlans
      .map((p) => {
        const months = Math.max(1, Math.round(Number(p.months) || 1));
        return {
          id: p.id || uid(),
          months,
          label:
            p.label.trim() ||
            `${months} ${months === 1 ? 'Month' : 'Months'} Plan`,
          price: Math.max(0, Number(p.price) || 0),
        };
      })
      .sort((a, b) => a.months - b.months);

    const certificateConfig: CertificateTemplateConfig = {
      ...(course?.certificateConfig || {}),
      mode: certMode,
      certificateTitle: certTitle.trim() || undefined,
      heading: certHeading.trim() || undefined,
      subtitle: certSubtitle.trim() || undefined,
      customTemplateUrl: certCustomUrl.trim() || undefined,
      customTemplateName: certCustomName.trim() || undefined,
    };

    await onSave({
      id: course?.id,
      title,
      category,
      description,
      thumbnailUrl: thumbnailUrl.trim(),
      price: Math.max(0, Number(price) || 0),
      paymentPlans: cleanedPlans,
      certificateConfig,
      visibility,
    });
    onClose();
  };

  return (
    <ModalShell
      open={open}
      title={course ? 'Edit Course' : 'Create Course'}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1.5">
              Course title *
            </label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. GST Practitioner Course"
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1.5">
              Category
            </label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Direct Tax, GST"
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
            />
          </div>
        </div>

        {/* YouTube 16:9 Course Thumbnail */}
        <div className="rounded-[12px] border border-[#dce6f5] bg-[#f8fafd] p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-[#142746] flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-[#315b9b]" />
                <span>Course Thumbnail (YouTube 16:9 Ratio · 1280×720)</span>
              </div>
              <div className="text-[11px] text-[#718096]">
                Displayed on Course Catalogue &amp; My Learning cards before entering lessons
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#dce6f7] bg-white px-2.5 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer">
                <Upload className="h-3.5 w-3.5 text-[#315b9b]" />
                <span>Upload 16:9 Image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleThumbnailUpload}
                  className="sr-only"
                />
              </label>
              {thumbnailUrl && (
                <button
                  type="button"
                  onClick={() => setThumbnailUrl('')}
                  className="text-xs font-bold text-[#c64b58] hover:underline cursor-pointer"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {!thumbnailUrl.startsWith('data:') && (
            <input
              type="url"
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              placeholder="Or paste thumbnail URL (https://...)"
              className="w-full rounded-[9px] border border-[#e3e9f2] bg-white px-3 py-1.5 text-xs outline-none focus:border-[#315b9b]"
            />
          )}

          {thumbError && (
            <p className="text-xs font-semibold text-[#c64b58]">{thumbError}</p>
          )}

          {thumbnailUrl && (
            <div className="aspect-video w-full max-w-[300px] overflow-hidden rounded-[10px] border border-[#e3e9f2] bg-[#142746]">
              <img
                src={thumbnailUrl}
                alt="Course 16:9 Thumbnail Preview"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-1.5">
            Description
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief syllabus overview..."
            className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
          />
        </div>

        {((canEditPricing ?? canEditPricingAndPublish) || (canPublish ?? canEditPricingAndPublish)) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(canEditPricing ?? canEditPricingAndPublish) && (
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1.5">
                  Full course fee (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm font-mono tabular-nums outline-none focus:border-[#315b9b]"
                />
              </div>
            )}
            {(canPublish ?? canEditPricingAndPublish) && (
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1.5">
                  Visibility
                </label>
                <select
                  value={visibility}
                  onChange={(e) =>
                    setVisibility(e.target.value as 'draft' | 'published')
                  }
                  className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
                >
                  <option value="published">Published (Visible to Students)</option>
                  <option value="draft">Draft (Hidden from Students)</option>
                </select>
              </div>
            )}
          </div>
        )}

        {!(canPublish ?? canEditPricingAndPublish) && (
          <div className="rounded-[10px] border border-[#dce6f5] bg-[#f8fafd] px-3.5 py-2.5 text-xs text-[#59677d]">
            {course?.visibility === 'published'
              ? 'This course is currently Published. Your content edits will be saved directly without hiding it from students.'
              : 'New or draft courses start as Draft (hidden from students) until you click "Submit for Review" and an Admin / Owner publishes it.'}
          </div>
        )}

        {!(canEditPricing ?? canEditPricingAndPublish) && (
          <div className="rounded-[10px] border border-[#f1dca7] bg-[#fffaf0] px-3.5 py-2 text-[11px] font-medium text-[#8c6826]">
            Course fee, payment plans &amp; certificate templates are strictly managed by Main Super Admin (Owner).
          </div>
        )}

        {/* Month-wise Payment Plans Section */}
        {(canEditPricing ?? canEditPricingAndPublish) && (
        <div className="rounded-[12px] border border-[#dce6f5] bg-[#f8fafd] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
            <div>
              <div className="text-xs font-bold text-[#142746]">
                Month-wise Payment Plans (Student Flexibility)
              </div>
              <div className="text-[11px] text-[#718096]">
                Optionally add 1 month, 2 months, or custom duration fees so students can pay month-wise
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {[1, 2, 3, 6].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => addPlan(m)}
                  className="inline-flex items-center gap-1 rounded-[8px] border border-[#dce6f7] bg-white px-2.5 py-1 text-[11px] font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                  <span>{m}M</span>
                </button>
              ))}
            </div>
          </div>

          {paymentPlans.length === 0 ? (
            <p className="text-[11px] text-[#718096]">
              No month-wise plans added. Students will pay the full course fee above.
            </p>
          ) : (
            <div className="space-y-2">
              {paymentPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="grid grid-cols-12 gap-2 items-center rounded-[9px] border border-[#e3e9f2] bg-white p-2"
                >
                  <div className="col-span-3">
                    <label className="block text-[10px] font-bold text-[#718096]">
                      Months
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={plan.months}
                      onChange={(e) => {
                        const m = Math.max(1, Number(e.target.value) || 1);
                        updatePlan(plan.id, {
                          months: m,
                          label: `${m} ${m === 1 ? 'Month' : 'Months'} Plan`,
                        });
                      }}
                      className="w-full rounded-md border border-[#e3e9f2] px-2 py-1 text-xs font-mono"
                    />
                  </div>
                  <div className="col-span-5">
                    <label className="block text-[10px] font-bold text-[#718096]">
                      Plan Label
                    </label>
                    <input
                      value={plan.label}
                      onChange={(e) =>
                        updatePlan(plan.id, { label: e.target.value })
                      }
                      placeholder="1 Month Plan"
                      className="w-full rounded-md border border-[#e3e9f2] px-2 py-1 text-xs"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] font-bold text-[#718096]">
                      Fee (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={plan.price}
                      onChange={(e) =>
                        updatePlan(plan.id, {
                          price: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-full rounded-md border border-[#e3e9f2] px-2 py-1 text-xs font-mono"
                    />
                  </div>
                  <div className="col-span-1 flex justify-end pt-3">
                    <button
                      type="button"
                      onClick={() => removePlan(plan.id)}
                      aria-label="Remove plan"
                      className="rounded p-1 text-[#c64b58] hover:bg-[#fff0f1] cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Course-Specific Certificate Customization (A4 Auto Template or Handmade Artwork) */}
        {(canEditPricing ?? canEditPricingAndPublish) && (
        <div className="rounded-[12px] border border-[#dce6f5] bg-[#f8fafd] p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-[#142746] flex items-center gap-1.5">
                <Award className="h-3.5 w-3.5 text-[#8c6826]" />
                <span>Course-Wise Certificate Setup (Admin Only)</span>
              </div>
              <div className="text-[11px] text-[#718096]">
                Configure custom wording for this course (e.g. GST vs Income Tax) or upload a handmade/external software certificate
              </div>
            </div>
            <select
              value={certMode}
              onChange={(e) =>
                setCertMode(e.target.value as 'template' | 'uploaded')
              }
              className="rounded-[8px] border border-[#dce6f7] bg-white px-2.5 py-1 text-xs font-bold text-[#142746]"
            >
              <option value="template">Auto A4 E-Certificate</option>
              <option value="uploaded">Upload Custom Certificate</option>
            </select>
          </div>

          {certMode === 'template' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                value={certHeading}
                onChange={(e) => setCertHeading(e.target.value)}
                placeholder="Heading override (default: Certificate of Achievement)"
                className="rounded-lg border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#315b9b]"
              />
              <input
                value={certTitle}
                onChange={(e) => setCertTitle(e.target.value)}
                placeholder="Course name on Certificate (optional override)"
                className="rounded-lg border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#315b9b]"
              />
              <input
                value={certSubtitle}
                onChange={(e) => setCertSubtitle(e.target.value)}
                placeholder="Custom wording (e.g. for mastering GST Returns & E-Way Bill)"
                className="sm:col-span-2 rounded-lg border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#315b9b]"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#dce6f7] bg-white px-3 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer">
                  <Upload className="h-3.5 w-3.5 text-[#315b9b]" />
                  <span>Upload Certificate Image / PDF</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleCertFileUpload}
                    className="sr-only"
                  />
                </label>
                {certCustomUrl && (
                  <span className="text-[11px] font-semibold text-[#13845b]">
                    Loaded: {certCustomName || 'Custom Certificate'}
                  </span>
                )}
              </div>
              {certUploadError && (
                <p className="text-xs font-semibold text-[#c64b58]">
                  {certUploadError}
                </p>
              )}
            </div>
          )}
        </div>
        )}

        <div className="flex justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[#e3e9f2] bg-white px-4 py-2 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
          >
            Save Course
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* 2. Chapter Modal */
export function ChapterModal({
  open,
  chapter,
  onClose,
  onSave,
}: {
  open: boolean;
  chapter: Chapter | null;
  onClose: () => void;
  onSave: (title: string) => Promise<void> | void;
}) {
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (open) setTitle(chapter?.title || '');
  }, [open, chapter]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSave(title);
    onClose();
  };

  return (
    <ModalShell
      open={open}
      title={chapter ? 'Edit Chapter' : 'Add Chapter'}
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-1.5">
            Chapter title *
          </label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Module 1: Registration & Compliance"
            className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
          />
        </div>
        <div className="flex justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[#e3e9f2] bg-white px-4 py-2 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
          >
            Save Chapter
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* 3. Lesson Modal */
export function LessonModal({
  open,
  lesson,
  onClose,
  onSave,
}: {
  open: boolean;
  lesson: Lesson | null;
  onClose: () => void;
  onSave: (payload: Omit<Lesson, 'id'>) => Promise<void> | void;
}) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState('');

  const [lessonError, setLessonError] = useState('');

  useEffect(() => {
    if (open) {
      setTitle(lesson?.title || '');
      setUrl(lesson?.url || '');
      setNotes(lesson?.notes || '');
      setFile(lesson?.file || '');
      setLessonError('');
    }
  }, [open, lesson]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const normUrl = normalizeVideoUrl(url);
    const cleanNotes = notes.trim();
    const cleanFile = file.trim();
    if (!normUrl && !cleanNotes && !cleanFile) {
      setLessonError(
        'Provide at least a video URL, lesson notes, or study material PDF/link.'
      );
      return;
    }
    setLessonError('');
    await onSave({
      title: title.trim(),
      url: normUrl,
      notes: cleanNotes,
      file: cleanFile,
    });
    onClose();
  };

  return (
    <ModalShell
      open={open}
      title={lesson ? 'Edit Lesson' : 'Add Lesson'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-1.5">
            Lesson title *
          </label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. GSTR-3B Offset Rules"
            className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-1.5">
            YouTube URL or video URL (optional if notes or PDF attached)
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setLessonError('');
            }}
            placeholder="https://www.youtube.com/watch?v=... or leave blank for notes/PDF lesson"
            className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-1.5">
            Lesson notes
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Key takeaways and section references..."
            className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-1.5">
            Study material URL (optional)
          </label>
          <input
            type="url"
            value={file}
            onChange={(e) => setFile(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
          />
        </div>
        {lessonError && (
          <p className="text-xs font-semibold text-[#c64b58]">{lessonError}</p>
        )}
        <div className="flex justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[#e3e9f2] bg-white px-4 py-2 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
          >
            Save Lesson
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* 4. Student Modal */
export function StudentModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (
    name: string,
    email: string,
    phone: string,
    state: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [studentState, setStudentState] = useState('West Bengal');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setPhone('');
      setStudentState('West Bengal');
      setPassword('');
      setError('');
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await onCreate(name, email, phone, studentState, password);
      if (!res.ok) {
        setError(res.error || 'Could not create student.');
        return;
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title="Add Student"
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-1.5">
            Student name *
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-1.5">
            Gmail / Student ID *
          </label>
          <input
            type="text"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@gmail.com or rahul01"
            className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1.5">
              WhatsApp / Phone number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm font-mono outline-none focus:border-[#315b9b]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1.5">
              Student State / UT *
            </label>
            <select
              required
              value={studentState}
              onChange={(e) => setStudentState(e.target.value)}
              className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#315b9b]"
            >
              {INDIAN_GST_STATES.map((st) => (
                <option key={st.code} value={st.name}>
                  {st.code} - {st.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-1.5">
            Temporary password (min 6 chars) *
          </label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 pr-10 text-sm outline-none focus:border-[#315b9b]"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-[#718096]"
              aria-label="Toggle password visibility"
            >
              {showPass ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
        {error && <p className="text-xs font-semibold text-[#c64b58]">{error}</p>}
        <div className="flex justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[#e3e9f2] bg-white px-4 py-2 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] disabled:opacity-60 cursor-pointer"
          >
            {submitting ? 'Creating...' : 'Create Student'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* 4b. Admin Direct Course Access Modal */
export function StudentAccessModal({
  open,
  student,
  courses,
  manageableCourseIds,
  onClose,
  onSaveAccess,
}: {
  open: boolean;
  student: User | null;
  courses: Course[];
  manageableCourseIds?: string[] | null;
  onClose: () => void;
  onSaveAccess: (studentId: string, courseIds: string[]) => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current && student) {
      setSelectedIds(student.grantedCourseIds || []);
      setSaving(false);
    }
    wasOpen.current = open;
  }, [open, student]);

  if (!student) return null;

  const canManageCourse = (courseId: string) =>
    manageableCourseIds === undefined ||
    manageableCourseIds === null ||
    manageableCourseIds.includes(courseId);

  const toggleCourse = (courseId: string) => {
    if (!canManageCourse(courseId)) return;
    setSelectedIds((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveAccess(student.id, selectedIds);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title={`Course Access · ${student.name}`}
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <p className="text-xs text-[#718096] mb-3 leading-relaxed">
        Select courses to grant direct access for <strong className="text-[#142746]">{student.email}</strong>. Changes apply immediately across all devices where this student logs in.
      </p>

      {courses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e3e9f2] p-6 text-center text-xs text-[#718096]">
          No courses created yet.
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto space-y-2 rounded-xl border border-[#e3e9f2] p-3">
          {courses.map((c) => {
            const checked = selectedIds.includes(c.id);
            const allowed = canManageCourse(c.id);
            return (
              <label
                key={c.id}
                className={`flex items-center justify-between gap-3 rounded-lg border border-[#e3e9f2] px-3 py-2.5 text-xs ${
                  allowed ? 'hover:bg-[#f8fafd] cursor-pointer' : 'opacity-60 bg-[#f8fafd] cursor-not-allowed'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!allowed}
                    onChange={() => toggleCourse(c.id)}
                    className="h-4 w-4 rounded border-[#cbd5e1]"
                  />
                  <span className="min-w-0">
                    <span className="block font-bold text-[#142746] truncate">
                      {c.title}
                    </span>
                    <span className="text-[11px] text-[#718096]">
                      {c.category || 'Course'} · {c.visibility}
                      {!allowed ? ' · Assigned courses only' : ''}
                    </span>
                  </span>
                </span>
                <span className="font-mono font-semibold text-[#142746] tabular-nums shrink-0">
                  {money(c.price)}
                </span>
              </label>
            );
          })}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-[10px] border border-[#e3e9f2] bg-white px-4 py-2 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] disabled:opacity-60 cursor-pointer"
        >
          {saving ? 'Saving...' : 'Save Course Access'}
        </button>
      </div>
    </ModalShell>
  );
}

/* 5. Checkout Modal */
export function CheckoutModal({
  open,
  item,
  user,
  settings,
  methods,
  onClose,
  onPreviewCheckout,
  onVerifyReference,
  onSubmitOrder,
  onStartLearning,
  onViewInvoice,
  onOpenProfile,
}: {
  open: boolean;
  item: { type: 'course'; data: Course } | { type: 'bundle'; data: Bundle } | null;
  user: User;
  settings: PortalSettings;
  methods: PaymentMethod[];
  onClose: () => void;
  onPreviewCheckout: (
    itemType: 'course' | 'bundle',
    itemId: string,
    couponCode: string,
    planId?: string,
    studentState?: string
  ) => Promise<
    { ok: true; data: { breakdown: PriceBreakdown } } | { ok: false; error: string }
  >;
  onVerifyReference?: (payload: {
    reference: string;
    studentPhone?: string;
  }) => Promise<
    | {
        ok: true;
        valid: boolean;
        normalized: string;
        proofType: string;
        duplicate: boolean;
        message: string;
      }
    | { ok: false; error: string }
  >;
  onSubmitOrder: (payload: {
    itemType: 'course' | 'bundle';
    itemId: string;
    planId?: string;
    couponCode?: string;
    method: string;
    reference: string;
    studentPhone?: string;
    studentState?: string;
    proofScreenshotUrl?: string;
  }) => Promise<{ ok: true; order: Order } | { ok: false; error?: string }>;
  onStartLearning: (courseId: string) => void;
  onViewInvoice: (order: Order) => void;
  onOpenProfile?: () => void;
}) {
  const activeMethods = methods.filter((m) => m.active);
  const [couponInput, setCouponInput] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const studentState = user.state || settings.gstState || 'West Bengal';
  const [appliedBreakdown, setAppliedBreakdown] =
    useState<PriceBreakdown | null>(null);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [studentPhone, setStudentPhone] = useState(user.phone || '');
  const [reference, setReference] = useState('');
  const [proofScreenshotUrl, setProofScreenshotUrl] = useState('');
  const [proofChecking, setProofChecking] = useState(false);
  const [proofStatus, setProofStatus] = useState<{
    valid: boolean;
    proofType: string;
    message: string;
  } | null>(null);
  const [applying, setApplying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [dynamicQrUrl, setDynamicQrUrl] = useState('');
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [qrExpanded, setQrExpanded] = useState(false);
  const [upiLaunchHint, setUpiLaunchHint] = useState('');
  const [paymentInitiated, setPaymentInitiated] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const qrPanelRef = useRef<HTMLDivElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

  const coursePlans =
    item?.type === 'course' ? item.data.paymentPlans || [] : [];

  const wasOpenKey = useRef('');
  const currentOpenKey = open && item ? `${item.type}:${item.data.id}` : '';
  useEffect(() => {
    if (currentOpenKey && wasOpenKey.current !== currentOpenKey && item) {
      setCouponInput('');
      setSelectedPlanId('');
      setAppliedBreakdown(
        calculatePriceBreakdown(item.data.price, settings, '', [], studentState)
      );
      setStudentPhone(user.phone || '');
      setReference('');
      setProofScreenshotUrl('');
      setProofStatus(null);
      setProofChecking(false);
      setSubmitError('');
      setSelectedMethod(activeMethods[0]?.id || '');
      setSubmitting(false);
      setPaymentInitiated(false);
      setCompletedOrder(null);
      setCopiedUpi(false);
      setQrExpanded(false);
      setUpiLaunchHint('');
    }
    wasOpenKey.current = currentOpenKey;
  }, [currentOpenKey]);

  useEffect(() => {
    if (!open) return;
    if (!activeMethods.length) return;
    if (!selectedMethod || !activeMethods.some((m) => m.id === selectedMethod)) {
      setSelectedMethod(activeMethods[0].id);
    }
  }, [open, activeMethods, selectedMethod]);

  const chosenPlan =
    item?.type === 'course' && selectedPlanId
      ? coursePlans.find((p) => p.id === selectedPlanId)
      : undefined;

  const activeBasePrice = item
    ? chosenPlan
      ? chosenPlan.price
      : item.data.price
    : 0;

  useEffect(() => {
    if (!open || !item) return;
    if (appliedBreakdown?.couponApplied || appliedBreakdown?.couponError) return;
    setAppliedBreakdown(
      calculatePriceBreakdown(activeBasePrice, settings, '', [], studentState)
    );
  }, [
    open,
    item?.type,
    item?.data.id,
    activeBasePrice,
    settings,
    studentState,
    appliedBreakdown?.couponApplied,
    appliedBreakdown?.couponError,
  ]);

  const itemName = item
    ? item.type === 'course'
      ? item.data.title
      : item.data.name
    : '';
  const breakdown =
    appliedBreakdown ||
    calculatePriceBreakdown(activeBasePrice, settings, '', [], studentState);

  const methodObj =
    activeMethods.find((m) => m.id === selectedMethod) || activeMethods[0];
  const resolvedUpiId = resolveMethodUpiId(methodObj);
  const hasHttpGatewayUrl = isValidHttpUrl(methodObj?.gatewayUrl);

  const upiUri = resolvedUpiId
    ? buildUpiUri({
        upiId: resolvedUpiId,
        payeeName: settings.brand || 'ARYA TAX PATHSHALA',
        amount: breakdown.total,
        note: itemName.slice(0, 40),
      })
    : '';

  const gpayUri = resolvedUpiId
    ? buildGpayUpiUri({
        upiId: resolvedUpiId,
        payeeName: settings.brand || 'ARYA TAX PATHSHALA',
        amount: breakdown.total,
        note: itemName.slice(0, 40),
      })
    : '';

  useEffect(() => {
    let active = true;
    if (!upiUri) {
      setDynamicQrUrl('');
      return;
    }
    generateQrDataUrl(upiUri)
      .then((url) => {
        if (active) setDynamicQrUrl(url);
      })
      .catch(() => {
        if (active) setDynamicQrUrl('');
      });
    return () => {
      active = false;
    };
  }, [upiUri]);

  const runProofVerification = async (rawRef: string) => {
    const trimmed = rawRef.trim();
    if (!trimmed) {
      setProofStatus(null);
      return null;
    }
    const localCheck = validateTransactionProof(trimmed, studentPhone);
    if (!localCheck.valid) {
      const next = {
        valid: false,
        proofType: localCheck.proofType,
        message: localCheck.message,
      };
      setProofStatus(next);
      return next;
    }
    if (onVerifyReference) {
      setProofChecking(true);
      try {
        const res = await onVerifyReference({
          reference: trimmed,
          studentPhone,
        });
        if (res.ok) {
          const next = {
            valid: res.valid,
            proofType: res.proofType,
            message: res.message,
          };
          setProofStatus(next);
          return next;
        }
      } finally {
        setProofChecking(false);
      }
    }
    const fallback = {
      valid: true,
      proofType: localCheck.proofType,
      message: localCheck.message,
    };
    setProofStatus(fallback);
    return fallback;
  };

  useEffect(() => {
    if (!open || breakdown.total <= 0) return;
    const trimmed = reference.trim();
    if (!trimmed) {
      setProofStatus(null);
      return;
    }
    if (trimmed.length < 8) {
      setProofStatus(null);
      return;
    }
    const timer = setTimeout(() => {
      void runProofVerification(trimmed);
    }, 280);
    return () => clearTimeout(timer);
  }, [open, reference, studentPhone, breakdown.total]);

  if (!item) return null;

  const handleSelectPlan = async (planId: string) => {
    setSelectedPlanId(planId);
    setPaymentInitiated(false);
    setSubmitError('');
    const nextPlan = coursePlans.find((p) => p.id === planId);
    const nextPrice = nextPlan ? nextPlan.price : item.data.price;
    const res = await onPreviewCheckout(
      item.type,
      item.data.id,
      couponInput.trim(),
      planId || undefined,
      studentState
    );
    if (res.ok) {
      setAppliedBreakdown(res.data.breakdown);
      return;
    }
    setAppliedBreakdown(
      calculatePriceBreakdown(nextPrice, settings, '', [], studentState)
    );
  };

  const handleApplyCoupon = async () => {
    setApplying(true);
    setPaymentInitiated(false);
    setSubmitError('');
    try {
      const res = await onPreviewCheckout(
        item.type,
        item.data.id,
        couponInput.trim(),
        selectedPlanId || undefined,
        studentState
      );
      if (res.ok) {
        setAppliedBreakdown(res.data.breakdown);
      }
    } finally {
      setApplying(false);
    }
  };

  const handleRevealQrPayment = () => {
    setSubmitError('');
    if (studentPhone.replace(/\D/g, '').length < 10) {
      setSubmitError('Please enter your 10-digit WhatsApp / Phone number first.');
      phoneInputRef.current?.focus();
      return;
    }
    setPaymentInitiated(true);
    setUpiLaunchHint('');
    setTimeout(() => {
      qrPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  };

  const handleProofScreenshot = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressQrImageFile(file, 720);
      setProofScreenshotUrl(compressed);
    } catch {
      setSubmitError('Could not load screenshot image. Use PNG, JPG, or WebP.');
    }
    e.target.value = '';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    if (!methodObj) return;
    if (breakdown.total > 0 && !paymentInitiated) {
      handleRevealQrPayment();
      return;
    }
    if (studentPhone.replace(/\D/g, '').length < 10) {
      setSubmitError('Please enter a valid 10-digit WhatsApp / Phone number.');
      phoneInputRef.current?.focus();
      return;
    }
    if (breakdown.total > 0) {
      const check = await runProofVerification(reference);
      if (!check || !check.valid) {
        setSubmitError(
          check?.message ||
            'Please verify a valid Transaction ID / 12-digit UPI UTR before submitting.'
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await onSubmitOrder({
        itemType: item.type,
        itemId: item.data.id,
        planId: selectedPlanId || undefined,
        couponCode: breakdown.couponApplied?.code,
        method: methodObj.id,
        reference: reference.trim(),
        studentPhone: studentPhone.trim(),
        studentState,
        ...(proofScreenshotUrl ? { proofScreenshotUrl } : {}),
      });
      if (res.ok) {
        setCompletedOrder(res.order);
      } else if (res.error) {
        setSubmitError(res.error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Post-payment immediate success & unlock screen
  if (completedOrder) {
    const waText =
      completedOrder.whatsappMessage ||
      buildWhatsAppBillText(completedOrder, settings, user.name);
    const waHref =
      completedOrder.whatsappUrl ||
      buildWhatsAppUrl(
        completedOrder.buyerPhone || studentPhone || settings.adminWhatsapp,
        waText
      );
    const gmailHref = buildGmailComposeUrl({
      to: completedOrder.buyerEmail || user.email,
      cc: settings.adminEmail || settings.smtpUser || '',
      subject: `Tax Invoice ${completedOrder.invoiceNumber || completedOrder.id} · ${completedOrder.itemName}`,
      body: waText,
    });
    const isPaid = completedOrder.status === 'PAID';
    const firstCourseId = completedOrder.courseIds?.[0];

    return (
      <ModalShell
        open={open}
        title={isPaid ? 'Payment Verified & Course Unlocked' : 'Verification In Progress · Pending Admin Approval'}
        onClose={onClose}
        maxWidth="max-w-lg"
      >
        <div
          className={`rounded-[14px] border p-4 mb-4 ${
            isPaid
              ? 'border-[#bfe6d5] bg-[#eefaf4]'
              : 'border-[#f1dca7] bg-[#fffaf0]'
          }`}
        >
          <div className="flex items-start gap-3">
            {isPaid ? (
              <CheckCircle2 className="h-6 w-6 shrink-0 mt-0.5 text-[#13845b]" />
            ) : (
              <Clock className="h-6 w-6 shrink-0 mt-0.5 text-[#8c6826]" />
            )}
            <div>
              <div className="text-sm font-extrabold text-[#142746]">
                {isPaid
                  ? 'Course is now ACTIVE on your account!'
                  : 'Verification in Progress — Course Locked Until Admin Approves'}
              </div>
              <p className="mt-1 text-xs text-[#4b5a70] leading-relaxed">
                {isPaid ? (
                  <>
                    Invoice{' '}
                    <strong className="font-mono text-[#142746]">
                      {completedOrder.invoiceNumber || completedOrder.id}
                    </strong>{' '}
                    for{' '}
                    <strong className="font-mono text-[#13845b]">
                      {money(completedOrder.total)}
                    </strong>{' '}
                    has been generated for <strong>{completedOrder.itemName}</strong>.
                  </>
                ) : (
                  <>
                    Payment proof{' '}
                    <strong className="font-mono text-[#142746]">
                      {completedOrder.reference}
                    </strong>{' '}
                    ({completedOrder.proofType || 'Transaction ID'} ·{' '}
                    <strong className="font-mono text-[#142746]">
                      {money(completedOrder.total)}
                    </strong>
                    ) has been submitted for verification. Your course stays locked until the Owner / Admin confirms payment receipt—after approval it unlocks automatically and sends your GST Tax Invoice.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {isPaid && (
          <div className="space-y-2.5 rounded-[12px] border border-[#e3e9f2] bg-[#f8fafd] p-3.5 text-xs mb-4">
            <div className="flex items-start gap-2">
              <Mail className="h-4 w-4 text-[#315b9b] shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold text-[#142746]">
                  Auto-Locked Gmail Tax Invoice (Student + Admin)
                </div>
                <div className="text-[#59677d]">
                  {completedOrder.emailDispatchNote ||
                    `Tax Invoice ready for ${completedOrder.buyerEmail || user.email}.`}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 pt-2 border-t border-[#e3e9f2]">
              <MessageCircle className="h-4 w-4 text-[#13845b] shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold text-[#142746]">
                  WhatsApp Payment Bill
                </div>
                <div className="text-[#59677d]">
                  {completedOrder.whatsappDispatchStatus === 'sent'
                    ? `Bill automatically dispatched to ${completedOrder.buyerPhone || studentPhone}.`
                    : `Formatted bill ready for WhatsApp (${completedOrder.buyerPhone || studentPhone || 'your number'}).`}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {isPaid && firstCourseId && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartLearning(firstCourseId);
              }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-[#13845b] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0f6c4a] cursor-pointer"
            >
              <PlayCircle className="h-4 w-4" />
              <span>Start Learning Now</span>
            </button>
          )}

          {isPaid && (
            <>
              <button
                type="button"
                onClick={() => onViewInvoice(completedOrder)}
                className="inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-[#142746] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>View / Print Tax Invoice</span>
              </button>

              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-[#bfe6d5] bg-[#eefaf4] px-3.5 py-2.5 text-xs font-bold text-[#0f6c4a] hover:bg-[#ddf5e9]"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                <span>WhatsApp Bill</span>
              </a>

              {completedOrder.emailDispatchStatus !== 'sent' && (
                <a
                  href={gmailHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-[#e3e9f2] bg-white px-3.5 py-2.5 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb]"
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span>Open in Gmail</span>
                </a>
              )}
            </>
          )}

          {!isPaid && (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-[10px] bg-[#142746] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
            >
              Back to Portal
            </button>
          )}
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      open={open}
      title="Course Checkout & GST Invoice"
      onClose={onClose}
      maxWidth="max-w-xl"
    >
      {/* Order & Inbuilt State-Based GST Breakdown */}
      <div className="rounded-xl border border-[#e3e9f2] bg-[#f8fafd] p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-[#8c6826]">
              {item.type === 'bundle'
                ? 'Bundle Offer'
                : chosenPlan
                  ? `Month-wise Access · ${chosenPlan.label}`
                  : 'Full Course Enrollment'}
            </div>
            <div className="mt-0.5 text-base font-bold text-[#142746]">
              {itemName}
            </div>
          </div>

          <div className="min-w-[200px] rounded-[9px] border border-[#dce6f7] bg-white px-3 py-2 text-right">
            <div className="text-[10px] font-bold uppercase text-[#718096]">
              Paying GST From (Profile State)
            </div>
            <div className="mt-0.5 text-xs font-extrabold text-[#142746]">
              {getGstStateCode(studentState)
                ? `${getGstStateCode(studentState)} - `
                : ''}
              {studentState}
            </div>
            {onOpenProfile && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenProfile();
                }}
                className="mt-0.5 text-[11px] font-bold text-[#315b9b] hover:underline cursor-pointer"
              >
                {user.state
                  ? 'Change only in My Profile →'
                  : 'Set State in My Profile →'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-2.5 rounded-lg border border-[#dce6f5] bg-white px-3 py-2 text-[11px] text-[#59677d] flex flex-wrap items-center justify-between gap-2">
          <span>
            Origin (GST Payable):{' '}
            <strong className="text-[#142746]">
              {breakdown.sellerState || settings.gstState || 'West Bengal'}
            </strong>{' '}
            &rarr; Student:{' '}
            <strong className="text-[#142746]">
              {getGstStateCode(studentState) ? `${getGstStateCode(studentState)} ` : ''}
              {studentState}
            </strong>
          </span>
          <span className="font-bold text-[#13845b]">
            Auto Tax:{' '}
            {breakdown.gstSplit === 'igst'
              ? `IGST (${breakdown.gstRate}% Inter-State)`
              : `CGST + SGST (${breakdown.gstRate}% Intra-State)`}
          </span>
        </div>

        <div className="mt-3 space-y-1.5 text-xs">
          <div className="flex justify-between border-b border-dashed border-[#e3e9f2] pb-1.5">
            <span className="text-[#59677d]">
              {chosenPlan ? `Plan Fee (${chosenPlan.label})` : 'Course fee'}
            </span>
            <span className="font-mono font-bold text-[#142746] tabular-nums">
              {money(breakdown.base)}
            </span>
          </div>

          {breakdown.discount > 0 && (
            <div className="flex justify-between border-b border-dashed border-[#e3e9f2] pb-1.5 text-[#13845b]">
              <span>Coupon discount ({breakdown.couponApplied?.code})</span>
              <span className="font-mono font-bold tabular-nums">
                -{money(breakdown.discount)}
              </span>
            </div>
          )}

          <div className="flex justify-between border-b border-dashed border-[#e3e9f2] pb-1.5">
            <span className="text-[#59677d]">Taxable Value</span>
            <span className="font-mono font-semibold text-[#142746] tabular-nums">
              {money(breakdown.taxable)}
            </span>
          </div>

          {breakdown.gstSplit === 'igst' ? (
            <div className="flex justify-between border-b border-dashed border-[#e3e9f2] pb-1.5">
              <span className="text-[#59677d]">
                IGST ({breakdown.gstRate}% · Inter-State{' '}
                {settings.gstMode === 'inclusive' ? 'incl.' : 'added'})
              </span>
              <span className="font-mono font-bold text-[#142746] tabular-nums">
                {money(breakdown.igst)}
              </span>
            </div>
          ) : (
            <div className="flex justify-between border-b border-dashed border-[#e3e9f2] pb-1.5">
              <span className="text-[#59677d]">
                CGST ({breakdown.gstRate / 2}%) + SGST ({breakdown.gstRate / 2}%
                ) · Intra-State{settings.gstMode === 'inclusive' ? ' · incl.' : ''}
              </span>
              <span className="font-mono font-bold text-[#142746] tabular-nums">
                {money(breakdown.cgst)} + {money(breakdown.sgst)}
              </span>
            </div>
          )}

          {(settings.gstSection || settings.sacCode || settings.gstNumber) && (
            <div className="text-[11px] text-[#718096] pt-0.5">
              {settings.gstSection}
              {settings.sacCode ? ` · SAC ${settings.sacCode}` : ''}
              {settings.gstNumber ? ` · GSTIN ${settings.gstNumber}` : ''}
            </div>
          )}

          <div className="flex justify-between pt-1.5 text-sm font-extrabold text-[#142746]">
            <span>Total Payable</span>
            <span className="font-mono text-base tabular-nums text-[#13845b]">
              {money(breakdown.total)}
            </span>
          </div>
        </div>
      </div>

      {/* Month-wise Payment Plans */}
      {item.type === 'course' && coursePlans.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-bold text-[#59677d] mb-2">
            Choose Payment Mode (Full or Month-wise Plan)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleSelectPlan('')}
              className={`flex items-center justify-between rounded-[10px] border p-3 text-left text-xs transition-colors cursor-pointer ${
                selectedPlanId === ''
                  ? 'border-[#142746] bg-[#edf2fa] text-[#142746]'
                  : 'border-[#e3e9f2] bg-white text-[#59677d] hover:border-[#aabbd4]'
              }`}
            >
              <div>
                <div className="font-bold text-[#142746]">Full Course Access</div>
                <div className="text-[11px] text-[#718096]">Complete enrollment</div>
              </div>
              <span className="font-mono font-extrabold text-[#142746] tabular-nums">
                {money(item.data.price)}
              </span>
            </button>

            {coursePlans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => handleSelectPlan(plan.id)}
                className={`flex items-center justify-between rounded-[10px] border p-3 text-left text-xs transition-colors cursor-pointer ${
                  selectedPlanId === plan.id
                    ? 'border-[#142746] bg-[#edf2fa] text-[#142746]'
                    : 'border-[#e3e9f2] bg-white text-[#59677d] hover:border-[#aabbd4]'
                }`}
              >
                <div>
                  <div className="font-bold text-[#142746]">{plan.label}</div>
                  <div className="text-[11px] text-[#718096]">
                    {plan.months} {plan.months === 1 ? 'month' : 'months'} access
                  </div>
                </div>
                <span className="font-mono font-extrabold text-[#142746] tabular-nums">
                  {money(plan.price)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Coupon */}
        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-1.5">
            Coupon code (optional)
          </label>
          <div className="flex gap-2">
            <input
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value)}
              placeholder="Enter offer code (e.g. ARYA10)"
              className="flex-1 rounded-[10px] border border-[#e3e9f2] px-3.5 py-2 text-sm uppercase outline-none focus:border-[#315b9b]"
            />
            <button
              type="button"
              disabled={applying}
              onClick={handleApplyCoupon}
              className="rounded-[10px] bg-[#edf2fa] px-4 py-2 text-xs font-bold text-[#142746] hover:bg-[#dce6f7] whitespace-nowrap shrink-0 cursor-pointer"
            >
              {applying ? 'Checking...' : 'Apply'}
            </button>
          </div>
          {breakdown.couponError && (
            <p className="mt-1 text-xs font-medium text-[#c64b58]">
              {breakdown.couponError}
            </p>
          )}
          {breakdown.couponApplied && (
            <p className="mt-1 text-xs font-medium text-[#13845b]">
              Coupon {breakdown.couponApplied.code} applied!
            </p>
          )}
        </div>

        {/* Selectable Payment Method Cards (only required when payable > 0) */}
        {breakdown.total > 0 && (
        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-2">
            Select Payment Method / Gateway *
          </label>
          {activeMethods.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-[#f3bcc2] bg-[#fff0f1] p-3 text-xs text-[#c64b58]">
              No active payment method configured by Admin yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {activeMethods.map((m) => {
                const isSelected = (methodObj?.id || selectedMethod) === m.id;
                const mUpi = resolveMethodUpiId(m);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSelectedMethod(m.id);
                      setPaymentInitiated(false);
                      setUpiLaunchHint('');
                      setQrExpanded(false);
                      setSubmitError('');
                    }}
                    className={`flex items-center justify-between gap-2 rounded-[11px] border p-3 text-left text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-[#142746] bg-[#edf2fa]'
                        : 'border-[#e3e9f2] bg-white hover:border-[#aabbd4]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-[#142746] truncate">
                        {m.name}
                      </div>
                      <div className="text-[11px] text-[#718096]">
                        {isValidHttpUrl(m.gatewayUrl)
                          ? m.gatewayProvider || 'Online Payment Gateway'
                          : m.type === 'bank' && !mUpi
                            ? 'Bank Transfer'
                            : m.qrCodeUrl || mUpi
                              ? `Scan QR / UPI${mUpi ? ` · ${mUpi}` : ''}`
                              : 'UPI / Direct Pay'}
                      </div>
                    </div>
                    {isValidHttpUrl(m.gatewayUrl) ? (
                      <ExternalLink className="h-4 w-4 text-[#315b9b] shrink-0" />
                    ) : (
                      <QrCode className="h-4 w-4 text-[#142746] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        )}

        {/* WhatsApp / Phone Number BEFORE Ready to Pay */}
        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-1.5">
            WhatsApp / Phone Number (for Billing &amp; Alerts) *
          </label>
          <input
            ref={phoneInputRef}
            required
            type="tel"
            value={studentPhone}
            onChange={(e) => {
              setStudentPhone(e.target.value);
              setSubmitError('');
            }}
            placeholder="e.g. 9876543210"
            className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2 text-sm font-mono outline-none focus:border-[#315b9b]"
          />
        </div>

        {/* Step 2 Gate: Ready to Pay -> Reveals QR Code / GPay / Gateway */}
        {methodObj && breakdown.total > 0 && !paymentInitiated && (
          <div className="rounded-[13px] border border-[#d7a84b]/60 bg-[#fffaf0] p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[#59677d] min-w-0 flex-1">
              <div className="font-bold text-[#142746]">
                Ready to pay {money(breakdown.total)} via {methodObj.name}?
              </div>
              <div className="mt-0.5">
                Click <strong>Proceed to Pay</strong> to open the scannable QR code &amp; Google Pay / UPI payment panel with exact GST included.
              </div>
            </div>
            <button
              type="button"
              onClick={handleRevealQrPayment}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#142746] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer shrink-0"
            >
              <QrCode className="h-3.5 w-3.5 text-[#d7a84b]" />
              <span>Proceed to Pay {money(breakdown.total)}</span>
            </button>
          </div>
        )}

        {/* Active Method QR Code, Google Pay Direct QR, UPI Link or Gateway Checkout */}
        {methodObj && (paymentInitiated || breakdown.total === 0) && (
          <div
            ref={qrPanelRef}
            className="rounded-[13px] border border-[#dce6f5] bg-[#f8fafd] p-4 space-y-3"
          >
            {breakdown.total > 0 && (methodObj.qrCodeUrl || dynamicQrUrl) && (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="flex flex-wrap justify-center gap-2.5 shrink-0">
                  {methodObj.qrCodeUrl && (
                    <div className="rounded-xl border border-[#e3e9f2] bg-white p-2.5 text-center shadow-xs">
                      <img
                        src={methodObj.qrCodeUrl}
                        alt="Admin Payment QR Code"
                        className={
                          qrExpanded
                            ? 'h-56 w-56 object-contain'
                            : 'h-36 w-36 object-contain'
                        }
                      />
                      <div className="mt-1 text-[10px] font-bold text-[#142746]">
                        Admin QR Code
                      </div>
                    </div>
                  )}
                  {dynamicQrUrl && (
                    <div className="rounded-xl border border-[#dce6f7] bg-white p-2.5 text-center shadow-xs">
                      <img
                        src={dynamicQrUrl}
                        alt="GPay / UPI Exact Amount QR Code"
                        className={
                          qrExpanded
                            ? 'h-56 w-56 object-contain'
                            : 'h-36 w-36 object-contain'
                        }
                      />
                      <div className="mt-1 text-[10px] font-bold text-[#13845b] font-mono">
                        GPay / UPI · {money(breakdown.total)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 text-xs space-y-2.5 text-center sm:text-left min-w-0">
                  <div className="font-bold text-[#142746]">
                    Scan QR Code to pay {money(breakdown.total)}
                  </div>
                  {resolvedUpiId && (
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <span className="font-mono font-bold text-[#315b9b] bg-white border border-[#e3e9f2] rounded-md px-2.5 py-1">
                        {resolvedUpiId}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(resolvedUpiId);
                          setCopiedUpi(true);
                          setTimeout(() => setCopiedUpi(false), 2000);
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-[#e3e9f2] bg-white px-2.5 py-1 font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer"
                      >
                        <Copy className="h-3 w-3" />
                        <span>{copiedUpi ? 'Copied!' : 'Copy UPI'}</span>
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    {(dynamicQrUrl || methodObj.qrCodeUrl) && (
                      <>
                        <button
                          type="button"
                          onClick={() => setQrExpanded((v) => !v)}
                          className="inline-flex items-center gap-1 rounded-md border border-[#dce6f7] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer"
                        >
                          <Maximize2 className="h-3 w-3 text-[#315b9b]" />
                          <span>{qrExpanded ? 'Normal QR Size' : 'Enlarge QR'}</span>
                        </button>
                        <a
                          href={dynamicQrUrl || methodObj.qrCodeUrl}
                          download={`arya-tax-pay-${breakdown.total}.png`}
                          className="inline-flex items-center gap-1 rounded-md border border-[#dce6f7] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#142746] hover:bg-[#edf2fa]"
                        >
                          <Download className="h-3 w-3 text-[#13845b]" />
                          <span>Save QR</span>
                        </a>
                      </>
                    )}
                  </div>

                  {upiUri && (
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-0.5">
                      {gpayUri && (
                        <a
                          href={gpayUri}
                          onClick={() =>
                            setUpiLaunchHint(
                              'Opening Google Pay… If you are on a desktop/web browser without a UPI app installed, simply scan the QR code on the left with Google Pay or use "Save QR".'
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#142746] px-3 py-2 text-xs font-bold text-white hover:bg-[#1e3761]"
                        >
                          <QrCode className="h-3.5 w-3.5 text-[#d7a84b]" />
                          <span>Open GPay App</span>
                        </a>
                      )}
                      <a
                        href={upiUri}
                        onClick={() =>
                          setUpiLaunchHint(
                            'Opening PhonePe / Paytm / UPI app… On desktop browsers, scan the QR code directly using any UPI app.'
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#dce6f7] bg-white px-3 py-2 text-xs font-bold text-[#142746] hover:bg-[#edf2fa]"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-[#315b9b]" />
                        <span>PhonePe / Paytm / UPI</span>
                      </a>
                    </div>
                  )}

                  {upiLaunchHint && (
                    <p className="rounded-lg border border-[#dce6f7] bg-white px-2.5 py-1.5 text-[11px] text-[#315b9b]">
                      {upiLaunchHint}
                    </p>
                  )}
                </div>
              </div>
            )}

            {breakdown.total > 0 && hasHttpGatewayUrl && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dce6f7] bg-white p-3">
                <div className="text-xs">
                  <div className="font-bold text-[#142746]">
                    {methodObj.gatewayProvider || 'Online Payment Gateway'}
                  </div>
                  <div className="text-[#718096]">
                    Complete payment of{' '}
                    <strong className="font-mono text-[#142746]">
                      {money(breakdown.total)}
                    </strong>{' '}
                    and verify the Payment ID below.
                  </div>
                </div>
                <a
                  href={methodObj.gatewayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761]"
                >
                  <span>Pay via {methodObj.gatewayProvider || 'Gateway'}</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )}

            {breakdown.total > 0 && !methodObj.qrCodeUrl && !dynamicQrUrl && !hasHttpGatewayUrl && (
              <div className="rounded-lg border border-[#f1dca7] bg-[#fffaf0] p-3 text-xs text-[#8c6826]">
                Follow instructions below to pay{' '}
                <strong className="font-mono text-[#142746]">{money(breakdown.total)}</strong>, then enter &amp; verify your Transaction ID.
              </div>
            )}

            {methodObj.info && (
              <div className="text-xs text-[#59677d] leading-relaxed whitespace-pre-line border-t border-[#e3e9f2] pt-2.5">
                <span className="font-bold text-[#142746]">Instructions: </span>
                {methodObj.info}
              </div>
            )}
          </div>
        )}

        {/* Transaction ID / UTR Verification + Optional Screenshot Proof */}
        {(paymentInitiated || breakdown.total === 0) && breakdown.total > 0 && (
          <div className="rounded-[13px] border border-[#e3e9f2] bg-white p-3.5 space-y-3">
            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1.5">
                Transaction ID / 12-Digit UPI UTR / Payment Ref *
              </label>
              <div className="flex gap-2">
                <input
                  required
                  value={reference}
                  onChange={(e) => {
                    setReference(e.target.value);
                    setSubmitError('');
                  }}
                  placeholder="e.g. 412345678901 or pay_..."
                  className="flex-1 rounded-[10px] border border-[#e3e9f2] px-3.5 py-2 text-sm font-mono outline-none focus:border-[#315b9b]"
                />
                <button
                  type="button"
                  disabled={!reference.trim() || proofChecking}
                  onClick={() => void runProofVerification(reference)}
                  className="rounded-[10px] border border-[#dce6f7] bg-[#edf2fa] px-3.5 py-2 text-xs font-bold text-[#142746] hover:bg-[#dce6f7] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {proofChecking ? 'Verifying...' : 'Verify ID'}
                </button>
              </div>

              {proofStatus ? (
                <div
                  className={`mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                    proofStatus.valid
                      ? 'border-[#bfe6d5] bg-[#eefaf4] text-[#0f6c4a]'
                      : 'border-[#f3bcc2] bg-[#fff0f1] text-[#c64b58]'
                  }`}
                >
                  {proofStatus.valid ? (
                    <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-[#13845b]" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#c64b58]" />
                  )}
                  <div>
                    <span className="font-extrabold">
                      {proofStatus.valid
                        ? `Verified · ${proofStatus.proofType}`
                        : proofStatus.proofType}
                    </span>{' '}
                    — {proofStatus.message}
                  </div>
                </div>
              ) : (
                <p className="mt-1.5 text-[11px] text-[#718096]">
                  Paste your 12-digit UPI UTR from Google Pay / PhonePe / Paytm (or Gateway Payment ID) — it auto-verifies format &amp; uniqueness before submission.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1.5">
                Upload Payment Receipt Screenshot (optional · helps Admin verify faster)
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                <label className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#dce6f7] bg-[#f8fafd] px-3 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer">
                  <Upload className="h-3.5 w-3.5 text-[#315b9b]" />
                  <span>{proofScreenshotUrl ? 'Change Screenshot' : 'Attach Screenshot'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleProofScreenshot}
                    className="sr-only"
                  />
                </label>
                {proofScreenshotUrl && (
                  <>
                    <span className="text-[11px] font-semibold text-[#13845b]">
                      ✓ Screenshot attached
                    </span>
                    <button
                      type="button"
                      onClick={() => setProofScreenshotUrl('')}
                      className="text-[11px] font-bold text-[#c64b58] hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {submitError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-[10px] border border-[#f3bcc2] bg-[#fff0f1] px-3.5 py-2.5 text-xs font-semibold text-[#c64b58]"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        {(paymentInitiated || breakdown.total === 0) && (
          <button
            type="submit"
            disabled={
              submitting ||
              (breakdown.total > 0 && (activeMethods.length === 0 || !proofStatus?.valid))
            }
            className="w-full rounded-[10px] bg-[#d7a84b] px-4 py-2.5 text-sm font-bold text-[#18243a] hover:bg-[#cca042] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {submitting
              ? 'Submitting Verified Proof...'
              : breakdown.total === 0
                ? 'Activate Free Enrollment (₹0)'
                : proofStatus?.valid
                  ? `Submit Verified Payment (${money(breakdown.total)}) for Admin Approval`
                  : 'Enter & Verify Valid Transaction ID First'}
          </button>
        )}

        <p className="text-[11px] text-[#718096] leading-relaxed">
          {breakdown.total === 0
            ? `₹0 enrollment activates immediately and generates a confirmation receipt for ${user.email}.`
            : `Security Verification Lock: Paid courses stay locked (Verification In Progress) until Owner / Admin verifies payment receipt. GST Tax Invoice generates automatically for ${user.email} upon approval.`}
        </p>
      </form>
    </ModalShell>
  );
}

/* 6. Payment Method Edit Modal */
export function PaymentMethodModal({
  open,
  method,
  brandName,
  onClose,
  onSave,
}: {
  open: boolean;
  method: PaymentMethod | null;
  brandName?: string;
  onClose: () => void;
  onSave: (
    id: string,
    payload: Partial<Omit<PaymentMethod, 'id'>>
  ) => Promise<void> | void;
}) {
  const [type, setType] = useState<PaymentMethodType>('upi_qr');
  const [name, setName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [gatewayProvider, setGatewayProvider] = useState('Razorpay');
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [info, setInfo] = useState('');
  const [previewQr, setPreviewQr] = useState('');

  useEffect(() => {
    if (open && method) {
      setType(method.type || 'upi_qr');
      setName(method.name);
      setUpiId(resolveMethodUpiId(method) || method.upiId || '');
      setQrCodeUrl(method.qrCodeUrl || '');
      setGatewayProvider(method.gatewayProvider || 'Razorpay');
      setGatewayUrl(isValidHttpUrl(method.gatewayUrl) ? method.gatewayUrl || '' : '');
      setInfo(method.info || '');
    }
  }, [open, method]);

  useEffect(() => {
    let active = true;
    const effectiveUpi = resolveMethodUpiId({ upiId, gatewayUrl, info });
    if (!effectiveUpi) {
      setPreviewQr('');
      return;
    }
    generateQrDataUrl(
      buildUpiUri({
        upiId: effectiveUpi,
        payeeName: brandName || 'ARYA TAX PATHSHALA',
        amount: 100,
      })
    )
      .then((u) => {
        if (active) setPreviewQr(u);
      })
      .catch(() => {
        if (active) setPreviewQr('');
      });
    return () => {
      active = false;
    };
  }, [upiId, gatewayUrl, info, brandName]);

  if (!method) return null;

  const handleQrUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressQrImageFile(file);
      setQrCodeUrl(compressed);
    } catch {
      // ignore invalid image
    }
    e.target.value = '';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSave(method.id, {
      type,
      name: name.trim(),
      upiId: upiId.trim(),
      qrCodeUrl: qrCodeUrl.trim(),
      gatewayProvider: type === 'gateway' ? gatewayProvider.trim() : '',
      gatewayUrl: type === 'gateway' ? gatewayUrl.trim() : '',
      info: info.trim(),
    });
    onClose();
  };

  return (
    <ModalShell
      open={open}
      title="Edit Payment Method, QR & Gateway"
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1.5">
              Method Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as PaymentMethodType)}
              className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
            >
              <option value="upi_qr">UPI &amp; Admin QR Code</option>
              <option value="gateway">Payment Gateway</option>
              <option value="bank">Bank Transfer</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1.5">
              Method name *
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
            />
          </div>
        </div>

        {type === 'upi_qr' && (
          <>
            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1.5">
                UPI ID (auto-generates dynamic scannable QR)
              </label>
              <input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="yourid@okicici"
                className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm font-mono outline-none focus:border-[#315b9b]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1.5">
                Admin QR Code Image
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#dce6f7] bg-[#f8fafd] px-3 py-2 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer">
                  <Upload className="h-3.5 w-3.5 text-[#315b9b]" />
                  <span>Upload / Replace QR Image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleQrUpload}
                    className="sr-only"
                  />
                </label>
                {qrCodeUrl && (
                  <button
                    type="button"
                    onClick={() => setQrCodeUrl('')}
                    className="text-xs font-bold text-[#c64b58] hover:underline cursor-pointer"
                  >
                    Remove Uploaded QR
                  </button>
                )}
              </div>
              {!qrCodeUrl.startsWith('data:') && (
                <input
                  value={qrCodeUrl}
                  onChange={(e) => setQrCodeUrl(e.target.value)}
                  placeholder="Or paste QR image URL..."
                  className="mt-2 w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
                />
              )}

              {(qrCodeUrl || previewQr) && (
                <div className="mt-2.5 flex items-center gap-3 rounded-xl border border-[#e3e9f2] bg-[#f8fafd] p-2.5">
                  <img
                    src={qrCodeUrl || previewQr}
                    alt="QR Code"
                    className="h-20 w-20 rounded border border-[#e3e9f2] object-contain bg-white"
                  />
                  <div className="text-xs text-[#59677d]">
                    {qrCodeUrl
                      ? 'Uploaded Admin QR Code will be shown directly at checkout.'
                      : 'Auto-generated UPI QR for exact invoice amount.'}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {type === 'gateway' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1.5">
                Gateway Provider
              </label>
              <select
                value={gatewayProvider}
                onChange={(e) => setGatewayProvider(e.target.value)}
                className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
              >
                <option value="Razorpay">Razorpay</option>
                <option value="Cashfree">Cashfree Payments</option>
                <option value="PhonePe PG">PhonePe Payment Gateway</option>
                <option value="PayU">PayU India</option>
                <option value="Stripe">Stripe</option>
                <option value="Custom Gateway">Custom Gateway</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1.5">
                Gateway Checkout URL
              </label>
              <input
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
                placeholder="https://rzp.io/l/..."
                className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-xs font-mono outline-none focus:border-[#315b9b]"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-1.5">
            Payment instructions / Bank details
          </label>
          <textarea
            rows={3}
            value={info}
            onChange={(e) => setInfo(e.target.value)}
            className="w-full rounded-[10px] border border-[#e3e9f2] px-3.5 py-2.5 text-sm outline-none focus:border-[#315b9b]"
          />
        </div>
        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[#e3e9f2] bg-white px-4 py-2 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
          >
            Save Method
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* 7. Luxury A4 Landscape Read-Only Certificate Modal (Matching Navy & Metallic Gold Reference) */
export function CertificateModal({
  open,
  target,
  allCourses,
  user,
  settings,
  customRecords,
  onEditAsAdmin,
  onClose,
}: {
  open: boolean;
  target:
    | { type: 'course'; course: Course }
    | { type: 'bundle'; bundle: Bundle }
    | null;
  allCourses: Course[];
  user: User;
  settings: PortalSettings;
  customRecords: CustomCertificateRecord[];
  onEditAsAdmin?: () => void;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  if (!target) return null;

  const data = resolveCertificateViewData({
    targetType: target.type,
    course: target.type === 'course' ? target.course : null,
    bundle: target.type === 'bundle' ? target.bundle : null,
    allCourses,
    user,
    settings,
    customRecords,
  });

  const isUploadedPdf = Boolean(
    data.mode === 'uploaded' &&
      data.uploadedUrl &&
      data.uploadedUrl.startsWith('data:application/pdf')
  );

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadA4CertificatePng(data);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title={`${target.type === 'bundle' ? 'Bundle' : 'Course'} A4 Certificate · Read-Only Verified`}
      onClose={onClose}
      maxWidth="max-w-5xl"
    >
      {user.role === 'student' && (
        <div className="no-print mb-3 flex items-center justify-between gap-2 rounded-[10px] border border-[#dce6f5] bg-[#f8fafd] px-3.5 py-2 text-xs text-[#59677d]">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-[#13845b] shrink-0" />
            <span>
              Official verified e-certificate auto-populated from your Profile details. Read-only for students.
            </span>
          </span>
          <span className="font-mono font-bold text-[#142746] shrink-0">
            A4 Landscape (297×210mm)
          </span>
        </div>
      )}

      {data.mode === 'uploaded' && data.uploadedUrl ? (
        <div className="print-only-certificate relative aspect-[297/210] w-full overflow-hidden rounded-[8px] border border-[#e3e9f2] bg-white shadow-lg">
          {isUploadedPdf ? (
            <object
              data={data.uploadedUrl}
              type="application/pdf"
              className="h-full w-full"
            >
              <iframe
                src={data.uploadedUrl}
                title={data.targetTitle}
                className="h-full w-full border-0"
              />
            </object>
          ) : (
            <img
              src={data.uploadedUrl}
              alt={`${data.targetTitle} Official Certificate`}
              referrerPolicy="no-referrer"
              className="h-full w-full object-contain bg-white"
            />
          )}
        </div>
      ) : (
        <div
          className="print-only-certificate relative aspect-[297/210] w-full overflow-hidden border border-[#d6c292] bg-[#fdfcf8] shadow-xl select-none"
          style={{
            background:
              'radial-gradient(circle at 46% 45%, #ffffff 0%, #f5efe2 100%)',
          }}
        >
          {/* Outer Navy Frame & Inner Gold Rule */}
          <div className="pointer-events-none absolute inset-0 border-[6px] sm:border-[10px] border-[#13243f]" />
          <div className="pointer-events-none absolute inset-[12px] sm:inset-[18px] border border-[#c89b3c]" />

          {/* Top-Right Metallic Gold & Navy Diagonal Corner */}
          <svg
            viewBox="0 0 1000 707"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="certGoldTop" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#b8862d" />
                <stop offset="50%" stopColor="#f3dc94" />
                <stop offset="100%" stopColor="#a1711f" />
              </linearGradient>
              <linearGradient id="certGoldBot" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="#a67521" />
                <stop offset="50%" stopColor="#f4de97" />
                <stop offset="100%" stopColor="#b9872d" />
              </linearGradient>
            </defs>
            {/* Top-Right Sweep */}
            <polygon points="540,0 1000,0 1000,262" fill="url(#certGoldTop)" />
            <polygon points="602,0 1000,0 1000,220" fill="#13243f" />
            {/* Bottom-Left & Bottom Ribbon Sweep */}
            <polygon points="0,445 385,707 0,707" fill="url(#certGoldBot)" />
            <polygon
              points="0,488 312,707 1000,707 1000,602 0,652"
              fill="#13243f"
            />
            <line
              x1="0"
              y1="630"
              x2="1000"
              y2="580"
              stroke="url(#certGoldBot)"
              strokeWidth="4.5"
            />
          </svg>

          {/* Foreground Content Layer */}
          <div className="relative z-10 flex h-full flex-col justify-between px-[6%] py-[5.2%] text-left">
            {/* Top Header */}
            <div className="pr-[22%]">
              <div className="text-[10px] sm:text-xs font-extrabold tracking-[0.24em] uppercase text-[#13243f]">
                {data.brandName}
              </div>
              <div className="mt-0.5 font-mono text-[9px] sm:text-[11px] font-semibold text-[#64748b] tabular-nums">
                Cert No: {data.certificateNo} · Reg ID: {data.recipientEnrollmentNo}
              </div>

              <h1
                className="mt-2 sm:mt-4 font-serif text-2xl sm:text-4xl md:text-5xl font-bold tracking-[0.06em] uppercase"
                style={{ color: '#c4963b' }}
              >
                {data.heading}
              </h1>

              <div className="mt-1 flex items-center gap-3">
                <span className="text-[10px] sm:text-sm font-extrabold tracking-[0.22em] uppercase text-[#13243f] whitespace-nowrap">
                  {data.subheading}
                </span>
                <span className="h-[1.5px] flex-1 max-w-[180px] bg-[#c4963b]" />
              </div>
            </div>

            {/* Recipient & Course / Bundle Body */}
            <div className="my-auto pr-[12%]">
              <p className="font-serif text-[11px] sm:text-sm text-[#475569]">
                This certificate is proudly presented to
              </p>

              <div className="mt-1 sm:mt-2 inline-block min-w-[55%] border-b-2 border-[#d4a64a] pb-1 font-serif text-xl sm:text-3xl md:text-4xl font-bold text-[#13243f]">
                {data.recipientName}
              </div>

              {(data.recipientGuardian || data.recipientAddressLine) && (
                <div className="mt-1.5 text-[10px] sm:text-xs font-medium text-[#334155]">
                  {data.recipientGuardian && (
                    <span>S/O / D/O: {data.recipientGuardian}</span>
                  )}
                  {data.recipientGuardian && data.recipientAddressLine && (
                    <span className="mx-1.5 text-[#94a3b8]">·</span>
                  )}
                  {data.recipientAddressLine && (
                    <span>Address: {data.recipientAddressLine}</span>
                  )}
                </div>
              )}

              <p className="mt-2 sm:mt-3 max-w-2xl text-[11px] sm:text-sm text-[#475569] leading-relaxed">
                {data.bodyText}
              </p>

              <div className="mt-2">
                <div className="text-[9px] sm:text-[11px] font-extrabold tracking-[0.16em] uppercase text-[#8c6826]">
                  {data.categoryLabel}
                </div>
                <h2 className="mt-0.5 font-serif text-base sm:text-xl md:text-2xl font-bold text-[#13243f] leading-snug">
                  {data.targetTitle}
                </h2>
                {data.includedCourses && data.includedCourses.length > 0 && (
                  <p className="mt-0.5 text-[10px] sm:text-xs text-[#475569] line-clamp-1">
                    Includes: {data.includedCourses.join(' · ')}
                  </p>
                )}
              </div>
            </div>

            {/* Bottom Signatures + Gold Rosette Medal */}
            <div className="relative flex items-end justify-between gap-4 pb-3 sm:pb-5 pr-[16%]">
              <div className="flex flex-wrap items-end gap-6 sm:gap-12">
                {/* Admin Uploaded Authorized Signature Block */}
                <div className="min-w-[130px] sm:min-w-[175px] text-center">
                  <div className="flex h-10 sm:h-12 items-end justify-center pb-1">
                    {data.signatureUrl ? (
                      <img
                        src={data.signatureUrl}
                        alt="Authorized Signature"
                        referrerPolicy="no-referrer"
                        className="max-h-10 sm:max-h-12 max-w-[150px] object-contain"
                      />
                    ) : (
                      <span className="font-serif italic text-xs text-[#94a3b8]">
                        Digitally Verified
                      </span>
                    )}
                  </div>
                  <div className="border-t border-[#475569] pt-1 text-[11px] sm:text-xs font-bold text-[#13243f]">
                    {data.signerName}
                  </div>
                  <div className="text-[8px] sm:text-[10px] font-semibold tracking-wider uppercase text-[#64748b]">
                    Authorized Signatory
                  </div>
                </div>

                {/* Issue Date Block */}
                <div className="min-w-[120px] sm:min-w-[150px] text-center">
                  <div className="flex h-10 sm:h-12 items-end justify-center pb-1 font-mono text-[10px] sm:text-xs font-bold text-[#13243f] tabular-nums">
                    {data.issuedDate}
                  </div>
                  <div className="border-t border-[#475569] pt-1 text-[11px] sm:text-xs font-bold text-[#13243f]">
                    {data.brandName}
                  </div>
                  <div className="text-[8px] sm:text-[10px] font-semibold tracking-wider uppercase text-[#64748b]">
                    Date of Issue
                  </div>
                </div>
              </div>

              {/* Footer line resting inside Navy ribbon */}
              <div className="absolute -bottom-3 sm:-bottom-4 left-0 text-[9px] sm:text-[11px] font-medium text-[#e2e8f0]">
                {data.footerText}
              </div>
            </div>
          </div>

          {/* Bottom-Right Embossed Gold Rosette Seal */}
          <div className="pointer-events-none absolute bottom-[6%] right-[4.5%] z-20 h-[21%] aspect-square">
            <svg viewBox="0 0 180 210" className="h-full w-full drop-shadow-md">
              <defs>
                <radialGradient id="rosetteFace" cx="35%" cy="35%" r="70%">
                  <stop offset="0%" stopColor="#fcedb3" />
                  <stop offset="55%" stopColor="#d7a84b" />
                  <stop offset="100%" stopColor="#9c6b19" />
                </radialGradient>
              </defs>
              {/* Twin Ribbon Tails */}
              <polygon
                points="55,118 35,205 68,185 90,205 90,118"
                fill="#b48228"
              />
              <polygon
                points="90,118 90,205 112,185 145,205 125,118"
                fill="#d7a84b"
              />
              {/* Scalloped Outer Rosette */}
              <polygon
                fill="#c28e2d"
                points={Array.from({ length: 36 })
                  .map((_, i) => {
                    const angle = (i * Math.PI) / 18;
                    const r = i % 2 === 0 ? 74 : 66;
                    return `${90 + Math.cos(angle) * r},${82 + Math.sin(angle) * r}`;
                  })
                  .join(' ')}
              />
              <circle cx="90" cy="82" r="58" fill="url(#rosetteFace)" />
              <circle
                cx="90"
                cy="82"
                r="47"
                fill="none"
                stroke="#7a5111"
                strokeWidth="2.5"
              />
              <text
                x="90"
                y="87"
                textAnchor="middle"
                fill="#523508"
                fontSize="14"
                fontWeight="800"
                fontFamily="sans-serif"
              >
                {data.sealText.toUpperCase().slice(0, 11)}
              </text>
            </svg>
          </div>
        </div>
      )}

      <div className="no-print mt-5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="text-xs text-[#718096]">
          {data.notes ? (
            <span>Note: {data.notes}</span>
          ) : (
            <span>
              Set paper orientation to Landscape &amp; Margins to None for edge-to-edge A4 PDF.
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user.role === 'admin' && onEditAsAdmin && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEditAsAdmin();
              }}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#dce6f7] bg-[#f8fafd] px-3.5 py-2 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer"
            >
              <Pencil className="h-3.5 w-3.5 text-[#315b9b]" />
              <span>Edit Template</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[#e3e9f2] bg-white px-4 py-2 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            disabled={downloading}
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] disabled:opacity-60 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-[#d7a84b]" />
            <span>
              {downloading
                ? 'Preparing A4...'
                : data.mode === 'uploaded'
                  ? 'Download Certificate'
                  : 'Download A4 PNG (300 DPI)'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#d7a84b] px-4 py-2 text-xs font-bold text-[#18243a] hover:bg-[#cca042] cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print / Save A4 PDF</span>
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* 7b. Admin Per-Course / Per-Bundle Certificate Template & Custom Upload Modal */
export function CertificateTemplateModal({
  open,
  target,
  onClose,
  onSave,
}: {
  open: boolean;
  target:
    | { type: 'course'; course: Course }
    | { type: 'bundle'; bundle: Bundle }
    | null;
  onClose: () => void;
  onSave: (config: CertificateTemplateConfig) => Promise<void>;
}) {
  const [mode, setMode] = useState<'template' | 'uploaded'>('template');
  const [heading, setHeading] = useState('');
  const [certificateTitle, setCertificateTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [signerName, setSignerName] = useState('');
  const [footerText, setFooterText] = useState('');
  const [customTemplateUrl, setCustomTemplateUrl] = useState('');
  const [customTemplateName, setCustomTemplateName] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [saving, setSaving] = useState(false);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current && target) {
      const cfg =
        target.type === 'bundle'
          ? target.bundle.certificateConfig || {}
          : target.course.certificateConfig || {};
      setMode(cfg.mode || 'template');
      setHeading(cfg.heading || '');
      setCertificateTitle(
        cfg.certificateTitle ||
          (target.type === 'bundle' ? target.bundle.name : target.course.title)
      );
      setSubtitle(cfg.subtitle || '');
      setSignerName(cfg.signerName || '');
      setFooterText(cfg.footerText || '');
      setCustomTemplateUrl(cfg.customTemplateUrl || '');
      setCustomTemplateName(cfg.customTemplateName || '');
      setUploadError('');
      setSaving(false);
    }
    wasOpen.current = open;
  }, [open, target]);

  if (!target) return null;

  const targetName =
    target.type === 'bundle' ? target.bundle.name : target.course.title;

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    try {
      const parsed = await readCertificateAssetFile(file);
      setCustomTemplateUrl(parsed.dataUrl);
      setCustomTemplateName(parsed.fileName);
      setMode('uploaded');
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Could not load certificate file.'
      );
    }
    e.target.value = '';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        mode,
        heading: heading.trim() || undefined,
        certificateTitle: certificateTitle.trim() || undefined,
        subtitle: subtitle.trim() || undefined,
        signerName: signerName.trim() || undefined,
        footerText: footerText.trim() || undefined,
        customTemplateUrl: customTemplateUrl.trim() || undefined,
        customTemplateName: customTemplateName.trim() || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title={`Edit ${target.type === 'bundle' ? 'Bundle' : 'Course'} Certificate · ${targetName}`}
      onClose={onClose}
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setMode('template')}
            className={`rounded-[10px] border px-3 py-2.5 text-left text-xs transition-colors cursor-pointer ${
              mode === 'template'
                ? 'border-[#142746] bg-[#edf2fa] text-[#142746]'
                : 'border-[#e3e9f2] bg-white text-[#59677d]'
            }`}
          >
            <div className="font-bold">1. Edit Portal A4 Template</div>
            <div className="text-[11px] opacity-80 mt-0.5">
              Auto-fills student profile, address &amp; Admin signature
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMode('uploaded')}
            className={`rounded-[10px] border px-3 py-2.5 text-left text-xs transition-colors cursor-pointer ${
              mode === 'uploaded'
                ? 'border-[#142746] bg-[#edf2fa] text-[#142746]'
                : 'border-[#e3e9f2] bg-white text-[#59677d]'
            }`}
          >
            <div className="font-bold">2. Upload Custom Certificate</div>
            <div className="text-[11px] opacity-80 mt-0.5">
              Handmade / Photoshop / Canva file (read-only for students)
            </div>
          </button>
        </div>

        {mode === 'template' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1">
                  Certificate Heading
                </label>
                <input
                  value={heading}
                  onChange={(e) => setHeading(e.target.value)}
                  placeholder="Certificate of Achievement"
                  className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#59677d] mb-1">
                  Signer Name Override
                </label>
                <input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Leave blank to use Global Signatory"
                  className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Program Title Displayed on Certificate
              </label>
              <input
                value={certificateTitle}
                onChange={(e) => setCertificateTitle(e.target.value)}
                placeholder={targetName}
                className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Completion Wording / Citation
              </label>
              <textarea
                rows={2}
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="e.g. has successfully completed practical training in GST Return Filing, ITC Reconciliation & Audit"
                className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#59677d] mb-1">
                Footer Note Override
              </label>
              <input
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                placeholder="Leave blank to use global certificate footer"
                className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
              />
            </div>
          </div>
        ) : (
          <div className="rounded-[12px] border border-[#dce6f5] bg-[#f8fafd] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-[#142746]">
                  Upload Handmade / External Software Certificate
                </div>
                <div className="text-[11px] text-[#718096]">
                  Accepts PNG, JPG, WebP (A4 landscape recommended) or PDF under 6 MB.
                </div>
              </div>
              <label className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#142746] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer">
                <Upload className="h-3.5 w-3.5 text-[#d7a84b]" />
                <span>Choose File</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
              </label>
            </div>

            {uploadError && (
              <p className="text-xs font-semibold text-[#c64b58]">{uploadError}</p>
            )}

            {customTemplateUrl && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#13845b]">
                    Attached: {customTemplateName || 'Uploaded Certificate'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomTemplateUrl('');
                      setCustomTemplateName('');
                    }}
                    className="font-bold text-[#c64b58] hover:underline cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
                {!customTemplateUrl.startsWith('data:application/pdf') && (
                  <img
                    src={customTemplateUrl}
                    alt="Uploaded Certificate Preview"
                    className="aspect-[297/210] w-full rounded-lg border border-[#e3e9f2] object-contain bg-white"
                  />
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[#e3e9f2] bg-white px-4 py-2 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] disabled:opacity-60 cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save Certificate Config'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* 8. Admin Broadcast Announcement Modal */
export function AnnouncementModal({
  open,
  announcement,
  onClose,
  onSave,
  onClear,
}: {
  open: boolean;
  announcement: Announcement | null;
  onClose: () => void;
  onSave: (payload: {
    active: boolean;
    category: AnnouncementCategory;
    title: string;
    message: string;
    actionPage?: 'courses' | 'mycourses' | 'certificates' | '';
    actionLabel?: string;
  }) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [category, setCategory] = useState<AnnouncementCategory>('update');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [actionPage, setActionPage] = useState<
    '' | 'courses' | 'mycourses' | 'certificates'
  >('');
  const [actionLabel, setActionLabel] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setCategory(announcement?.category || 'update');
      setTitle(announcement?.title || '');
      setMessage(announcement?.message || '');
      setActionPage(announcement?.actionPage || '');
      setActionLabel(announcement?.actionLabel || '');
      setActive(announcement ? announcement.active : true);
      setSaving(false);
    }
    wasOpen.current = open;
  }, [open, announcement]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSaving(true);
    try {
      await onSave({
        active,
        category,
        title: title.trim(),
        message: message.trim(),
        actionPage,
        actionLabel: actionLabel.trim(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title="Broadcast Dashboard Announcement"
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <p className="text-xs text-[#718096] mb-3 leading-relaxed">
        Students will see this dismissible banner at the top of their Dashboard
        across all devices. Updating it re-displays the notice even if a
        student dismissed an older version.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Notice type
            </label>
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as AnnouncementCategory)
              }
              className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
            >
              <option value="update">Important Update</option>
              <option value="exam">Exam Schedule</option>
              <option value="course">New Course Notification</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Short headline (optional)
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. GSTR-9 Assessment Date"
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-1">
            Broadcast message *
          </label>
          <textarea
            required
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write the update, exam schedule, or new course launch details..."
            className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Quick action destination
            </label>
            <select
              value={actionPage}
              onChange={(e) =>
                setActionPage(
                  e.target.value as
                    | ''
                    | 'courses'
                    | 'mycourses'
                    | 'certificates'
                )
              }
              className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
            >
              <option value="">None (message only)</option>
              <option value="courses">Course Catalogue</option>
              <option value="mycourses">My Learning</option>
              <option value="certificates">Certificates</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Action button label
            </label>
            <input
              disabled={!actionPage}
              value={actionLabel}
              onChange={(e) => setActionLabel(e.target.value)}
              placeholder={actionPage ? 'e.g. View New Course' : 'Select destination first'}
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b] disabled:bg-[#f8fafd] disabled:text-[#94a3b8]"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-[#e3e9f2] px-3 py-2.5 text-xs font-semibold text-[#142746] cursor-pointer">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-[#cbd5e1]"
          />
          <span>Show announcement banner to students on Dashboard</span>
        </label>

        <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5">
          {announcement ? (
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await onClear();
                  onClose();
                } finally {
                  setSaving(false);
                }
              }}
              className="rounded-[10px] border border-[#f3bcc2] bg-[#fff0f1] px-3.5 py-2 text-xs font-bold text-[#c64b58] hover:bg-[#ffe2e5] cursor-pointer"
            >
              Remove Announcement
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[10px] border border-[#e3e9f2] bg-white px-4 py-2 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Publishing...' : 'Publish Broadcast'}
            </button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

/* 9. Admin Edit Welcome / Course Overview Video Modal */
export function WelcomeVideoModal({
  open,
  showcase,
  onClose,
  onSave,
}: {
  open: boolean;
  showcase: WelcomeShowcase;
  onClose: () => void;
  onSave: (payload: Partial<WelcomeShowcase>) => Promise<void>;
}) {
  const [title, setTitle] = useState(showcase.title);
  const [subtitle, setSubtitle] = useState(showcase.subtitle);
  const [videoUrl, setVideoUrl] = useState(showcase.videoUrl);
  const [mentorName, setMentorName] = useState(showcase.mentorName);
  const [mentorRole, setMentorRole] = useState(showcase.mentorRole);
  const [photoUrl, setPhotoUrl] = useState(showcase.photoUrl);
  const [autoplay, setAutoplay] = useState(showcase.autoplay);
  const [loop, setLoop] = useState(showcase.loop);
  const [active, setActive] = useState(showcase.active);
  const [saving, setSaving] = useState(false);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setTitle(showcase.title);
      setSubtitle(showcase.subtitle);
      setVideoUrl(showcase.videoUrl);
      setMentorName(showcase.mentorName);
      setMentorRole(showcase.mentorRole);
      setPhotoUrl(
        showcase.photoUrl ||
          '/assets/aistudio/IMG_20251110_092655_764_2c1ee29a.webp'
      );
      setAutoplay(showcase.autoplay);
      setLoop(showcase.loop);
      setActive(showcase.active);
      setSaving(false);
    }
    wasOpen.current = open;
  }, [open, showcase]);

  const detectedYtId = videoUrl.trim() ? youtubeId(videoUrl) : '';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        subtitle: subtitle.trim(),
        videoUrl: normalizeVideoUrl(videoUrl),
        mentorName: mentorName.trim(),
        mentorRole: mentorRole.trim(),
        photoUrl: photoUrl.trim(),
        autoplay,
        loop,
        active,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title="Edit Dashboard Intro Video & Mentor Card"
      onClose={onClose}
      maxWidth="max-w-xl"
    >
      <p className="text-xs text-[#718096] mb-3 leading-relaxed">
        Paste any YouTube link (including <strong>Unlisted YouTube links</strong>)
        or direct MP4 video URL. It plays automatically inside the portal
        Dashboard with inbuilt volume, speed, and minimize controls — without
        redirecting to external apps.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-1">
            Video link (YouTube Unlisted / Standard URL or MP4 URL)
          </label>
          <input
            type="text"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
            className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
          />
          {videoUrl.trim() && (
            <p
              className={`mt-1 text-[11px] font-semibold ${
                detectedYtId ? 'text-[#13845b]' : 'text-[#315b9b]'
              }`}
            >
              {detectedYtId
                ? `YouTube Video ID detected (${detectedYtId}) — ready for inbuilt playback.`
                : 'Direct video stream URL detected (MP4/WebM).'}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-1">
            Panel headline *
          </label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-1">
            Course overview summary
          </label>
          <textarea
            rows={2}
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Mentor / Instructor name
            </label>
            <input
              value={mentorName}
              onChange={(e) => setMentorName(e.target.value)}
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Title / Designation
            </label>
            <input
              value={mentorRole}
              onChange={(e) => setMentorRole(e.target.value)}
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-1">
            Mentor photo path or URL
          </label>
          <input
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="/assets/aistudio/IMG_20251110_092655_764_2c1ee29a.webp"
            className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-[#e3e9f2] px-3 py-2 text-xs font-semibold text-[#142746] cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 rounded border-[#cbd5e1]"
            />
            <span>Show on Dashboard</span>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-[#e3e9f2] px-3 py-2 text-xs font-semibold text-[#142746] cursor-pointer">
            <input
              type="checkbox"
              checked={autoplay}
              onChange={(e) => setAutoplay(e.target.checked)}
              className="h-4 w-4 rounded border-[#cbd5e1]"
            />
            <span>Autoplay on open</span>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-[#e3e9f2] px-3 py-2 text-xs font-semibold text-[#142746] cursor-pointer">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
              className="h-4 w-4 rounded border-[#cbd5e1]"
            />
            <span>Loop video</span>
          </label>
        </div>

        <div className="pt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[#e3e9f2] bg-white px-4 py-2 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] disabled:opacity-60 cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save & Publish Video'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* 10. Admin Edit Platform & Social Links Modal */
const PLATFORM_PRESETS: Array<{
  platform: SocialPlatformType;
  label: string;
  subtitle: string;
  placeholder: string;
}> = [
  {
    platform: 'whatsapp',
    label: 'WhatsApp Community / Support',
    subtitle: 'Direct mentor doubt & batch updates',
    placeholder: 'https://wa.me/91XXXXXXXXXX',
  },
  {
    platform: 'youtube',
    label: 'Official YouTube Channel',
    subtitle: 'Free tax tutorials & live webinars',
    placeholder: 'https://youtube.com/@yourchannel',
  },
  {
    platform: 'telegram',
    label: 'Telegram Study Group',
    subtitle: 'Daily notes, PDFs & notifications',
    placeholder: 'https://t.me/yourgroup',
  },
  {
    platform: 'instagram',
    label: 'Instagram Official',
    subtitle: 'Reels & quick tax updates',
    placeholder: 'https://instagram.com/yourhandle',
  },
  {
    platform: 'facebook',
    label: 'Facebook Page / Group',
    subtitle: 'Community Q&A and announcements',
    placeholder: 'https://facebook.com/yourpage',
  },
  {
    platform: 'website',
    label: 'Official Website / Portal',
    subtitle: 'Tax tools, forms & resources',
    placeholder: 'https://yourwebsite.com',
  },
];

export function PlatformLinksModal({
  open,
  config,
  onClose,
  onSave,
}: {
  open: boolean;
  config: PlatformLinksConfig;
  onClose: () => void;
  onSave: (payload: Partial<PlatformLinksConfig>) => Promise<void>;
}) {
  const [heading, setHeading] = useState(config.heading);
  const [subtitle, setSubtitle] = useState(config.subtitle);
  const [links, setLinks] = useState<PlatformLink[]>(config.links || []);
  const [saving, setSaving] = useState(false);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setHeading(config.heading || 'Important Links & Student Community');
      setSubtitle(
        config.subtitle ||
          'Connect directly on WhatsApp, YouTube, Telegram, Instagram, and official portal channels.'
      );
      setLinks((config.links || []).map((l) => ({ ...l })));
      setSaving(false);
    }
    wasOpen.current = open;
  }, [open, config]);

  const addPreset = (preset: (typeof PLATFORM_PRESETS)[number]) => {
    setLinks((prev) => [
      ...prev,
      {
        id: uid(),
        platform: preset.platform,
        label: preset.label,
        subtitle: preset.subtitle,
        url: '',
        active: true,
      },
    ]);
  };

  const updateLink = (id: string, patch: Partial<PlatformLink>) => {
    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l))
    );
  };

  const removeLink = (id: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        heading: heading.trim(),
        subtitle: subtitle.trim(),
        links: links.filter((l) => l.label.trim() || l.url.trim()),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title="Customize Platform, WhatsApp & Social Links"
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <p className="text-xs text-[#718096] mb-3 leading-relaxed">
        Only the Admin can customize these links. Any active link added here
        appears right below the Dashboard orientation video for all students.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Section Heading
            </label>
            <input
              required
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Section Subtitle
            </label>
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
            />
          </div>
        </div>

        <div className="rounded-[12px] border border-[#dce6f5] bg-[#f8fafd] p-3">
          <div className="text-xs font-bold text-[#142746] mb-2">
            Quick Add Platform:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PLATFORM_PRESETS.map((preset) => (
              <button
                key={preset.platform}
                type="button"
                onClick={() => addPreset(preset)}
                className="inline-flex items-center gap-1 rounded-[8px] border border-[#dce6f7] bg-white px-2.5 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer"
              >
                <Plus className="h-3 w-3 text-[#13845b]" />
                <span className="capitalize">{preset.platform}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() =>
                setLinks((prev) => [
                  ...prev,
                  {
                    id: uid(),
                    platform: 'other',
                    label: 'Custom Important Link',
                    subtitle: '',
                    url: '',
                    active: true,
                  },
                ])
              }
              className="inline-flex items-center gap-1 rounded-[8px] border border-[#dce6f7] bg-white px-2.5 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#edf2fa] cursor-pointer"
            >
              <Plus className="h-3 w-3 text-[#d7a84b]" />
              <span>Custom Link</span>
            </button>
          </div>
        </div>

        {links.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#cbd5e1] p-6 text-center text-xs text-[#718096]">
            Click any platform button above (like WhatsApp, YouTube, Telegram)
            to add your official links.
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
            {links.map((item) => (
              <div
                key={item.id}
                className="rounded-[12px] border border-[#e3e9f2] bg-white p-3 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <select
                    value={item.platform}
                    onChange={(e) =>
                      updateLink(item.id, {
                        platform: e.target.value as SocialPlatformType,
                      })
                    }
                    className="rounded-lg border border-[#e3e9f2] bg-[#f8fafd] px-2.5 py-1 text-xs font-bold text-[#142746]"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="youtube">YouTube</option>
                    <option value="telegram">Telegram</option>
                    <option value="instagram">Instagram</option>
                    <option value="facebook">Facebook</option>
                    <option value="website">Official Website</option>
                    <option value="other">Other Link</option>
                  </select>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-[#142746] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.active}
                        onChange={(e) =>
                          updateLink(item.id, { active: e.target.checked })
                        }
                        className="h-3.5 w-3.5"
                      />
                      <span>Visible to Students</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => removeLink(item.id)}
                      className="rounded p-1 text-[#c64b58] hover:bg-[#fff0f1] cursor-pointer"
                      aria-label="Remove link"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    required
                    value={item.label}
                    onChange={(e) =>
                      updateLink(item.id, { label: e.target.value })
                    }
                    placeholder="Button Title (e.g. Join WhatsApp Group)"
                    className="rounded-lg border border-[#e3e9f2] px-2.5 py-1.5 text-xs outline-none focus:border-[#315b9b]"
                  />
                  <input
                    value={item.subtitle || ''}
                    onChange={(e) =>
                      updateLink(item.id, { subtitle: e.target.value })
                    }
                    placeholder="Short note (optional)"
                    className="rounded-lg border border-[#e3e9f2] px-2.5 py-1.5 text-xs outline-none focus:border-[#315b9b]"
                  />
                </div>

                <input
                  required
                  value={item.url}
                  onChange={(e) => updateLink(item.id, { url: e.target.value })}
                  placeholder="https://wa.me/91... or https://youtube.com/..."
                  className="w-full rounded-lg border border-[#e3e9f2] px-2.5 py-1.5 text-xs font-mono outline-none focus:border-[#315b9b]"
                />
              </div>
            ))}
          </div>
        )}

        <div className="pt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[#e3e9f2] bg-white px-4 py-2 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] disabled:opacity-60 cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save Platform Links'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* 11. Admin Schedule / Edit Live Zoom or Google Meet Class Modal */
function defaultLocalDateTimeValue(): string {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function LiveClassModal({
  open,
  session,
  courses,
  defaultInstructor,
  onClose,
  onSave,
  onClear,
}: {
  open: boolean;
  session: LiveClassSession | null;
  courses: Course[];
  defaultInstructor: string;
  onClose: () => void;
  onSave: (payload: Partial<LiveClassSession>) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [platform, setPlatform] = useState<LivePlatformType>('zoom');
  const [title, setTitle] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [instructorName, setInstructorName] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [passcode, setPasscode] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setPlatform(session?.platform || 'zoom');
      setTitle(session?.title || '');
      setMeetingUrl(session?.meetingUrl || '');
      setScheduledAt(session?.scheduledAt || defaultLocalDateTimeValue());
      setDurationMinutes(String(session?.durationMinutes || 60));
      setInstructorName(session?.instructorName || defaultInstructor || 'Arya Tax Mentor');
      setCourseTitle(session?.courseTitle || '');
      setMeetingId(session?.meetingId || '');
      setPasscode(session?.passcode || '');
      setNotes(session?.notes || '');
      setActive(session ? session.active : true);
      setSaving(false);
    }
    wasOpen.current = open;
  }, [open, session, defaultInstructor]);

  const handleUrlChange = (val: string) => {
    setMeetingUrl(val);
    const lower = val.toLowerCase();
    if (lower.includes('zoom.us')) setPlatform('zoom');
    else if (lower.includes('meet.google.com')) setPlatform('meet');
    else if (lower.includes('teams.microsoft.com')) setPlatform('teams');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !meetingUrl.trim()) return;
    setSaving(true);
    try {
      await onSave({
        active,
        platform,
        title: title.trim(),
        meetingUrl: meetingUrl.trim(),
        scheduledAt: scheduledAt.trim(),
        durationMinutes: Math.max(5, Math.min(600, Number(durationMinutes) || 60)),
        instructorName: instructorName.trim(),
        courseTitle: courseTitle.trim(),
        meetingId: meetingId.trim(),
        passcode: passcode.trim(),
        notes: notes.trim(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title={session ? 'Edit Live Zoom / Meet Class' : 'Schedule Live Zoom / Meet Class'}
      onClose={onClose}
      maxWidth="max-w-xl"
    >
      <p className="text-xs text-[#718096] mb-3 leading-relaxed">
        Paste your Zoom, Google Meet, or Microsoft Teams link below. Once saved
        with visibility enabled, students see the live class schedule and{' '}
        <strong className="text-[#142746]">Join Live Class</strong> button directly
        on their Dashboard.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Platform
            </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as LivePlatformType)}
              className="w-full rounded-[10px] border border-[#e3e9f2] bg-white px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
            >
              <option value="zoom">Zoom</option>
              <option value="meet">Google Meet</option>
              <option value="teams">Microsoft Teams</option>
              <option value="other">Other Live Link</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Live Session Title *
            </label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Live GSTR-3B Return Filing & Doubt Clearing"
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-1">
            Zoom / Google Meet Join Link *
          </label>
          <input
            required
            type="text"
            value={meetingUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://zoom.us/j/... or https://meet.google.com/xxx-xxxx-xxx"
            className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm font-mono outline-none focus:border-[#315b9b]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Scheduled Date &amp; Time
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm font-mono outline-none focus:border-[#315b9b]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Duration (minutes)
            </label>
            <input
              type="number"
              min={5}
              max={600}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm font-mono outline-none focus:border-[#315b9b]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Related Course / Batch (optional)
            </label>
            <input
              list="live-course-options"
              value={courseTitle}
              onChange={(e) => setCourseTitle(e.target.value)}
              placeholder="e.g. All Batches or GST Masterclass"
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
            />
            <datalist id="live-course-options">
              {courses.map((c) => (
                <option key={c.id} value={c.title} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Host / Instructor Name
            </label>
            <input
              value={instructorName}
              onChange={(e) => setInstructorName(e.target.value)}
              placeholder="Arya Tax Mentor"
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Meeting ID (optional, for Zoom)
            </label>
            <input
              value={meetingId}
              onChange={(e) => setMeetingId(e.target.value)}
              placeholder="e.g. 845 1290 4412"
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm font-mono outline-none focus:border-[#315b9b]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#59677d] mb-1">
              Passcode (optional)
            </label>
            <input
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="e.g. ARYA2026"
              className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm font-mono outline-none focus:border-[#315b9b]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-[#59677d] mb-1">
            Joining Instructions / Agenda (optional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Please join 5 minutes early and keep your GST portal practice sheet ready."
            className="w-full rounded-[10px] border border-[#e3e9f2] px-3 py-2 text-sm outline-none focus:border-[#315b9b]"
          />
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-[#e3e9f2] px-3 py-2.5 text-xs font-semibold text-[#142746] cursor-pointer">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-[#cbd5e1]"
          />
          <span>Live class is scheduled — show Join Link on student Dashboard</span>
        </label>

        <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5">
          {session ? (
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await onClear();
                  onClose();
                } finally {
                  setSaving(false);
                }
              }}
              className="rounded-[10px] border border-[#f3bcc2] bg-[#fff0f1] px-3.5 py-2 text-xs font-bold text-[#c64b58] hover:bg-[#ffe2e5] cursor-pointer"
            >
              Remove Schedule
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[10px] border border-[#e3e9f2] bg-white px-4 py-2 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-[10px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save & Publish Live Link'}
            </button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

/* 12. Printable GST Tax Invoice & Bill Modal */
export function TaxInvoiceModal({
  open,
  order,
  settings,
  methods,
  user,
  onClose,
  onResendEmail,
}: {
  open: boolean;
  order: Order | null;
  settings: PortalSettings;
  methods: PaymentMethod[];
  user: User;
  onClose: () => void;
  onResendEmail: (
    orderId: string
  ) => Promise<{ ok: boolean; data?: { note: string }; error?: string }>;
}) {
  const [resending, setResending] = useState(false);
  const [statusNote, setStatusNote] = useState('');

  useEffect(() => {
    if (open) {
      setResending(false);
      setStatusNote('');
    }
  }, [open, order?.id]);

  if (!order) return null;

  const methodName =
    methods.find((m) => m.id === order.method)?.name || order.method;
  const gstRate = order.gstRate ?? settings.gst ?? 0;
  const taxable = order.taxable ?? Math.max(0, order.base - order.discount);
  const isIgst = order.gstSplit === 'igst';
  const cgst =
    order.cgst ?? (isIgst ? 0 : Math.round((order.gst / 2) * 100) / 100);
  const sgst =
    order.sgst ?? (isIgst ? 0 : Math.round((order.gst - cgst) * 100) / 100);
  const igst = order.igst ?? (isIgst ? order.gst : 0);

  const waText =
    order.whatsappMessage ||
    buildWhatsAppBillText(order, settings, order.buyerName || user.name);
  const waHref =
    order.whatsappUrl ||
    buildWhatsAppUrl(
      order.buyerPhone || user.phone || settings.adminWhatsapp,
      waText
    );
  const gmailHref = buildGmailComposeUrl({
    to: order.buyerEmail || user.email,
    cc: settings.adminEmail || settings.smtpUser || '',
    subject: `GST Tax Invoice ${order.invoiceNumber || order.id} · ${order.itemName}`,
    body: waText,
  });

  const adminGmail = settings.adminEmail || settings.smtpUser || '';
  const studentGmail = order.buyerEmail || user.email;

  return (
    <ModalShell
      open={open}
      title={`GST Tax Invoice · ${order.invoiceNumber || order.id}`}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <div className="print-only-invoice rounded-[14px] border border-[#d7e1ef] bg-white overflow-hidden">
        <div className="bg-[#142746] px-6 py-5 text-white flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold tracking-[0.22em] uppercase text-[#d7a84b]">
              GST TAX INVOICE &amp; BILL OF SUPPLY
            </div>
            <h3 className="mt-1 text-xl font-extrabold">{settings.brand}</h3>
            <div className="mt-1 text-xs text-[#cbd7ea] font-mono tabular-nums">
              Invoice: {order.invoiceNumber || order.id}
              {order.invoiceSerial ? ` · Sl. #${order.invoiceSerial}` : ''} · Date:{' '}
              {new Date(order.paidAt || order.created).toLocaleDateString(
                'en-IN',
                {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                }
              )}
            </div>
          </div>
          <div className="text-right text-xs">
            <div className="font-bold text-[#6ef0b8]">
              {order.status === 'PAID' ? 'PAID · COURSE ACTIVE' : order.status}
            </div>
            <div className="mt-1 text-[#cbd7ea]">
              Supplier GSTIN: {order.gstNumber || settings.gstNumber || 'N/A'}
            </div>
            <div className="text-[#cbd7ea]">
              SAC: {order.sacCode || settings.sacCode || '999293'}
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#718096]">
                Billed To Student (Bill Of)
              </div>
              <div className="mt-1 text-sm font-bold text-[#142746]">
                {order.buyerName || user.name}
              </div>
              <div className="text-[#59677d]">
                Gmail / Login ID: {studentGmail}
              </div>
              <div className="font-mono text-[#59677d]">
                Mobile / WhatsApp: {order.buyerPhone || user.phone || '—'}
              </div>
              {(order.buyerState || user.state) && (
                <div className="mt-0.5 font-semibold text-[#142746]">
                  Place of Supply (State): {order.buyerState || user.state}
                </div>
              )}
            </div>

            <div className="sm:text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#718096]">
                Applicable GST Provision (ধারা)
              </div>
              <div className="mt-1 font-semibold text-[#142746]">
                {order.gstSection || settings.gstSection}
              </div>
              {(order.sellerState || settings.gstState) && (
                <div className="mt-0.5 font-semibold text-[#142746]">
                  GST Payable From: {order.sellerState || settings.gstState} (
                  {isIgst ? 'Inter-State IGST' : 'Intra-State CGST+SGST'})
                </div>
              )}
              <div className="mt-1 text-[#59677d]">
                Method: {methodName} · Ref:{' '}
                <span className="font-mono">{order.reference || 'Direct'}</span>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#e3e9f2]">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-[#f4f7fc] text-[#142746]">
                  <th className="px-4 py-2.5 font-bold">Particulars</th>
                  <th className="px-4 py-2.5 font-bold text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2fa]">
                <tr>
                  <td className="px-4 py-3 font-semibold text-[#142746]">
                    {order.itemName}
                    {order.expiresAt && (
                      <div className="text-[11px] font-normal text-[#315b9b] mt-0.5">
                        Valid until{' '}
                        {new Date(order.expiresAt).toLocaleDateString('en-IN')}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-[#142746] tabular-nums">
                    {money(order.base)}
                  </td>
                </tr>
                <tr className={order.discount > 0 ? 'text-[#13845b]' : 'text-[#59677d]'}>
                  <td className="px-4 py-2">
                    Discount {order.couponCode ? `(${order.couponCode})` : ''}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-bold tabular-nums">
                    {order.discount > 0 ? `-${money(order.discount)}` : money(0)}
                  </td>
                </tr>
                <tr className="text-[#59677d]">
                  <td className="px-4 py-2">Taxable Value</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    {money(taxable)}
                  </td>
                </tr>
                {isIgst ? (
                  <tr className="text-[#59677d]">
                    <td className="px-4 py-2">IGST ({gstRate}%) · Inter-State</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                      {money(igst)}
                    </td>
                  </tr>
                ) : (
                  <>
                    <tr className="text-[#59677d]">
                      <td className="px-4 py-2">CGST ({gstRate / 2}%)</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">
                        {money(cgst)}
                      </td>
                    </tr>
                    <tr className="text-[#59677d]">
                      <td className="px-4 py-2">SGST ({gstRate / 2}%)</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">
                        {money(sgst)}
                      </td>
                    </tr>
                  </>
                )}
                <tr className="bg-[#eefaf4] text-sm font-extrabold text-[#142746]">
                  <td className="px-4 py-3">Total Amount Paid</td>
                  <td className="px-4 py-3 text-right font-mono text-[#13845b] tabular-nums">
                    {money(order.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="no-print rounded-lg border border-[#dce6f5] bg-[#f8fafd] px-3 py-2 text-[11px] text-[#59677d]">
            <span className="font-bold text-[#142746]">Auto-Locked Gmail Recipients:</span>{' '}
            Student: <span className="font-mono text-[#142746]">{studentGmail}</span>
            {adminGmail && (
              <>
                {' '}· Admin Copy: <span className="font-mono text-[#142746]">{adminGmail}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {(statusNote || order.emailDispatchNote) && (
        <p className="no-print mt-3 text-xs text-[#59677d]">
          {statusNote || order.emailDispatchNote}
        </p>
      )}

      <div className="no-print mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#bfe6d5] bg-[#eefaf4] px-3.5 py-2 text-xs font-bold text-[#0f6c4a] hover:bg-[#ddf5e9]"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            <span>Send WhatsApp Bill</span>
          </a>

          {settings.emailConfigured ? (
            <button
              type="button"
              disabled={resending}
              onClick={async () => {
                setResending(true);
                try {
                  const res = await onResendEmail(order.id);
                  if (res.ok && res.data) {
                    setStatusNote(res.data.note);
                  } else {
                    setStatusNote(res.error || 'Could not email invoice.');
                  }
                } finally {
                  setResending(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#dce6f7] bg-[#edf2fa] px-3.5 py-2 text-xs font-bold text-[#142746] hover:bg-[#dce6f7] disabled:opacity-50 cursor-pointer"
            >
              <Mail className="h-3.5 w-3.5" />
              <span>{resending ? 'Sending...' : 'Send Invoice to Gmail & Phone'}</span>
            </button>
          ) : (
            <a
              href={gmailHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e3e9f2] bg-white px-3.5 py-2 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb]"
            >
              <Mail className="h-3.5 w-3.5" />
              <span>Send via Gmail</span>
            </a>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] border border-[#e3e9f2] bg-white px-4 py-2 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#d7a84b] px-4 py-2 text-xs font-bold text-[#18243a] hover:bg-[#cca042] cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print / Save Invoice PDF</span>
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
