import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import VocabWarmupDrawer from './components/VocabWarmupDrawer';
import { buildMixedQuizQuestionPool } from './quizHelpers';
import type { MixedQuizQuestionCount } from './quizHelpers';
import type { AnswerReview, AttemptMode, Lesson, LessonProgress, Question, Subject } from './types';

const normalizeAnswer = (value: string | boolean) =>
  String(value).trim().toLowerCase().replace(/\s+/g, ' ');

const shuffleArray = <T,>(items: T[]) =>
  [...items]
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);

const getStringAnswers = (answer: string | string[]) => (Array.isArray(answer) ? answer : [answer]);

const prepareQuestionForQuiz = (question: Question): Question => {
  if (question.type !== 'multiple-choice') {
    return question;
  }

  const acceptedAnswers = getStringAnswers(question.answer);
  const acceptedAnswerKeys = new Set(acceptedAnswers.map(normalizeAnswer));
  const chosenCorrectAnswer = shuffleArray(acceptedAnswers)[0];
  const incorrectChoices = question.choices.filter((choice) => !acceptedAnswerKeys.has(normalizeAnswer(choice)));

  return {
    ...question,
    choices: shuffleArray([chosenCorrectAnswer, ...shuffleArray(incorrectChoices).slice(0, 3)]),
  };
};

const ATTEMPT_MODES = {
  practice: {
    label: 'Practice Mode',
    limit: 10,
    description: '10 random questions. Feedback after each answer.',
  },
  quiz: {
    label: 'Quiz Mode',
    limit: 25,
    description: '25 random questions. Feedback at the end.',
  },
} as const;

const prepareQuestionsForAttempt = (questions: Question[], limit: number) =>
  shuffleArray(questions).slice(0, limit).map(prepareQuestionForQuiz);

const isAttemptMode = (value: unknown): value is AttemptMode => value === 'practice' || value === 'quiz';

const getModeLabel = (mode: AttemptMode) => ATTEMPT_MODES[mode].label;

const getOptionalModeLabel = (mode: unknown) => (isAttemptMode(mode) ? getModeLabel(mode) : '');

const splitBilingualTitle = (title: string) => {
  const [primaryTitle, secondaryTitle] = title.split(' / ');

  return {
    primaryTitle: primaryTitle || title,
    secondaryTitle: secondaryTitle || '',
  };
};

const getAcceptedAnswers = (question: Question): Array<string | boolean> => {
  if (question.type === 'fill-in-the-blank' || question.type === 'multiple-choice') {
    return getStringAnswers(question.answer);
  }

  return [question.answer];
};

const formatAnswer = (answer: string | boolean) => {
  if (typeof answer === 'boolean') {
    return answer ? 'True' : 'False';
  }

  if (normalizeAnswer(answer) === 'true') {
    return 'True';
  }

  if (normalizeAnswer(answer) === 'false') {
    return 'False';
  }

  return answer;
};

const getReviewAnswer = (question: Question) =>
  getAcceptedAnswers(question)
    .map(formatAnswer)
    .join(' / ');

const NICKNAME_STORAGE_KEY = 'ykk-practice-nickname';
const PROGRESS_STORAGE_KEY = 'ykk-practice-progress';
const SKIP_HOME_LEAVE_WARNING_STORAGE_KEY = 'ykk-skip-home-leave-warning';
const ACCESS_GATE_STORAGE_KEY = 'ykk-site-unlocked';
const ACCESS_CODE_SHA256_HASH = '544cff476a8f3e20f195104b207925fc83b3087f064d88a7168bfb10e0575602';
const GOOGLE_FORM_BASE_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScxaQqfSfsYaUIFzwUGW2G2TqCpccChC66LHq5gBI1HsQpm6A/viewform?usp=pp_url';
const GOOGLE_FORM_FIELDS = {
  nickname: 'entry.517867730',
  lesson: 'entry.1904990527',
  score: 'entry.168681509',
  percentage: 'entry.1935507190',
  completedCount: 'entry.222664735',
  bestScore: 'entry.1096279580',
  dateTime: 'entry.1471656644',
  comment: 'entry.198954009',
} as const;

type LessonProgressMap = Record<string, LessonProgress>;

const VOCABULARY_SUBJECT_ID = 'vocabulary';

type VocabularyUnitGroup = {
  key: string;
  label: string;
  lessons: Lesson[];
};

const getVocabularyUnitNumber = (lesson: Lesson) => {
  const titleMatch = lesson.title.match(/\bUnit\s+(\d+)\b/i);
  const idMatch = lesson.id.match(/(?:^|-)unit-(\d+)$/i);
  const unitNumber = Number(titleMatch?.[1] ?? idMatch?.[1]);

  return Number.isFinite(unitNumber) ? unitNumber : null;
};

const getVocabularyUnitButtonLabel = (lesson: Lesson) => {
  const unitNumber = getVocabularyUnitNumber(lesson);

  return unitNumber ? `Unit ${unitNumber}` : lesson.title;
};

const getVocabularyUnitGroupLabel = (unitNumber: number) => {
  const startUnit = Math.floor((unitNumber - 1) / 10) * 10 + 1;

  return {
    key: `${startUnit}-${startUnit + 9}`,
    label: `Units ${startUnit}–${startUnit + 9}`,
  };
};

const groupVocabularyLessonsByTens = (vocabularyLessons: Lesson[]): VocabularyUnitGroup[] => {
  const groups = new Map<string, VocabularyUnitGroup>();

  vocabularyLessons.forEach((lesson) => {
    const unitNumber = getVocabularyUnitNumber(lesson);
    const groupInfo = unitNumber
      ? getVocabularyUnitGroupLabel(unitNumber)
      : { key: 'other', label: 'Other Vocabulary Units' };

    const group = groups.get(groupInfo.key) ?? { ...groupInfo, lessons: [] };
    group.lessons.push(lesson);
    groups.set(groupInfo.key, group);
  });

  return Array.from(groups.values()).map((group) => ({
    ...group,
    lessons: [...group.lessons].sort((a, b) => {
      const aUnitNumber = getVocabularyUnitNumber(a) ?? Number.MAX_SAFE_INTEGER;
      const bUnitNumber = getVocabularyUnitNumber(b) ?? Number.MAX_SAFE_INTEGER;

      return aUnitNumber - bUnitNumber || a.title.localeCompare(b.title);
    }),
  }));
};

const MIXED_REVIEW_QUESTION_COUNTS: Array<{ value: MixedQuizQuestionCount; label: string }> = [
  { value: 25, label: '25 questions' },
  { value: 50, label: '50 questions' },
  { value: 100, label: '100 questions' },
  { value: 'all', label: 'All available' },
];

const isStorageAvailable = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const testKey = 'ykk-practice-storage-test';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
};

