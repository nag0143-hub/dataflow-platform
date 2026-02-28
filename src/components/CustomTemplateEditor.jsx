import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, Save, Trash2, X, Info, LayoutTemplate } from "lucide-react";
import { AVAILABLE_PLACEHOLDERS } from "@/components/DagTemplates";

const DEFAULT_CUSTOM_TEMPLATE = `{{dag_id}}:
  default_args:
    owner: {{owner}}
    email:
      - {{email}}
    email_on_failure: {{email_on_failure}}
    retries: {{retries}}
    retry_delay_sec: {{retry_delay_sec}}
    start_date: {{start_date}}
  schedule: {{schedule}}
  catchup: false
  description: "{{description}}"

  tasks:
    # Add your tasks here using {{placeholders}}
    # Use {{dataset_extract_group}} for DB sources
    # Use {{dataset_ingest_group}} for flat file sources
{{dataset_extract_group}}`;

export default function CustomTemplateEditor({ open, onOpenChange, editingTemplate, onSave, onDelete }) {
  const [name, setName] = useState(editingTemplate?.name || "");
  const [description, setDescription] = useState(editingTemplate?.description || "");
  const [sourceType, setSourceType] = useState(editingTemplate?.sourceType || "any");
  const [template, setTemplate] = useState(editingTemplate?.template || DEFAULT_CUSTOM_TEMPLATE);
  const [showPlaceholders, setShowPlaceholders] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const templateId = editingTemplate?.templateId || `custom_${Date.now()}`;
      await onSave({
        templateId,
        name: name.trim(),
        description: description.trim(),
        sourceType,
        template,
        builtin: false,
        dbId: editingTemplate?.id || null,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (editingTemplate?.templateId) {
      await onDelete(editingTemplate.templateId);
      onOpenChange(false);
    }
  };

  const insertPlaceholder = (key) => {
    const textarea = document.getElementById("template-editor");
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = template;
      const newText = text.substring(0, start) + `{{${key}}}` + text.substring(end);
      setTemplate(newText);
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + key.length + 4;
      }, 0);
    } else {
      setTemplate(prev => prev + `{{${key}}}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-[#0060AF]" />
            {editingTemplate?.id ? "Edit Custom Template" : "Create Custom Template"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Template Name</Label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., My Spark ETL Pipeline"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#0060AF]/30 focus:border-[#0060AF] outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Source Type</Label>
              <select
                value={sourceType}
                onChange={e => setSourceType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-[#0060AF]/30 focus:border-[#0060AF] outline-none"
              >
                <option value="any">Any (all sources)</option>
                <option value="flat_file">Flat File sources only</option>
                <option value="database">Database sources only</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Description</Label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of what this template does"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#0060AF]/30 focus:border-[#0060AF] outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">YAML Template</Label>
              <button
                type="button"
                onClick={() => setShowPlaceholders(!showPlaceholders)}
                className="flex items-center gap-1 text-xs text-[#0060AF] hover:text-[#004d8c] font-medium"
              >
                <Info className="w-3.5 h-3.5" />
                {showPlaceholders ? "Hide placeholders" : "Available placeholders"}
              </button>
            </div>

            {showPlaceholders && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2 max-h-48 overflow-y-auto">
                <p className="text-xs text-blue-700 font-semibold">Click a placeholder to insert at cursor position:</p>
                <div className="grid grid-cols-1 gap-1">
                  {AVAILABLE_PLACEHOLDERS.map(p => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => insertPlaceholder(p.key)}
                      className="flex items-center gap-2 text-left px-2 py-1 rounded hover:bg-blue-100 transition-colors"
                    >
                      <code className="text-xs font-mono text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded shrink-0">{`{{${p.key}}}`}</code>
                      <span className="text-xs text-blue-600 truncate">{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <textarea
              id="template-editor"
              value={template}
              onChange={e => setTemplate(e.target.value)}
              rows={20}
              spellCheck={false}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg bg-slate-950 text-emerald-300 focus:ring-2 focus:ring-[#0060AF]/30 focus:border-[#0060AF] outline-none leading-relaxed resize-y"
            />
            <p className="text-[10px] text-slate-400">
              Use {"{{placeholder}}"} syntax. Dynamic task groups for datasets: {"{{dataset_extract_group}}"}, {"{{dataset_ingest_group}}"}, {"{{dataset_transform_group}}"}
            </p>
          </div>

          <div className="flex justify-between pt-2">
            <div>
              {editingTemplate?.id && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  className="gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Template
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                <X className="w-3.5 h-3.5 mr-1" /> Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={!name.trim() || saving}
                className="gap-1.5 bg-[#0060AF] hover:bg-[#004d8c]"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? "Saving..." : "Save Template"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
