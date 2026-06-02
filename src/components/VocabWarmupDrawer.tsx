import { useEffect, useMemo, useState } from 'react';
import type { Lesson, Question } from '../types';
import './VocabWarmupDrawer.css';

type VocabWarmupDrawerProps = {
  lessons: Lesson[];
  hidden?: boolean;
};

type VocabItem = {
  id: string;
  word: string;
  meaning: string;
};

type RoundState = {
  item: VocabItem;
  choices: string[];
};

type AnswerState = {
  selectedMeaning: string;
  isCorrect: boolean;
};

const BADGE_STORAGE_KEY = 'ykk-vocab-warmup-badges';
const NO_VOCAB_MESSAGE = '単語データがまだありません。';

const normalizeText = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const shuffleArray = <T,>(items: T[]) =>
  [...items]
    .map((item) => ({ item, sort: Math.random() }))
    .sort((first, second) => first.sort - second.sort)
    .map(({ item }) => item);

const readBadgeCount = () => {
  if (typeof window === 'undefined') {
    return 0;
  }

  try {
    const storedValue = window.localStorage.getItem(BADGE_STORAGE_KEY);
    const count = storedValue ? Number.parseInt(storedValue, 10) : 0;

    return Number.isFinite(count) && count > 0 ? count : 0;
  } catch {
    return 0;
  }
};

const writeBadgeCount = (count: number) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(BADGE_STORAGE_KEY, String(count));
  } catch {
    // Local-only badge feedback is optional; ignore devices that block storage.
  }
};

const getFirstAnswer = (answer: Question['answer']) => {
  if (typeof answer === 'boolean') {
    return '';
  }

  return Array.isArray(answer) ? answer[0] : answer;
};

const getPromptQuotedText = (prompt: string) => {
  const doubleQuotedMatch = prompt.match(/"([^"]+)"/);
  if (doubleQuotedMatch?.[1]) {
    return doubleQuotedMatch[1];
  }

  const japaneseQuotedMatch = prompt.match(/「([^」]+)」/);
  if (japaneseQuotedMatch?.[1]) {
    return japaneseQuotedMatch[1];
  }

  return '';
};

const getMeaningFromQuestion = (question: Question) => {
  const promptText = getPromptQuotedText(question.prompt);
  const answerText = getFirstAnswer(question.answer);

  if (question.type === 'multiple-choice' && question.prompt.toLowerCase().includes('what does')) {
    return answerText;
  }

  if (question.type === 'multiple-choice' && question.prompt.includes('means') && promptText) {
    return promptText;
  }

  return question.explanation;
};

const getWordFromQuestion = (question: Question) => {
  const promptText = getPromptQuotedText(question.prompt);
  const answerText = getFirstAnswer(question.answer);

  if (question.type === 'multiple-choice' && question.prompt.toLowerCase().includes('what does') && promptText) {
    return promptText;
  }

  if (question.type === 'multiple-choice' && question.prompt.includes('means')) {
    return answerText;
  }

  return answerText;
};

const questionToVocabItem = (question: Question, lessonId: string): VocabItem | null => {
  if (question.type === 'true-false') {
    return null;
  }

  const word = getWordFromQuestion(question).trim();
  const meaning = getMeaningFromQuestion(question).trim();

  if (!word || !meaning || normalizeText(word) === normalizeText(meaning)) {
    return null;
  }

  return {
    id: `${lessonId}-${question.id}`,
    word,
    meaning,
  };
};

const isQuestion = (value: unknown): value is Question => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const question = value as Record<string, unknown>;
  return (
    typeof question.id === 'string' &&
    typeof question.prompt === 'string' &&
    typeof question.explanation === 'string' &&
    typeof question.type === 'string' &&
    (typeof question.answer === 'string' || typeof question.answer === 'boolean' || Array.isArray(question.answer))
  );
};

const buildRound = (vocabItems: VocabItem[]): RoundState | null => {
  if (vocabItems.length === 0) {
    return null;
  }

  const item = shuffleArray(vocabItems)[0];
  const wrongChoices = shuffleArray(
    vocabItems
      .filter((candidate) => candidate.id !== item.id && normalizeText(candidate.meaning) !== normalizeText(item.meaning))
      .map((candidate) => candidate.meaning),
  ).slice(0, 3);

  return {
    item,
    choices: shuffleArray([item.meaning, ...wrongChoices]),
  };
};

