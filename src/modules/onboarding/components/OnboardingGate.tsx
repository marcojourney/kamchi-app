import React from 'react';
import { AppSkeleton } from '../../../components/AppSkeleton';
import {
  OnboardingStateProvider,
  useOnboardingContext,
} from '../context/OnboardingContext';
import { OnboardingFlow } from './OnboardingFlow';

interface OnboardingGateProps {
  analyticsConsent?: boolean;
  children: React.ReactNode;
}

const OnboardingGateInner: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { loaded, state, saveDraft, completeOnboarding } = useOnboardingContext();

  if (!loaded) {
    return <AppSkeleton />;
  }

  if (!state.completed) {
    return (
      <OnboardingFlow
        initialState={state}
        onSaveDraft={saveDraft}
        onComplete={completeOnboarding}
      />
    );
  }

  return <>{children}</>;
};

export const OnboardingGate: React.FC<OnboardingGateProps> = ({
  analyticsConsent = false,
  children,
}) => {
  return (
    <OnboardingStateProvider analyticsConsent={analyticsConsent}>
      <OnboardingGateInner>{children}</OnboardingGateInner>
    </OnboardingStateProvider>
  );
};
