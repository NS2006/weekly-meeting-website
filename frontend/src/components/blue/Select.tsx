import { useId, type FocusEventHandler, type KeyboardEventHandler, type PointerEventHandler } from 'react';

// BLUE3 BSelect → BlueSelect (no plugin template yet; props: value, onChange, options, placeholder).
// A styled native <select>: keyboard, screen reader and mobile pickers work without extra code.
export interface BlueSelectOption<V extends string> {
  value: V;
  label: string;
}

export interface BlueSelectProps<V extends string> {
  value: V;
  onChange: (value: V) => void;
  options: BlueSelectOption<V>[];
  label?: string;
  /** Accessible name when there is no visible label (for example in a table cell). */
  ariaLabel?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  /** For lists that act on a pick (hooks/useJumpSelect): to tell keyboard steps from a choice. */
  onKeyDown?: KeyboardEventHandler<HTMLSelectElement>;
  onKeyUp?: KeyboardEventHandler<HTMLSelectElement>;
  onPointerDown?: PointerEventHandler<HTMLSelectElement>;
  onBlur?: FocusEventHandler<HTMLSelectElement>;
}

export function BlueSelect<V extends string>({
  value,
  onChange,
  options,
  label,
  ariaLabel,
  disabled,
  size = 'md',
  className = '',
  onKeyDown,
  onKeyUp,
  onPointerDown,
  onBlur,
}: BlueSelectProps<V>) {
  const id = useId();
  return (
    <div className={`blue-select blue-select--${size} ${className}`.trim()}>
      {label ? (
        <label className="blue-input__label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <select
        id={id}
        className="blue-select__field"
        value={value}
        aria-label={label ? undefined : ariaLabel}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as V)}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onPointerDown={onPointerDown}
        onBlur={onBlur}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