// Removable prototype: delete this component/CSS and its single App render to remove the warmup drawer.
const VocabWarmupDrawer = ({ lessons, hidden = false }: VocabWarmupDrawerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [vocabItems, setVocabItems] = useState<VocabItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadMessage, setLoadMessage] = useState('');
  const [round, setRound] = useState<RoundState | null>(null);
  const [typedWord, setTypedWord] = useState('');
  const [answerState, setAnswerState] = useState<AnswerState | null>(null);
  const [badgeCount, setBadgeCount] = useState(readBadgeCount);

  const vocabularyLessons = useMemo(
    () => lessons.filter((lesson) => lesson.categoryId === 'vocabulary' || /vocab/i.test(lesson.questionFile)),
    [lessons],
  );
  const hasMatchedWord = round ? normalizeText(typedWord) === normalizeText(round.item.word) : false;

  useEffect(() => {
    if (hidden) {
      setIsOpen(false);
    }
  }, [hidden]);

  useEffect(() => {
    if (vocabularyLessons.length === 0) {
      setVocabItems([]);
      setLoadMessage(NO_VOCAB_MESSAGE);
      return;
    }

    let isCancelled = false;

    const loadVocabulary = async () => {
      setIsLoading(true);
      setLoadMessage('');

      try {
        const loadedItems = await Promise.all(
          vocabularyLessons.map(async (lesson) => {
            const response = await fetch(`${import.meta.env.BASE_URL}data/questions/${lesson.questionFile}`);

            if (!response.ok) {
              return [];
            }

            const data = (await response.json()) as unknown;

            if (!Array.isArray(data)) {
              return [];
            }

            return data.filter(isQuestion).flatMap((question) => {
              const item = questionToVocabItem(question, lesson.id);
              return item ? [item] : [];
            });
          }),
        );
        const nextItems = loadedItems.flat();

        if (isCancelled) {
          return;
        }

        setVocabItems(nextItems);
        setLoadMessage(nextItems.length > 0 ? '' : NO_VOCAB_MESSAGE);
      } catch {
        if (!isCancelled) {
          setVocabItems([]);
          setLoadMessage(NO_VOCAB_MESSAGE);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadVocabulary();

    return () => {
      isCancelled = true;
    };
  }, [vocabularyLessons]);

  useEffect(() => {
    if (!round && vocabItems.length > 0) {
      setRound(buildRound(vocabItems));
    }
  }, [round, vocabItems]);

  const startNewRound = () => {
    setTypedWord('');
    setAnswerState(null);
    setRound(buildRound(vocabItems));
  };

  const chooseMeaning = (choice: string) => {
    if (!round || answerState) {
      return;
    }

    const isCorrect = normalizeText(choice) === normalizeText(round.item.meaning);
    setAnswerState({ selectedMeaning: choice, isCorrect });

    if (isCorrect) {
      setBadgeCount((currentCount) => {
        const nextCount = currentCount + 1;
        writeBadgeCount(nextCount);
        return nextCount;
      });
    }
  };

  if (hidden) {
    return null;
  }

  return (
    <aside className={`vocab-warmup${isOpen ? ' vocab-warmup-open' : ''}`} aria-label="Vocab Warmup drawer">
      <button
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close Vocab Warmup drawer' : 'Open Vocab Warmup drawer'}
        className="vocab-warmup-tab"
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        type="button"
      >
        <span aria-hidden="true" className="vocab-warmup-arrow">{isOpen ? '‹' : '›'}</span>
        <span className="vocab-warmup-tab-text">Warmup</span>
      </button>

      <section className="vocab-warmup-panel" aria-labelledby="vocab-warmup-title">
        <div className="vocab-warmup-header">
          <p className="vocab-warmup-kicker">Quick side activity</p>
          <h2 id="vocab-warmup-title">Vocab Warmup</h2>
          <p>Type the ghost word, then choose its meaning.</p>
        </div>

        <div className="vocab-warmup-badges" aria-label={`Local warmup badges: ${badgeCount}`}>
          {badgeCount <= 10 ? (
            Array.from({ length: badgeCount }, (_, index) => (
              <span aria-hidden="true" className="vocab-warmup-badge" key={index}>★</span>
            ))
          ) : (
            <span className="vocab-warmup-badge-counter">★ {badgeCount}x</span>
          )}
          <span className="vocab-warmup-badge-note">local fun badges</span>
        </div>

        {isLoading && <p className="vocab-warmup-message">Loading words...</p>}
        {!isLoading && loadMessage && <p className="vocab-warmup-message">{loadMessage}</p>}

        {!isLoading && !loadMessage && round && (
          <div className="vocab-warmup-game">
            <label className="vocab-warmup-label" htmlFor="vocab-warmup-input">
              Type this word
            </label>
            <input
              autoComplete="off"
              className="vocab-warmup-input"
              disabled={Boolean(answerState)}
              id="vocab-warmup-input"
              onChange={(event) => setTypedWord(event.target.value)}
              placeholder={round.item.word}
              type="text"
              value={typedWord}
            />

            {hasMatchedWord && !answerState && (
              <div className="vocab-warmup-choices" aria-label="Meaning choices">
                {round.choices.map((choice) => (
                  <button
                    className="vocab-warmup-choice"
                    key={choice}
                    onClick={() => chooseMeaning(choice)}
                    type="button"
                  >
                    {choice}
                  </button>
                ))}
              </div>
            )}

            {answerState && (
              <div className={`vocab-warmup-feedback${answerState.isCorrect ? ' is-correct' : ' is-incorrect'}`}>
                <strong>{answerState.isCorrect ? 'Nice warmup!' : 'Almost. Good try!'}</strong>
                <p><span>{round.item.word}</span> = {round.item.meaning}</p>
                {!answerState.isCorrect && <p>Your choice: {answerState.selectedMeaning}</p>}
                <button className="vocab-warmup-try-again" onClick={startNewRound} type="button">
                  Try again
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </aside>
  );
};

export default VocabWarmupDrawer;
