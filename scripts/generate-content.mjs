import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const csvPath = path.join(projectRoot, 'teacher-content', 'questions.csv');
const announcementsCsvPath = path.join(projectRoot, 'teacher-content', 'announcements.csv');
const calendarEventsCsvPath = path.join(projectRoot, 'teacher-content', 'calendar-events.csv');
const announcementsPath = path.join(projectRoot, 'public', 'data', 'announcements.json');
const calendarEventsPath = path.join(projectRoot, 'public', 'data', 'calendar-events.json');
const lessonsPath = path.join(projectRoot, 'public', 'data', 'lessons.json');
const subjectsPath = path.join(projectRoot, 'public', 'data', 'subjects.json');
const questionsDir = path.join(projectRoot, 'public', 'data', 'questions');

const optionColumns = [
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'option_e',
  'option_f',
  'option_g',
  'option_h',
];

const categoryColumns = [
  'category_id',
  'category_title',
  'category_description',
];

const defaultSubjects = [
  {
    id: 'communication',
    title: 'コミュニケーション英語 / Communication English',
    description: 'Practice Communication English lessons and units.',
  },
  {
    id: 'logic-expression',
    title: '論理・表現 / Logic and Expression',
    description: 'Logic and Expression lessons are coming soon.',
  },
  {
    id: 'vocabulary',
    title: '語彙 / Vocabulary',
    description: 'Vocabulary lessons are coming soon.',
  },
];

const expectedColumns = [
  ...categoryColumns,
  'lesson_id',
  'lesson_title',
  'lesson_description',
  'question_id',
  'question_type',
  'prompt',
  ...optionColumns,
  'answer',
  'accepted_answers',
  'explanation',
];

const requiredFields = [
  ...categoryColumns,
  'lesson_id',
  'lesson_title',
  'lesson_description',
  'question_id',
  'question_type',
  'prompt',
  'answer',
  'explanation',
];

const validQuestionTypes = ['multiple-choice', 'fill-in-the-blank', 'true-false'];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let rowStartLine = 1;
  let fieldStartLine = 1;
  let line = 1;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
        if (char === '\n') {
          line += 1;
        }
      }
      continue;
    }

    if (char === '"') {
      if (field.length === 0) {
        inQuotes = true;
        fieldStartLine = line;
      } else {
        throw new Error(`CSV parse error on line ${line}: quotes must start at the beginning of a cell.`);
      }
    } else if (char === ',') {
      row.push(field);
      field = '';
      fieldStartLine = line;
    } else if (char === '\n') {
      row.push(field);
      rows.push({ values: row, line: rowStartLine });
      row = [];
      field = '';
      line += 1;
      rowStartLine = line;
      fieldStartLine = line;
    } else if (char === '\r') {
      if (next === '\n') {
        continue;
      }
      row.push(field);
      rows.push({ values: row, line: rowStartLine });
      row = [];
      field = '';
      line += 1;
      rowStartLine = line;
      fieldStartLine = line;
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    throw new Error(`CSV parse error: quoted cell starting on line ${fieldStartLine} is missing a closing quote.`);
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push({ values: row, line: rowStartLine });
  }

  return rows;
}

function isBlankRow(values) {
  return values.every((value) => value.trim() === '');
}

function addError(errors, rowNumber, message) {
  errors.push(`Row ${rowNumber}: ${message}`);
}

function normalizeRow(header, csvRow, errors) {
  const values = csvRow.values.map((value) => value.trim());
  if (values.length > header.length) {
    addError(errors, csvRow.line, `found ${values.length} cells, but the header has ${header.length}. Check for an extra comma or add quotes around text that contains commas.`);
  }

  const row = Object.fromEntries(header.map((column, index) => [column, values[index] ?? '']));
  for (const field of requiredFields) {
    if (!row[field]) {
      addError(errors, csvRow.line, `missing required field "${field}". Add a value in the ${field} column.`);
    }
  }

  return row;
}

function getOptionValues(row) {
  return optionColumns.map((field) => row[field]).filter((choice) => choice !== '');
}

function getFilledOptionColumns(row) {
  return optionColumns.filter((field) => row[field] !== '');
}

