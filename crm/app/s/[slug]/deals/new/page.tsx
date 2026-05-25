'use client';

import { useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WizardProgress } from '@/components/deals/wizard-progress';
import { WizardStepContacts } from '@/components/deals/wizard-step-contacts';
import { WizardStepPipeline } from '@/components/deals/wizard-step-pipeline';
import { WizardStepDetails } from '@/components/deals/wizard-step-details';
import { WizardStepNotes } from '@/components/deals/wizard-step-notes';
import { toast } from 'sonner';

type ContactResult = { id: string; name: string; email: string | null; leadType: 'rental' | 'buyer' | 'seller' };

export default function NewDealPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const searchParams = useSearchParams();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedContacts, setSelectedContacts] = useState<ContactResult[]>([]);
  const [pipelineType, setPipelineType] = useState<'rental' | 'buyer' | 'seller'>('rental');
  const [stageId, setStageId] = useState(searchParams.get('stageId') ?? '');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [value, setValue] = useState('');
  const [commissionRate, setCommissionRate] = useState('');
  const [probability, setProbability] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [stageError, setStageError] = useState('');
  const [titleError, setTitleError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleNext() {
    if (step === 1) {
      // Only auto-update pipelineType if contacts were actually selected.
      if (selectedContacts.length > 0) {
        const hasBuyer = selectedContacts.some(c => c.leadType === 'buyer');
        const hasSeller = selectedContacts.some(c => c.leadType === 'seller');
        const detected = hasBuyer ? 'buyer' : hasSeller ? 'seller' : 'rental';
        setPipelineType(detected);
      }
      setStep(2);
    } else if (step === 2) {
      if (!stageId) {
        setStageError('Please select a stage');
        return;
      }
      setStep(3);
    } else if (step === 3) {
      if (!title.trim()) {
        setTitleError('Title is required');
        return;
      }
      setStep(4);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          title: title.trim(),
          stageId,
          priority,
          status: 'active',
          ...(value && { value: parseFloat(value) }),
          ...(commissionRate && { commissionRate: parseFloat(commissionRate) }),
          ...(probability && { probability: parseInt(probability, 10) }),
          ...(closeDate && { closeDate }),
          ...(address.trim() && { address: address.trim() }),
          ...(description.trim() && { description: description.trim() }),
          contactIds: selectedContacts.map(c => c.id),
        }),
      });
      if (res.ok) {
        const newDeal = await res.json();
        router.push(`/s/${slug}/deals/${newDeal.id}`);
      } else {
        const body = await res.json().catch(() => ({}));
        const message = (body as { error?: string }).error ?? "Couldn't create that deal.";
        setSubmitError(message);
        toast.error(message);
      }
    } catch {
      const message = "Couldn't create that deal. Try again.";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  // Only surface a detected pipeline type when at least one contact is selected.
  // With no contacts, we have nothing to base the suggestion on.
  const detectedPipelineType = selectedContacts.length > 0
    ? (selectedContacts.some(c => c.leadType === 'buyer')
        ? 'buyer'
        : selectedContacts.some(c => c.leadType === 'seller')
        ? 'seller'
        : 'rental')
    : null;

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] max-w-lg mx-auto px-4 py-6">
      {/* Top bar */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.push(`/s/${slug}/deals`)}
          aria-label="Back to deals"
          className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-semibold">New Deal</h1>
      </div>

      {/* Step progress */}
      <div className="mb-8">
        <WizardProgress
          steps={['People', 'Pipeline', 'Details', 'Notes']}
          currentStep={step}
          onStepClick={(s) => { if (s < step) setStep(s as 1 | 2 | 3 | 4); }}
        />
      </div>

      {/* Step content */}
      <div className="flex-1">
        {step === 1 && (
          <WizardStepContacts
            slug={slug}
            selectedContacts={selectedContacts}
            onSelectionChange={setSelectedContacts}
          />
        )}
        {step === 2 && (
          <WizardStepPipeline
            slug={slug}
            pipelineType={pipelineType}
            onPipelineChange={(type: 'rental' | 'buyer' | 'seller') => { setPipelineType(type); setStageId(''); setStageError(''); }}
            stageId={stageId}
            onStageChange={(id) => { setStageId(id); if (id) setStageError(''); }}
            detectedPipelineType={detectedPipelineType}
            error={stageError}
          />
        )}
        {step === 3 && (
          <WizardStepDetails
            title={title}
            onTitleChange={(v) => { setTitle(v); if (v.trim()) setTitleError(''); }}
            priority={priority}
            onPriorityChange={setPriority}
            value={value}
            onValueChange={setValue}
            commissionRate={commissionRate}
            onCommissionRateChange={setCommissionRate}
            probability={probability}
            onProbabilityChange={setProbability}
            closeDate={closeDate}
            onCloseDateChange={setCloseDate}
            address={address}
            onAddressChange={setAddress}
            titleError={titleError}
          />
        )}
        {step === 4 && (
          <WizardStepNotes
            description={description}
            onDescriptionChange={setDescription}
          />
        )}
      </div>

      {/* Navigation footer */}
      {submitError && (
        <p className="text-sm text-destructive mt-4">{submitError}</p>
      )}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
        {step > 1 ? (
          <Button variant="outline" onClick={() => setStep((step - 1) as 1 | 2 | 3 | 4)}>
            Back
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => router.push(`/s/${slug}/deals`)}>
            Cancel
          </Button>
        )}

        {step < 4 ? (
          <Button onClick={handleNext}>
            {step === 1 && selectedContacts.length === 0 ? 'Skip' : 'Next'}
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting} className="min-w-[120px]">
            {submitting ? (
              <><Loader2 size={14} className="mr-1.5 animate-spin" />Creating…</>
            ) : (
              'Create Deal'
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
