import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Pencil,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import type {
  AssignmentSubmission,
  Chapter,
  Course,
  CourseAssignment,
  CourseQuiz,
  Lesson,
  PortalSettings,
  ProgressMap,
  QuizAttempt,
  QuizQuestion,
  User,
} from '../types/lms';
import {
  getCompletedLessonCount,
  getCourseLessons,
  getUserCourseProgress,
  isCertificateEligible,
  normalizeVideoUrl,
  uid,
  youtubeId,
} from '../utils/lms';
import { hasPermission, isSuperAdmin } from '../utils/rbac';
import {
  getYtOrigin,
  loadYouTubeIframeApi,
  type YtControlsPlayer,
} from '../utils/youtubeApi';

interface LearningViewProps {
  course: Course;
  user: User;
  settings: PortalSettings;
  progress: ProgressMap;
  quizAttempts: QuizAttempt[];
  assignmentSubmissions: AssignmentSubmission[];
  onBack: () => void;
  onMarkLessonComplete: (courseId: string, lessonId: string) => void;
  onRecordWatchDelta: (
    courseId: string,
    lessonId: string,
    delta: number,
    duration: number
  ) => void;
  onOpenCertificate: (course: Course) => void;
  onAddChapter: (courseId: string) => void;
  onEditChapter: (courseId: string, chapter: Chapter) => void;
  onDeleteChapter: (courseId: string, chapter: Chapter) => void;
  onAddLesson: (courseId: string, chapterId: string) => void;
  onEditLesson: (courseId: string, chapterId: string, lesson: Lesson) => void;
  onDeleteLesson: (
    courseId: string,
    chapterId: string,
    lesson: Lesson
  ) => void;
  onSaveQuiz: (
    courseId: string,
    quiz: Partial<CourseQuiz> & { title: string }
  ) => Promise<{ ok: boolean; error?: string }>;
  onDeleteQuiz: (
    courseId: string,
    quizId: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onSaveAssignment: (
    courseId: string,
    assignment: Partial<CourseAssignment> & { title: string; description: string }
  ) => Promise<{ ok: boolean; error?: string }>;
  onDeleteAssignment: (
    courseId: string,
    assignmentId: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onSubmitQuizAttempt: (
    courseId: string,
    quizId: string,
    answers: number[]
  ) => Promise<{ ok: true; data: { attempt: QuizAttempt } } | { ok: false; error: string }>;
  onSubmitAssignmentResponse: (
    courseId: string,
    assignmentId: string,
    submissionText: string,
    attachmentUrl?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onReviewSubmission: (
    courseId: string,
    assignmentId: string,
    submissionId: string,
    marks: number,
    feedback: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export function LearningView({
  course,
  user,
  settings,
  progress,
  quizAttempts,
  assignmentSubmissions,
  onBack,
  onMarkLessonComplete,
  onRecordWatchDelta,
  onOpenCertificate,
  onAddChapter,
  onEditChapter,
  onDeleteChapter,
  onAddLesson,
  onEditLesson,
  onDeleteLesson,
  onSaveQuiz,
  onDeleteQuiz,
  onSaveAssignment,
  onDeleteAssignment,
  onSubmitQuizAttempt,
  onSubmitAssignmentResponse,
  onReviewSubmission,
  onToast,
}: LearningViewProps) {
  const isAdmin = user.role === 'admin';
  const owner = isSuperAdmin(user);
  const canModule = isAdmin && (owner || hasPermission(user, 'module_manage', course.id));
  const canLesson = isAdmin && (owner || hasPermission(user, 'lesson_manage', course.id));
  const canQuizManage = isAdmin && (owner || hasPermission(user, 'quiz_manage', course.id));
  const canAssignManage =
    isAdmin && (owner || hasPermission(user, 'assignment_manage', course.id));

  const [viewTab, setViewTab] = useState<'lessons' | 'quizzes' | 'assignments'>('lessons');

  const allLessons = getCourseLessons(course);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(
    () => allLessons[0]?.id || null
  );

  // Quiz builder & attempt state
  const [quizTitle, setQuizTitle] = useState('');
  const [quizPassPct, setQuizPassPct] = useState('60');
  const [quizPrompt, setQuizPrompt] = useState('');
  const [quizOptA, setQuizOptA] = useState('');
  const [quizOptB, setQuizOptB] = useState('');
  const [quizOptC, setQuizOptC] = useState('');
  const [quizOptD, setQuizOptD] = useState('');
  const [quizCorrectIdx, setQuizCorrectIdx] = useState('0');
  const [draftQuestions, setDraftQuestions] = useState<QuizQuestion[]>([]);
  const [studentAnswers, setStudentAnswers] = useState<Record<string, number[]>>({});

  // Assignment builder, submission & review state
  const [assignTitle, setAssignTitle] = useState('');
  const [assignInst, setAssignInst] = useState('');
  const [assignMaxMarks, setAssignMaxMarks] = useState('100');
  const [assignDue, setAssignDue] = useState('');
  const [subText, setSubText] = useState<Record<string, string>>({});
  const [subUrl, setSubUrl] = useState<Record<string, string>>({});
  const [gradeMarks, setGradeMarks] = useState<Record<string, string>>({});
  const [gradeFeedback, setGradeFeedback] = useState<Record<string, string>>({});

  const activeLesson =
    allLessons.find((l) => l.id === activeLessonId) || allLessons[0] || null;

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ytPlayerRef = useRef<YtControlsPlayer | null>(null);

  useEffect(() => {
    if (!activeLesson && allLessons.length > 0) {
      setActiveLessonId(allLessons[0].id);
    }
  }, [activeLesson, allLessons]);

  const normalizedLessonUrl = activeLesson
    ? normalizeVideoUrl(activeLesson.url)
    : '';
  const ytId = normalizedLessonUrl ? youtubeId(normalizedLessonUrl) : '';
  const ytOrigin = getYtOrigin();

  useEffect(() => {
    if (!activeLesson || isAdmin) return;

    let cancelled = false;
    let lastTime: number | null = null;
    ytPlayerRef.current = null;

    if (ytId) {
      loadYouTubeIframeApi(5000)
        .then((YTGlobal) => {
          if (cancelled || !iframeRef.current) return;
          ytPlayerRef.current = new YTGlobal.Player(iframeRef.current, {
            events: { onReady: () => {} },
          });
        })
        .catch(() => {});
    }

    const interval = setInterval(() => {
      let current = 0;
      let duration = 0;
      let playing = false;

      try {
        if (videoRef.current) {
          current = videoRef.current.currentTime;
          duration = videoRef.current.duration;
          playing = !videoRef.current.paused && !videoRef.current.ended;
        } else if (ytPlayerRef.current?.getCurrentTime) {
          current = ytPlayerRef.current.getCurrentTime();
          duration = ytPlayerRef.current.getDuration?.() || 0;
          playing = ytPlayerRef.current.getPlayerState?.() === 1;
        }
      } catch {
        // ignore transient player read errors
      }

      if (playing && duration > 0 && lastTime !== null) {
        const delta = current - lastTime;
        if (delta > 0 && delta <= 2.5) {
          onRecordWatchDelta(course.id, activeLesson.id, delta, duration);
        }
      }
      lastTime = current;
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeLesson?.id, course.id, isAdmin, ytId, onRecordWatchDelta]);

  const coursePct = getUserCourseProgress(user.id, course, progress);
  const completedCount = getCompletedLessonCount(user.id, course, progress);
  const certificateUnlocked =
    isAdmin ||
    isCertificateEligible(user.id, course, progress, settings.threshold);

  const activeLessonPct = activeLesson
    ? Math.round(progress[`${user.id}_${course.id}_${activeLesson.id}`] || 0)
    : 0;

  const quizzes = course.quizzes || [];
  const assignments = course.assignments || [];

  const handleAddDraftQuestion = () => {
    if (!quizPrompt.trim() || !quizOptA.trim() || !quizOptB.trim()) {
      onToast('error', 'Enter a question and at least options A and B.');
      return;
    }
    const opts = [quizOptA.trim(), quizOptB.trim()];
    if (quizOptC.trim()) opts.push(quizOptC.trim());
    if (quizOptD.trim()) opts.push(quizOptD.trim());
    const cIdx = Math.min(opts.length - 1, Math.max(0, Number(quizCorrectIdx) || 0));
    setDraftQuestions((prev) => [
      ...prev,
      { id: uid(), question: quizPrompt.trim(), options: opts, correctIndex: cIdx },
    ]);
    setQuizPrompt('');
    setQuizOptA('');
    setQuizOptB('');
    setQuizOptC('');
    setQuizOptD('');
    setQuizCorrectIdx('0');
  };

  const handleCreateQuiz = async (e: FormEvent) => {
    e.preventDefault();
    if (draftQuestions.length === 0) {
      onToast('error', 'Add at least 1 MCQ question before saving the quiz.');
      return;
    }
    const res = await onSaveQuiz(course.id, {
      title: quizTitle.trim(),
      passingPercent: Math.min(100, Math.max(1, Number(quizPassPct) || 60)),
      questions: draftQuestions,
    });
    if (!res.ok) {
      onToast('error', res.error || 'Could not save quiz.');
      return;
    }
    setQuizTitle('');
    setDraftQuestions([]);
    onToast('success', 'Course quiz saved.');
  };

  const handleCreateAssignment = async (e: FormEvent) => {
    e.preventDefault();
    const res = await onSaveAssignment(course.id, {
      title: assignTitle.trim(),
      description: assignInst.trim() || 'Complete and submit your answer below.',
      maxMarks: Math.max(1, Number(assignMaxMarks) || 100),
      dueLabel: assignDue || undefined,
    });
    if (!res.ok) {
      onToast('error', res.error || 'Could not create assignment.');
      return;
    }
    setAssignTitle('');
    setAssignInst('');
    setAssignDue('');
    onToast('success', 'Course assignment published.');
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="hidden sm:block aspect-video w-36 shrink-0 overflow-hidden rounded-[11px] border border-[#e3e9f2] bg-[#142746]">
            {course.thumbnailUrl ? (
              <img
                src={course.thumbnailUrl}
                alt={`${course.title} thumbnail`}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-[#142746] to-[#0f1d34] p-2.5 text-white">
                <div className="text-[9px] font-bold tracking-wider uppercase text-[#d7a84b] truncate">
                  {course.category || 'Tax Course'}
                </div>
                <div className="text-[11px] font-extrabold leading-tight line-clamp-2">
                  {course.title}
                </div>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#718096]">
              <span>{course.category || 'Course'}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {allLessons.length} {allLessons.length === 1 ? 'lesson' : 'lessons'}
              </span>
              {isAdmin && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-[#8c6826]">
                    Curriculum Workspace
                  </span>
                </>
              )}
            </div>
            <h1 className="mt-1 text-2xl font-extrabold text-[#142746] text-balance">
              {course.title}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-[10px] border border-[#e3e9f2] bg-white p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setViewTab('lessons')}
              className={`rounded-md px-3 py-1.5 cursor-pointer ${
                viewTab === 'lessons'
                  ? 'bg-[#142746] text-white'
                  : 'text-[#59677d] hover:text-[#142746]'
              }`}
            >
              Video &amp; Notes
            </button>
            <button
              type="button"
              onClick={() => setViewTab('quizzes')}
              className={`rounded-md px-3 py-1.5 cursor-pointer ${
                viewTab === 'quizzes'
                  ? 'bg-[#142746] text-white'
                  : 'text-[#59677d] hover:text-[#142746]'
              }`}
            >
              Quizzes ({quizzes.length})
            </button>
            <button
              type="button"
              onClick={() => setViewTab('assignments')}
              className={`rounded-md px-3 py-1.5 cursor-pointer ${
                viewTab === 'assignments'
                  ? 'bg-[#142746] text-white'
                  : 'text-[#59677d] hover:text-[#142746]'
              }`}
            >
              Assignments ({assignments.length})
            </button>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-[10px] border border-[#e3e9f2] bg-white px-4 py-2 text-xs font-bold text-[#142746] hover:bg-[#f3f6fb] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </button>
        </div>
      </div>

      {/* QUIZZES TAB */}
      {viewTab === 'quizzes' && (
        <div className="space-y-5">
          {canQuizManage && (
            <form
              onSubmit={handleCreateQuiz}
              className="rounded-[15px] border border-[#e3e9f2] bg-white p-5 space-y-3"
            >
              <h2 className="text-base font-extrabold text-[#142746]">
                Create Course MCQ Quiz
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  required
                  value={quizTitle}
                  onChange={(e) => setQuizTitle(e.target.value)}
                  placeholder="Quiz Title *"
                  className="sm:col-span-2 rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs outline-none focus:border-[#315b9b]"
                />
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={quizPassPct}
                  onChange={(e) => setQuizPassPct(e.target.value)}
                  placeholder="Passing %"
                  className="rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs font-mono outline-none focus:border-[#315b9b]"
                />
              </div>

              <div className="rounded-[11px] border border-[#dce6f5] bg-[#f8fafd] p-3.5 space-y-2.5">
                <div className="text-xs font-bold text-[#142746]">
                  Add Question ({draftQuestions.length} added)
                </div>
                <input
                  value={quizPrompt}
                  onChange={(e) => setQuizPrompt(e.target.value)}
                  placeholder="Question text..."
                  className="w-full rounded-[8px] border border-[#e3e9f2] bg-white px-3 py-1.5 text-xs outline-none"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    value={quizOptA}
                    onChange={(e) => setQuizOptA(e.target.value)}
                    placeholder="Option A *"
                    className="rounded-[8px] border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs"
                  />
                  <input
                    value={quizOptB}
                    onChange={(e) => setQuizOptB(e.target.value)}
                    placeholder="Option B *"
                    className="rounded-[8px] border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs"
                  />
                  <input
                    value={quizOptC}
                    onChange={(e) => setQuizOptC(e.target.value)}
                    placeholder="Option C (optional)"
                    className="rounded-[8px] border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs"
                  />
                  <input
                    value={quizOptD}
                    onChange={(e) => setQuizOptD(e.target.value)}
                    placeholder="Option D (optional)"
                    className="rounded-[8px] border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <select
                    value={quizCorrectIdx}
                    onChange={(e) => setQuizCorrectIdx(e.target.value)}
                    className="rounded-[8px] border border-[#e3e9f2] bg-white px-2.5 py-1.5 text-xs font-semibold"
                  >
                    <option value="0">Correct: Option A</option>
                    <option value="1">Correct: Option B</option>
                    <option value="2">Correct: Option C</option>
                    <option value="3">Correct: Option D</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddDraftQuestion}
                    className="rounded-[8px] bg-[#edf2fa] px-3 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#dce6f7] cursor-pointer"
                  >
                    + Add Question to Quiz
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="rounded-[9px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
              >
                Publish Quiz
              </button>
            </form>
          )}

          {quizzes.length === 0 ? (
            <div className="rounded-[15px] border border-dashed border-[#d0dae8] bg-white p-8 text-center text-sm text-[#718096]">
              No quizzes added to this course yet.
            </div>
          ) : (
            quizzes.map((q) => {
              const myAttempts = quizAttempts.filter(
                (a) => a.courseId === course.id && a.quizId === q.id && a.studentId === user.id
              );
              const latestAttempt = myAttempts[0];
              const ansArr =
                studentAnswers[q.id] || q.questions.map(() => -1);

              return (
                <div
                  key={q.id}
                  className="rounded-[15px] border border-[#e3e9f2] bg-white p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-extrabold text-[#142746]">
                        <ClipboardCheck className="inline h-4 w-4 mr-1.5 text-[#315b9b]" />
                        {q.title}
                      </h3>
                      <div className="text-xs text-[#718096]">
                        {q.questions.length} questions · Pass mark {q.passingPercent}%
                      </div>
                    </div>
                    {canQuizManage && (
                      <button
                        type="button"
                        onClick={() => onDeleteQuiz(course.id, q.id)}
                        className="rounded-md border border-[#f5c8ce] bg-[#fff5f6] px-2.5 py-1 text-xs font-bold text-[#c64b58] cursor-pointer"
                      >
                        Delete Quiz
                      </button>
                    )}
                  </div>

                  {latestAttempt && (
                    <div
                      className={`rounded-[10px] border p-3 text-xs font-bold ${
                        latestAttempt.passed
                          ? 'border-[#bfe6d5] bg-[#eefaf4] text-[#13845b]'
                          : 'border-[#f5c8ce] bg-[#fff5f6] text-[#c64b58]'
                      }`}
                    >
                      Latest Score: {latestAttempt.scorePercent}% ·{' '}
                      {latestAttempt.passed ? 'PASSED' : 'NEEDS RETRY'}
                    </div>
                  )}

                  <div className="space-y-3">
                    {q.questions.map((ques, qi) => (
                      <div
                        key={ques.id}
                        className="rounded-[10px] border border-[#e3e9f2] bg-[#f8fafd] p-3 text-xs space-y-2"
                      >
                        <div className="font-bold text-[#142746]">
                          Q{qi + 1}. {ques.question}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {ques.options.map((opt, oi) => (
                            <label
                              key={oi}
                              className="flex items-center gap-2 rounded-md border border-[#e3e9f2] bg-white px-2.5 py-1.5 cursor-pointer"
                            >
                              <input
                                type="radio"
                                name={`${q.id}-${ques.id}`}
                                checked={ansArr[qi] === oi}
                                onChange={() => {
                                  const next = [...ansArr];
                                  next[qi] = oi;
                                  setStudentAnswers((prev) => ({
                                    ...prev,
                                    [q.id]: next,
                                  }));
                                }}
                              />
                              <span>{opt}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {!isAdmin && (
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await onSubmitQuizAttempt(course.id, q.id, ansArr);
                        if (!res.ok) {
                          onToast('error', res.error);
                          return;
                        }
                        onToast(
                          res.data.attempt.passed ? 'success' : 'info',
                          `Scored ${res.data.attempt.scorePercent}% (${res.data.attempt.passed ? 'Passed' : 'Retry available'})`
                        );
                      }}
                      className="rounded-[9px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
                    >
                      Submit Quiz Answers
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ASSIGNMENTS TAB */}
      {viewTab === 'assignments' && (
        <div className="space-y-5">
          {canAssignManage && (
            <form
              onSubmit={handleCreateAssignment}
              className="rounded-[15px] border border-[#e3e9f2] bg-white p-5 space-y-3"
            >
              <h2 className="text-base font-extrabold text-[#142746]">
                Create Course Assignment
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  required
                  value={assignTitle}
                  onChange={(e) => setAssignTitle(e.target.value)}
                  placeholder="Assignment Title *"
                  className="rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs outline-none"
                />
                <input
                  type="number"
                  min={1}
                  value={assignMaxMarks}
                  onChange={(e) => setAssignMaxMarks(e.target.value)}
                  placeholder="Max Marks (100)"
                  className="rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs font-mono outline-none"
                />
                <input
                  type="date"
                  value={assignDue}
                  onChange={(e) => setAssignDue(e.target.value)}
                  className="rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs outline-none"
                />
              </div>
              <textarea
                rows={2}
                value={assignInst}
                onChange={(e) => setAssignInst(e.target.value)}
                placeholder="Instructions & practical filing task details..."
                className="w-full rounded-[9px] border border-[#e3e9f2] px-3 py-2 text-xs outline-none"
              />
              <button
                type="submit"
                className="rounded-[9px] bg-[#142746] px-4 py-2 text-xs font-bold text-white hover:bg-[#1e3761] cursor-pointer"
              >
                Publish Assignment
              </button>
            </form>
          )}

          {assignments.length === 0 ? (
            <div className="rounded-[15px] border border-dashed border-[#d0dae8] bg-white p-8 text-center text-sm text-[#718096]">
              No assignments published for this course yet.
            </div>
          ) : (
            assignments.map((a) => {
              const allSubs = assignmentSubmissions.filter(
                (s) => s.courseId === course.id && s.assignmentId === a.id
              );
              const mySub = allSubs.find((s) => s.studentId === user.id);

              return (
                <div
                  key={a.id}
                  className="rounded-[15px] border border-[#e3e9f2] bg-white p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-extrabold text-[#142746]">
                        <FileText className="inline h-4 w-4 mr-1.5 text-[#315b9b]" />
                        {a.title}
                      </h3>
                      <div className="text-xs text-[#718096]">
                        Max Marks: {a.maxMarks}
                        {a.dueLabel ? ` · Due ${a.dueLabel}` : ''}
                      </div>
                    </div>
                    {canAssignManage && (
                      <button
                        type="button"
                        onClick={() => onDeleteAssignment(course.id, a.id)}
                        className="rounded-md border border-[#f5c8ce] bg-[#fff5f6] px-2.5 py-1 text-xs font-bold text-[#c64b58] cursor-pointer"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-[#59677d] whitespace-pre-line">
                    {a.description || 'Complete and submit your answer below.'}
                  </p>

                  {!isAdmin && (
                    <div className="rounded-[11px] border border-[#e3e9f2] bg-[#f8fafd] p-3.5 space-y-2.5">
                      {mySub && (
                        <div className="text-xs font-semibold text-[#13845b]">
                          Submitted on{' '}
                          {new Date(mySub.submittedAt).toLocaleDateString('en-IN')} ·{' '}
                          {mySub.status === 'REVIEWED'
                            ? `Graded: ${mySub.marks}/${a.maxMarks} (${mySub.feedback || 'Reviewed'})`
                            : 'Pending Instructor Review'}
                        </div>
                      )}
                      <textarea
                        rows={2}
                        value={subText[a.id] ?? mySub?.submissionText ?? ''}
                        onChange={(e) =>
                          setSubText((prev) => ({ ...prev, [a.id]: e.target.value }))
                        }
                        placeholder="Write your assignment answer..."
                        className="w-full rounded-[8px] border border-[#e3e9f2] bg-white px-3 py-2 text-xs outline-none"
                      />
                      <input
                        type="url"
                        value={subUrl[a.id] ?? mySub?.attachmentUrl ?? ''}
                        onChange={(e) =>
                          setSubUrl((prev) => ({ ...prev, [a.id]: e.target.value }))
                        }
                        placeholder="Optional Google Drive / PDF link"
                        className="w-full rounded-[8px] border border-[#e3e9f2] bg-white px-3 py-1.5 text-xs outline-none"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const text = (
                            subText[a.id] ??
                            mySub?.submissionText ??
                            ''
                          ).trim();
                          const attachment = (
                            subUrl[a.id] ??
                            mySub?.attachmentUrl ??
                            ''
                          ).trim();
                          if (!text) {
                            onToast('error', 'Enter your submission response first.');
                            return;
                          }
                          const res = await onSubmitAssignmentResponse(
                            course.id,
                            a.id,
                            text,
                            attachment || undefined
                          );
                          if (res.ok) onToast('success', 'Assignment submitted.');
                          else onToast('error', res.error || 'Failed to submit.');
                        }}
                        className="rounded-[8px] bg-[#142746] px-4 py-1.5 text-xs font-bold text-white cursor-pointer"
                      >
                        Submit Assignment
                      </button>
                    </div>
                  )}

                  {canAssignManage && allSubs.length > 0 && (
                    <div className="pt-3 border-t border-[#e3e9f2] space-y-2.5">
                      <div className="text-xs font-extrabold text-[#142746]">
                        Student Submissions ({allSubs.length})
                      </div>
                      {allSubs.map((s) => (
                        <div
                          key={s.id}
                          className="rounded-[10px] border border-[#e3e9f2] bg-[#f8fafd] p-3 text-xs space-y-2"
                        >
                          <div className="flex items-center justify-between font-bold text-[#142746]">
                            <span>{s.studentName}</span>
                            <span>
                              {s.status}
                              {s.status === 'REVIEWED' ? ` (${s.marks}/${a.maxMarks})` : ''}
                            </span>
                          </div>
                          <p className="text-[#59677d]">{s.submissionText}</p>
                          {s.attachmentUrl && (
                            <a
                              href={s.attachmentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#315b9b] font-semibold hover:underline"
                            >
                              Open Attachment
                            </a>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="number"
                              min={0}
                              max={a.maxMarks}
                              value={gradeMarks[s.id] ?? String(s.marks ?? a.maxMarks)}
                              onChange={(e) =>
                                setGradeMarks((prev) => ({
                                  ...prev,
                                  [s.id]: e.target.value,
                                }))
                              }
                              className="w-20 rounded-md border border-[#e3e9f2] bg-white px-2 py-1 text-xs font-mono"
                              placeholder="Marks"
                            />
                            <input
                              value={gradeFeedback[s.id] ?? s.feedback ?? ''}
                              onChange={(e) =>
                                setGradeFeedback((prev) => ({
                                  ...prev,
                                  [s.id]: e.target.value,
                                }))
                              }
                              placeholder="Instructor feedback..."
                              className="flex-1 min-w-[160px] rounded-md border border-[#e3e9f2] bg-white px-2 py-1 text-xs"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                const m = Number(gradeMarks[s.id] ?? s.marks ?? 0);
                                const fb = gradeFeedback[s.id] ?? s.feedback ?? '';
                                const res = await onReviewSubmission(
                                  course.id,
                                  a.id,
                                  s.id,
                                  m,
                                  fb
                                );
                                if (res.ok) onToast('success', 'Submission graded.');
                                else onToast('error', res.error || 'Could not grade.');
                              }}
                              className="rounded-md bg-[#13845b] px-3 py-1 text-xs font-bold text-white cursor-pointer"
                            >
                              Save Grade
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VIDEO & LESSONS TAB */}
      {viewTab === 'lessons' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="space-y-4">
            <div className="aspect-video w-full overflow-hidden rounded-[15px] bg-[#101722] flex items-center justify-center text-white">
              {activeLesson ? (
                ytId ? (
                  <iframe
                    key={activeLesson.id}
                    ref={iframeRef}
                    src={`https://www.youtube.com/embed/${ytId}?rel=0&enablejsapi=1&playsinline=1${
                      ytOrigin ? `&origin=${encodeURIComponent(ytOrigin)}` : ''
                    }`}
                    title={activeLesson.title}
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="h-full w-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : normalizedLessonUrl ? (
                  <video
                    key={activeLesson.id}
                    ref={videoRef}
                    controls
                    src={normalizedLessonUrl}
                    className="h-full w-full"
                  />
                ) : (
                  <div className="px-6 py-8 text-center space-y-2 max-w-md">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#1c2b45] text-[#d7a84b]">
                      <FileText className="h-6 w-6" />
                    </div>
                    <div className="text-sm font-bold text-white">
                      {activeLesson.title}
                    </div>
                    <p className="text-xs text-[#a8b8d0]">
                      Study Notes &amp; Reading Material Lesson — read the notes or open the attached material below and click &ldquo;Mark lesson complete&rdquo; once finished.
                    </p>
                  </div>
                )
              ) : (
                <div className="px-6 text-center text-sm text-[#a8b8d0]">
                  {isAdmin
                    ? 'Add a chapter and lesson from the Course Content panel to preview video playback.'
                    : 'Lesson video এখানে দেখাবে'}
                </div>
              )}
            </div>

            <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-5 shadow-[0_5px_22px_rgba(23,43,72,0.03)]">
              {activeLesson ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium text-[#718096]">
                        {activeLesson.chapterTitle}
                        {!isAdmin && (
                          <>
                            {' · '}
                            <span className="tabular-nums font-semibold text-[#13845b]">
                              {activeLessonPct}% watched
                            </span>
                          </>
                        )}
                      </div>
                      <h2 className="mt-1 text-lg font-bold text-[#142746]">
                        {activeLesson.title}
                      </h2>
                    </div>

                    {!isAdmin && (
                      <button
                        type="button"
                        onClick={() =>
                          onMarkLessonComplete(course.id, activeLesson.id)
                        }
                        className={`flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          activeLessonPct >= 100
                            ? 'bg-[#e7f5ef] text-[#13845b]'
                            : 'bg-[#d7a84b] text-[#18243a] hover:bg-[#cca042]'
                        }`}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>
                          {activeLessonPct >= 100
                            ? 'Lesson completed'
                            : 'Mark lesson complete'}
                        </span>
                      </button>
                    )}
                  </div>

                  <p className="mt-3 text-sm text-[#59677d] leading-relaxed whitespace-pre-line">
                    {activeLesson.notes || 'No lesson notes provided.'}
                  </p>

                  {activeLesson.file && (
                    <div className="mt-4 pt-3 border-t border-[#e3e9f2]">
                      <a
                        href={activeLesson.file}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#315b9b] hover:underline"
                      >
                        <span>Download / Open Study Material</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  )}

                  <p className="mt-4 text-xs text-[#718096] leading-relaxed">
                    ভিডিও দেখা হলে progress স্বয়ংক্রিয়ভাবে বাড়বে। প্রয়োজনে lesson সম্পূর্ণ হয়েছে বলে Mark করতে পারবেন।
                  </p>
                </>
              ) : (
                <p className="text-sm text-[#718096]">
                  Select or create a lesson to view notes and study materials.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-4 shadow-[0_5px_22px_rgba(23,43,72,0.03)]">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-base font-bold text-[#142746]">
                  Course Content
                </h3>
                {canModule && (
                  <button
                    type="button"
                    onClick={() => onAddChapter(course.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#edf2fa] px-2.5 py-1.5 text-xs font-bold text-[#142746] hover:bg-[#dce6f7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Chapter</span>
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {(course.chapters || []).length === 0 ? (
                  <p className="text-xs text-[#718096] py-3">
                    No chapters created yet.
                  </p>
                ) : (
                  course.chapters.map((chapter, ci) => (
                    <div
                      key={chapter.id}
                      className="rounded-xl border border-[#e3e9f2] p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-bold text-[#142746]">
                          Chapter {ci + 1}: {chapter.title}
                        </div>
                        {canModule && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => onEditChapter(course.id, chapter)}
                              className="rounded-md p-1 text-[#718096] hover:bg-[#f3f6fb] hover:text-[#142746]"
                              aria-label="Edit chapter"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteChapter(course.id, chapter)}
                              className="rounded-md p-1 text-[#718096] hover:bg-[#fff0f1] hover:text-[#c64b58]"
                              aria-label="Delete chapter"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {canLesson && (
                        <button
                          type="button"
                          onClick={() => onAddLesson(course.id, chapter.id)}
                          className="mt-2 inline-flex items-center gap-1 rounded-lg border border-[#e3e9f2] bg-white px-2.5 py-1 text-xs font-semibold text-[#142746] hover:bg-[#f3f6fb] cursor-pointer"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Add lesson</span>
                        </button>
                      )}

                      <div className="mt-2.5 space-y-1.5">
                        {(chapter.lessons || []).length === 0 ? (
                          <p className="text-xs text-[#718096]">
                            No lessons in this chapter.
                          </p>
                        ) : (
                          chapter.lessons.map((lesson, li) => {
                            const isSelected = activeLesson?.id === lesson.id;
                            const lessonDone =
                              !isAdmin &&
                              (progress[
                                `${user.id}_${course.id}_${lesson.id}`
                              ] || 0) >= 100;

                            return (
                              <div
                                key={lesson.id}
                                className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${
                                  isSelected
                                    ? 'border-[#aabbd4] bg-[#f2f5fb]'
                                    : 'border-[#e3e9f2] bg-white hover:bg-[#f8fafd]'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => setActiveLessonId(lesson.id)}
                                  className="flex flex-1 items-center gap-2 text-left font-medium text-[#1d2940] min-w-0 cursor-pointer"
                                >
                                  {lessonDone ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#13845b]" />
                                  ) : (
                                    <Play className="h-3.5 w-3.5 shrink-0 text-[#315b9b]" />
                                  )}
                                  <span className="truncate">
                                    {li + 1}. {lesson.title}
                                  </span>
                                </button>

                                {canLesson && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onEditLesson(
                                          course.id,
                                          chapter.id,
                                          lesson
                                        )
                                      }
                                      className="rounded p-1 text-[#718096] hover:bg-white hover:text-[#142746]"
                                      aria-label="Edit lesson"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onDeleteLesson(
                                          course.id,
                                          chapter.id,
                                          lesson
                                        )
                                      }
                                      className="rounded p-1 text-[#718096] hover:bg-[#fff0f1] hover:text-[#c64b58]"
                                      aria-label="Delete lesson"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[15px] border border-[#e3e9f2] bg-white p-4 shadow-[0_5px_22px_rgba(23,43,72,0.03)]">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-bold text-[#59677d]">
                  Course Progress
                </span>
                <span className="font-mono text-xs text-[#718096] tabular-nums">
                  {completedCount}/{allLessons.length} completed
                </span>
              </div>
              <div className="mt-1.5 font-mono text-2xl font-extrabold text-[#142746] tabular-nums">
                {isAdmin ? 'Preview' : `${coursePct}%`}
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#e9edf4]">
                <div
                  className="h-full bg-[#13845b] transition-[width] duration-300"
                  style={{ width: `${isAdmin ? 100 : coursePct}%` }}
                />
              </div>
              <p className="mt-2.5 text-xs text-[#718096] leading-relaxed">
                Certificate পেতে Course-এর অন্তত{' '}
                <span className="font-mono font-semibold tabular-nums">
                  {settings.threshold}%
                </span>{' '}
                lesson সম্পূর্ণ করতে হবে।
              </p>
              <button
                type="button"
                disabled={!certificateUnlocked}
                onClick={() => onOpenCertificate(course)}
                className={`mt-3 w-full rounded-[10px] px-4 py-2 text-xs font-bold transition-colors whitespace-nowrap ${
                  certificateUnlocked
                    ? 'bg-[#edf2fa] text-[#142746] hover:bg-[#dce6f7] cursor-pointer'
                    : 'bg-[#f3f6fb] text-[#94a3b8] cursor-not-allowed'
                }`}
              >
                {certificateUnlocked ? 'View Certificate' : 'Certificate locked'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