function formatList(values) {
  return values.map((value) => `"${value}"`).join(', ');
}

function addAcceptedAnswer(answers, seenAnswers, value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }

  const key = trimmed.toLocaleLowerCase();
  if (!seenAnswers.has(key)) {
    answers.push(trimmed);
    seenAnswers.add(key);
  }
}

function getAcceptedAnswers(row) {
  const answers = [];
  const seenAnswers = new Set();
  addAcceptedAnswer(answers, seenAnswers, row.answer);
  for (const acceptedAnswer of row.accepted_answers.split(';')) {
    addAcceptedAnswer(answers, seenAnswers, acceptedAnswer);
  }
  return answers;
}

function findDuplicateValues(values) {
  const firstValueByKey = new Map();
  const duplicateValues = [];
  const duplicateKeys = new Set();

  for (const value of values) {
    const key = value.toLocaleLowerCase();
    if (firstValueByKey.has(key)) {
      if (!duplicateKeys.has(key)) {
        duplicateValues.push(firstValueByKey.get(key));
        duplicateKeys.add(key);
      }
      duplicateValues.push(value);
    } else {
      firstValueByKey.set(key, value);
    }
  }

  return duplicateValues;
}

function validateAnswerOptions({ answers, choices, errors, rowNumber }) {
  const choiceSet = new Set(choices);
  for (const answer of answers) {
    if (!choiceSet.has(answer)) {
      addError(errors, rowNumber, `multiple-choice answer "${answer}" must exactly match one of option_a through option_h. Available options are: ${formatList(choices)}.`);
    }
  }
}

function toQuestion(row, rowNumber, errors) {
  const type = row.question_type;
  if (!validQuestionTypes.includes(type)) {
    if (type) {
      addError(errors, rowNumber, `invalid question_type "${type}". Use one of: ${validQuestionTypes.join(', ')}.`);
    }
    return null;
  }

  if (type === 'multiple-choice') {
    const choices = getOptionValues(row);
    const duplicateOptions = findDuplicateValues(choices);
    const answers = getAcceptedAnswers(row);

    if (choices.length < 4) {
      addError(errors, rowNumber, 'multiple-choice questions need at least 4 non-empty options in option_a through option_h. Add more options or change the question_type.');
    }

    if (duplicateOptions.length > 0) {
      addError(errors, rowNumber, `multiple-choice options must not be duplicates. Remove or rewrite these duplicate options: ${formatList(duplicateOptions)}.`);
    }

    if (row.answer) {
      validateAnswerOptions({ answers, choices, errors, rowNumber });
    }

    const answerSet = new Set(answers);
    const incorrectChoices = choices.filter((choice) => !answerSet.has(choice));
    if (incorrectChoices.length < 3) {
      addError(errors, rowNumber, 'multiple-choice questions need at least 3 incorrect options. Add more distractors in option_a through option_h, or remove extra correct answers from accepted_answers.');
    }

    return {
      id: row.question_id,
      type,
      prompt: row.prompt,
      choices,
      answer: answers.length === 1 ? answers[0] : answers,
      explanation: row.explanation,
    };
  }

  if (type === 'true-false') {
    const filledOptions = getFilledOptionColumns(row);
    if (filledOptions.length > 0) {
      addError(errors, rowNumber, `true-false questions must leave option_a through option_h blank. Clear these columns: ${filledOptions.join(', ')}.`);
    }

    if (row.accepted_answers !== '') {
      addError(errors, rowNumber, 'true-false questions must leave accepted_answers blank. Put only true or false in the answer column.');
    }

    const normalizedAnswer = row.answer.toLocaleLowerCase();
    if (row.answer && normalizedAnswer !== 'true' && normalizedAnswer !== 'false') {
      addError(errors, rowNumber, 'true-false answer must be either "true" or "false". Capitalization does not matter.');
    }

    return {
      id: row.question_id,
      type,
      prompt: row.prompt,
      answer: normalizedAnswer === 'true',
      explanation: row.explanation,
    };
  }

  const answers = getAcceptedAnswers(row);
  if (row.answer && answers.length === 0) {
    addError(errors, rowNumber, 'fill-in-the-blank needs at least one accepted answer after trimming spaces. Add the correct answer in the answer column.');
  }

  return {
    id: row.question_id,
    type,
    prompt: row.prompt,
    answer: answers.length === 1 ? answers[0] : answers,
    explanation: row.explanation,
  };
}

