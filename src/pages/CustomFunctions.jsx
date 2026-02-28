import { useState, useEffect } from "react";
import { dataflow } from '@/api/client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Zap, FlaskConical, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";

const EMPTY = { name: "", label: "", category: "spark_udf", description: "", expression_template: "", param_hint: "" };

export default function CustomFunctions() {
  const [functions, setFunctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | "new" | record
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const data = await dataflow.entities.CustomFunction.list();
    setFunctions(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startNew = () => { setEditing("new"); setForm(EMPTY); };
  const startEdit = (fn) => { setEditing(fn); setForm({ ...fn }); };
  const cancelEdit = () => { setEditing(null); setForm(EMPTY); };

  const save = async () => {
    setSaving(true);
    if (editing === "new") {
      await dataflow.entities.CustomFunction.create(form);
    } else {
      await dataflow.entities.CustomFunction.update(editing.id, form);
    }
    await load();
    cancelEdit();
    setSaving(false);
  };

  const remove = async (fn) => {
    if (!window.confirm(`Delete "${fn.label}"?`)) return;
    await dataflow.entities.CustomFunction.delete(fn.id);
    setFunctions(prev => prev.filter(f => f.id !== fn.id));
  };

  const categoryBadge = (cat) => {
    if (cat === "spark_udf") return <Badge className="bg-blue-100 text-[#0060AF] dark:bg-blue-900/40 dark:text-blue-300 text-[10px]">Spark UDF</Badge>;
    return <Badge className="bg-amber-100 text-amber-700 text-[10px]">Custom Expression</Badge>;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Custom Functions</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Add Spark UDFs or custom expressions that will appear in the Column Mapping transform dropdown.
          </p>
        </div>
        <Button onClick={startNew} className="gap-2 bg-[#0060AF] hover:bg-[#004d8c] dark:bg-[#0060AF] dark:hover:bg-[#004d8c]">
          <Plus className="w-4 h-4" /> New Function
        </Button>
      </div>

      {/* Form panel */}
      {editing && (
        <Card className="p-5 border-blue-200 bg-blue-50/40 space-y-4">
          <h3 className="text-sm font-semibold text-slate-800">
            {editing === "new" ? "Add New Function" : `Edit: ${editing.label}`}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Function Key (unique, no spaces)</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value.replace(/\s+/g, "_") }))}
                placeholder="my_udf"
                className="h-8 text-xs mt-1 font-mono"
              />
            </div>
            <div>
              <Label className="text-xs">Display Label</Label>
              <Input
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="my_udf(col, 'param')"
                className="h-8 text-xs mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spark_udf">Spark UDF</SelectItem>
                  <SelectItem value="custom_expression">Custom Expression</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What this function does"
                className="h-8 text-xs mt-1"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Expression Template (use {"{col}"} as placeholder)</Label>
              <Input
                value={form.expression_template}
                onChange={e => setForm(f => ({ ...f, expression_template: e.target.value }))}
                placeholder="my_udf({col}, 'default')"
                className="h-8 text-xs mt-1 font-mono"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={save} disabled={!form.name || !form.label || saving} className="gap-1.5 bg-[#0060AF] hover:bg-[#004d8c] dark:bg-[#0060AF] dark:hover:bg-[#004d8c]">
              <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save Function"}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelEdit}>
              <X className="w-3.5 h-3.5 mr-1" /> Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Key</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Display Label</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Category</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Expression Template</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Description</th>
              <th className="py-2.5 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400">Loading…</td></tr>
            )}
            {!loading && functions.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-400">
                  <FlaskConical className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No custom functions yet. Click <strong>New Function</strong> to add one.
                </td>
              </tr>
            )}
            {functions.map(fn => (
              <tr key={fn.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                <td className="px-4 py-2.5 font-mono text-slate-800">{fn.name}</td>
                <td className="px-4 py-2.5 text-slate-700">{fn.label}</td>
                <td className="px-4 py-2.5">{categoryBadge(fn.category)}</td>
                <td className="px-4 py-2.5 font-mono text-slate-500">{fn.expression_template || "—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{fn.description || "—"}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(fn)} className="text-slate-400 hover:text-blue-600 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => remove(fn)} className="text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-slate-400">
        <Zap className="w-3 h-3 inline mr-1" />
        Functions added here automatically appear in the <strong>Transform</strong> dropdown in Column Mapping.
      </p>
    </div>
  );
}