// BLUE3 BAvatar → BlueAvatar (no plugin template yet). Shows initials when there is no picture.
export interface BlueAvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] ?? '';
  // A trailing number stays whole, so "Team 1" and "Team 10" do not both read "T1".
  if (words.length > 1 && /^\d{1,3}$/.test(last)) return `${words[0]?.[0] ?? ''}${last}`.toUpperCase();
  const letters = words.length > 1 ? [words[0], last] : words;
  return letters
    .map((word) => word?.[0] ?? '')
    .join('')
    .toUpperCase();
}

export function BlueAvatar({ name, src, size = 'md' }: BlueAvatarProps) {
  return (
    <span className={`blue-avatar blue-avatar--${size}`} aria-hidden="true">
      {src ? <img src={src} alt="" /> : initials(name)}
    </span>
  );
}
