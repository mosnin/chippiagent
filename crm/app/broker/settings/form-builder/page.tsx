'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  Save,
  RotateCcw,
  Eye,
  Pencil,
  Home,
  Key,
  Send,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { FormBuilder } from '@/components/form-builder';
import { FormPreview } from '@/components/form-builder/form-preview';
import { TEMPLATES } from '@/components/form-builder/templates';
import type { IntakeFormConfig } from '@/components/form-builder/types';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

type LeadType = 'rental' | 'buyer';

export default function BrokerFormBuilderPage() {
  // ── Primary tab: which form are we editing ──
  const [activeLeadType, setActiveLeadType] = useState<LeadType>('rental');

  // ── Per-form state ──
  const [rentalConfig, setRentalConfig] = useState<IntakeFormConfig>(deepClone(TEMPLATES.rental.config));
  const [buyerConfig, setBuyerConfig] = useState<IntakeFormConfig>(deepClone(TEMPLATES.buyer.config));
  const [rentalHasChanges, setRentalHasChanges] = useState(false);
  const [buyerHasChanges, setBuyerHasChanges] = useState(false);
  const [rentalHasSavedConfig, setRentalHasSavedConfig] = useState(false);
  const [buyerHasSavedConfig, setBuyerHasSavedConfig] = useState(false);
  const rentalSavedRef = useRef<string>('');
  const buyerSavedRef = useRef<string>('');

  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<string>('builder');
  const [memberCount, setMemberCount] = useState<number | null>(null);

  // Load existing configs
  useEffect(() => {
    fetch('/api/broker/form-config')
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then((data: {
        brokerageId: string;
        rentalFormConfig: IntakeFormConfig | null;
        buyerFormConfig: IntakeFormConfig | null;
      }) => {
        // Rental config
        if (data.rentalFormConfig?.sections) {
          setRentalConfig(data.rentalFormConfig);
          setRentalHasSavedConfig(true);
          rentalSavedRef.current = JSON.stringify(data.rentalFormConfig);
        } else {
          const defaultConfig = deepClone(TEMPLATES.rental.config);
          setRentalConfig(defaultConfig);
          setRentalHasSavedConfig(false);
          rentalSavedRef.current = JSON.stringify(defaultConfig);
        }

        // Buyer config
        if (data.buyerFormConfig?.sections) {
          setBuyerConfig(data.buyerFormConfig);
          setBuyerHasSavedConfig(true);
          buyerSavedRef.current = JSON.stringify(data.buyerFormConfig);
        } else {
          const defaultConfig = deepClone(TEMPLATES.buyer.config);
          setBuyerConfig(defaultConfig);
          setBuyerHasSavedConfig(false);
          buyerSavedRef.current = JSON.stringify(defaultConfig);
        }
      })
      .catch(() => {
        const defaultRental = deepClone(TEMPLATES.rental.config);
        const defaultBuyer = deepClone(TEMPLATES.buyer.config);
        setRentalConfig(defaultRental);
        setBuyerConfig(defaultBuyer);
        rentalSavedRef.current = JSON.stringify(defaultRental);
        buyerSavedRef.current = JSON.stringify(defaultBuyer);
      })
      .finally(() => setLoading(false));
  }, []);

  // Fetch member count for the "Push to Members" section
  useEffect(() => {
    fetch('/api/broker/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.memberCount != null) {
          setMemberCount(data.memberCount);
        }
      })
      .catch(() => {
        // Silently fail
      });
  }, []);

  // ── Active config accessor ──
  const config = activeLeadType === 'rental' ? rentalConfig : buyerConfig;
  const hasChanges = activeLeadType === 'rental' ? rentalHasChanges : buyerHasChanges;
  const hasSavedConfig = activeLeadType === 'rental' ? rentalHasSavedConfig : buyerHasSavedConfig;
  const anyHasChanges = rentalHasChanges || buyerHasChanges;
  const eitherHasSavedConfig = rentalHasSavedConfig || buyerHasSavedConfig;

  const handleConfigChange = useCallback((newConfig: IntakeFormConfig) => {
    if (activeLeadType === 'rental') {
      setRentalConfig(newConfig);
      setRentalHasChanges(JSON.stringify(newConfig) !== rentalSavedRef.current);
    } else {
      setBuyerConfig(newConfig);
      setBuyerHasChanges(JSON.stringify(newConfig) !== buyerSavedRef.current);
    }
  }, [activeLeadType]);

  // Use refs so handleSave always reads the latest config without needing
  // rentalConfig/buyerConfig in the dependency array (avoids stale closures
  // when React batches a FormBuilder onChange with the save click).
  const rentalConfigRef = useRef(rentalConfig);
  rentalConfigRef.current = rentalConfig;
  const buyerConfigRef = useRef(buyerConfig);
  buyerConfigRef.current = buyerConfig;

  const handleSave = useCallback(async () => {
    setSaving(true);
    const currentConfig = activeLeadType === 'rental' ? rentalConfigRef.current : buyerConfigRef.current;
    try {
      const res = await fetch('/api/broker/form-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadType: activeLeadType, formConfig: currentConfig }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save form configuration.');
      }

      if (activeLeadType === 'rental') {
        setRentalHasSavedConfig(true);
        setRentalHasChanges(false);
        rentalSavedRef.current = JSON.stringify(currentConfig);
      } else {
        setBuyerHasSavedConfig(true);
        setBuyerHasChanges(false);
        buyerSavedRef.current = JSON.stringify(currentConfig);
      }

      toast.success(`Brokerage ${activeLeadType === 'rental' ? 'rental' : 'buyer'} form saved successfully.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }, [activeLeadType]);

  const handleReset = useCallback(async () => {
    const label = activeLeadType === 'rental' ? 'rental' : 'buyer';
    if (
      !confirm(
        `Reset the ${label} form to the standard Chippi default? Your custom brokerage form will be removed.`,
      )
    )
      return;
    try {
      const res = await fetch('/api/broker/form-config', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadType: activeLeadType }),
      });
      if (!res.ok) {
        throw new Error('Failed to reset form configuration.');
      }
      const templateKey = activeLeadType === 'rental' ? 'rental' : 'buyer';
      const defaultConfig = deepClone(TEMPLATES[templateKey].config);
      if (activeLeadType === 'rental') {
        setRentalConfig(defaultConfig);
        setRentalHasSavedConfig(false);
        setRentalHasChanges(false);
        rentalSavedRef.current = JSON.stringify(defaultConfig);
      } else {
        setBuyerConfig(defaultConfig);
        setBuyerHasSavedConfig(false);
        setBuyerHasChanges(false);
        buyerSavedRef.current = JSON.stringify(defaultConfig);
      }
      toast.success(`Brokerage ${label} form reset to the standard Chippi default.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }, [activeLeadType]);

  const handlePushToMembers = useCallback(async () => {
    const memberLabel = memberCount != null ? `${memberCount} member${memberCount === 1 ? '' : 's'}` : 'all member realtors';
    if (
      !confirm(
        `This will override BOTH rental and buyer form settings for ${memberLabel} with the brokerage forms. Their formConfigSource will be set to "brokerage". Continue?`,
      )
    )
      return;
    setPushing(true);
    try {
      const res = await fetch('/api/broker/form-config/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rentalFormConfig: rentalConfigRef.current,
          buyerFormConfig: buyerConfigRef.current,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to push form to members.');
      }
      toast.success(`Both rental and buyer forms pushed to ${memberLabel}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setPushing(false);
    }
  }, [memberCount]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded-lg w-40" />
        <div className="h-64 bg-muted rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Brokerage Intake Form</h1>
            <p className="text-muted-foreground text-sm">
              Design standard rental and buyer intake forms for your brokerage and push them to all members.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {hasChanges ? (
              <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 gap-1.5">
                <AlertCircle size={12} />
                Unsaved changes
              </Badge>
            ) : hasSavedConfig ? (
              <Badge variant="outline" className="text-xs text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 gap-1.5">
                <CheckCircle2 size={12} />
                Saved
              </Badge>
            ) : null}
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw size={14} className="mr-1.5" /> Reset to Default
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !hasChanges}>
              {saving ? (
                <><Loader2 size={14} className="mr-1.5 animate-spin" /> Saving...</>
              ) : (
                <><Save size={14} className="mr-1.5" /> Save Form</>
              )}
            </Button>
          </div>
        </div>

        {/* ── Primary tabs: Rental Form / Buyer Form ── */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveLeadType('rental')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
              activeLeadType === 'rental'
                ? 'border-orange-400 dark:border-orange-500/50 bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300 shadow-sm'
                : 'border-border text-muted-foreground hover:border-muted-foreground/30'
            }`}
          >
            <Home size={16} />
            Rental Form
            {rentalHasChanges && (
              <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveLeadType('buyer')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
              activeLeadType === 'buyer'
                ? 'border-blue-400 dark:border-blue-500/50 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 shadow-sm'
                : 'border-border text-muted-foreground hover:border-muted-foreground/30'
            }`}
          >
            <Key size={16} />
            Buyer Form
            {buyerHasChanges && (
              <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
            )}
          </button>
        </div>

        {/* ── Active form status bar ── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Pencil size={16} className="text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-semibold">
                  Editing: {activeLeadType === 'rental' ? 'Rental Application' : 'Buyer Inquiry'}
                </span>
              </div>
              {hasSavedConfig ? (
                <Badge variant="secondary" className="text-[10px]">Custom</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">Not configured</Badge>
              )}
            </div>
          </div>

          {!hasSavedConfig && (
            <div className="px-5 py-2.5 border-t border-border bg-blue-50/50 dark:bg-blue-500/5 flex items-start gap-2">
              <Info size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                No custom brokerage {activeLeadType === 'rental' ? 'rental' : 'buyer'} form is configured yet. Customize the fields below and save to create your brokerage standard form.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Push to members ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold">Push to All Members</p>
            <p className="text-xs text-muted-foreground">
              Apply both rental and buyer forms to {memberCount != null ? (
                <span className="font-medium">{memberCount} member{memberCount === 1 ? '' : 's'}</span>
              ) : (
                'all member realtors'
              )}. Their individual form settings will be overridden.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePushToMembers}
            disabled={pushing || anyHasChanges || !eitherHasSavedConfig}
            className="flex-shrink-0"
          >
            {pushing ? (
              <><Loader2 size={14} className="mr-1.5 animate-spin" /> Pushing...</>
            ) : (
              <><Send size={14} className="mr-1.5" /> Push to Members</>
            )}
          </Button>
        </div>
        {anyHasChanges && (
          <div className="px-5 py-2 border-t border-border bg-amber-50 dark:bg-amber-950/20 flex items-start gap-2">
            <AlertCircle size={12} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 dark:text-amber-400">Save your changes before pushing to members.</p>
          </div>
        )}
        {!eitherHasSavedConfig && !anyHasChanges && (
          <div className="px-5 py-2 border-t border-border bg-blue-50/50 dark:bg-blue-500/5 flex items-start gap-2">
            <Info size={12} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-700 dark:text-blue-300">Save a custom brokerage form first before pushing to members.</p>
          </div>
        )}
      </div>

      {/* ── Builder / Preview sub-tabs ── */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList>
          <TabsTrigger value="builder">
            <Pencil size={14} className="mr-1.5" /> Builder
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye size={14} className="mr-1.5" /> Preview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="builder">
          <FormBuilder config={config} onChange={handleConfigChange} />
        </TabsContent>

        <TabsContent value="preview">
          <FormPreview config={config} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
