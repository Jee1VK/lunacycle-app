import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalDialogProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  lightDismiss?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Native <dialog> wrapper following modern-web-guidance `dialog`,
 * `light-dismiss-a-dialog`, and `prevent-page-scroll-under-modal-dialog`:
 * - Opened exclusively via showModal() (no manual role="dialog" or aria-modal)
 * - Uses declarative closedby="any" with a coordinate-checked pointer fallback
 * - Resets dialog.returnValue on close so stale return values never leak
 */
export function ModalDialog({
  open,
  title,
  subtitle,
  onClose,
  lightDismiss = true,
  children,
  footer,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onCloseRef.current();
    };

    dialog.addEventListener('close', handleClose);

    // Fallback for browsers without native <dialog closedby="any"> (e.g. Safari)
    let cleanupLightDismiss: (() => void) | undefined;
    if (lightDismiss && !('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isOutside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e) && dialog.open) {
          dialog.close();
        }
        pressedOutside = false;
      };
      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
      cleanupLightDismiss = () => {
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      cleanupLightDismiss?.();
    };
  }, [lightDismiss]);

  return (
    <dialog
      ref={dialogRef}
      className="luna-dialog"
      aria-labelledby={titleId}
      {...({ closedby: lightDismiss ? 'any' : 'closerequest' } as Record<string, string>)}
    >
      <div className="dialog-header">
        <div>
          <h2 id={titleId} className="dialog-title">
            {title}
          </h2>
          {subtitle ? <p className="section-caption">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
      {footer ? <div className="dialog-footer">{footer}</div> : null}
    </dialog>
  );
}
