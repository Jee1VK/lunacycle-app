import { useEffect, useState } from 'react';
import { Check, Droplets, Heart, Moon, Thermometer, Trash2 } from 'lucide-react';
import {
  FLOW_OPTIONS,
  LH_OPTIONS,
  MOOD_OPTIONS,
  MUCUS_OPTIONS,
  SYMPTOM_OPTIONS,
} from '../engine/catalog';
import { toCelsius } from '../engine/cycleEngine';
import { formatLongDate } from '../engine/temporal';
import type { DailyLog, MoodId, SymptomId, TrackingMode } from '../types';
import { createEmptyLog } from '../types';
import { ModalDialog } from './ModalDialog';

interface DailyLogDialogProps {
  open: boolean;
  date: string | null;
  existingLog?: DailyLog;
  tempUnit: 'C' | 'F';
  mode: TrackingMode;
  simpleMode: boolean;
  customSymptoms: string[];
  customMoods: string[];
  onAddCustomSymptom: (label: string) => void;
  onAddCustomMood: (label: string) => void;
  onSave: (log: DailyLog) => void;
  onDelete: (date: string) => void;
  onClose: () => void;
}

export function DailyLogDialog({
  open,
  date,
  existingLog,
  tempUnit,
  mode,
  simpleMode,
  customSymptoms,
  customMoods,
  onAddCustomSymptom,
  onAddCustomMood,
  onSave,
  onDelete,
  onClose,
}: DailyLogDialogProps) {
  const [draft, setDraft] = useState<DailyLog>(() =>
    existingLog ? { ...existingLog } : createEmptyLog(date ?? '2026-01-01'),
  );
  const [bbtInput, setBbtInput] = useState('');
  const [sleepInput, setSleepInput] = useState('');
  const [waterInput, setWaterInput] = useState('');
  const [newSymptomText, setNewSymptomText] = useState('');
  const [newMoodText, setNewMoodText] = useState('');

  useEffect(() => {
    if (!open || !date) return;
    const base = existingLog
      ? {
          ...existingLog,
          symptoms: [...existingLog.symptoms],
          customSymptoms: [...(existingLog.customSymptoms ?? [])],
          moods: [...existingLog.moods],
          customMoods: [...(existingLog.customMoods ?? [])],
        }
      : createEmptyLog(date);
    setDraft(base);
    setNewSymptomText('');
    setNewMoodText('');

    if (typeof base.bbtC === 'number') {
      setBbtInput(
        tempUnit === 'F' ? ((base.bbtC * 9) / 5 + 32).toFixed(1) : base.bbtC.toFixed(2),
      );
    } else {
      setBbtInput('');
    }
    setSleepInput(typeof base.sleepHours === 'number' ? String(base.sleepHours) : '');
    setWaterInput(typeof base.waterGlasses === 'number' ? String(base.waterGlasses) : '');
  }, [open, date, existingLog, tempUnit]);

  const toggleSymptom = (id: SymptomId) => {
    setDraft((prev) => ({
      ...prev,
      symptoms: prev.symptoms.includes(id)
        ? prev.symptoms.filter((s) => s !== id)
        : [...prev.symptoms, id],
    }));
  };

  const toggleCustomSymptom = (label: string) => {
    setDraft((prev) => {
      const current = prev.customSymptoms ?? [];
      return {
        ...prev,
        customSymptoms: current.includes(label)
          ? current.filter((s) => s !== label)
          : [...current, label],
      };
    });
  };

  const toggleMood = (id: MoodId) => {
    setDraft((prev) => ({
      ...prev,
      moods: prev.moods.includes(id)
        ? prev.moods.filter((m) => m !== id)
        : [...prev.moods, id],
    }));
  };

  const toggleCustomMood = (label: string) => {
    setDraft((prev) => {
      const current = prev.customMoods ?? [];
      return {
        ...prev,
        customMoods: current.includes(label)
          ? current.filter((m) => m !== label)
          : [...current, label],
      };
    });
  };

  const handleSave = () => {
    if (!date) return;
    const parsedBbt = bbtInput.trim() === '' ? undefined : Number(bbtInput);
    const bbtC =
      parsedBbt !== undefined && Number.isFinite(parsedBbt) && parsedBbt > 30 && parsedBbt < 110
        ? toCelsius(parsedBbt, tempUnit)
        : undefined;

    const parsedSleep = sleepInput.trim() === '' ? undefined : Number(sleepInput);
    const sleepHours =
      parsedSleep !== undefined && Number.isFinite(parsedSleep) && parsedSleep >= 0 && parsedSleep <= 24
        ? parsedSleep
        : undefined;

    const parsedWater = waterInput.trim() === '' ? undefined : Number(waterInput);
    const waterGlasses =
      parsedWater !== undefined && Number.isFinite(parsedWater) && parsedWater >= 0 && parsedWater <= 30
        ? Math.round(parsedWater)
        : undefined;

    onSave({
      ...draft,
      date,
      bbtC,
      sleepHours,
      waterGlasses,
      notes: draft.notes.trim(),
    });
    onClose();
  };

  return (
    <ModalDialog
      open={open}
      title={date ? formatLongDate(date) : 'Daily Log'}
      subtitle="Tap to record flow, symptoms, mood, and wellness cues"
      onClose={onClose}
      footer={
        <>
          {existingLog && date ? (
            <button
              type="button"
              className="btn-danger"
              onClick={() => {
                onDelete(date);
                onClose();
              }}
              style={{ marginRight: 'auto' }}
            >
              <Trash2 size={16} />
              Clear Day
            </button>
          ) : null}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} autoFocus>
            <Check size={16} />
            Save Log
          </button>
        </>
      }
    >
      {/* Flow Intensity */}
      <section className="field-group">
        <span className="field-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Droplets size={16} color="var(--color-brand-primary)" />
          {mode === 'pregnancy' ? 'Bleeding / Spotting' : 'Menstrual Flow'}
        </span>
        <div className="chip-group">
          {FLOW_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="chip"
              aria-pressed={draft.flow === opt.id}
              onClick={() => setDraft((prev) => ({ ...prev, flow: opt.id }))}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Symptoms */}
      <section className="field-group">
        <span className="field-label">Physical Symptoms</span>
        <div className="chip-group">
          {SYMPTOM_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="chip"
              aria-pressed={draft.symptoms.includes(opt.id)}
              onClick={() => toggleSymptom(opt.id)}
            >
              {opt.label}
            </button>
          ))}
          {customSymptoms.map((label) => (
            <button
              key={`cs-${label}`}
              type="button"
              className="chip"
              aria-pressed={(draft.customSymptoms ?? []).includes(label)}
              onClick={() => toggleCustomSymptom(label)}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <input
            type="text"
            className="input-control"
            style={{ minHeight: 40, fontSize: '0.84rem' }}
            placeholder="Add custom symptom (e.g. Migraine aura)"
            value={newSymptomText}
            onChange={(e) => setNewSymptomText(e.target.value)}
          />
          <button
            type="button"
            className="btn-secondary"
            style={{ minHeight: 40, padding: '0 12px', fontSize: '0.82rem', flexShrink: 0 }}
            onClick={() => {
              const trimmed = newSymptomText.trim();
              if (!trimmed) return;
              onAddCustomSymptom(trimmed);
              if (!(draft.customSymptoms ?? []).includes(trimmed)) {
                toggleCustomSymptom(trimmed);
              }
              setNewSymptomText('');
            }}
          >
            + Add
          </button>
        </div>
      </section>

      {/* Moods */}
      <section className="field-group">
        <span className="field-label">Mood &amp; Energy</span>
        <div className="chip-group">
          {MOOD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="chip chip--sage"
              aria-pressed={draft.moods.includes(opt.id)}
              onClick={() => toggleMood(opt.id)}
            >
              {opt.label}
            </button>
          ))}
          {customMoods.map((label) => (
            <button
              key={`cm-${label}`}
              type="button"
              className="chip chip--sage"
              aria-pressed={(draft.customMoods ?? []).includes(label)}
              onClick={() => toggleCustomMood(label)}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <input
            type="text"
            className="input-control"
            style={{ minHeight: 40, fontSize: '0.84rem' }}
            placeholder="Add custom mood (e.g. Focused)"
            value={newMoodText}
            onChange={(e) => setNewMoodText(e.target.value)}
          />
          <button
            type="button"
            className="btn-secondary"
            style={{ minHeight: 40, padding: '0 12px', fontSize: '0.82rem', flexShrink: 0 }}
            onClick={() => {
              const trimmed = newMoodText.trim();
              if (!trimmed) return;
              onAddCustomMood(trimmed);
              if (!(draft.customMoods ?? []).includes(trimmed)) {
                toggleCustomMood(trimmed);
              }
              setNewMoodText('');
            }}
          >
            + Add
          </button>
        </div>
      </section>

      {/* Cervical Mucus & Fertility Cues (hidden in Simple / Teen Mode) */}
      {!simpleMode ? (
        <section className="field-group">
          <span className="field-label">Cervical Mucus / Discharge</span>
          <div className="chip-group">
            {MUCUS_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="chip chip--sage"
                aria-pressed={draft.mucus === opt.id}
                onClick={() => setDraft((prev) => ({ ...prev, mucus: opt.id }))}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {mode !== 'pregnancy' && !simpleMode ? (
        <section className="field-group">
          <span className="field-label">Ovulation (LH) Strip Test</span>
          <p className="field-hint">
            Logging a Peak LH test automatically sharpens this cycle&apos;s estimated ovulation date.
          </p>
          <div className="chip-group">
            {LH_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="chip chip--sage"
                aria-pressed={draft.lhTest === opt.id}
                onClick={() => setDraft((prev) => ({ ...prev, lhTest: opt.id }))}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* BBT, Sleep, Hydration */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 10,
        }}
      >
        <label className="field-group">
          <span className="field-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Thermometer size={14} />
            BBT (°{tempUnit})
          </span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            placeholder={tempUnit === 'F' ? '97.6' : '36.45'}
            className="input-control tabular"
            value={bbtInput}
            onChange={(e) => setBbtInput(e.target.value)}
          />
        </label>

        <label className="field-group">
          <span className="field-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Moon size={14} />
            Sleep (hrs)
          </span>
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            max="24"
            placeholder="7.5"
            className="input-control tabular"
            value={sleepInput}
            onChange={(e) => setSleepInput(e.target.value)}
          />
        </label>

        <label className="field-group">
          <span className="field-label">Water (cups)</span>
          <input
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            max="30"
            placeholder="8"
            className="input-control tabular"
            value={waterInput}
            onChange={(e) => setWaterInput(e.target.value)}
          />
        </label>
      </section>

      {/* Intimacy Toggle (hidden in Simple / Teen Mode) */}
      {!simpleMode ? (
        <div className="chip-group">
          <button
            type="button"
            className="chip chip--sage"
            aria-pressed={Boolean(draft.sexLogged)}
            onClick={() => setDraft((prev) => ({ ...prev, sexLogged: !prev.sexLogged }))}
          >
            <Heart size={15} />
            {draft.sexLogged ? 'Intimacy logged' : 'Log intimacy'}
          </button>
        </div>
      ) : null}

      {/* Private Notes */}
      <label className="field-group">
        <span className="field-label">Private Notes</span>
        <textarea
          className="input-control textarea-control"
          placeholder="Optional notes for yourself or your clinician..."
          value={draft.notes}
          onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
        />
      </label>
    </ModalDialog>
  );
}
