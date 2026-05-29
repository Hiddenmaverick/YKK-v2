import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const csvPath = path.join(projectRoot, 'teacher-content', 'questions.csv');
const lessonsPath = path.join(projectRoot, 'public', 'data', 'lessons.json');
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

const expectedColumns = [
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
  'lesson_id',
  'lesson_title',
  'lesson_description',
  'question_id',
  'question_type',
  'prompt',
  'answer',
  'explanation',
];

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

function fail(rowNumber, message) {
  throw new Error(`Row ${rowNumber}: ${message}`);
}

function normalizeRow(header, csvRow) {
  const values = csvRow.values.map((value) => value.trim());
  if (values.length > header.length) {
    fail(csvRow.line, `found ${values.length} cells, but the header has ${header.length}. Check for an extra comma or missing quotes around text that contains commas.`);
  }

  const row = Object.fromEntries(header.map((column, index) => [column, values[index] ?? '']));
  for (const field of requiredFields) {
    if (!row[field]) {
      const friendlyNames = {
        prompt: 'missing prompt',
        answer: 'missing answer',
        explanation: 'missing explanation',
      };
      fail(csvRow.line, friendlyNames[field] ?? `missing required field "${field}".`);
    }
  }

  return row;
}

function getOptionValues(row) {
  return optionColumns.map((field) => row[field]).filter((choice) => choice !== '');
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

function toQuestion(row, rowNumber) {
  const type = row.question_type;
  if (type !== 'multiple-choice' && type !== 'fill-in-the-blank' && type !== 'true-false') {
    fail(rowNumber, `invalid question_type "${type}". Use "multiple-choice", "fill-in-the-blank", or "true-false".`);
  }

  if (!row.explanation) {
    fail(rowNumber, 'question has no explanation. Add a teacher-friendly explanation.');
  }

  if (type === 'multiple-choice') {
    const choices = getOptionValues(row);
    const answers = [];
    const seenAnswers = new Set();
    addAcceptedAnswer(answers, seenAnswers, row.answer);
    for (const acceptedAnswer of row.accepted_answers.split(';')) {
      addAcceptedAnswer(answers, seenAnswers, acceptedAnswer);
    }

    if (choices.length < 4) {
      fail(rowNumber, 'fewer than 4 total options for multiple-choice. Add at least 4 non-empty choices in option_a through option_h.');
    }

    const choiceSet = new Set(choices);
    for (const answer of answers) {
      if (!choiceSet.has(answer)) {
        fail(rowNumber, `correct answer not found in options: "${answer}" must appear in option_a through option_h.`);
      }
    }

    const answerSet = new Set(answers);
    const incorrectChoices = choices.filter((choice) => !answerSet.has(choice));
    if (incorrectChoices.length < 3) {
      fail(rowNumber, 'fewer than 3 incorrect distractors for multiple-choice. Add more incorrect choices in option_a through option_h.');
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
    const filledOptions = optionColumns.filter((field) => row[field] !== '');
    if (filledOptions.length > 0) {
      fail(rowNumber, 'true-false questions must leave option_a through option_h blank.');
    }

    if (row.accepted_answers !== '') {
      fail(rowNumber, 'true-false questions must leave accepted_answers blank.');
    }

    const normalizedAnswer = row.answer.toLocaleLowerCase();
    if (normalizedAnswer !== 'true' && normalizedAnswer !== 'false') {
      fail(rowNumber, 'true-false answer must be either "true" or "false".');
    }

    return {
      id: row.question_id,
      type,
      prompt: row.prompt,
      answer: normalizedAnswer === 'true',
      explanation: row.explanation,
    };
  }

  const answers = [];
  const seenAnswers = new Set();
  addAcceptedAnswer(answers, seenAnswers, row.answer);
  for (const acceptedAnswer of row.accepted_answers.split(';')) {
    addAcceptedAnswer(answers, seenAnswers, acceptedAnswer);
  }

  return {
    id: row.question_id,
    type,
    prompt: row.prompt,
    answer: answers.length === 1 ? answers[0] : answers,
    explanation: row.explanation,
  };
}

function validateHeader(header) {
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

async function main() {
  const csvText = await readFile(csvPath, 'utf8');
  const rows = parseCsv(csvText).filter((row) => !isBlankRow(row.values));

  if (rows.length === 0) {
    throw new Error('CSV file is empty. Add the header row and at least one question row.');
  }

  const header = validateHeader(rows[0].values);
  const lessons = [];
  const lessonsById = new Map();
  const questionIdsByLesson = new Map();

  for (const csvRow of rows.slice(1)) {
    const row = normalizeRow(header, csvRow);
    const lessonId = row.lesson_id;

    if (!lessonsById.has(lessonId)) {
      const lesson = {
        id: lessonId,
        title: row.lesson_title,
        description: row.lesson_description,
        questionFile: `${lessonId}.json`,
        questions: [],
      };
      lessonsById.set(lessonId, lesson);
      lessons.push(lesson);
      questionIdsByLesson.set(lessonId, new Set());
    } else {
      const lesson = lessonsById.get(lessonId);
      if (lesson.title !== row.lesson_title) {
        fail(csvRow.line, `lesson_title for "${lessonId}" does not match earlier rows. Use the same title every time this lesson_id appears.`);
      }
      if (lesson.description !== row.lesson_description) {
        fail(csvRow.line, `lesson_description for "${lessonId}" does not match earlier rows. Use the same description every time this lesson_id appears.`);
      }
    }

    const questionIds = questionIdsByLesson.get(lessonId);
    if (questionIds.has(row.question_id)) {
      fail(csvRow.line, `duplicate question_id "${row.question_id}" in lesson "${lessonId}".`);
    }
    questionIds.add(row.question_id);

    lessonsById.get(lessonId).questions.push(toQuestion(row, csvRow.line));
  }

  if (lessons.length === 0) {
    throw new Error('CSV file has a header but no question rows. Add at least one question row.');
  }

  const generatedLessons = lessons.map(({ id, title, description, questionFile }) => ({
    id,
    title,
    description,
    questionFile,
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

  for (const lesson of lessons) {
    const outputPath = path.join(questionsDir, lesson.questionFile);
    await writeFile(outputPath, `${JSON.stringify(lesson.questions, null, 2)}\n`);
  }

  console.log(`Generated ${lessonsPath}`);
  for (const lesson of lessons) {
    console.log(`Generated ${path.join(questionsDir, lesson.questionFile)} (${lesson.questions.length} questions)`);
  }
}

main().catch((error) => {
  console.error(`Content generation failed: ${error.message}`);
  process.exitCode = 1;
});
