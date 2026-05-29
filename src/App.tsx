import { useEffect, useMemo, useState } from 'react';
import type { AnswerReview, AttemptMode, Lesson, LessonProgress, Question } from './types';

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

const getModeLabel = (mode: AttemptMode) => ATTEMPT_MODES[mode].label;

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
    typeof progress.lastCompletedAt === 'string'
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

function App() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
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
  const [lessonProgress, setLessonProgress] = useState<LessonProgressMap>(() => readProgress());
  const [progressSaved, setProgressSaved] = useState(false);
  const [currentResultProgress, setCurrentResultProgress] = useState<LessonProgress | null>(null);

  useEffect(() => {
    const trimmedNickname = nickname.trim();

    if (trimmedNickname) {
      writeStorageValue(NICKNAME_STORAGE_KEY, trimmedNickname);
      return;
    }

    removeStorageValue(NICKNAME_STORAGE_KEY);
  }, [nickname]);

  useEffect(() => {
    const loadLessons = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/lessons.json`);

        if (!response.ok) {
          throw new Error('Could not load the lesson list.');
        }

        const lessonData = (await response.json()) as Lesson[];
        setLessons(lessonData);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load lessons.');
      } finally {
        setIsLoading(false);
      }
    };

    loadLessons();
  }, []);

  const currentQuestion = questions[currentQuestionIndex];
  const score = useMemo(() => reviews.filter((review) => review.isCorrect).length, [reviews]);
  const incorrectCount = reviews.length - score;
  const percentage = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
  const missedReviews = useMemo(() => reviews.filter((review) => !review.isCorrect), [reviews]);
  const quizComplete = questions.length > 0 && showResults;

  useEffect(() => {
    if (!quizComplete || !selectedLesson || !currentResultProgress || progressSaved) {
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
  }, [currentResultProgress, lessonProgress, progressSaved, quizComplete, selectedLesson]);

  const resetAnswerState = () => {
    setSelectedChoice('');
    setBlankAnswer('');
    setFeedback(null);
  };

  const chooseLesson = (lesson: Lesson) => {
    setSelectedLesson(lesson);
    setQuestions([]);
    setSelectedMode(null);
    setReviews([]);
    setShowResults(false);
    setProgressSaved(false);
    setCurrentResultProgress(null);
    setCurrentQuestionIndex(0);
    resetAnswerState();
    setError('');
  };

  const startAttempt = async (mode: AttemptMode) => {
    if (!selectedLesson) {
      return;
    }

    setIsLoading(true);
    setError('');
    setSelectedMode(mode);
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
    setCurrentQuestionIndex(0);
    resetAnswerState();
    setError('');
  };

  const clearNickname = () => {
    setNickname('');
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
  const googleFormUrl = selectedLesson && currentResultProgress
    ? buildGoogleFormUrl({
        nickname: trimmedNickname,
        lesson: selectedMode ? `${selectedLesson.title} (${getModeLabel(selectedMode)})` : selectedLesson.title,
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

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Version 1</p>
        <h1>English Practice</h1>
        <div className="nickname-panel">
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
            <button className="text-button" onClick={clearNickname} type="button">
              Clear saved nickname
            </button>
          )}
        </div>
        <p className="privacy-note" id="privacy-helper">
          Progress is saved only on this device. Do not use your real full name or student number.
        </p>
      </section>

      {error && <p className="message error-message">{error}</p>}
      {isLoading && <p className="message">Loading...</p>}

      {!isLoading && !selectedLesson && (
        <section className="card">
          <div className="section-heading-row">
            <h2>Choose a lesson</h2>
            {hasSavedProgress && (
              <button className="text-button" onClick={clearProgress} type="button">
                Clear saved progress
              </button>
            )}
          </div>
          <div className="lesson-grid">
            {lessons.map((lesson) => {
              const progress = lessonProgress[lesson.id];

              return (
                <button className="lesson-card" key={lesson.id} onClick={() => chooseLesson(lesson)}>
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
        </section>
      )}

      {!isLoading && selectedLesson && questions.length === 0 && (
        <section className="card lesson-start">
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
                <p><strong>Last mode:</strong> {getModeLabel(lessonProgress[selectedLesson.id].lastMode)}</p>
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
            <button className="secondary-button" onClick={chooseAnotherLesson}>Choose another lesson</button>
          </div>
        </section>
      )}

      {!isLoading && selectedLesson && currentQuestion && !quizComplete && (
        <section className="card quiz-card">
          <p className="progress-text">
            {selectedMode ? `${getModeLabel(selectedMode)} · ` : ''}Question {currentQuestionIndex + 1} of {questions.length}
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
                <button className="primary-button" onClick={goToNextQuestion}>Next question</button>
              ) : (
                <button className="primary-button" onClick={goToNextQuestion}>Show results</button>
              )}
            </div>
          ) : null}
        </section>
      )}

      {!isLoading && quizComplete && (
        <section className="card results-card">
          <h2>Final results</h2>
          <div className="results-summary">
            {selectedMode && <p><strong>Mode:</strong> {getModeLabel(selectedMode)}</p>}
            <p className="score-text">Score: {score} / {questions.length}</p>
            <p><strong>Percentage:</strong> {percentage}%</p>
            <p><strong>Correct:</strong> {score}</p>
            <p><strong>Incorrect:</strong> {incorrectCount}</p>
            <p className="result-message">{getResultMessage(percentage, trimmedNickname)}</p>
            <p className="local-save-message">
              {progressSaved
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
              {missedReviews.map((review) => (
                <li key={review.question.id} className="review-incorrect">
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
            <button className="secondary-button" onClick={chooseAnotherLesson}>Choose another lesson</button>
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
