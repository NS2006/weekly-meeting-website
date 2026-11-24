import { useEffect, useState } from 'react';
import { BlueInput } from './blue';

/**
 * A search box that sends its text 300 ms after the last key press (one server request per pause, not per letter).
 * `value` is the search in use; when it changes from outside (for example "Clear filters"), the box follows.
 */
export function SearchField({
  value,
  onCommit,
  label,
  placeholder,
  className,
}: {
  value: string;
  onCommit: (text: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(value);

  useEffect(() => setText(value), [value]);

  useEffect(() => {
    if (text.trim() === value) return;
    const timer = setTimeout(() => onCommit(text.trim()), 300);
    return () => clearTimeout(timer);
    // Only typing starts the timer; `value` catching up must not start another.
  }, [text]);

  return (
    <BlueInput
      className={className}
      label={label}
      type="search"
      maxLength={100}
      placeholder={placeholder}
      value={text}
      onChange={(event) => setText(event.target.value)}
    />
  );
}
