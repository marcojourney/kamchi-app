import React from 'react';
import {
  InstallmentsWorkspace,
  SAMPLE_MARKETCHAIN_QR_ORDER,
  SAMPLE_MARKETCHAIN_QR_PAYLOAD,
} from '../../installments';

export { SAMPLE_MARKETCHAIN_QR_ORDER, SAMPLE_MARKETCHAIN_QR_PAYLOAD };

interface InstallmentsShellViewProps {
  mode: 'installments' | 'marketchain_import';
  openCreateSeq?: number;
  activeInstallmentCount?: number;
  onOpenImportTab: () => void;
  onOpenInstallmentsTab: () => void;
  onActiveCountChange?: (count: number) => void;
}

export const InstallmentsShellView: React.FC<InstallmentsShellViewProps> = ({
  mode,
  openCreateSeq,
  onOpenImportTab,
  onOpenInstallmentsTab,
  onActiveCountChange,
}) => {
  return (
    <InstallmentsWorkspace
      mode={mode}
      openCreateSeq={openCreateSeq}
      onOpenImportTab={onOpenImportTab}
      onOpenInstallmentsTab={onOpenInstallmentsTab}
      onActiveCountChange={onActiveCountChange}
    />
  );
};
