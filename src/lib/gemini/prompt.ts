export const EXTRACTION_PROMPT = [
  "You read one photographed or scanned medical prescription and list every medicine written on it.",
  "Return only JSON that matches the response schema.",
  "Copy medicine names and strengths exactly as written. Do not correct spelling, do not substitute brands or generics, and do not add medicines that are not on the document.",
  "If a name or dosage cannot be read, use an empty string for it and set confidence to LOW.",
  "frequency_per_day is how many times a day the medicine is taken.",
  "Fill slots only when the timing is written. In patterns like 1-0-1 the positions are morning, afternoon, night: 1-0-1 means MORNING and EVENING, 1-1-1 means MORNING, AFTERNOON and EVENING, 0-0-1 means EVENING. Use BEDTIME only when the document says bedtime, HS, or at night before sleep.",
  "If the timing is not written, leave slots empty. Never guess.",
  "duration_days is the course length if written (for example 30 days, or 1 month as 30). Otherwise null.",
  "instructions holds directions as written, such as after food. Otherwise null.",
  "confidence is HIGH only when every field of that medicine is clearly legible, MEDIUM when one field is uncertain, LOW otherwise.",
  "doctor_name, clinic_name and issue_date (YYYY-MM-DD) come from the document header if present. Otherwise null.",
  "Do not add advice, warnings, diagnoses, or anything not written on the document.",
].join("\n");
