import {useCallback, useEffect, useId, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {X} from 'lucide-react';

type ModalProps = {
    title: string;
    description?: string;
    children: ReactNode;
    footer?: ReactNode | ((requestClose: () => void) => ReactNode);
    className?: string;
    onClose: () => void;
    closeOnBackdrop?: boolean;
};

const MODAL_EXIT_DURATION = 180;

export function Modal({
    title,
    description,
    children,
    footer,
    className = '',
    onClose,
    closeOnBackdrop = true,
}: ModalProps) {
    const titleId = useId();
    const descriptionId = useId();
    const dialogRef = useRef<HTMLElement | null>(null);
    const closeTimerRef = useRef<number | null>(null);
    const closingRef = useRef(false);
    const onCloseRef = useRef(onClose);
    const [closing, setClosing] = useState(false);
    onCloseRef.current = onClose;

    const requestClose = useCallback(() => {
        if (closingRef.current) {
            return;
        }
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            onCloseRef.current();
            return;
        }
        closingRef.current = true;
        setClosing(true);
        closeTimerRef.current = window.setTimeout(() => onCloseRef.current(), MODAL_EXIT_DURATION);
    }, []);

    useEffect(() => {
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const dialog = dialogRef.current;
        const focusableSelector = [
            '[data-modal-autofocus]',
            'input:not([disabled])',
            'textarea:not([disabled])',
            '[role="combobox"]:not([aria-disabled="true"])',
            'button:not([disabled]):not(.modal-close)',
            '.modal-close',
        ].join(',');
        const initialFocus = dialog?.querySelector<HTMLElement>('[data-modal-autofocus]')
            || dialog?.querySelector<HTMLElement>('.modal-body input:not([disabled]), .modal-body textarea:not([disabled]), .modal-body [role="combobox"]:not([aria-disabled="true"]), .modal-body button:not([disabled])')
            || dialog?.querySelector<HTMLElement>('.modal-close');
        initialFocus?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented) {
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                requestClose();
                return;
            }
            if (event.key !== 'Tab' || !dialog) {
                return;
            }
            const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
                .filter((element) => element.offsetParent !== null);
            if (!focusable.length) {
                event.preventDefault();
                dialog.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            if (closeTimerRef.current) {
                window.clearTimeout(closeTimerRef.current);
            }
            previousFocus?.focus();
        };
    }, [requestClose]);

    return (
        <div
            className={`modal-backdrop ${closing ? 'closing' : ''}`}
            onMouseDown={(event) => {
                if (closeOnBackdrop && event.currentTarget === event.target) {
                    requestClose();
                }
            }}
        >
            <section
                ref={dialogRef}
                className={`modal-dialog ${className} ${closing ? 'closing' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={description ? descriptionId : undefined}
                tabIndex={-1}
            >
                <header className="modal-head">
                    <div>
                        <h2 id={titleId}>{title}</h2>
                        {description && <span id={descriptionId}>{description}</span>}
                    </div>
                    <button className="icon-button modal-close" onClick={requestClose} type="button" title="关闭">
                        <X size={15}/>
                    </button>
                </header>
                <div className="modal-body">{children}</div>
                {footer && <footer className="modal-footer">{typeof footer === 'function' ? footer(requestClose) : footer}</footer>}
            </section>
        </div>
    );
}