function validateConsistentCategory({ categoriesById, row, rowNumber, errors }) {
  const existingCategory = categoriesById.get(row.category_id);

  if (!existingCategory) {
    categoriesById.set(row.category_id, {
      id: row.category_id,
      title: row.category_title,
      description: row.category_description,
      firstRow: rowNumber,
    });
    return;
  }

  if (row.category_title && existingCategory.title !== row.category_title) {
    addError(errors, rowNumber, `category_title for category_id "${row.category_id}" does not match row ${existingCategory.firstRow}. Use exactly "${existingCategory.title}" or update all rows for this category.`);
  }

  if (row.category_description && existingCategory.description !== row.category_description) {
    addError(errors, rowNumber, `category_description for category_id "${row.category_id}" does not match row ${existingCategory.firstRow}. Use exactly "${existingCategory.description}" or update all rows for this category.`);
  }
}

function validateQuestionsHeader(header) {
  const trimmedHeader = header.map((column) => column.trim());
  const duplicateColumns = trimmedHeader.filter((column, index) => trimmedHeader.indexOf(column) !== index);
  const missingColumns = expectedColumns.filter((column) => !trimmedHeader.includes(column));
  const extraColumns = trimmedHeader.filter((column) => !expectedColumns.includes(column));

  if (missingColumns.length > 0 || extraColumns.length > 0 || duplicateColumns.length > 0) {
    const parts = [];
    if (missingColumns.length > 0) {
      parts.push(`missing columns: ${missingColumns.join(', ')}`);
    }
    if (extraColumns.length > 0) {
      parts.push(`unexpected columns: ${extraColumns.join(', ')}`);
    }
    if (duplicateColumns.length > 0) {
      parts.push(`duplicate columns: ${[...new Set(duplicateColumns)].join(', ')}`);
    }
    throw new Error(`CSV header is not valid (${parts.join('; ')}). Expected these columns: ${expectedColumns.join(', ')}`);
  }

  return trimmedHeader;
}


function validateSimpleHeader({ header, expectedHeader, fileName }) {
  const trimmedHeader = header.map((column) => column.trim());
  const duplicateColumns = trimmedHeader.filter((column, index) => trimmedHeader.indexOf(column) !== index);
  const missingColumns = expectedHeader.filter((column) => !trimmedHeader.includes(column));
  const extraColumns = trimmedHeader.filter((column) => !expectedHeader.includes(column));

  if (missingColumns.length > 0 || extraColumns.length > 0 || duplicateColumns.length > 0) {
    const parts = [];
    if (missingColumns.length > 0) {
      parts.push(`missing columns: ${missingColumns.join(', ')}`);
    }
    if (extraColumns.length > 0) {
      parts.push(`unexpected columns: ${extraColumns.join(', ')}`);
    }
    if (duplicateColumns.length > 0) {
      parts.push(`duplicate columns: ${[...new Set(duplicateColumns)].join(', ')}`);
    }
    throw new Error(`${fileName} header is not valid (${parts.join('; ')}). Expected these columns: ${expectedHeader.join(', ')}`);
  }

  return trimmedHeader;
}

