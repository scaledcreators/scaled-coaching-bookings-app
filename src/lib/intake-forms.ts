import { z } from "zod";
import type { IntakeField, IntakeFieldType, IntakeSchema } from "@/lib/types";

export const intakeFieldTypes: Array<{
  value: IntakeFieldType;
  label: string;
}> = [
  { value: "short_text", label: "Short answer" },
  { value: "long_text", label: "Long answer" },
  { value: "single_choice", label: "Single choice" },
  { value: "multi_choice", label: "Checkboxes" },
  { value: "yes_no", label: "Yes / No" },
  { value: "date", label: "Date" },
];

const choiceTypes = new Set<IntakeFieldType>([
  "single_choice",
  "multi_choice",
]);

export const intakeFieldSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,64}$/),
  type: z.enum([
    "short_text",
    "long_text",
    "single_choice",
    "multi_choice",
    "yes_no",
    "date",
  ]),
  label: z.string().trim().min(1).max(120),
  required: z.boolean().default(false),
  placeholder: z.string().trim().max(160).optional().default(""),
  options: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
});

export const intakeSchemaInput = z
  .object({
    version: z.literal(1),
    title: z.string().trim().max(100).default("A little context"),
    description: z.string().trim().max(300).default(""),
    fields: z.array(intakeFieldSchema).max(12),
  })
  .superRefine((value, context) => {
    const ids = new Set<string>();
    value.fields.forEach((item, index) => {
      if (ids.has(item.id)) {
        context.addIssue({
          code: "custom",
          path: ["fields", index, "id"],
          message: "Each intake question must have a unique ID.",
        });
      }
      ids.add(item.id);
      if (
        choiceTypes.has(item.type) &&
        new Set(item.options ?? []).size < 1
      ) {
        context.addIssue({
          code: "custom",
          path: ["fields", index, "options"],
          message: "Choice questions need at least one option.",
        });
      }
    });
  });

function field(
  id: string,
  label: string,
  type: IntakeFieldType,
  required = false,
  placeholder = "",
  options?: string[],
): IntakeField {
  return { id, label, type, required, placeholder, options };
}

export const INTAKE_TEMPLATES: Array<{
  id: string;
  name: string;
  description: string;
  schema: IntakeSchema;
}> = [
  {
    id: "general",
    name: "General consultation",
    description: "A simple goal and context form for most sessions.",
    schema: {
      version: 1,
      title: "A little context",
      description: "Help us prepare for your time together.",
      fields: [
        field(
          "goal",
          "What would make this session a win?",
          "long_text",
          true,
          "Share the main thing you would like to work through.",
        ),
        field(
          "anything_else",
          "Anything else we should know?",
          "long_text",
          false,
          "Optional context or questions.",
        ),
      ],
    },
  },
  {
    id: "new_client",
    name: "New-client intake",
    description: "Learn about a new client before the first appointment.",
    schema: {
      version: 1,
      title: "Tell us about yourself",
      description: "A few details help make the first session more useful.",
      fields: [
        field("preferred_name", "Preferred name", "short_text", true),
        field("reason", "What brings you here?", "long_text", true),
        field("support", "What kind of support are you looking for?", "long_text"),
        field("first_visit", "Is this your first visit?", "yes_no"),
      ],
    },
  },
  {
    id: "goals",
    name: "Goals and expectations",
    description: "Understand desired outcomes and current obstacles.",
    schema: {
      version: 1,
      title: "Goals and expectations",
      description: "Share what you want to accomplish together.",
      fields: [
        field("primary_goal", "What is your primary goal?", "long_text", true),
        field("challenge", "What is getting in the way right now?", "long_text"),
        field("success", "What would a successful outcome look like?", "long_text"),
      ],
    },
  },
  {
    id: "preparation",
    name: "Appointment preparation",
    description: "Collect the details needed to prepare for an appointment.",
    schema: {
      version: 1,
      title: "Prepare for your appointment",
      description: "Answer these before submitting your request.",
      fields: [
        field("focus", "What should we focus on?", "long_text", true),
        field("bring", "Is there anything you plan to bring or share?", "long_text"),
        field("accessibility", "Any accessibility or arrival needs?", "long_text"),
      ],
    },
  },
  {
    id: "visit",
    name: "Visit or event details",
    description: "Useful for in-person visits and location-based work.",
    schema: {
      version: 1,
      title: "Visit details",
      description: "Share the practical details for this visit.",
      fields: [
        field("area", "City or general area", "short_text", true),
        field("date_context", "Is there an important date we should know?", "date"),
        field("attendees", "Who will be present?", "short_text"),
        field("notes", "Anything else about the visit?", "long_text"),
      ],
    },
  },
  {
    id: "blank",
    name: "Blank form",
    description: "Start empty and add only the questions you need.",
    schema: {
      version: 1,
      title: "Before your session",
      description: "",
      fields: [],
    },
  },
];

