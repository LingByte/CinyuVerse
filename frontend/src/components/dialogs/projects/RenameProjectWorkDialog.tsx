import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { TextInput } from '@astryxdesign/core/TextInput';
import type { Project } from 'shared/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { defineModal, getErrorMessage } from '@/lib/modals';

export interface RenameProjectWorkDialogProps {
  projectId: string;
  currentName: string;
}

export type RenameProjectWorkDialogResult =
  | { status: 'renamed'; project: Project }
  | { status: 'canceled' };

const textInputSurfaceStyle = {
  backgroundColor: 'var(--surface-control)',
  borderRadius: 'var(--radius)',
};

const RenameProjectWorkDialogImpl =
  NiceModal.create<RenameProjectWorkDialogProps>(
    ({ projectId, currentName }) => {
      const { t } = useTranslation(['dialogs', 'common']);
      const modal = useModal();
      const [name, setName] = useState(currentName);
      const [error, setError] = useState('');

      const { renameProjectWork } = useProjectMutations({
        onRenameSuccess: (project) => {
          modal.resolve({
            status: 'renamed',
            project,
          } as RenameProjectWorkDialogResult);
          modal.hide();
        },
        onRenameError: (err) => {
          setError(
            getErrorMessage(err) || t('projectForm.renameFailed')
          );
        },
      });

      useEffect(() => {
        setName(currentName);
        setError('');
      }, [currentName, modal.visible]);

      const handleCancel = () => {
        modal.resolve({ status: 'canceled' } as RenameProjectWorkDialogResult);
        modal.hide();
      };

      const handleConfirm = () => {
        const trimmed = name.trim();
        if (!trimmed) {
          setError(t('projectForm.renameNameRequired'));
          return;
        }
        if (trimmed === currentName.trim()) {
          handleCancel();
          return;
        }

        setError('');
        renameProjectWork.mutate({
          projectId,
          data: { new_name: trimmed },
        });
      };

      const isBusy = renameProjectWork.isPending;

      return (
        <Dialog
          open={modal.visible}
          onOpenChange={(open) => {
            if (!open && !isBusy) {
              handleCancel();
            }
          }}
          className="sm:max-w-md"
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('projectForm.renameTitle')}</DialogTitle>
              <DialogDescription>
                {t('projectForm.renameDescription')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('projectForm.renameNameLabel')}</Label>
                <TextInput
                  label={t('projectForm.renameNameLabel')}
                  isLabelHidden
                  value={name}
                  onChange={setName}
                  placeholder={t('projectForm.renamePlaceholder')}
                  isDisabled={isBusy}
                  hasAutoFocus
                  width="100%"
                  className="[&_input]:text-sm"
                  style={textInputSurfaceStyle}
                />
              </div>
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isBusy}
              >
                {t('common:cancel')}
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={isBusy}
              >
                {t('projectForm.renameSubmit')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
  );

export const RenameProjectWorkDialog = defineModal<
  RenameProjectWorkDialogProps,
  RenameProjectWorkDialogResult
>(RenameProjectWorkDialogImpl);
