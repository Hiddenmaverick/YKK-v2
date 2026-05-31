# YKK-v2 English Practice

A clean Version 1 English practice website for Japanese high school students. It uses Vite, React, TypeScript, plain CSS, and static JSON files. There is no backend, database, login, analytics, or collection of student personal information.

## Run locally

Install dependencies:

```bash
npm install
```

Start the local development server:

```bash
npm run dev
```

Build the production site:

```bash
npm run build
```

## Editing Teacher Content with CSV Files

Teachers can edit lesson and question content in `teacher-content/questions.csv` and homepage content in `teacher-content/announcements.csv` and `teacher-content/calendar-events.csv` with Excel, Google Sheets, LibreOffice Calc, Numbers, or another spreadsheet editor. Use UTF-8 CSV files; Google Sheets is preferred for Japanese text because it helps avoid mojibake/encoding problems. The website still reads generated JSON from `public/data`, so students will see the same quiz and homepage behavior after the JSON is regenerated. Generated JSON files are build/output files, not the teacher-editing source, and should not be hand-edited.

### Recommended editing workflow

1. Open the CSV file you need in Excel, Google Sheets, or another spreadsheet editor. Use `teacher-content/questions.csv` for lesson questions, `teacher-content/announcements.csv` for the homepage message ribbon, or `teacher-content/calendar-events.csv` for the English Schedule calendar.
2. Edit rows or add new rows. Keep each header row exactly the same.
3. Save or export the file as a UTF-8 CSV. Google Sheets is recommended for Japanese text.
4. Generate the website JSON files:

```bash
npm run generate-content
```

5. Build the site to check that the generated content works:

```bash
npm run build
```

6. Commit the updated CSV file and generated JSON files together. For questions, this usually means `teacher-content/questions.csv`, `public/data/lessons.json`, and matching files in `public/data/questions/`. For homepage content, commit the matching `teacher-content/announcements.csv`, `teacher-content/calendar-events.csv`, `public/data/announcements.json`, and `public/data/calendar-events.json` files. Do not hand-edit generated JSON files; rerun the generator instead.

### Content safety reminders

- Do not add student real names, student numbers, emails, photos, addresses, health information, or other personal information.
- Nicknames should be anonymous. Progress is saved locally on the device unless students manually submit results through the existing result submission flow.
- Do not add copyrighted textbook content, textbook questions, audio, images, or other protected content without permission.
- Keep examples original, short, classroom-appropriate, and useful for English practice.

### Question CSV columns

Edit `teacher-content/questions.csv`, run `npm run generate-content`, and do not hand-edit generated question JSON in `public/data/questions/`.

| Column | What to write |
| --- | --- |
| `lesson_id` | A unique lesson ID, such as `lesson-01`. Rows with the same lesson ID are grouped into the same generated question file. |
| `lesson_title` | The lesson title shown on the lesson card. Use the same title on every row with the same `lesson_id`. |
| `lesson_description` | A short lesson summary shown on the lesson card. Use the same description on every row with the same `lesson_id`. |
| `question_id` | A unique question ID inside that lesson, such as `q1`, `q2`, or `q10`. |
| `question_type` | Use exactly `multiple-choice`, `fill-in-the-blank`, or `true-false`. |
| `prompt` | The question or instruction students will see. |
| `option_a` through `option_h` | Up to eight source choices for a multiple-choice question. Existing files that only use `option_a` through `option_d` still work, and blank option columns are ignored. Leave all option columns blank for fill-in-the-blank and true-false questions. |
| `answer` | For multiple choice, this is the main correct answer and must exactly match one option cell. For fill-in-the-blank, this is the required accepted answer. For true-false, use `true` or `false`. |
| `accepted_answers` | Add extra accepted answers separated by semicolons, such as `eat; have`. For multiple-choice questions, each extra correct answer must also appear somewhere in `option_a` through `option_h`. Leave blank for true-false questions. |
| `explanation` | A clear teacher-friendly explanation shown after the student answers. Every question needs an explanation. |

### Multiple-choice example

The CSV can store a larger teacher-controlled option bank than students see. For each multiple-choice question, `option_a` through `option_h` may contain up to eight possible choices. When a quiz starts, the student sees only four choices: exactly one randomly selected correct answer and three randomly selected incorrect choices, shuffled into a random order. The correct answer is always included in the displayed four choices.

