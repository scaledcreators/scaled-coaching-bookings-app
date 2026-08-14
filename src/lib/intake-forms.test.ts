import { describe, expect, it } from "vitest";
import {
  buildStoredIntakeAnswers,
  DEFAULT_INTAKE_SCHEMA,
  normalizeIntakeSchema,
  readStoredIntakeAnswers,
} from "@/lib/intake-forms";

describe("intake forms", () => {
  it("keeps the existing goal flow for sessions without a saved schema", () => {
    expect(normalizeIntakeSchema({})).toEqual(DEFAULT_INTAKE_SCHEMA);
  });

  it("preserves an explicit blank form", () => {
    expect(
      normalizeIntakeSchema({
        version: 1,
        title: "No questions",
        description: "",
        fields: [],
      }).fields,
    ).toEqual([]);
  });

  it("stores a question snapshot with each booking", () => {
    const stored = buildStoredIntakeAnswers(DEFAULT_INTAKE_SCHEMA, {
      goal: "Prepare for the first visit",
      anything_else: "Evenings work best",
    });
    expect(stored.responses[0]).toMatchObject({
      fieldId: "goal",
      label: "What would make this session a win?",
      value: "Prepare for the first visit",
    });
    expect(readStoredIntakeAnswers(stored)).toEqual([
      {
        label: "What would make this session a win?",
        value: "Prepare for the first visit",
      },
      {
        label: "Anything else we should know?",
        value: "Evenings work best",
      },
    ]);
  });

  it("rejects missing required answers", () => {
    expect(() => buildStoredIntakeAnswers(DEFAULT_INTAKE_SCHEMA, {})).toThrow(
      "is required",
    );
  });

  it("continues to read historical flat answers", () => {
    expect(readStoredIntakeAnswers({ goal: "Legacy goal" })).toEqual([
      { label: "Customer goal", value: "Legacy goal" },
    ]);
  });
});
