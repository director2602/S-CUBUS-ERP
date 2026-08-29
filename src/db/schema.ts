// S-CUBUS ERP — Core database schema (Phases 1-4)
// Normalized, template-driven, workspace-aware examination result database.
// SQLite via Drizzle ORM (portable single-file DB; swap to Postgres later
// by changing the driver — the schema shape carries over almost 1:1).

import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const timestamps = {
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
};

// ---------------------------------------------------------------------------
// IDENTITY / ACCESS
// ---------------------------------------------------------------------------

// role: OWNER | ADMIN | RESULT_OPERATOR | FACULTY | VIEWER
export const users = sqliteTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("VIEWER"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
}, (t) => ({
  emailIdx: uniqueIndex("users_email_idx").on(t.email),
}));

// ---------------------------------------------------------------------------
// ORGANISATIONAL STRUCTURE — data-driven, never hard-coded
// ---------------------------------------------------------------------------

export const academicYears = sqliteTable("academic_years", {
  id: id(),
  label: text("label").notNull(), // e.g. "2025-26"
  startDate: text("start_date"),
  endDate: text("end_date"),
  ...timestamps,
}, (t) => ({
  labelIdx: uniqueIndex("academic_years_label_idx").on(t.label),
}));

export const centres = sqliteTable("centres", {
  id: id(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  ...timestamps,
}, (t) => ({
  codeIdx: uniqueIndex("centres_code_idx").on(t.code),
}));

// workspace: EXAMS | SATHII
export const classes = sqliteTable("classes", {
  id: id(),
  name: text("name").notNull(),
  workspace: text("workspace").notNull(),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
}, (t) => ({
  nameWorkspaceIdx: uniqueIndex("classes_name_workspace_idx").on(t.name, t.workspace),
}));

export const batches = sqliteTable("batches", {
  id: id(),
  name: text("name").notNull(),
  classId: text("class_id").notNull().references(() => classes.id),
  academicYearId: text("academic_year_id").notNull().references(() => academicYears.id),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
}, (t) => ({
  uniq: uniqueIndex("batches_name_class_year_idx").on(t.name, t.classId, t.academicYearId),
}));

// ---------------------------------------------------------------------------
// STUDENT IDENTITY — name is never a unique key
// ---------------------------------------------------------------------------

export const students = sqliteTable("students", {
  id: id(),
  name: text("name").notNull(),
  centreId: text("centre_id").references(() => centres.id),
  phone: text("phone"),
  email: text("email"),
  ...timestamps,
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
}, (t) => ({
  nameIdx: index("students_name_idx").on(t.name),
}));

// type: SCID | SATHII_KEY — permanent identifiers, unique per type.
// Roll numbers are NOT here: they belong to exam_registrations because they
// are per-exam/session, not permanent.
export const studentIdentifiers = sqliteTable("student_identifiers", {
  id: id(),
  studentId: text("student_id").notNull().references(() => students.id),
  type: text("type").notNull(),
  value: text("value").notNull(),
  ...timestamps,
}, (t) => ({
  typeValueIdx: uniqueIndex("student_identifiers_type_value_idx").on(t.type, t.value),
  studentIdx: index("student_identifiers_student_idx").on(t.studentId),
}));

// ---------------------------------------------------------------------------
// EXAMINATIONS — fully configurable, no hard-coded exam names/subjects/years
// ---------------------------------------------------------------------------

// status: DRAFT | PUBLISHED | ARCHIVED
export const examinations = sqliteTable("examinations", {
  id: id(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  workspace: text("workspace").notNull(),
  academicYearId: text("academic_year_id").notNull().references(() => academicYears.id),
  examType: text("exam_type").notNull(), // free-text/config: NEET, JEE, Foundation, Mock...
  status: text("status").notNull().default("DRAFT"),

  // Exam-level marking-scheme defaults (dynamic, per exam — never hard-coded)
  correctMarks: real("correct_marks").notNull().default(4),
  wrongMarks: real("wrong_marks").notNull().default(-1),
  unattemptedMarks: real("unattempted_marks").notNull().default(0),
  negativeMarking: integer("negative_marking", { mode: "boolean" }).notNull().default(true),
  decimalPrecision: integer("decimal_precision").notNull().default(2),
  allowPartialMarks: integer("allow_partial_marks", { mode: "boolean" }).notNull().default(false),

  brandingProfileId: text("branding_profile_id").references(() => brandingProfiles.id),
  activeTemplateId: text("active_template_id").references(() => resultTemplates.id),

  ...timestamps,
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
});

export const examCodes = sqliteTable("exam_codes", {
  id: id(),
  examinationId: text("examination_id").notNull().references(() => examinations.id),
  code: text("code").notNull(),
  label: text("label"),
}, (t) => ({
  uniq: uniqueIndex("exam_codes_exam_code_idx").on(t.examinationId, t.code),
}));

export const subjects = sqliteTable("subjects", {
  id: id(),
  examinationId: text("examination_id").notNull().references(() => examinations.id),
  name: text("name").notNull(),
  maxMarks: real("max_marks").notNull(),
  order: integer("order").notNull().default(0),
}, (t) => ({
  uniq: uniqueIndex("subjects_exam_name_idx").on(t.examinationId, t.name),
}));

// A student's registration/participation in one examination instance.
// Captures roll number, class, batch, code AT THAT TIME — preserving
// history even if the student later moves batch/class.
export const examRegistrations = sqliteTable("exam_registrations", {
  id: id(),
  examinationId: text("examination_id").notNull().references(() => examinations.id),
  studentId: text("student_id").notNull().references(() => students.id),
  rollNumber: text("roll_number").notNull(),
  classId: text("class_id").references(() => classes.id),
  batchId: text("batch_id").references(() => batches.id),
  examCodeId: text("exam_code_id").references(() => examCodes.id),
  ...timestamps,
}, (t) => ({
  uniq: uniqueIndex("exam_registrations_exam_roll_idx").on(t.examinationId, t.rollNumber),
  studentIdx: index("exam_registrations_student_idx").on(t.studentId),
}));

// ---------------------------------------------------------------------------
// TEMPLATE ENGINE — maps arbitrary Excel columns to normalized fields
// ---------------------------------------------------------------------------

// type: RESULT | STUDENT_MASTER | QUESTION_PAPER | ANSWER_KEY |
//       STUDENT_RESPONSE | SCHOLARSHIP | REPORT | BRANDING
export const resultTemplates = sqliteTable("result_templates", {
  id: id(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  version: integer("version").notNull().default(1),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  clonedFromId: text("cloned_from_id"),
  createdById: text("created_by_id").notNull().references(() => users.id),
  ...timestamps,
}, (t) => ({
  uniq: uniqueIndex("result_templates_name_version_idx").on(t.name, t.version),
}));

// targetField: STUDENT_NAME | SCID | SATHII_KEY | ROLL_NUMBER | CLASS |
//   BATCH | CODE | SUBJECT_MARKS | TOTAL_MARKS | PERCENTAGE | RANK |
//   PERCENTILE | CUSTOM
export const templateFields = sqliteTable("template_fields", {
  id: id(),
  templateId: text("template_id").notNull().references(() => resultTemplates.id),
  targetField: text("target_field").notNull(),
  subjectName: text("subject_name"), // set when targetField = SUBJECT_MARKS
  sourceAliases: text("source_aliases").notNull(), // JSON-encoded string[]
  required: integer("required", { mode: "boolean" }).notNull().default(false),
  calculated: integer("calculated", { mode: "boolean" }).notNull().default(false),
  order: integer("order").notNull().default(0),
}, (t) => ({
  templateIdx: index("template_fields_template_idx").on(t.templateId),
}));

// ---------------------------------------------------------------------------
// IMPORT ENGINE — idempotent, validated, auditable
// ---------------------------------------------------------------------------

// status: UPLOADED | MAPPED | VALIDATED | IMPORTED | FAILED | CANCELLED
export const importJobs = sqliteTable("import_jobs", {
  id: id(),
  examinationId: text("examination_id").notNull().references(() => examinations.id),
  templateId: text("template_id").notNull().references(() => resultTemplates.id),
  uploadedById: text("uploaded_by_id").notNull().references(() => users.id),
  fileName: text("file_name").notNull(),
  sheetName: text("sheet_name"),
  fingerprint: text("fingerprint").notNull(), // hash of file content — detects re-uploads
  status: text("status").notNull().default("UPLOADED"),
  totalRows: integer("total_rows").notNull().default(0),
  validRows: integer("valid_rows").notNull().default(0),
  errorRows: integer("error_rows").notNull().default(0),
  ...timestamps,
  importedAt: text("imported_at"),
}, (t) => ({
  fingerprintIdx: index("import_jobs_fingerprint_idx").on(t.examinationId, t.fingerprint),
}));

// errorType: DUPLICATE_ID | MISSING_ID | MISSING_ROLL_NUMBER | INVALID_MARKS |
//   OUT_OF_RANGE_MARKS | TOTAL_MISMATCH | PERCENTAGE_MISMATCH |
//   UNKNOWN_STUDENT | UNKNOWN_CLASS | UNKNOWN_CODE | UNKNOWN_SUBJECT |
//   MISSING_REQUIRED_FIELD | OTHER
export const importErrors = sqliteTable("import_errors", {
  id: id(),
  importJobId: text("import_job_id").notNull().references(() => importJobs.id),
  rowNumber: integer("row_number").notNull(),
  field: text("field"),
  errorType: text("error_type").notNull(),
  message: text("message").notNull(),
  rawValue: text("raw_value"),
}, (t) => ({
  jobIdx: index("import_errors_job_idx").on(t.importJobId),
}));

// ---------------------------------------------------------------------------
// RESULTS — versioned publication, independent recalculation, provenance
// ---------------------------------------------------------------------------

// status: DRAFT | VALIDATED | PUBLISHED | ARCHIVED
export const resultRecords = sqliteTable("result_records", {
  id: id(),
  examinationId: text("examination_id").notNull().references(() => examinations.id),
  studentId: text("student_id").notNull().references(() => students.id),
  examRegistrationId: text("exam_registration_id").notNull().references(() => examRegistrations.id),
  status: text("status").notNull().default("DRAFT"),

  totalMarksUploaded: real("total_marks_uploaded"),
  totalMarksCalculated: real("total_marks_calculated").notNull(),
  percentageCalculated: real("percentage_calculated").notNull(),
  mismatchFlag: integer("mismatch_flag", { mode: "boolean" }).notNull().default(false),
  mismatchDetail: text("mismatch_detail"),

  rank: integer("rank"),
  percentile: real("percentile"),

  sourceImportJobId: text("source_import_job_id").references(() => importJobs.id),
  sourceRow: integer("source_row"),

  version: integer("version").notNull().default(1),
  publishedAt: text("published_at"),
  ...timestamps,
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
}, (t) => ({
  examRegIdx: uniqueIndex("result_records_exam_reg_idx").on(t.examRegistrationId),
  examStatusIdx: index("result_records_exam_status_idx").on(t.examinationId, t.status),
}));

export const subjectResults = sqliteTable("subject_results", {
  id: id(),
  resultRecordId: text("result_record_id").notNull().references(() => resultRecords.id),
  subjectId: text("subject_id").notNull().references(() => subjects.id),
  marksObtained: real("marks_obtained").notNull(),
}, (t) => ({
  uniq: uniqueIndex("subject_results_record_subject_idx").on(t.resultRecordId, t.subjectId),
}));

export const resultCorrections = sqliteTable("result_corrections", {
  id: id(),
  resultRecordId: text("result_record_id").notNull().references(() => resultRecords.id),
  field: text("field").notNull(),
  oldValue: text("old_value").notNull(),
  newValue: text("new_value").notNull(),
  reason: text("reason").notNull(),
  userId: text("user_id").notNull().references(() => users.id),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// BRANDING — S-CUBUS primary logo + exam-specific secondary logo
// ---------------------------------------------------------------------------

export const brandingProfiles = sqliteTable("branding_profiles", {
  id: id(),
  name: text("name").notNull(),
  workspace: text("workspace"), // null = usable by both workspaces
  primaryLogoUrl: text("primary_logo_url").notNull().default("/branding/scubus-primary.svg"),
  secondaryLogoUrl: text("secondary_logo_url"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// SCHOLARSHIP ENGINE (SATHII) — versioned, auditable, explainable
// ---------------------------------------------------------------------------

// status: DRAFT | ACTIVE | RETIRED
export const scholarshipPolicies = sqliteTable("scholarship_policies", {
  id: id(),
  name: text("name").notNull(),
  academicYearId: text("academic_year_id").references(() => academicYears.id),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("ACTIVE"),

  // SES = marksWeight * percentage + percentileWeight * percentile (weights sum to 1.0)
  marksWeight: real("marks_weight").notNull().default(0.7),
  percentileWeight: real("percentile_weight").notNull().default(0.3),
  maxScholarshipPercent: real("max_scholarship_percent").notNull().default(100),

  // Top-3-of-class special merit rule
  top3Enabled: integer("top3_enabled", { mode: "boolean" }).notNull().default(true),
  top3Percent: real("top3_percent").notNull().default(100),

  // Eligibility minimums (null = not enforced)
  minPercentage: real("min_percentage"),
  minPercentile: real("min_percentile"),
  minMarks: real("min_marks"),

  defaultTuitionFee: real("default_tuition_fee").notNull().default(0),

  createdById: text("created_by_id").references(() => users.id),
  ...timestamps,
}, (t) => ({
  uniq: uniqueIndex("scholarship_policies_name_version_idx").on(t.name, t.version),
}));

export const scholarshipSlabs = sqliteTable("scholarship_slabs", {
  id: id(),
  policyId: text("policy_id").notNull().references(() => scholarshipPolicies.id),
  minScore: real("min_score").notNull(), // inclusive
  maxScore: real("max_score"), // exclusive upper bound; null = no upper bound
  scholarshipPercent: real("scholarship_percent").notNull(),
  order: integer("order").notNull().default(0),
});

// category: TOP_3_CLASS_MERIT | SES_SCHOLARSHIP | NO_SCHOLARSHIP | NOT_ELIGIBLE | DISQUALIFIED
export const scholarshipResults = sqliteTable("scholarship_results", {
  id: id(),
  resultRecordId: text("result_record_id").notNull().references(() => resultRecords.id),
  studentId: text("student_id").notNull().references(() => students.id),
  policyId: text("policy_id").notNull().references(() => scholarshipPolicies.id),

  percentage: real("percentage").notNull(),
  percentile: real("percentile"),
  classRank: integer("class_rank"),
  overallRank: integer("overall_rank"),
  sesScore: real("ses_score"),

  eligibilityStatus: text("eligibility_status").notNull(), // ELIGIBLE | NOT_ELIGIBLE | INCOMPLETE
  ineligibilityReason: text("ineligibility_reason"),

  scholarshipCategory: text("scholarship_category").notNull(),
  scholarshipPercentage: real("scholarship_percentage").notNull(),

  tuitionFee: real("tuition_fee").notNull().default(0),
  scholarshipAmount: real("scholarship_amount").notNull().default(0),
  netTuitionFee: real("net_tuition_fee").notNull().default(0),

  explanation: text("explanation").notNull(),

  isOverride: integer("is_override", { mode: "boolean" }).notNull().default(false),
  calculatedPercentage: real("calculated_percentage"), // preserved original when overridden
  overrideReason: text("override_reason"),
  overrideById: text("override_by_id").references(() => users.id),

  calculationVersion: text("calculation_version").notNull().default("SCHOLARSHIP_ENGINE_v1.0"),
  ...timestamps,
  updatedAt: text("updated_at").$defaultFn(() => new Date().toISOString()),
}, (t) => ({
  uniq: uniqueIndex("scholarship_results_record_idx").on(t.resultRecordId),
  studentIdx: index("scholarship_results_student_idx").on(t.studentId),
}));

// ---------------------------------------------------------------------------
// AUDIT LOG
// ---------------------------------------------------------------------------

export const auditLogs = sqliteTable("audit_logs", {
  id: id(),
  userId: text("user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  ...timestamps,
}, (t) => ({
  entityIdx: index("audit_logs_entity_idx").on(t.entityType, t.entityId),
}));