Multiple-choice questions must have at least four total non-empty options and at least three incorrect distractors. Empty option columns are ignored. The `answer` cell is the main correct answer. Use `accepted_answers` for additional correct multiple-choice answers separated by semicolons; every correct answer from both `answer` and `accepted_answers` must appear somewhere in `option_a` through `option_h`.

| lesson_id | lesson_title | lesson_description | question_id | question_type | prompt | option_a | option_b | option_c | option_d | option_e | option_f | option_g | option_h | answer | accepted_answers | explanation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `lesson-04` | `Lesson 4: Food and Shopping English` | `Practice useful English for ordering food and shopping.` | `q1` | `multiple-choice` | `Choose a polite sentence.` | `Could I have a sandwich, please?` | `Give sandwich now.` | `I sandwich yesterday.` | `Sandwich is station.` | `May I have a sandwich, please?` | `You sandwich give me.` | `The sandwich is a train.` | `Where sandwich homework?` | `Could I have a sandwich, please?` | `May I have a sandwich, please?` | `"Could I have ... please?" and "May I have ... please?" are polite ways to order food or ask for something.` |

### Fill-in-the-blank example with multiple accepted answers

| lesson_id | lesson_title | lesson_description | question_id | question_type | prompt | option_a | option_b | option_c | option_d | option_e | option_f | option_g | option_h | answer | accepted_answers | explanation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `lesson-04` | `Lesson 4: Food and Shopping English` | `Practice useful English for ordering food and shopping.` | `q2` | `fill-in-the-blank` | `Fill in the blank: I usually _____ lunch at school.` |  |  |  |  |  |  |  |  | `eat` | `have` | `Both "eat lunch" and "have lunch" are natural English expressions.` |

For fill-in-the-blank questions, `option_a` through `option_h` are ignored. Put the main answer in `answer`; put extra accepted answers in `accepted_answers` separated by semicolons. Duplicate accepted answers are ignored when JSON is generated.

### True-false example

True-false questions use two buttons, **True** and **False**, and show feedback as soon as a student chooses one. In the CSV, use `true-false` as the `question_type`, leave `option_a` through `option_h` blank, put `true` or `false` in `answer`, and leave `accepted_answers` blank. The generated JSON stores the answer as a boolean.

| lesson_id | lesson_title | lesson_description | question_id | question_type | prompt | option_a | option_b | option_c | option_d | option_e | option_f | option_g | option_h | answer | accepted_answers | explanation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `lesson-04` | `Lesson 4: Food and Shopping English` | `Practice useful English for ordering food and shopping.` | `q3` | `true-false` | `True or false: "Could I have a sandwich, please?" is a polite request.` |  |  |  |  |  |  |  |  | `true` |  | `"Could I have ... please?" is a polite way to order food or ask for something.` |

### Homepage announcement CSV columns

`teacher-content/announcements.csv` controls the homepage 英語のお知らせ ribbon. The ribbon uses rows where `active` is `true`; run `npm run generate-content` after editing, and do not hand-edit `public/data/announcements.json`.

| Column | What to write |
| --- | --- |
| `active` | Use `true` to publish the message or `false` to keep the row ignored. |
| `message` | The announcement text. This is required when `active` is `true`. |

### Homepage calendar CSV columns

`teacher-content/calendar-events.csv` controls the English Schedule calendar on the homepage. Run `npm run generate-content` after editing, and do not hand-edit `public/data/calendar-events.json`.

| Column | What to write |
| --- | --- |
| `date` | Event date in `YYYY-MM-DD` format, such as `2026-05-18`. |
| `title` | A short event title. |
| `description` | Optional event details. |

## GitHub Pages

This project is configured as a GitHub Pages project site for `Hiddenmaverick/YKK-v2`. Vite uses this base path:

```ts
base: '/YKK-v2/'
```

Static lesson data is loaded using `import.meta.env.BASE_URL` so the site works both locally and on GitHub Pages.

## Generated JSON Format Reference

The files in `public/data` are generated by `npm run generate-content` from CSV files in `teacher-content`. Do not manually edit generated JSON for routine content updates, because the next CSV generation will overwrite those changes. Use this section only as a reference for the static JSON format that the app reads.

