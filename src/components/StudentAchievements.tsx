import type { ReactNode } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Flame,
  Lock,
  Target,
  Trophy,
} from 'lucide-react';
import type { Course, ProgressMap } from '../types/lms';
import {
  getCompletedLessonCount,
  getCourseLessons,
  getUserCourseProgress,
  isCertificateEligible,
} from '../utils/lms';

interface AchievementItem {
  id: string;
  title: string;
  description: string;
  progressLabel: string;
  earned: boolean;
  accent: 'gold' | 'emerald' | 'navy';
  icon: ReactNode;
}

export function StudentAchievements({
  userId,
  myCourses,
  progress,
  threshold,
}: {
  userId: string;
  myCourses: Course[];
  progress: ProgressMap;
  threshold: number;
}) {
  const completedLessons = myCourses.reduce(
    (sum, course) => sum + getCompletedLessonCount(userId, course, progress),
    0
  );

  const coursePcts = myCourses.map((course) =>
    getUserCourseProgress(userId, course, progress)
  );
  const maxCoursePct = coursePcts.length ? Math.max(...coursePcts) : 0;
  const avgProgress = coursePcts.length
    ? Math.round(coursePcts.reduce((a, b) => a + b, 0) / coursePcts.length)
    : 0;

  const eligibleCoursesCount = myCourses.filter((course) =>
    isCertificateEligible(userId, course, progress, threshold)
  ).length;

  const fullCompletedCoursesCount = myCourses.filter((course) => {
    const ls = getCourseLessons(course);
    return (
      ls.length > 0 &&
      getCompletedLessonCount(userId, course, progress) === ls.length
    );
  }).length;

  const badges: AchievementItem[] = [
    {
      id: 'first-lesson',
      title: 'First Step',
      description: 'Complete your first lesson in any enrolled course.',
      progressLabel:
        completedLessons >= 1
          ? 'Unlocked'
          : `${completedLessons}/1 lesson`,
      earned: completedLessons >= 1,
      accent: 'navy',
      icon: <BookOpen className="h-4.5 w-4.5" />,
    },
    {
      id: 'scholar-five',
      title: 'Steady Scholar',
      description: 'Finish 5 or more lessons across your courses.',
      progressLabel:
        completedLessons >= 5
          ? 'Unlocked'
          : `${Math.min(completedLessons, 5)}/5 lessons`,
      earned: completedLessons >= 5,
      accent: 'emerald',
      icon: <Flame className="h-4.5 w-4.5" />,
    },
    {
      id: 'halfway',
      title: 'Halfway Milestone',
      description: 'Reach 50% or higher completion in any course.',
      progressLabel:
        maxCoursePct >= 50
          ? 'Unlocked'
          : `${maxCoursePct}% / 50%`,
      earned: maxCoursePct >= 50,
      accent: 'navy',
      icon: <Target className="h-4.5 w-4.5" />,
    },
    {
      id: 'first-course',
      title: 'First Course Finished',
      description: `Clear the ${threshold}% completion milestone in a course.`,
      progressLabel:
        eligibleCoursesCount >= 1
          ? 'Unlocked'
          : `${eligibleCoursesCount}/1 course`,
      earned: eligibleCoursesCount >= 1,
      accent: 'gold',
      icon: <Award className="h-4.5 w-4.5" />,
    },
    {
      id: 'perfectionist',
      title: '100% Mastery',
      description: 'Complete 100% of lessons inside an entire course.',
      progressLabel:
        fullCompletedCoursesCount >= 1
          ? 'Unlocked'
          : `${fullCompletedCoursesCount}/1 course`,
      earned: fullCompletedCoursesCount >= 1,
      accent: 'emerald',
      icon: <CheckCircle2 className="h-4.5 w-4.5" />,
    },
    {
      id: 'top-learner',
      title: 'Top Learner',
      description: 'Finish 2 courses or maintain 80%+ average after a course finish.',
      progressLabel:
        eligibleCoursesCount >= 2 ||
        (eligibleCoursesCount >= 1 && avgProgress >= 80)
          ? 'Unlocked'
          : `${avgProgress}% avg`,
      earned:
        eligibleCoursesCount >= 2 ||
        (eligibleCoursesCount >= 1 && avgProgress >= 80),
      accent: 'gold',
      icon: <Trophy className="h-4.5 w-4.5" />,
    },
  ];

  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <section
      aria-label="Learning Achievements and Badges"
      className="mb-6 rounded-[16px] border border-[#e3e9f2] bg-white p-4 sm:p-5 shadow-[0_5px_22px_rgba(23,43,72,0.04)]"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-extrabold text-[#142746]">
            Achievements &amp; Badges
          </h2>
          <p className="mt-0.5 text-xs text-[#718096]">
            Complete lessons and courses to unlock learning milestones
          </p>
        </div>
        <div className="font-mono text-xs font-bold tabular-nums text-[#142746] bg-[#edf2fa] border border-[#dce6f7] rounded-[9px] px-3 py-1.5">
          {earnedCount} / {badges.length} Earned
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {badges.map((badge) => {
          const iconBoxStyle = !badge.earned
            ? 'bg-[#eef2f8] text-[#8a97ab] border-[#e3e9f2]'
            : badge.accent === 'gold'
              ? 'bg-[#d7a84b] text-[#142746] border-[#c89635]'
              : badge.accent === 'emerald'
                ? 'bg-[#13845b] text-white border-[#0f6c4a]'
                : 'bg-[#142746] text-[#f3cf7a] border-[#223b63]';

          return (
            <div
              key={badge.id}
              className={`flex items-start gap-3 rounded-[13px] border p-3.5 transition-colors ${
                badge.earned
                  ? 'border-[#e6d2a2] bg-gradient-to-br from-[#fffdf7] to-[#faf4e4]'
                  : 'border-[#e8eef6] bg-[#f9fbfe]'
              }`}
            >
              <div
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-[11px] border ${iconBoxStyle}`}
              >
                {badge.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3
                    className={`truncate text-sm font-bold ${
                      badge.earned ? 'text-[#142746]' : 'text-[#59677d]'
                    }`}
                  >
                    {badge.title}
                  </h3>
                  {badge.earned ? (
                    <span className="shrink-0 text-[11px] font-bold text-[#13845b]">
                      {badge.progressLabel}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 shrink-0 font-mono text-[11px] font-semibold tabular-nums text-[#718096]">
                      <Lock className="h-3 w-3" />
                      {badge.progressLabel}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-snug text-[#718096]">
                  {badge.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