function normalizeSimpleRow(header, csvRow, errors) {
  const values = csvRow.values.map((value) => value.trim());
  if (values.length > header.length) {
    addError(errors, csvRow.line, `found ${values.length} cells, but the header has ${header.length}. Check for an extra comma or add quotes around text that contains commas.`);
  }

  return Object.fromEntries(header.map((column, index) => [column, values[index] ?? '']));
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

async function generateAnnouncements() {
  const csvText = await readFile(announcementsCsvPath, 'utf8');
  const rows = parseCsv(csvText).filter((row) => !isBlankRow(row.values));

  if (rows.length === 0) {
    throw new Error('announcements.csv is empty. Add the header row: active,message');
  }

  const header = validateSimpleHeader({
    header: rows[0].values,
    expectedHeader: ['active', 'message'],
    fileName: 'announcements.csv',
  });
  const errors = [];
  const announcements = [];

  for (const csvRow of rows.slice(1)) {
    const row = normalizeSimpleRow(header, csvRow, errors);
    const normalizedActive = row.active.toLocaleLowerCase();

    if (!row.active) {
      addError(errors, csvRow.line, 'missing required field "active". Use true or false.');
      continue;
    }

    if (normalizedActive !== 'true' && normalizedActive !== 'false') {
      addError(errors, csvRow.line, 'active must be either "true" or "false".');
      continue;
    }

    if (normalizedActive === 'true') {
      if (!row.message) {
        addError(errors, csvRow.line, 'message is required when active is true. Add an announcement message or set active to false.');
        continue;
      }

      announcements.push({
        active: true,
        message: row.message,
      });
    }
  }

  return { announcements, errors };
}

async function generateCalendarEvents() {
  const csvText = await readFile(calendarEventsCsvPath, 'utf8');
  const rows = parseCsv(csvText).filter((row) => !isBlankRow(row.values));

  if (rows.length === 0) {
    throw new Error('calendar-events.csv is empty. Add the header row: date,title,description');
  }

  const header = validateSimpleHeader({
    header: rows[0].values,
    expectedHeader: ['date', 'title', 'description'],
    fileName: 'calendar-events.csv',
  });
  const errors = [];
  const calendarEvents = [];

  for (const csvRow of rows.slice(1)) {
    const row = normalizeSimpleRow(header, csvRow, errors);

    if (!row.date) {
      addError(errors, csvRow.line, 'missing required field "date". Use YYYY-MM-DD.');
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
      addError(errors, csvRow.line, 'date must use YYYY-MM-DD format, for example 2026-05-18.');
    } else if (!isValidDateString(row.date)) {
      addError(errors, csvRow.line, 'date must be a real calendar date. Check the month and day.');
    }

    if (!row.title) {
      addError(errors, csvRow.line, 'missing required field "title". Add a short event title.');
    }

    if (row.date && isValidDateString(row.date) && row.title) {
      calendarEvents.push({
        date: row.date,
        title: row.title,
        description: row.description,
      });
    }
  }

  calendarEvents.sort((first, second) => first.date.localeCompare(second.date));

  return { calendarEvents, errors };
}

function printValidationErrors(errors) {
  console.error(`Found ${errors.length} CSV validation ${errors.length === 1 ? 'error' : 'errors'}:`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  console.error(`Fix ${errors.length === 1 ? 'it' : 'them'} and run npm run generate-content again.`);
}

function printSuccessSummary({ lessons, subjects, announcements, calendarEvents }) {
  const questionCount = lessons.reduce((count, lesson) => count + lesson.questions.length, 0);

  console.log('Generated content:');
  console.log(`- Subjects: ${subjects.length}`);
  console.log(`- Lessons: ${lessons.length}`);
  console.log(`- Questions: ${questionCount}`);
  console.log(`- Active announcements: ${announcements.length}`);
  console.log(`- Calendar events: ${calendarEvents.length}`);
}

async function main() {
  const csvText = await readFile(csvPath, 'utf8');
  const rows = parseCsv(csvText).filter((row) => !isBlankRow(row.values));

  if (rows.length === 0) {
    throw new Error('CSV file is empty. Add the header row and at least one question row.');
  }

  const header = validateQuestionsHeader(rows[0].values);
  const errors = [];
  const lessons = [];
  const categoriesById = new Map();
  const lessonsById = new Map();
  const questionIdsByLesson = new Map();

  for (const csvRow of rows.slice(1)) {
    const row = normalizeRow(header, csvRow, errors);
    const lessonId = row.lesson_id;

    if (row.category_id) {
      validateConsistentCategory({ categoriesById, row, rowNumber: csvRow.line, errors });
    }

    if (lessonId) {
      if (!lessonsById.has(lessonId)) {
        const lesson = {
          id: lessonId,
          title: row.lesson_title,
          description: row.lesson_description,
          questionFile: `${lessonId}.json`,
          categoryId: row.category_id,
          categoryTitle: row.category_title,
          categoryDescription: row.category_description,
          questions: [],
          firstRow: csvRow.line,
        };
        lessonsById.set(lessonId, lesson);
        lessons.push(lesson);
        questionIdsByLesson.set(lessonId, new Map());
      } else {
        const lesson = lessonsById.get(lessonId);
        if (row.category_id && lesson.categoryId !== row.category_id) {
          addError(errors, csvRow.line, `category_id for lesson_id "${lessonId}" does not match row ${lesson.firstRow}. Use exactly "${lesson.categoryId}" or move the lesson by updating all rows for this lesson.`);
        }
        if (row.lesson_title && lesson.title !== row.lesson_title) {
          addError(errors, csvRow.line, `lesson_title for lesson_id "${lessonId}" does not match row ${lesson.firstRow}. Use exactly "${lesson.title}" or update all rows for this lesson.`);
        }
        if (row.lesson_description && lesson.description !== row.lesson_description) {
          addError(errors, csvRow.line, `lesson_description for lesson_id "${lessonId}" does not match row ${lesson.firstRow}. Use exactly "${lesson.description}" or update all rows for this lesson.`);
        }
      }

      if (row.question_id) {
        const questionIds = questionIdsByLesson.get(lessonId);
        if (questionIds.has(row.question_id)) {
          addError(errors, csvRow.line, `duplicate question_id "${row.question_id}" in lesson "${lessonId}". It was first used on row ${questionIds.get(row.question_id)}; choose a unique question_id for this row.`);
        } else {
          questionIds.set(row.question_id, csvRow.line);
        }
      }
    }

    const question = toQuestion(row, csvRow.line, errors);
    if (question && lessonId && lessonsById.has(lessonId)) {
      lessonsById.get(lessonId).questions.push(question);
    }
  }

  const { announcements, errors: announcementErrors } = await generateAnnouncements();
  const { calendarEvents, errors: calendarEventErrors } = await generateCalendarEvents();
  const allErrors = [...errors, ...announcementErrors, ...calendarEventErrors];

  if (allErrors.length > 0) {
    printValidationErrors(allErrors);
    process.exitCode = 1;
    return;
  }

  if (lessons.length === 0) {
    throw new Error('CSV file has a header but no question rows. Add at least one question row.');
  }

  const generatedLessons = lessons.map(({ id, title, description, questionFile, categoryId, categoryTitle, categoryDescription }) => ({
    id,
    title,
    description,
    questionFile,
    categoryId,
    categoryTitle,
    categoryDescription,
  }));

  const orderedCategoryIds = new Set(defaultSubjects.map((subject) => subject.id));
  const generatedSubjects = [
    ...defaultSubjects.map((defaultSubject) => categoriesById.get(defaultSubject.id) ?? defaultSubject),
    ...[...categoriesById.values()].filter((category) => !orderedCategoryIds.has(category.id)),
  ].map(({ id, title, description }) => ({
    id,
    title,
    description,
    lessonIds: lessons.filter((lesson) => lesson.categoryId === id).map((lesson) => lesson.id),
  }));

  await mkdir(questionsDir, { recursive: true });

  const generatedQuestionFiles = new Set(lessons.map((lesson) => lesson.questionFile));
  const existingQuestionFiles = await readdir(questionsDir);
  for (const fileName of existingQuestionFiles) {
    if (fileName.endsWith('.json') && !generatedQuestionFiles.has(fileName)) {
      await rm(path.join(questionsDir, fileName));
    }
  }

  await writeFile(lessonsPath, `${JSON.stringify(generatedLessons, null, 2)}\n`);
  await writeFile(subjectsPath, `${JSON.stringify(generatedSubjects, null, 2)}\n`);
  await writeFile(announcementsPath, `${JSON.stringify(announcements, null, 2)}\n`);
  await writeFile(calendarEventsPath, `${JSON.stringify(calendarEvents, null, 2)}\n`);

  for (const lesson of lessons) {
    const outputPath = path.join(questionsDir, lesson.questionFile);
    await writeFile(outputPath, `${JSON.stringify(lesson.questions, null, 2)}\n`);
  }

  printSuccessSummary({
    lessons,
    subjects: generatedSubjects,
    announcements,
    calendarEvents,
  });
}

main().catch((error) => {
  console.error(`Content generation failed: ${error.message}`);
  process.exitCode = 1;
});