### Lesson index: `public/data/lessons.json`

The generated lesson index contains one lesson object for each unique `lesson_id` in the CSV. Each object points to the matching generated file in `public/data/questions/`.

```json
{
  "id": "lesson-04",
  "title": "Lesson 4: Food and Shopping English",
  "description": "Practice useful English for ordering food and shopping.",
  "questionFile": "lesson-04.json"
}
```

Generated lesson fields:

- `id`: the lesson ID from the CSV, such as `lesson-04`
- `title`: the lesson title shown on the lesson card
- `description`: a short teacher- and student-friendly summary
- `questionFile`: the generated JSON filename for the lesson questions

### Question files: `public/data/questions/[lesson_id].json`

Each question file contains a JSON array of question objects. Keep the English natural, simple, and appropriate for Japanese high school students. Most files are generated from the CSV source file, but the app can also read the true-false JSON format described below.

### Multiple-choice question format

A generated multiple-choice question has these fields:

- `id`: the question ID from the CSV, such as `q1`
- `type`: `multiple-choice`
- `prompt`: the question or instruction shown to students
- `choices`: an array of all non-empty source choices from `option_a` through `option_h`; the app randomly displays only four choices when a quiz starts
- `answer`: the correct answer as a string, or an array when `accepted_answers` adds multiple correct answers; every correct answer exactly matches one of the choices
- `explanation`: a clear explanation that a teacher can use for review

Example generated JSON:

```json
{
  "id": "q1",
  "type": "multiple-choice",
  "prompt": "Choose the most natural sentence.",
  "choices": [
    "Could I have a glass of water, please?",
    "Give me water now.",
    "I water want please glass.",
    "Water is yesterday.",
    "May I have a glass of water, please?",
    "Water glass now give.",
    "Yesterday is water please.",
    "My glass goes to school."
  ],
  "answer": [
    "Could I have a glass of water, please?",
    "May I have a glass of water, please?"
  ],
  "explanation": "'Could I have ... please?' is a polite pattern for ordering or asking for something."
}
```

### Fill-in-the-blank question format

A generated fill-in-the-blank question has these fields:

- `id`: the question ID from the CSV, such as `q2`
- `type`: `fill-in-the-blank`
- `prompt`: a sentence or instruction with a blank
- `answer`: either one accepted answer as a string or multiple accepted answers as an array of strings
- `explanation`: a clear explanation that a teacher can use for review

Example with one accepted answer:

```json
{
  "id": "q2",
  "type": "fill-in-the-blank",
  "prompt": "Fill in the blank: The cafe is next _____ the bookstore.",
  "answer": "to",
  "explanation": "The phrase 'next to' means beside or very close to another place."
}
```

Example with multiple accepted answers:

```json
{
  "id": "q3",
  "type": "fill-in-the-blank",
  "prompt": "Fill in the blank: I usually _____ lunch at school.",
  "answer": ["eat", "have"],
  "explanation": "Both 'eat lunch' and 'have lunch' are natural English expressions."
}
```

Fill-in-the-blank checking ignores capitalization and extra spaces.

### True-false question format

A true-false question has these fields:

- `id`: the question ID, such as `q10`
- `type`: `true-false`
- `prompt`: a true-or-false statement shown to students
- `answer`: the correct answer as `true`, `false`, `"true"`, or `"false"`
- `explanation`: a clear explanation that a teacher can use for review

Example true-false JSON:

```json
{
  "id": "q10",
  "type": "true-false",
  "prompt": "True or False: 'Get off the bus' means to leave the bus.",
  "answer": true,
  "explanation": "'Get off' means to leave a bus, train, or plane. 'Get on' means to board it."
}
```

True-false questions are included in randomized quiz order, instant feedback, scoring, explanations, and final review.

### Check generated content before publishing

Validate JSON files and build the site before opening a pull request. Regenerate first with `npm run generate-content` when using CSV-supported question types, including true-false questions.

```bash
npm run build
```

### Content safety warnings

- Do not add student names, student numbers, email addresses, photos, health details, addresses, or any other student personal information.
- Do not add copyrighted textbook passages, textbook questions, audio, images, or other protected content without permission.
- Keep practice content original, short, classroom-appropriate, and useful for Japanese high school English review.
