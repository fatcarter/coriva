import {createPortal} from 'react-dom';
import {useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {CSSProperties, KeyboardEvent as ReactKeyboardEvent} from 'react';
import {Check, ChevronDown} from 'lucide-react';

export type SelectOption = {
    value: string;
    label: string;
    disabled?: boolean;
};

type CustomSelectProps = {
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
    ariaLabel: string;
    placeholder?: string;
    disabled?: boolean;
};

const MENU_GAP = 6;
const MENU_MAX_HEIGHT = 240;

export function CustomSelect({
    value,
    options,
    onChange,
    ariaLabel,
    placeholder = '请选择',
    disabled = false,
}: CustomSelectProps) {
    const listboxId = useId();
    const rootRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
    const selectedIndex = useMemo(() => options.findIndex((option) => option.value === value), [options, value]);
    const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

    const firstEnabledIndex = useCallback(() => options.findIndex((option) => !option.disabled), [options]);

    const moveActive = useCallback((direction: 1 | -1) => {
        if (!options.length) {
            return;
        }
        let next = activeIndex;
        for (let offset = 0; offset < options.length; offset += 1) {
            next = (next + direction + options.length) % options.length;
            if (!options[next].disabled) {
                setActiveIndex(next);
                return;
            }
        }
    }, [activeIndex, options]);

    const openMenu = useCallback(() => {
        if (disabled) {
            return;
        }
        setActiveIndex(selectedIndex >= 0 && !options[selectedIndex]?.disabled ? selectedIndex : firstEnabledIndex());
        setOpen(true);
    }, [disabled, firstEnabledIndex, options, selectedIndex]);

    const selectOption = useCallback((index: number) => {
        const option = options[index];
        if (!option || option.disabled) {
            return;
        }
        onChange(option.value);
        setOpen(false);
        triggerRef.current?.focus();
    }, [onChange, options]);

    const updatePosition = useCallback(() => {
        const trigger = triggerRef.current;
        if (!trigger) {
            return;
        }
        const rect = trigger.getBoundingClientRect();
        const estimatedHeight = Math.min(options.length * 36 + 8, MENU_MAX_HEIGHT);
        const openAbove = window.innerHeight - rect.bottom < estimatedHeight + MENU_GAP && rect.top > estimatedHeight;
        setMenuStyle({
            left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
            top: openAbove ? Math.max(8, rect.top - estimatedHeight - MENU_GAP) : rect.bottom + MENU_GAP,
            width: rect.width,
        });
    }, [options.length]);

    useLayoutEffect(() => {
        if (open) {
            updatePosition();
        }
    }, [open, updatePosition]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
                setOpen(false);
            }
        };
        const handleViewportChange = () => updatePosition();
        document.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('resize', handleViewportChange);
        window.addEventListener('scroll', handleViewportChange, true);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('resize', handleViewportChange);
            window.removeEventListener('scroll', handleViewportChange, true);
        };
    }, [open, updatePosition]);

    useEffect(() => {
        menuRef.current?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)?.scrollIntoView({block: 'nearest'});
    }, [activeIndex]);

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            if (!open) {
                openMenu();
            } else {
                moveActive(1);
            }
            break;
        case 'ArrowUp':
            event.preventDefault();
            if (!open) {
                openMenu();
            } else {
                moveActive(-1);
            }
            break;
        case 'Home':
            if (open) {
                event.preventDefault();
                setActiveIndex(firstEnabledIndex());
            }
            break;
        case 'End':
            if (open) {
                event.preventDefault();
                const reversedIndex = [...options].reverse().findIndex((option) => !option.disabled);
                setActiveIndex(reversedIndex < 0 ? -1 : options.length - reversedIndex - 1);
            }
            break;
        case 'Enter':
        case ' ':
            event.preventDefault();
            if (open && activeIndex >= 0) {
                selectOption(activeIndex);
            } else {
                openMenu();
            }
            break;
        case 'Escape':
            if (open) {
                event.preventDefault();
                setOpen(false);
            }
            break;
        case 'Tab':
            setOpen(false);
            break;
        }
    };

    return (
        <div className="custom-select" ref={rootRef}>
            <button
                ref={triggerRef}
                className={`custom-select-trigger ${open ? 'open' : ''}`}
                type="button"
                role="combobox"
                aria-label={ariaLabel}
                aria-controls={listboxId}
                aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-disabled={disabled}
                disabled={disabled}
                onClick={() => open ? setOpen(false) : openMenu()}
                onKeyDown={handleKeyDown}
            >
                <span className={selectedOption ? '' : 'placeholder'}>{selectedOption?.label || placeholder}</span>
                <ChevronDown size={15}/>
            </button>
            {open && createPortal(
                <div
                    ref={menuRef}
                    id={listboxId}
                    className="custom-select-menu"
                    role="listbox"
                    aria-label={ariaLabel}
                    style={menuStyle}
                >
                    {options.map((option, index) => (
                        <button
                            id={`${listboxId}-option-${index}`}
                            className={`custom-select-option ${index === activeIndex ? 'active' : ''} ${option.value === value ? 'selected' : ''}`}
                            type="button"
                            role="option"
                            aria-selected={option.value === value}
                            disabled={option.disabled}
                            data-option-index={index}
                            key={option.value}
                            onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectOption(index)}
                        >
                            <span>{option.label}</span>
                            {option.value === value && <Check size={14}/>}
                        </button>
                    ))}
                </div>,
                document.body,
            )}
        </div>
    );
}
