"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { CustomSelect } from "@/components/custom-select";
import { CustomCheckbox } from "@/components/custom-checkbox";
import {
  cloneIntakeSchema,
  createIntakeField,
  INTAKE_TEMPLATES,
  intakeFieldTypes,
} from "@/lib/intake-forms";
import type { IntakeField, IntakeSchema } from "@/lib/types";

export function IntakeFormBuilder({
  value,
  onChange,
}: {
  value: IntakeSchema;
  onChange: (value: IntakeSchema) => void;
}) {
  function updateField(index: number, changes: Partial<IntakeField>) {
    onChange({
      ...value,
      fields: value.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...changes } : field,
      ),
    });
  }

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= value.fields.length) return;
    const fields = [...value.fields];
    [fields[index], fields[nextIndex]] = [fields[nextIndex], fields[index]];
    onChange({ ...value, fields });
  }

  return (
    <div className="intake-builder">
      <div className="field">
        <label>Start with a template</label>
        <CustomSelect
          value=""
          placeholder="Choose a template"
          options={INTAKE_TEMPLATES.map((template) => ({
            value: template.id,
            label: template.name,
          }))}
          onChange={(templateId) => {
            const template = INTAKE_TEMPLATES.find(
              (item) => item.id === templateId,
            );
            if (template) onChange(cloneIntakeSchema(template.schema));
          }}
        />
        <small className="field-help">
          Applying a template replaces the questions below. You can edit every
          question afterward.
        </small>
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Form heading</label>
          <input
            value={value.title}
            maxLength={100}
            onChange={(event) =>
              onChange({ ...value, title: event.target.value })
            }
            placeholder="Before your session"
          />
        </div>
        <div className="field">
          <label>Short introduction</label>
          <input
            value={value.description}
            maxLength={300}
            onChange={(event) =>
              onChange({ ...value, description: event.target.value })
            }
            placeholder="Help us prepare for your time together."
          />
        </div>
      </div>
      <div className="intake-question-list">
        {value.fields.length === 0 && (
          <div className="intake-builder-empty">
            <strong>No intake questions</strong>
            <p>Customers will move directly from choosing a time to review.</p>
          </div>
        )}
        {value.fields.map((field, index) => {
          const hasOptions = ["single_choice", "multi_choice"].includes(
            field.type,
          );
          return (
            <article className="intake-question-card" key={field.id}>
              <header>
                <span>Question {index + 1}</span>
                <div className="intake-question-actions">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move question ${index + 1} up`}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === value.fields.length - 1}
                    aria-label={`Move question ${index + 1} down`}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    className="danger-link"
                    onClick={() =>
                      onChange({
                        ...value,
                        fields: value.fields.filter(
                          (item) => item.id !== field.id,
                        ),
                      })
                    }
                    aria-label={`Remove question ${index + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </header>
              <div className="form-grid intake-question-grid">
                <div className="field">
                  <label>Question</label>
                  <input
                    value={field.label}
                    maxLength={120}
                    onChange={(event) =>
                      updateField(index, { label: event.target.value })
                    }
                    required
                  />
                </div>
                <div className="field">
                  <label>Answer type</label>
                  <CustomSelect
                    value={field.type}
                    options={intakeFieldTypes}
                    onChange={(type) =>
                      updateField(index, {
                        type: type as IntakeField["type"],
                        options: ["single_choice", "multi_choice"].includes(type)
                          ? field.options?.length
                            ? field.options
                            : ["Option 1", "Option 2"]
                          : undefined,
                      })
                    }
                  />
                </div>
              </div>
              {!["yes_no", "date"].includes(field.type) && (
                <div className="field">
                  <label>Placeholder or guidance</label>
                  <input
                    value={field.placeholder ?? ""}
                    maxLength={160}
                    onChange={(event) =>
                      updateField(index, { placeholder: event.target.value })
                    }
                    placeholder="Optional guidance shown inside the field"
                  />
                </div>
              )}
              {hasOptions && (
                <div className="field">
                  <label>Choices</label>
                  <input
                    value={(field.options ?? []).join(", ")}
                    onChange={(event) =>
                      updateField(index, {
                        options: event.target.value
                          .split(",")
                          .map((option) => option.trim())
                          .filter(Boolean)
                          .slice(0, 12),
                      })
                    }
                    placeholder="Option 1, Option 2, Option 3"
                    required
                  />
                  <small className="field-help">Separate choices with commas.</small>
                </div>
              )}
              <div className="intake-required-check">
                <CustomCheckbox
                  checked={field.required}
                  onChange={(required) => updateField(index, { required })}
                  label="Required question"
                />
              </div>
            </article>
          );
        })}
      </div>
      <button
        type="button"
        className="sc-btn-secondary intake-add-question"
        disabled={value.fields.length >= 12}
        onClick={() =>
          onChange({
            ...value,
            fields: [
              ...value.fields,
              createIntakeField(value.fields.length + 1),
            ],
          })
        }
      >
        <Plus size={15} /> Add question
      </button>
      <p className="intake-privacy-note">
        Keep this form focused on scheduling and preparation. Avoid collecting
        emergency information or detailed medical records here.
      </p>
    </div>
  );
}