const readStorageValue = (key: string) => {
  if (!isStorageAvailable()) {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorageValue = (key: string, value: string) => {
  if (!isStorageAvailable()) {
    return false;
  }

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const removeStorageValue = (key: string) => {
  if (!isStorageAvailable()) {
    return false;
  }

  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

const isLessonProgress = (value: unknown): value is LessonProgress => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const progress = value as Record<string, unknown>;

  return (
    typeof progress.lastScore === 'number' &&
    typeof progress.lastTotal === 'number' &&
    typeof progress.lastPercentage === 'number' &&
    typeof progress.bestScore === 'number' &&
    typeof progress.bestPercentage === 'number' &&
    typeof progress.completedCount === 'number' &&
    typeof progress.lastCompletedAt === 'string' &&
    (progress.lastMode === undefined || isAttemptMode(progress.lastMode))
  );
};

const readProgress = (): LessonProgressMap => {
  const storedProgress = readStorageValue(PROGRESS_STORAGE_KEY);

  if (!storedProgress) {
    return {};
  }

  try {
    const parsedProgress: unknown = JSON.parse(storedProgress);

    if (!parsedProgress || typeof parsedProgress !== 'object' || Array.isArray(parsedProgress)) {
      return {};
    }

    return Object.entries(parsedProgress).reduce<LessonProgressMap>((validProgress, [lessonId, progress]) => {
      if (isLessonProgress(progress)) {
        validProgress[lessonId] = progress;
      }

      return validProgress;
    }, {});
  } catch {
    return {};
  }
};

const saveProgress = (progress: LessonProgressMap) =>
  writeStorageValue(PROGRESS_STORAGE_KEY, JSON.stringify(progress));

const createLessonProgress = (
  previousProgress: LessonProgress | undefined,
  score: number,
  total: number,
  percentage: number,
  mode: AttemptMode,
): LessonProgress => {
  const previousBestPercentage = previousProgress?.bestPercentage ?? 0;
  const isNewBest = !previousProgress || percentage >= previousBestPercentage;

  return {
    lastScore: score,
    lastTotal: total,
    lastPercentage: percentage,
    bestScore: isNewBest ? score : previousProgress.bestScore,
    bestTotal: isNewBest ? total : previousProgress.bestTotal ?? previousProgress.lastTotal,
    bestPercentage: Math.max(previousBestPercentage, percentage),
    completedCount: (previousProgress?.completedCount ?? 0) + 1,
    lastCompletedAt: new Date().toISOString(),
    lastMode: mode,
  };
};

const formatShortDateTime = (dateTime: string) => {
  const date = new Date(dateTime);

  if (Number.isNaN(date.getTime())) {
    return dateTime;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const buildGoogleFormUrl = (fields: {
  nickname: string;
  lesson: string;
  score: string;
  percentage: string;
  completedCount: string;
  bestScore: string;
  dateTime: string;
}) => {
  const formUrl = new URL(GOOGLE_FORM_BASE_URL);

  formUrl.searchParams.set(GOOGLE_FORM_FIELDS.nickname, fields.nickname);
  formUrl.searchParams.set(GOOGLE_FORM_FIELDS.lesson, fields.lesson);
  formUrl.searchParams.set(GOOGLE_FORM_FIELDS.score, fields.score);
  formUrl.searchParams.set(GOOGLE_FORM_FIELDS.percentage, fields.percentage);
  formUrl.searchParams.set(GOOGLE_FORM_FIELDS.completedCount, fields.completedCount);
  formUrl.searchParams.set(GOOGLE_FORM_FIELDS.bestScore, fields.bestScore);
  formUrl.searchParams.set(GOOGLE_FORM_FIELDS.dateTime, fields.dateTime);
  formUrl.searchParams.set(GOOGLE_FORM_FIELDS.comment, '');

  return formUrl.toString();
};

const getResultMessage = (percentage: number, nickname: string) => {
  if (percentage >= 90) {
    return nickname ? `Excellent work, ${nickname}.` : 'Excellent work.';
  }

  if (percentage >= 70) {
    return nickname
      ? `Good job, ${nickname}. Review the missed questions below.`
      : 'Good job. Review the missed questions below.';
  }

  if (percentage >= 50) {
    return nickname
      ? `Keep practicing, ${nickname}. Focus on the review below.`
      : 'Keep practicing. Focus on the review below.';
  }

  return nickname
    ? `Try again, ${nickname}, after reviewing the explanations.`
    : 'Try again after reviewing the explanations.';
};

type Announcement = {
  active: boolean;
  message: string;
};

type ScheduleEvent = {
  date: string;
  title: string;
  description: string;
};

const DEFAULT_ANNOUNCEMENT_MESSAGE =
  'Welcome to English Practice　｜　Start Studying から学習を始めましょう';
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getMonthStart = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), 1);

const formatScheduleDateKey = (year: number, monthIndex: number, day: number) =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const isScheduleEventDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const toScheduleDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const isAnnouncement = (value: unknown): value is Announcement => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const announcement = value as Record<string, unknown>;
  return typeof announcement.active === 'boolean' && typeof announcement.message === 'string';
};

const isScheduleEvent = (value: unknown): value is ScheduleEvent => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const event = value as Record<string, unknown>;
  return (
    typeof event.date === 'string' &&
    isScheduleEventDate(event.date) &&
    typeof event.title === 'string' &&
    typeof event.description === 'string'
  );
};

const EnglishScheduleCalendar = ({ events }: { events: ScheduleEvent[] }) => {
  const [selectedMonthStart, setSelectedMonthStart] = useState(() => getMonthStart());
  const today = getMonthStart(new Date());
  const todayDate = new Date();
  const displayedYear = selectedMonthStart.getFullYear();
  const displayedMonth = selectedMonthStart.getMonth();
  const firstWeekday = selectedMonthStart.getDay();
  const daysInMonth = new Date(displayedYear, displayedMonth + 1, 0).getDate();
  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(selectedMonthStart);
  const currentMonthKey = formatScheduleDateKey(displayedYear, displayedMonth, 1).slice(0, 7);
  const todayKey = formatScheduleDateKey(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
  const isViewingCurrentMonth =
    displayedYear === today.getFullYear() && displayedMonth === today.getMonth();
  const sortedEvents = useMemo(
    () => [...events].sort((first, second) => first.date.localeCompare(second.date)),
    [events],
  );
  const selectedMonthEvents = sortedEvents.filter((event) => event.date.startsWith(currentMonthKey));
  const eventsByDate = selectedMonthEvents.reduce<Map<string, ScheduleEvent[]>>((eventMap, event) => {
    const dateEvents = eventMap.get(event.date) ?? [];
    dateEvents.push(event);
    eventMap.set(event.date, dateEvents);
    return eventMap;
  }, new Map());
  const monthlyEvents = selectedMonthEvents;
  const calendarCells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const changeMonth = (monthOffset: number) => {
    setSelectedMonthStart((currentMonthStart) =>
      new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + monthOffset, 1),
    );
  };

  const showToday = () => {
    setSelectedMonthStart(getMonthStart());
  };

  return (
    <aside className="english-schedule-card" aria-labelledby="english-schedule-title">
      <div className="english-schedule-header">
        <p className="english-schedule-kicker">Homepage Calendar</p>
        <div className="english-schedule-title-row">
          <h2 id="english-schedule-title">English Schedule</h2>
          <div className="english-schedule-controls" aria-label="English schedule month navigation">
            <button
              aria-label="Show previous month"
              className="english-schedule-nav-button"
              onClick={() => changeMonth(-1)}
              type="button"
            >
              ‹
            </button>
            <button
              aria-label="Show current month"
              className="english-schedule-today-button"
              disabled={isViewingCurrentMonth}
              onClick={showToday}
              type="button"
            >
              Today
            </button>
            <button
              aria-label="Show next month"
              className="english-schedule-nav-button"
              onClick={() => changeMonth(1)}
              type="button"
            >
              ›
            </button>
          </div>
        </div>
        <p aria-live="polite">{monthLabel}</p>
      </div>
      <div className="english-schedule-grid" aria-label={`${monthLabel} English schedule calendar`}>
        {WEEKDAY_LABELS.map((weekday) => (
          <span className="english-schedule-weekday" key={weekday}>
            {weekday}
          </span>
        ))}
        {calendarCells.map((day, index) => {
          if (day === null) {
            return <span className="english-schedule-day english-schedule-day-empty" key={`empty-${index}`} />;
          }

          const dateKey = formatScheduleDateKey(displayedYear, displayedMonth, day);
          const dayEvents = eventsByDate.get(dateKey) ?? [];
          const eventLabel = dayEvents
            .map((event) => (event.description ? `${event.title} / ${event.description}` : event.title))
            .join('; ');
          const isToday = isViewingCurrentMonth && dateKey === todayKey;

          return (
            <span
              aria-label={eventLabel ? `${monthLabel} ${day}: ${eventLabel}` : `${monthLabel} ${day}`}
              className={`english-schedule-day${dayEvents.length > 0 ? ' english-schedule-day-event' : ''}${
                isToday ? ' english-schedule-day-today' : ''
              }`}
              key={dateKey}
            >
              {day}
            </span>
          );
        })}
      </div>
      <div className="english-schedule-events">
        <h3>{monthLabel} events</h3>
        {monthlyEvents.length > 0 ? (
          <ul>
            {monthlyEvents.map((event) => {
              const eventDate = toScheduleDate(event.date);
              const eventDay = new Intl.DateTimeFormat('en-US', {
                month: 'short',
                day: 'numeric',
              }).format(eventDate);

              return (
                <li key={`${event.date}-${event.title}`}>
                  <time dateTime={event.date}>{eventDay}</time>
                  <div>
                    <strong>{event.title}</strong>
                    {event.description && <span>{event.description}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="english-schedule-empty">この月のお知らせはありません。</p>
        )}
      </div>
    </aside>
  );
};

function AppContent() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedMode, setSelectedMode] = useState<AttemptMode | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState('');
  const [blankAnswer, setBlankAnswer] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [reviews, setReviews] = useState<AnswerReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState('');
  const [nickname, setNickname] = useState(() => readStorageValue(NICKNAME_STORAGE_KEY) ?? '');
  const [isEditingNickname, setIsEditingNickname] = useState(() => !readStorageValue(NICKNAME_STORAGE_KEY)?.trim());
  const [lessonProgress, setLessonProgress] = useState<LessonProgressMap>(() => readProgress());
  const [progressSaved, setProgressSaved] = useState(false);
  const [currentResultProgress, setCurrentResultProgress] = useState<LessonProgress | null>(null);
  const [mixedReviewLessonIds, setMixedReviewLessonIds] = useState<string[]>([]);
  const [mixedReviewQuestionCount, setMixedReviewQuestionCount] = useState<MixedQuizQuestionCount>(25);
  const [mixedReviewMessage, setMixedReviewMessage] = useState('');
  const [isMixedReviewAttempt, setIsMixedReviewAttempt] = useState(false);
  const [isStudyMode, setIsStudyMode] = useState(false);
  const [showHomeLeaveWarning, setShowHomeLeaveWarning] = useState(false);
  const [skipHomeLeaveWarning, setSkipHomeLeaveWarning] = useState(false);
  const [announcementMessage, setAnnouncementMessage] = useState(DEFAULT_ANNOUNCEMENT_MESSAGE);
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([]);

  useEffect(() => {
    const trimmedNickname = nickname.trim();

    if (trimmedNickname) {
      writeStorageValue(NICKNAME_STORAGE_KEY, trimmedNickname);
      return;
    }

    removeStorageValue(NICKNAME_STORAGE_KEY);
  }, [nickname]);

  useEffect(() => {
    const loadContent = async () => {
      try {
        const [subjectResponse, lessonResponse] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}data/subjects.json`),
          fetch(`${import.meta.env.BASE_URL}data/lessons.json`),
        ]);

        if (!subjectResponse.ok) {
          throw new Error('Could not load the subject list.');
        }

        if (!lessonResponse.ok) {
          throw new Error('Could not load the lesson list.');
        }

        const subjectData = (await subjectResponse.json()) as Subject[];
        const lessonData = (await lessonResponse.json()) as Lesson[];
        setSubjects(subjectData);
        setLessons(lessonData);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load content.');
      } finally {
        setIsLoading(false);
      }
    };

    loadContent();
  }, []);

  useEffect(() => {
    const loadHomepageContent = async () => {
      const [announcementResult, scheduleResult] = await Promise.allSettled([
        fetch(`${import.meta.env.BASE_URL}data/announcements.json`),
        fetch(`${import.meta.env.BASE_URL}data/calendar-events.json`),
      ]);

      if (announcementResult.status === 'fulfilled' && announcementResult.value.ok) {
        try {
          const announcementData = (await announcementResult.value.json()) as unknown;
          if (Array.isArray(announcementData) && announcementData.every(isAnnouncement)) {
            const activeMessages = announcementData
              .filter((announcement) => announcement.active)
              .map((announcement) => announcement.message.trim())
              .filter((message) => message !== '');
            setAnnouncementMessage(activeMessages.join('　｜　'));
          }
        } catch {
          setAnnouncementMessage(DEFAULT_ANNOUNCEMENT_MESSAGE);
        }
      }

      if (scheduleResult.status === 'fulfilled' && scheduleResult.value.ok) {
        try {
          const scheduleData = (await scheduleResult.value.json()) as unknown;
          if (Array.isArray(scheduleData) && scheduleData.every(isScheduleEvent)) {
            setScheduleEvents(scheduleData);
          }
        } catch {
          setScheduleEvents([]);
        }
      }
    };

    loadHomepageContent();
  }, []);


  const currentQuestion = questions[currentQuestionIndex];
  const score = useMemo(() => reviews.filter((review) => review.isCorrect).length, [reviews]);
  const incorrectCount = reviews.length - score;
  const percentage = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
  const missedReviews = useMemo(() => reviews.filter((review) => !review.isCorrect), [reviews]);
  const selectedSubjectLessons = useMemo(() => {
    if (!selectedSubject) {
      return [];
    }

    const lessonIds = new Set(selectedSubject.lessonIds);
    return lessons.filter((lesson) => lesson.categoryId === selectedSubject.id || lessonIds.has(lesson.id));
  }, [lessons, selectedSubject]);
  const hasMixedReviewLessons = selectedSubjectLessons.length > 0;
  const selectedSubjectIsVocabulary = selectedSubject?.id === VOCABULARY_SUBJECT_ID;
  const vocabularyUnitGroups = useMemo(
    () => (selectedSubjectIsVocabulary ? groupVocabularyLessonsByTens(selectedSubjectLessons) : []),
    [selectedSubjectIsVocabulary, selectedSubjectLessons],
  );
  const selectedMixedReviewLessons = useMemo(() => {
    const selectedLessonIdSet = new Set(mixedReviewLessonIds);
    return selectedSubjectLessons.filter((lesson) => selectedLessonIdSet.has(lesson.id));
  }, [mixedReviewLessonIds, selectedSubjectLessons]);
  const hasMixedReviewLessonSelection = selectedMixedReviewLessons.length > 0;
  const mixedReviewStartHelperId = 'mixed-review-start-helper';
  const mixedReviewStartButtonText = hasMixedReviewLessonSelection
    ? 'Start Mixed Review'
    : 'Choose a lesson/unit first';
  const mixedReviewSelectionSummary = hasMixedReviewLessonSelection
    ? `${selectedMixedReviewLessons.length} selected`
    : 'No lessons or units selected yet';
  const quizComplete = questions.length > 0 && showResults;

  useEffect(() => {
    if (isMixedReviewAttempt || !quizComplete || !selectedLesson || !currentResultProgress || progressSaved) {
      return;
    }

    const nextProgressMap = {
      ...lessonProgress,
      [selectedLesson.id]: currentResultProgress,
    };

    if (saveProgress(nextProgressMap)) {
      setLessonProgress(nextProgressMap);
      setProgressSaved(true);
    }
  }, [currentResultProgress, isMixedReviewAttempt, lessonProgress, progressSaved, quizComplete, selectedLesson]);

  const resetAnswerState = () => {
    setSelectedChoice('');
    setBlankAnswer('');
    setFeedback(null);
  };

  const resetStudyNavigation = () => {
    setSelectedSubject(null);
    setSelectedLesson(null);
    setQuestions([]);
    setSelectedMode(null);
    setReviews([]);
    setShowResults(false);
    setProgressSaved(false);
    setCurrentResultProgress(null);
    setIsMixedReviewAttempt(false);
    setMixedReviewLessonIds([]);
    setMixedReviewQuestionCount(25);
    setMixedReviewMessage('');
    setCurrentQuestionIndex(0);
    resetAnswerState();
    setError('');
  };

  const startStudying = () => {
    if (nickname.trim()) {
      setIsEditingNickname(false);
    }

    resetStudyNavigation();
    setIsStudyMode(true);
  };

  const returnHome = () => {
    resetStudyNavigation();
    setIsStudyMode(false);
    setShowHomeLeaveWarning(false);
    setSkipHomeLeaveWarning(false);
  };

  const chooseSubject = (subject: Subject) => {
    if (nickname.trim()) {
      setIsEditingNickname(false);
    }

    setSelectedSubject(subject);
    setSelectedLesson(null);
    setQuestions([]);
    setSelectedMode(null);
    setReviews([]);
    setShowResults(false);
    setProgressSaved(false);
    setCurrentResultProgress(null);
    setIsMixedReviewAttempt(false);
    setMixedReviewLessonIds([]);
    setMixedReviewQuestionCount(25);
    setMixedReviewMessage('');
    setCurrentQuestionIndex(0);
    resetAnswerState();
    setError('');
  };

  const backToSubjects = () => {
    setSelectedSubject(null);
    setSelectedLesson(null);
    setQuestions([]);
    setSelectedMode(null);
    setReviews([]);
    setShowResults(false);
    setProgressSaved(false);
    setCurrentResultProgress(null);
    setIsMixedReviewAttempt(false);
    setMixedReviewLessonIds([]);
    setMixedReviewQuestionCount(25);
    setMixedReviewMessage('');
    setCurrentQuestionIndex(0);
    resetAnswerState();
    setError('');
  };

  const chooseLesson = (lesson: Lesson) => {
    setSelectedLesson(lesson);
    setQuestions([]);
    setSelectedMode(null);
    setReviews([]);
    setShowResults(false);
    setProgressSaved(false);
    setCurrentResultProgress(null);
    setIsMixedReviewAttempt(false);
    setMixedReviewMessage('');
    setCurrentQuestionIndex(0);
    resetAnswerState();
    setError('');
  };

  const toggleMixedReviewLesson = (lessonId: string) => {
    setMixedReviewMessage('');
    setMixedReviewLessonIds((lessonIds) =>
      lessonIds.includes(lessonId)
        ? lessonIds.filter((currentLessonId) => currentLessonId !== lessonId)
        : [...lessonIds, lessonId],
    );
  };

  const selectAllMixedReviewLessons = () => {
    setMixedReviewMessage('');
    setMixedReviewLessonIds(selectedSubjectLessons.map((lesson) => lesson.id));
  };

  const clearMixedReviewLessons = () => {
    setMixedReviewMessage('');
    setMixedReviewLessonIds([]);
  };

  const createMixedReviewLesson = (subject: Subject, selectedLessons: Lesson[]): Lesson => {
    const mixedReviewLessonKey = selectedLessons.map((lesson) => lesson.id).sort().join('+');

    return {
      id: `mixed-review:${subject.id}:${mixedReviewLessonKey}:${mixedReviewQuestionCount}`,
      title: `Mixed Review (${mixedReviewQuestionCount === 'all' ? 'All' : mixedReviewQuestionCount} questions)`,
      description: selectedLessons.map((lesson) => lesson.title).join(' + '),
      questionFile: '',
      categoryId: subject.id,
      categoryTitle: subject.title,
      categoryDescription: subject.description,
    };
  };

  const startMixedReview = async () => {
    if (!selectedSubject || !hasMixedReviewLessons || !hasMixedReviewLessonSelection) {
      setMixedReviewMessage('Choose at least one lesson or unit to start a Mixed Review.');
      return;
    }

    const selectedLessons = selectedMixedReviewLessons;

    if (selectedLessons.length === 0) {
      setMixedReviewMessage('Choose at least one lesson or unit to start a Mixed Review.');
      return;
    }

    setIsLoading(true);
    setError('');
    setMixedReviewMessage('');
    setSelectedLesson(createMixedReviewLesson(selectedSubject, selectedLessons));
    setSelectedMode('quiz');
    setIsMixedReviewAttempt(true);
    setQuestions([]);
    setReviews([]);
    setShowResults(false);
    setProgressSaved(false);
    setCurrentResultProgress(null);
    setCurrentQuestionIndex(0);
    resetAnswerState();

    try {
      const lessonQuestionEntries = await Promise.all(
        selectedLessons.map(async (lesson) => {
          const response = await fetch(`${import.meta.env.BASE_URL}data/questions/${lesson.questionFile}`);

          if (!response.ok) {
            throw new Error(`Could not load the questions for ${lesson.title}.`);
          }

          return [lesson.id, (await response.json()) as Question[]] as const;
        }),
      );
      const questionsByLessonId = Object.fromEntries(lessonQuestionEntries);
      const mixedQuestions = buildMixedQuizQuestionPool(
        selectedSubjectLessons,
        questionsByLessonId,
        mixedReviewLessonIds,
        mixedReviewQuestionCount,
      ).map(prepareQuestionForQuiz);

      if (mixedQuestions.length === 0) {
        setSelectedLesson(null);
        setSelectedMode(null);
        setIsMixedReviewAttempt(false);
        setMixedReviewMessage('No questions are available for the selected lessons or units yet.');
        return;
      }

      setQuestions(mixedQuestions);
    } catch (loadError) {
      setSelectedLesson(null);
      setSelectedMode(null);
      setIsMixedReviewAttempt(false);
      setError(loadError instanceof Error ? loadError.message : 'Could not load Mixed Review questions.');
    } finally {
      setIsLoading(false);
    }
  };

  const startAttempt = async (mode: AttemptMode) => {
    if (!selectedLesson) {
      return;
    }

    setIsLoading(true);
    setError('');
    setSelectedMode(mode);
    setIsMixedReviewAttempt(false);
    setReviews([]);
    setShowResults(false);
    setProgressSaved(false);
    setCurrentResultProgress(null);
    setCurrentQuestionIndex(0);
    resetAnswerState();

    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}data/questions/${selectedLesson.questionFile}`,
      );

      if (!response.ok) {
        throw new Error('Could not load the questions for this lesson.');
      }

      const questionData = (await response.json()) as Question[];
      setQuestions(prepareQuestionsForAttempt(questionData, ATTEMPT_MODES[mode].limit));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load questions.');
    } finally {
      setIsLoading(false);
    }
  };

  const finishAttempt = (completedReviews: AnswerReview[]) => {
    const completedScore = completedReviews.filter((review) => review.isCorrect).length;
    const completedPercentage = questions.length > 0 ? Math.round((completedScore / questions.length) * 100) : 0;

    if (selectedLesson && selectedMode) {
      setCurrentResultProgress(
        createLessonProgress(
          lessonProgress[selectedLesson.id],
          completedScore,
          questions.length,
          completedPercentage,
          selectedMode,
        ),
      );
    }

    setShowResults(true);
  };

  const goToNextQuestion = (completedReviews = reviews) => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((index) => index + 1);
      resetAnswerState();
      return;
    }

    finishAttempt(completedReviews);
  };

  const checkAnswer = (answerOverride?: string) => {
    if (!currentQuestion || (selectedMode === 'practice' && feedback)) {
      return;
    }

    const studentAnswer =
      answerOverride ??
      (currentQuestion.type === 'multiple-choice' ? selectedChoice : blankAnswer.trim());

    if (!studentAnswer) {
      setError('Please enter or choose an answer.');
      return;
    }

    if (currentQuestion.type === 'true-false') {
      setSelectedChoice(studentAnswer);
    }

    const acceptedAnswers = getAcceptedAnswers(currentQuestion).map(normalizeAnswer);
    const isCorrect = acceptedAnswers.includes(normalizeAnswer(studentAnswer));
    const nextReviews = [
      ...reviews,
      {
        question: currentQuestion,
        studentAnswer,
        isCorrect,
      },
    ];

    setError('');
    setReviews(nextReviews);

    if (selectedMode === 'quiz') {
      goToNextQuestion(nextReviews);
      return;
    }

    setFeedback(isCorrect ? 'correct' : 'incorrect');
  };

  const retryLesson = () => {
    if (isMixedReviewAttempt) {
      startMixedReview();
      return;
    }

    if (selectedMode) {
      startAttempt(selectedMode);
    }
  };

  const chooseAnotherLesson = () => {
    setSelectedLesson(null);
    setQuestions([]);
    setSelectedMode(null);
    setReviews([]);
    setShowResults(false);
    setProgressSaved(false);
    setCurrentResultProgress(null);
    setIsMixedReviewAttempt(false);
    setCurrentQuestionIndex(0);
    resetAnswerState();
    setError('');
  };

  const isActiveAttempt = Boolean(selectedLesson && currentQuestion && !quizComplete);

  const handleMascotHomeClick = () => {
    if (!isStudyMode) {
      return;
    }

    if (isActiveAttempt && readStorageValue(SKIP_HOME_LEAVE_WARNING_STORAGE_KEY) !== 'true') {
      setSkipHomeLeaveWarning(false);
      setShowHomeLeaveWarning(true);
      return;
    }

    returnHome();
  };

  const confirmReturnHome = () => {
    if (skipHomeLeaveWarning) {
      writeStorageValue(SKIP_HOME_LEAVE_WARNING_STORAGE_KEY, 'true');
    }

    returnHome();
  };

  const clearNickname = () => {
    setNickname('');
    setIsEditingNickname(true);
    removeStorageValue(NICKNAME_STORAGE_KEY);
  };

  const clearProgress = () => {
    if (!window.confirm('Clear saved quiz progress on this device?')) {
      return;
    }

    removeStorageValue(PROGRESS_STORAGE_KEY);
    setLessonProgress({});
    setProgressSaved(false);
  };

  const hasSavedProgress = Object.keys(lessonProgress).length > 0;
  const trimmedNickname = nickname.trim();
  const isHomeScreen = !isStudyMode;
  const showFullNicknameInput = isHomeScreen && (!trimmedNickname || isEditingNickname);
  const googleFormUrl = selectedLesson && currentResultProgress
    ? buildGoogleFormUrl({
        nickname: trimmedNickname,
        lesson: isMixedReviewAttempt
          ? `${selectedLesson.categoryTitle} - Mixed Review (${selectedLesson.description})`
          : selectedMode
            ? `${selectedLesson.categoryTitle} - ${selectedLesson.title} (${getModeLabel(selectedMode)})`
            : `${selectedLesson.categoryTitle} - ${selectedLesson.title}`,
        score: `${score} / ${questions.length}`,
        percentage: `${percentage}%`,
        completedCount: String(currentResultProgress.completedCount),
        bestScore: `${currentResultProgress.bestScore} / ${currentResultProgress.bestTotal ?? currentResultProgress.lastTotal}`,
        dateTime: formatShortDateTime(currentResultProgress.lastCompletedAt),
      })
    : '';

  const openGoogleForm = () => {
    if (!googleFormUrl) {
      return;
    }

    window.open(googleFormUrl, '_blank', 'noopener,noreferrer');
  };

  const heroCard = (
    <section className={`hero-card${isHomeScreen ? '' : ' compact-hero'}`}>
      <div className="hero-content">
        <div className="hero-copy">
          <div className="school-identity" aria-label="Yuukoukan High School identity">
            <p className="school-name">長崎県立 猶興館高等学校</p>
            <p className="school-meta">YUUKOUKAN HIGH SCHOOL · EST. 1880</p>
          </div>
          <p className="eyebrow">VERSION 2</p>
          <h1>English Practice</h1>
          {!isHomeScreen && trimmedNickname && (
            <p className="nickname-compact">Playing as: <strong>{trimmedNickname}</strong></p>
          )}
        </div>
        <button
          aria-label="Return to homepage"
          className="mascot-home-button"
          onClick={handleMascotHomeClick}
          type="button"
        >
          <img
            alt="Yuukoukan mascot"
            className="mascot-image"
            src={`${import.meta.env.BASE_URL}images/mascot.svg`}
          />
        </button>
      </div>
      {isHomeScreen && (
          <>
            <div className={`nickname-panel${showFullNicknameInput ? '' : ' nickname-panel-saved'}`}>
              {showFullNicknameInput ? (
                <>
                  <label className="nickname-label">
                    Optional nickname
                    <input
                      aria-describedby="privacy-helper"
                      maxLength={24}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder="Example: Ren"
                      type="text"
                      value={nickname}
                    />
                  </label>
                  {trimmedNickname && (
                    <button className="text-button" onClick={() => setIsEditingNickname(false)} type="button">
                      Done
                    </button>
                  )}
                </>
              ) : (
                <div className="nickname-saved-display">
                  <span>Playing as: <strong>{trimmedNickname}</strong></span>
                  <button
                    className="text-button nickname-action-button"
                    onClick={() => setIsEditingNickname(true)}
                    type="button"
                  >
                    change
                  </button>
                </div>
              )}
              {trimmedNickname && (
                <button
                  className="text-button subtle-text-button nickname-action-button"
                  onClick={clearNickname}
                  type="button"
                >
                  clear
                </button>
              )}
            </div>
            <p className="privacy-note" id="privacy-helper">
              進み具合はこの端末だけに保存されます。本名や出席番号は使わないでください。
            </p>
          </>
      )}
    </section>
  );

  return (
    <>
      <VocabWarmupDrawer hidden={isActiveAttempt} lessons={lessons} />
      <div className="yuukoukan-rain" aria-hidden="true">
        <span>猶興館</span>
        <span>猶興館</span>
        <span>猶興館</span>
        <span>猶興館</span>
        <span>猶興館</span>
        <span>猶興館</span>
        <span>猶興館</span>
        <span>猶興館</span>
        <span>猶興館</span>
        <span>猶興館</span>
        <span>猶興館</span>
        <span>猶興館</span>
      </div>
      <main className={`app-shell${isHomeScreen ? ' home-shell' : ''}`}>
        {isHomeScreen ? (
          <div className="home-layout">
          <div className="home-layout-spacer" aria-hidden="true" />
          <div className="home-main-column">
            {heroCard}
            <div className="home-start-panel">
              <button className="primary-button start-study-button" onClick={startStudying} type="button">
                <span>Start Studying</span>
                <span>学習を始める</span>
              </button>
            </div>
            {announcementMessage && (
              <aside className="english-notice-ribbon" aria-label="英語のお知らせ">
                <span className="english-notice-label">英語のお知らせ</span>
                <div className="english-notice-track" aria-live="polite">
                  <p>{announcementMessage}</p>
                </div>
              </aside>
            )}
          </div>
            <EnglishScheduleCalendar events={scheduleEvents} />
          </div>
        ) : (
          heroCard
        )}

        {error && <p className="message error-message">{error}</p>}
        {isLoading && <p className="message">Loading...</p>}

      {!isLoading && isStudyMode && !selectedSubject && (
        <section className="card">
          <div className="section-heading-row">
            <h2>Choose a Subject</h2>
            {hasSavedProgress && (
              <button className="text-button" onClick={clearProgress} type="button">
                Clear saved progress
              </button>
            )}
          </div>
          <div className="subject-grid">
            {subjects.map((subject) => {
              const { primaryTitle, secondaryTitle } = splitBilingualTitle(subject.title);
              const isComingSoon = subject.lessonIds.length === 0;

              return (
                <button
                  className={`subject-card${isComingSoon ? ' coming-soon' : ''}`}
                  key={subject.id}
                  onClick={() => chooseSubject(subject)}
                  type="button"
                >
                  <span className="subject-title-ja">{primaryTitle}</span>
                  {secondaryTitle && <span className="subject-title-en">{secondaryTitle}</span>}
                  <small>{subject.description}</small>
                  {isComingSoon && <strong className="coming-soon-label">No lessons yet</strong>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {!isLoading && isStudyMode && selectedSubject && !selectedLesson && (
        <section className="card">
          <div className="section-heading-row">
            <div>
              <p className="section-kicker">{selectedSubject.title}</p>
              <h2>Choose a Lesson or Unit</h2>
            </div>
            <button className="text-button" onClick={backToSubjects} type="button">
              Back to subjects
            </button>
          </div>
          {hasMixedReviewLessons ? (
            selectedSubjectIsVocabulary ? (
              <div className="vocabulary-unit-groups" aria-label="Vocabulary units grouped by tens">
                {vocabularyUnitGroups.map((group) => (
                  <section className="vocabulary-unit-group" key={group.key} aria-labelledby={`vocabulary-unit-group-${group.key}`}>
                    <h3 id={`vocabulary-unit-group-${group.key}`}>{group.label}</h3>
                    <div className="vocabulary-unit-button-grid">
                      {group.lessons.map((lesson) => {
                        const progress = lessonProgress[lesson.id];

                        return (
                          <button
                            aria-label={`${lesson.title}: ${lesson.description}`}
                            className="vocabulary-unit-button"
                            key={lesson.id}
                            onClick={() => chooseLesson(lesson)}
                            title={lesson.title}
                            type="button"
                          >
                            <strong>{getVocabularyUnitButtonLabel(lesson)}</strong>
                            {progress && <small>{progress.bestPercentage}% best · {progress.completedCount} done</small>}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="lesson-grid">
                {selectedSubjectLessons.map((lesson) => {
                  const progress = lessonProgress[lesson.id];

                  return (
                    <button className="lesson-card" key={lesson.id} onClick={() => chooseLesson(lesson)} type="button">
                      <span>{lesson.title}</span>
                      <small>{lesson.description}</small>
                      {progress && (
                        <div className="lesson-progress">
                          <p>Last score: {progress.lastScore} / {progress.lastTotal}</p>
                          <p>Best score: {progress.bestScore} / {progress.bestTotal ?? progress.lastTotal}</p>
                          <p>Completed: {progress.completedCount} times</p>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            <p className="message">No lessons or units are available for this subject yet. Please check back later.</p>
          )}

          <section className="mixed-review-panel" aria-labelledby="mixed-review-title">
            <div className="mixed-review-intro">
              <p className="section-kicker">{selectedSubject.title}</p>
              <h3 id="mixed-review-title">Mixed Review</h3>
              <p>Pick one or more lessons or units, then take a quiz-style review with results at the end.</p>
            </div>

            {hasMixedReviewLessons ? (
              <>
                <div className="mixed-review-grid">
                  <fieldset className="mixed-review-fieldset">
                    <legend>Lessons / Units</legend>
                    <p className="mixed-review-summary">{mixedReviewSelectionSummary}</p>
                    {selectedSubjectIsVocabulary && (
                      <div className="mixed-review-selection-actions" aria-label="Vocabulary Mixed Review selection actions">
                        <button className="mixed-review-action-button" onClick={selectAllMixedReviewLessons} type="button">
                          Select all
                        </button>
                        <button
                          className="mixed-review-action-button"
                          disabled={!hasMixedReviewLessonSelection}
                          onClick={clearMixedReviewLessons}
                          type="button"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                    {hasMixedReviewLessonSelection && (
                      <div className="mixed-review-selected-list" aria-label="Selected Mixed Review lessons or units">
                        {selectedMixedReviewLessons.map((lesson) => (
                          <span key={lesson.id}>{selectedSubjectIsVocabulary ? getVocabularyUnitButtonLabel(lesson) : lesson.title}</span>
                        ))}
                      </div>
                    )}
                    {selectedSubjectIsVocabulary ? (
                      <div className="mixed-review-unit-groups" aria-label="Vocabulary Mixed Review units grouped by tens">
                        {vocabularyUnitGroups.map((group) => (
                          <section className="mixed-review-unit-group" key={group.key} aria-labelledby={`mixed-review-unit-group-${group.key}`}>
                            <h4 id={`mixed-review-unit-group-${group.key}`}>{group.label}</h4>
                            <div className="mixed-review-unit-button-grid">
                              {group.lessons.map((lesson) => {
                                const isSelected = mixedReviewLessonIds.includes(lesson.id);

                                return (
                                  <button
                                    aria-label={`${isSelected ? 'Deselect' : 'Select'} ${lesson.title} for Mixed Review`}
                                    aria-pressed={isSelected}
                                    className={`mixed-review-unit-toggle${isSelected ? ' selected' : ''}`}
                                    key={lesson.id}
                                    onClick={() => toggleMixedReviewLesson(lesson.id)}
                                    title={lesson.title}
                                    type="button"
                                  >
                                    <strong>{getVocabularyUnitButtonLabel(lesson)}</strong>
                                    <span>{isSelected ? 'Selected' : 'Not selected'}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </section>
                        ))}
                      </div>
                    ) : (
                      <div className="mixed-review-lessons">
                        {selectedSubjectLessons.map((lesson) => (
                          <label className="mixed-review-checkbox" key={lesson.id}>
                            <input
                              checked={mixedReviewLessonIds.includes(lesson.id)}
                              onChange={() => toggleMixedReviewLesson(lesson.id)}
                              type="checkbox"
                            />
                            <span>
                              <strong>{lesson.title}</strong>
                              <small>{lesson.description}</small>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </fieldset>

                  <fieldset className="mixed-review-fieldset">
                    <legend>Question count</legend>
                    <p className="mixed-review-summary">If fewer questions are available, the review will use all available questions.</p>
                    <div className="question-count-options">
                      {MIXED_REVIEW_QUESTION_COUNTS.map((option) => (
                        <label className="question-count-option" key={option.value}>
                          <input
                            checked={mixedReviewQuestionCount === option.value}
                            name="mixed-review-question-count"
                            onChange={() => {
                              setMixedReviewQuestionCount(option.value);
                              setMixedReviewMessage('');
                            }}
                            type="radio"
                            value={option.value}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>

                <p className="mixed-review-helper" id={mixedReviewStartHelperId}>
                  {hasMixedReviewLessonSelection
                    ? 'Ready when you are. You will see your score and missed-question review at the end.'
                    : 'Choose at least one lesson or unit before starting.'}
                </p>

                {mixedReviewMessage && <p className="message mixed-review-message">{mixedReviewMessage}</p>}

                <button
                  aria-describedby={mixedReviewStartHelperId}
                  className="primary-button"
                  disabled={!hasMixedReviewLessonSelection}
                  onClick={startMixedReview}
                  type="button"
                >
                  {mixedReviewStartButtonText}
                </button>
              </>
            ) : (
              <p className="message mixed-review-message">Mixed Review will be available after lessons or units are added for this subject.</p>
            )}
          </section>
        </section>
      )}

      {!isLoading && isStudyMode && selectedLesson && questions.length === 0 && (
        <section className="card lesson-start">
          <button className="text-button back-link" onClick={chooseAnotherLesson} type="button">
            Back to lessons
          </button>
          <p className="section-kicker">{selectedLesson.categoryTitle}</p>
          <h2>{selectedLesson.title}</h2>
          <p>{selectedLesson.description}</p>
          {lessonProgress[selectedLesson.id] && (
            <div className="saved-progress-summary">
              <p><strong>Last score:</strong> {lessonProgress[selectedLesson.id].lastScore} / {lessonProgress[selectedLesson.id].lastTotal}</p>
              <p><strong>Last percentage:</strong> {lessonProgress[selectedLesson.id].lastPercentage}%</p>
              <p><strong>Best score:</strong> {lessonProgress[selectedLesson.id].bestScore} / {lessonProgress[selectedLesson.id].bestTotal ?? lessonProgress[selectedLesson.id].lastTotal}</p>
              <p><strong>Best percentage:</strong> {lessonProgress[selectedLesson.id].bestPercentage}%</p>
              <p><strong>Completed:</strong> {lessonProgress[selectedLesson.id].completedCount} times</p>
              {lessonProgress[selectedLesson.id].lastMode && (
                <p><strong>Last mode:</strong> {getOptionalModeLabel(lessonProgress[selectedLesson.id].lastMode)}</p>
              )}
              <p><strong>Last completed:</strong> {formatShortDateTime(lessonProgress[selectedLesson.id].lastCompletedAt)}</p>
            </div>
          )}
          <div className="button-row">
            <button className="mode-button" onClick={() => startAttempt('practice')} type="button">
              <span>{ATTEMPT_MODES.practice.label}</span>
              <small>{ATTEMPT_MODES.practice.description}</small>
            </button>
            <button className="mode-button" onClick={() => startAttempt('quiz')} type="button">
              <span>{ATTEMPT_MODES.quiz.label}</span>
              <small>{ATTEMPT_MODES.quiz.description}</small>
            </button>
            <button className="secondary-button" onClick={chooseAnotherLesson} type="button">Back to lesson selection</button>
          </div>
        </section>
      )}

      {!isLoading && isStudyMode && selectedLesson && currentQuestion && !quizComplete && (
        <section className="card quiz-card">
          <p className="progress-text">
            {isMixedReviewAttempt ? 'Mixed Review · ' : ''}{selectedMode ? `${getModeLabel(selectedMode)} · ` : ''}Question {currentQuestionIndex + 1} of {questions.length}
          </p>
          <h2>{currentQuestion.prompt}</h2>

          {currentQuestion.type === 'multiple-choice' && (
            <div className="choice-list">
              {currentQuestion.choices.map((choice) => (
                <label className="choice-option" key={choice}>
                  <input
                    checked={selectedChoice === choice}
                    disabled={selectedMode === 'practice' && feedback !== null}
                    name="answer"
                    onChange={() => setSelectedChoice(choice)}
                    type="radio"
                    value={choice}
                  />
                  <span>{choice}</span>
                </label>
              ))}
            </div>
          )}

          {currentQuestion.type === 'fill-in-the-blank' && (
            <label className="blank-label">
              Your answer
              <input
                disabled={selectedMode === 'practice' && feedback !== null}
                onChange={(event) => setBlankAnswer(event.target.value)}
                placeholder="Type your answer"
                type="text"
                value={blankAnswer}
              />
            </label>
          )}

          {currentQuestion.type === 'true-false' && (
            <div className="button-row" role="group" aria-label="True or false answer choices">
              <button
                className="secondary-button"
                disabled={selectedMode === 'practice' && feedback !== null}
                onClick={() => checkAnswer('True')}
              >
                True
              </button>
              <button
                className="secondary-button"
                disabled={selectedMode === 'practice' && feedback !== null}
                onClick={() => checkAnswer('False')}
              >
                False
              </button>
            </div>
          )}

          {!feedback && currentQuestion.type !== 'true-false' ? (
            <button className="primary-button" onClick={() => checkAnswer()}>
              {selectedMode === 'quiz'
                ? currentQuestionIndex < questions.length - 1 ? 'Next question' : 'Show results'
                : 'Check answer'}
            </button>
          ) : feedback && selectedMode === 'practice' ? (
            <div className={`feedback ${feedback}`}>
              <strong>{feedback === 'correct' ? 'Correct!' : 'Incorrect'}</strong>
              <p>{currentQuestion.explanation}</p>
              {currentQuestionIndex < questions.length - 1 ? (
                <button className="primary-button" onClick={() => goToNextQuestion()}>Next question</button>
              ) : (
                <button className="primary-button" onClick={() => goToNextQuestion()}>Show results</button>
              )}
            </div>
          ) : null}
        </section>
      )}

      {!isLoading && isStudyMode && quizComplete && (
        <section className="card results-card">
          <h2>{isMixedReviewAttempt ? 'Mixed Review results' : 'Final results'}</h2>
          <div className="results-summary">
            {isMixedReviewAttempt && <p><strong>Review type:</strong> Mixed Review</p>}
            {selectedMode && <p><strong>Mode:</strong> {getModeLabel(selectedMode)}</p>}
            <p className="score-text">Score: {score} / {questions.length}</p>
            <p><strong>Percentage:</strong> {percentage}%</p>
            <p><strong>Correct:</strong> {score}</p>
            <p><strong>Incorrect:</strong> {incorrectCount}</p>
            <p className="result-message">{getResultMessage(percentage, trimmedNickname)}</p>
            <p className="local-save-message">
              {isMixedReviewAttempt
                ? 'Mixed Review results are not added to normal lesson/unit progress.'
                : progressSaved
                  ? 'Progress saved locally on this device.'
                  : 'Progress will be saved locally on this device when storage is available.'}
            </p>
          </div>

          <div className="result-submit-panel">
            <p className="form-privacy-note">
              This opens a Google Form. Check the information before submitting. Do not enter your real full
              name or student number.
            </p>
            <button className="primary-button" onClick={openGoogleForm} type="button">
              Submit result to teacher
            </button>
          </div>

          <h3>Questions to Review</h3>
          {missedReviews.length === 0 ? (
            <p className="message success-message">No missed questions. Great work.</p>
          ) : (
            <ol className="review-list">
              {missedReviews.map((review, index) => (
                <li key={`${review.question.id}-${index}`} className="review-incorrect">
                  <p><strong>{review.question.prompt}</strong></p>
                  <p><strong>Your answer:</strong> {formatAnswer(review.studentAnswer)}</p>
                  <p><strong>Correct answer:</strong> {getReviewAnswer(review.question)}</p>
                  <p><strong>Explanation:</strong> {review.question.explanation}</p>
                </li>
              ))}
            </ol>
          )}
          <div className="button-row">
            <button className="primary-button" onClick={retryLesson}>Retry</button>
            <button className="secondary-button" onClick={chooseAnotherLesson} type="button">Back to lesson selection</button>
          </div>
        </section>
      )}
      {showHomeLeaveWarning && (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="home-leave-warning-title"
            aria-modal="true"
            className="leave-warning-dialog"
            role="dialog"
          >
            <h2 id="home-leave-warning-title">ホームに戻りますか？</h2>
            <p>現在の問題の進み具合は保存されません。</p>
            <label className="leave-warning-checkbox">
              <input
                checked={skipHomeLeaveWarning}
                onChange={(event) => setSkipHomeLeaveWarning(event.target.checked)}
                type="checkbox"
              />
              <span>この端末では次回から表示しない</span>
            </label>
            <div className="button-row">
              <button className="primary-button" onClick={confirmReturnHome} type="button">
                ホームに戻る
              </button>
              <button
                className="secondary-button"
                onClick={() => setShowHomeLeaveWarning(false)}
                type="button"
              >
                学習を続ける
              </button>
            </div>
          </section>
        </div>
      )}
      </main>
    </>
  );
}


const sha256Hex = async (value: string) => {
  const encodedValue = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest('SHA-256', encodedValue);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const prefersReducedMotion = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const AccessGate = ({ onUnlock }: { onUnlock: () => void }) => {
  const gateStyle = {
    '--access-gate-background-image': `url("${import.meta.env.BASE_URL}images/school-gate.jpg")`,
  } as CSSProperties;
  const [accessCode, setAccessCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isChecking || isUnlocking) {
      return;
    }

    setErrorMessage('');
    setIsChecking(true);

    try {
      if (!window.crypto?.subtle) {
        throw new Error('Web Crypto API is not available.');
      }

      const enteredCodeHash = await sha256Hex(accessCode.trim());

      if (enteredCodeHash !== ACCESS_CODE_SHA256_HASH) {
        setErrorMessage('クラスコードが違います。');
        setIsChecking(false);
        return;
      }

      writeStorageValue(ACCESS_GATE_STORAGE_KEY, 'true');
      setIsUnlocking(true);
      window.setTimeout(onUnlock, prefersReducedMotion() ? 0 : 240);
    } catch {
      setErrorMessage('クラスコードが違います。');
      setIsChecking(false);
    }
  };

  return (
    <main className={`access-gate${isUnlocking ? ' access-gate-unlocking' : ''}`} style={gateStyle}>
      <section className="access-gate-card" aria-labelledby="access-gate-title">
        <p className="access-gate-kicker">Yuukoukan High School</p>
        <h1 id="access-gate-title">猶興館 English Practice</h1>
        <p className="access-gate-subtitle">このサイトは猶興館高校の英語学習用です。</p>
        <form className="access-gate-form" onSubmit={handleSubmit}>
          <label htmlFor="class-access-code">クラスコードを入力してください</label>
          <input
            aria-describedby={errorMessage ? 'access-gate-error' : undefined}
            aria-invalid={errorMessage ? 'true' : 'false'}
            autoComplete="off"
            autoFocus
            id="class-access-code"
            onChange={(event) => setAccessCode(event.target.value)}
            type="password"
            value={accessCode}
          />
          {errorMessage && (
            <p className="access-gate-error" id="access-gate-error" role="alert">
              {errorMessage}
            </p>
          )}
          <button className="access-gate-button" disabled={isChecking || isUnlocking} type="submit">
            {isChecking || isUnlocking ? '確認中…' : '入る'}
          </button>
        </form>
      </section>
    </main>
  );
};

function App() {
  const [isUnlocked, setIsUnlocked] = useState(() => readStorageValue(ACCESS_GATE_STORAGE_KEY) === 'true');

  if (!isUnlocked) {
    return <AccessGate onUnlock={() => setIsUnlocked(true)} />;
  }

  return <AppContent />;
}

export default App;
