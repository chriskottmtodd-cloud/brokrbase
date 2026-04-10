import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface CustomField {
  label: string;
  value: string;
}

interface Props {
  customFields: CustomField[];
  onSave: (fields: CustomField[]) => Promise<void>;
}

export function CustomFieldsSection({ customFields, onSave }: Props) {
  const [fields, setFields] = useState<CustomField[]>(customFields);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newValue, setNewValue] = useState("");

  const saveField = async (index: number, key: "label" | "value", val: string) => {
    const updated = [...fields];
    updated[index] = { ...updated[index], [key]: val };
    setFields(updated);
    await onSave(updated);
  };

  const removeField = async (index: number) => {
    const updated = fields.filter((_, i) => i !== index);
    setFields(updated);
    await onSave(updated);
  };

  const addField = async () => {
    if (!newLabel.trim()) return;
    const updated = [...fields, { label: newLabel.trim(), value: newValue.trim() }];
    setFields(updated);
    await onSave(updated);
    setNewLabel("");
    setNewValue("");
    setAdding(false);
  };

  if (fields.length === 0 && !adding) {
    return (
      <div>
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Custom Fields
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1 text-muted-foreground"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3 w-3" /> Add field
          </Button>
        </div>
        {adding && <AddFieldRow {...{ newLabel, setNewLabel, newValue, setNewValue, addField, onCancel: () => setAdding(false) }} />}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Custom Fields
        </div>
        {!adding && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1 text-muted-foreground"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3 w-3" /> Add field
          </Button>
        )}
      </div>
      <div className="space-y-1">
        {fields.map((field, idx) => (
          <div key={idx} className="group flex items-center gap-2 py-1.5 px-2 -mx-2 rounded-md hover:bg-muted/30 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground">{field.label}</div>
              <input
                className="text-sm bg-transparent border-none outline-none w-full placeholder:text-muted-foreground/50"
                value={field.value}
                onChange={(e) => {
                  const updated = [...fields];
                  updated[idx] = { ...updated[idx], value: e.target.value };
                  setFields(updated);
                }}
                onBlur={(e) => saveField(idx, "value", e.target.value)}
                placeholder="Add value..."
              />
            </div>
            <button
              type="button"
              onClick={() => removeField(idx)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      {adding && <AddFieldRow {...{ newLabel, setNewLabel, newValue, setNewValue, addField, onCancel: () => setAdding(false) }} />}
    </div>
  );
}

function AddFieldRow({
  newLabel,
  setNewLabel,
  newValue,
  setNewValue,
  addField,
  onCancel,
}: {
  newLabel: string;
  setNewLabel: (v: string) => void;
  newValue: string;
  setNewValue: (v: string) => void;
  addField: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-end gap-2 mt-2 p-2 rounded-md bg-muted/20 border border-dashed border-muted-foreground/20">
      <div className="flex-1">
        <div className="text-xs text-muted-foreground mb-0.5">Label</div>
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Field name..."
          className="h-7 text-sm"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") addField();
            if (e.key === "Escape") onCancel();
          }}
        />
      </div>
      <div className="flex-1">
        <div className="text-xs text-muted-foreground mb-0.5">Value</div>
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="Value..."
          className="h-7 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") addField();
            if (e.key === "Escape") onCancel();
          }}
        />
      </div>
      <Button size="sm" className="h-7 text-xs" onClick={addField} disabled={!newLabel.trim()}>
        Add
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