export const DEFAULT_INTAKE_SCHEMA = INTAKE_TEMPLATES[0].schema;

export function cloneIntakeSchema(schema: IntakeSchema): IntakeSchema {
  return structuredClone(schema);
}

export function normalizeIntakeSchema(value: unknown): IntakeSchema {
  const parsed = intakeSchemaInput.safeParse(value);
  if (!parsed.success) return cloneIntakeSchema(DEFAULT_INTAKE_SCHEMA);
  return {
    ...parsed.data,
    fields: parsed.data.fields.map((item) => ({
      ...item,
      options: choiceTypes.has(item.type)
        ? [...new Set(item.options ?? [])]
        : undefined,
    })),
  };
}

export function createIntakeField(index: number): IntakeField {
  return field(
    `question_${Date.now().toString(36)}_${index}`,
    "New question",
    "short_text",
  );
}

export type IntakeAnswerValue = string | string[];

export function buildStoredIntakeAnswers(
  schemaValue: unknown,
  answers: Record<string, unknown>,
) {
  const schema = normalizeIntakeSchema(schemaValue);
  const responses = schema.fields.map((item) => {
    const value = answers[item.id];
    let normalized: IntakeAnswerValue = "";
    if (item.type === "multi_choice") {
      normalized = Array.isArray(value)
        ? value.filter(
            (entry): entry is string =>
              typeof entry === "string" && (item.options ?? []).includes(entry),
          )
        : [];
    } else if (typeof value === "string") {
      normalized = value.trim();
    }

    if (
      item.type === "single_choice" &&
      normalized &&
      !(item.options ?? []).includes(normalized as string)
    ) {
      throw new Error(`Choose a valid answer for “${item.label}”.`);
    }
    if (item.type === "yes_no" && normalized && !["Yes", "No"].includes(normalized as string)) {
      throw new Error(`Choose Yes or No for “${item.label}”.`);
    }
    if (item.type === "date" && normalized && !/^\d{4}-\d{2}-\d{2}$/.test(normalized as string)) {
      throw new Error(`Choose a valid date for “${item.label}”.`);
    }
    const length = Array.isArray(normalized)
      ? normalized.length
      : normalized.length;
    if (item.required && length === 0) {
      throw new Error(`“${item.label}” is required.`);
    }
    const maxLength = item.type === "long_text" ? 4000 : 500;
    if (typeof normalized === "string" && normalized.length > maxLength) {
      throw new Error(`“${item.label}” is too long.`);
    }
    return {
      fieldId: item.id,
      label: item.label,
      type: item.type,
      value: normalized,
    };
  });

  return {
    version: 1,
    formTitle: schema.title,
    responses,
  };
}

export function readStoredIntakeAnswers(value: unknown): Array<{
  label: string;
  value: string;
}> {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.responses)) {
    return record.responses.flatMap((response) => {
      if (!response || typeof response !== "object") return [];
      const item = response as Record<string, unknown>;
      const formatted = Array.isArray(item.value)
        ? item.value.filter((entry) => typeof entry === "string").join(", ")
        : typeof item.value === "string"
          ? item.value
          : "";
      return typeof item.label === "string" && formatted
        ? [{ label: item.label, value: formatted }]
        : [];
    });
  }
  return Object.entries(record).flatMap(([key, answer]) => {
    if (typeof answer !== "string" || !answer.trim()) return [];
    const label = key === "goal" ? "Customer goal" : key.replaceAll("_", " ");
    return [{ label, value: answer }];
  });
}
